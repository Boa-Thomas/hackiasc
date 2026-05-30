# Sugar Cubes — Mural de Elogios

**Data:** 2026-05-30
**Status:** Aprovado para planejamento

## Objetivo

Permitir que participantes, mentores e a organização enviem "sugar cubes"
(elogios) uns aos outros durante o evento. Cada elogio passa por **aprovação
manual do admin** (item a item) e fica **invisível para todos** até o admin
acionar um **switch global de liberação** no encerramento. Quando liberado,
cada destinatário vê, no seu próprio painel, um **mural pessoal** com os
elogios aprovados endereçados a ele — apresentados de forma **anônima** (o
remetente não aparece no mural; só o admin vê o remetente, para moderar).

## Decisões de produto (fechadas no brainstorming)

- **Quem envia:** participantes confirmados, mentores e organização/staff.
- **Quem recebe:** participantes confirmados, mentores e "Organização"
  (entidade única). Destinatário escolhido de um **roster estruturado**
  (listas reais), não texto livre.
- **Autoria:** **anônima** no mural. `sender_name` é guardado só para o admin
  moderar; nunca é devolvido aos destinatários.
- **Onde aparece quando liberado:** no **painel de quem recebeu** (mural
  pessoal). A organização vê os elogios dela na aba do admin.
- **Tempo/controle:** envio aberto o tempo todo; admin aprova item a item;
  **um único switch global** revela tudo que está aprovado. Enquanto desligado,
  **nada aparece e ninguém sabe que recebeu**.

## Arquitetura

Espelha 1:1 os padrões já usados no repositório:

- **RLS deny-all** nas tabelas; acesso somente via RPCs `SECURITY DEFINER`
  (mesmo padrão de `pains`/`mentor_*`/`participant_*`).
- **Identidade do remetente resolvida no servidor** pelos resolvedores de
  sessão existentes: `participant_session_owner_confirmed(p_token)` (participante),
  `mentor_session_owner(p_token)` (mentor), `is_admin()` (organização). O cliente
  nunca decide quem é o remetente nem o nome exibido.
- **Switch global** via `app_settings` key-value, com `get_*`/`set_*` espelhando
  `get_team_scores_visible`/`set_team_scores_visible`. Gate no servidor: com o
  flag desligado, os RPCs de "recebidos" não devolvem nada.
- **Sem realtime**: o frontend faz polling, como o resto do app.

### Modelo de dados (Opção A — tabela única polimórfica)

```sql
CREATE TABLE sugar_cubes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  message         TEXT NOT NULL,                 -- o elogio (1..280 chars, validado no servidor)
  sender_type     TEXT NOT NULL CHECK (sender_type IN ('participant','mentor','organization')),
  sender_ref      UUID,                          -- registration_id / mentor_id / NULL p/ org
  sender_name     TEXT NOT NULL,                 -- snapshot; SÓ admin vê (mural é anônimo)
  recipient_type  TEXT NOT NULL CHECK (recipient_type IN ('participant','mentor','organization')),
  recipient_ref   UUID,                          -- registration_id / mentor_id / NULL p/ org
  recipient_name  TEXT NOT NULL,                 -- snapshot p/ exibição e moderação
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  moderated_at    TIMESTAMPTZ
);

CREATE INDEX idx_sugar_cubes_status        ON sugar_cubes(status);
CREATE INDEX idx_sugar_cubes_recipient     ON sugar_cubes(recipient_type, recipient_ref);
CREATE INDEX idx_sugar_cubes_sender        ON sugar_cubes(sender_type, sender_ref);
```

- `recipient_ref`/`sender_ref` são `NULL` quando o tipo é `organization`
  (entidade única, sem linha em tabela).
- `recipient_name`/`sender_name` são **snapshots** resolvidos no servidor no
  momento do envio (display estável mesmo se o cadastro mudar; para org, um
  rótulo fixo tipo `"Organização HackIA"`).
- Flag de liberação: `app_settings('sugar_released', 'false')` (semeado
  desligado, idempotente).

### RLS

```sql
ALTER TABLE sugar_cubes ENABLE ROW LEVEL SECURITY;
-- Admin/viewer lê direto (moderação); todo o resto via RPC SECURITY DEFINER.
CREATE POLICY "Admin can read sugar_cubes" ON sugar_cubes
  FOR SELECT TO authenticated USING (is_admin_or_viewer());
```

## RPCs

Todos `SECURITY DEFINER`, `SET search_path = public`. Erros via `RAISE
EXCEPTION` com códigos curtos (padrão do muro), traduzidos no frontend.

### Roster (popular o seletor de destinatário)

`sugar_roster(p_participant_token UUID DEFAULT NULL, p_mentor_token UUID DEFAULT NULL)`
→ exige que **pelo menos um** token seja válido (participante confirmado **ou**
mentor); senão `RAISE 'unauthorized'`. Gate de identidade evita vazar a lista
de presentes para `anon`. Retorna:

```json
{
  "participants": [{ "ref": "<registration_id>", "name": "<full_name>" }],
  "mentors": [{ "ref": "<mentor_id>", "name": "<name>" }],
  "organization": true
}
```

- `participants`: somente inscrições com `payment_status='confirmed'`.
- Concedido a `anon` (a validação do token é interna).
- Versão admin: a aba Elogios pode montar o roster via leitura direta
  (admin tem SELECT) ou um `sugar_roster_admin()` análogo gated por `is_admin`.

### Envio (1 por tipo de remetente)

Regras comuns (validadas no servidor, nessa ordem):

1. Resolver identidade do remetente (token/admin) → `sender_ref` + `sender_name`.
2. Validar `recipient_type`/`recipient_ref`: existência e (p/ participante)
   `payment_status='confirmed'`; resolver `recipient_name`. Org: ref `NULL`.
3. **Bloquear auto-elogio**: mesmo `(type, ref)` de remetente e destinatário →
   `RAISE 'self_compliment'`.
4. **Anti-spam**: throttle (último envio do remetente < 5s → `rate_limited`) e
   teto de elogios por remetente (ex. 30 → `rate_limited`).
5. Validar/normalizar mensagem (trim; vazio → `message_required`; corta em 280).
6. Inserir com `status='pending'`.

- `sugar_send_participant(p_token UUID, p_recipient_type TEXT, p_recipient_ref UUID, p_message TEXT)`
  → `participant_session_owner_confirmed(p_token)`. GRANT a `anon`.
- `sugar_send_mentor(p_token UUID, p_recipient_type TEXT, p_recipient_ref UUID, p_message TEXT)`
  → `mentor_session_owner(p_token)`. GRANT a `anon`.
- `sugar_send_org(p_recipient_type TEXT, p_recipient_ref UUID, p_message TEXT)`
  → `authenticated` + `is_admin()`. `sender_name` = rótulo fixo da organização.

Retorno: `{ "ok": true }` (não devolve nada que revele estado de moderação).

### Recebidos (mural pessoal)

Só retornam se `get_sugar_released() = true` **E** `status='approved'`;
caso contrário, lista vazia (gate no servidor). **Nunca** devolvem remetente.

- `sugar_my_received_participant(p_token UUID)` → resolve `registration_id`;
  retorna `[{ message, created_at }]` ordenado por `created_at`.
- `sugar_my_received_mentor(p_token UUID)` → idem para `mentor_id`.
- Organização: vista na aba admin (não há painel próprio da org).

Ambos GRANT a `anon` (token validado internamente).

### Admin / flag

- `sugar_admin_list(p_status TEXT DEFAULT NULL)` → `is_admin_or_viewer()`;
  lista tudo (ou filtra por status), **com** `sender_name`/`recipient_name`,
  `sender_type`/`recipient_type`, `message`, `status`, `created_at`. Ordenado
  por `created_at DESC`.
- `sugar_moderate(p_id UUID, p_status TEXT)` → `is_admin()`; aceita
  `approved`/`rejected`; seta `moderated_at = now()`.
- `get_sugar_released()` → `is_admin_or_viewer()` (espelha
  `get_team_scores_visible`).
- `set_sugar_released(p_bool BOOLEAN)` → `is_admin()` (espelha
  `set_team_scores_visible`).

## Fluxo de moderação + liberação

1. Remetente envia → linha `pending`, invisível a todos exceto admin/viewer.
2. Admin aprova/rejeita item a item na aba **Elogios**.
3. Enquanto `sugar_released=false`, os RPCs de recebidos devolvem vazio —
   ninguém sabe que recebeu.
4. No encerramento, admin liga o switch (`set_sugar_released(true)`, com
   confirmação na UI) → cada destinatário passa a ver os elogios **aprovados**
   endereçados a ele.

## Frontend

### Componente de envio — `SendSugarCube`

Reutilizável; recebe a credencial do contexto (token do painel ou modo admin).
Fluxo: escolhe destinatário do roster (campo de busca por nome; "Organização"
como item fixo) → escreve mensagem (contador até 280) → envia. Mensagens de
erro traduzidas (`self_compliment`, `rate_limited`, `message_required`, etc.).
Estado de sucesso: confirmação leve ("Elogio enviado! Passará por curadoria").

Pontos de integração:

- `ParticipantPanel.jsx`: nova aba/seção "Elogios" (envio sempre disponível p/
  confirmados).
- `MentorPanel.jsx`: nova sub-visão "Elogios".
- Aba admin Elogios: envio em nome da organização.

### Mural pessoal — `ReceivedComplimentsSection`

Cartões no design system (`card-glass`, glow, fonte Sora). Cabeçalho
"🧁 Você recebeu N elogios" + cartões anônimos (só mensagem). Só renderiza
quando há aprovados liberados; caso contrário a seção fica **oculta** (não
mostra "0 elogios", para preservar a surpresa). Embutido em `ParticipantPanel`
e `MentorPanel`.

### Aba admin — `AdminSugarCubes` (`adminOnly`)

Espelha `AdminWall`. Registrada em `AdminPanel.jsx` no array `TABS`
(`{ id: 'sugarcubes', label: 'Elogios', icon: '🧁', adminOnly: true }`) e
renderizada com `{!readOnly && activeTab === 'sugarcubes' && <AdminSugarCubes />}`.
Conteúdo:

- Filtros: pendentes / aprovados / rejeitados; contadores.
- Cartão por elogio: "De: \<sender_name\> (\<tipo\>) → Para: \<recipient_name\>
  (\<tipo\>)" + mensagem + botões **Aprovar**/**Rejeitar**.
- Switch global "Elogios liberados" com confirmação (afeta todos os painéis).
- Polling (~5s) via `sugar_admin_list`.

## Testes

- **Lógica pura** em `src/lib/sugarCubes.js` + `sugarCubes.test.js` (padrão
  `teamIdea.test.js`/`aiScores.test.js`): validação/normalização de mensagem
  (trim, vazio, corte em 280), regra de **auto-elogio** (`(type,ref)` igual),
  mapeamento de códigos de erro → texto pt-BR, rótulo da organização.
- **Migration** verificada manualmente no Supabase SQL Editor (não é
  auto-aplicada; idempotente: `IF NOT EXISTS`/`CREATE OR REPLACE`/`ON CONFLICT`).

## Segurança

- Remetente e nome de exibição sempre resolvidos no servidor; cliente não forja
  identidade.
- Roster gated por identidade (não vaza lista de presentes a `anon`).
- Mural anônimo: RPCs de recebidos nunca devolvem `sender_*`.
- Liberação e moderação só `is_admin()`; leitura de fila/flag `is_admin_or_viewer()`.
- Anti-spam (throttle + teto) e bloqueio de auto-elogio no servidor.

## Fora de escopo (YAGNI)

- Mural público / telão de elogios (não pedido; só mural pessoal por painel).
- Página pública dedicada (rota `#mural-elogios`).
- Edição/exclusão de elogio pelo remetente após o envio.
- Notificação ativa (e-mail/push) quando liberado — basta aparecer no painel.
- Reações/curtidas nos elogios recebidos.
