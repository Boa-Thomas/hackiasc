# Spec: Muro de Dores — votantes no telão + ferramentas de admin

**Data:** 2026-05-29
**Tópico:** Expor quem votou em cada ideia (telão + admin) e permitir que a
organização cadastre uma dor em nome de um participante pelo admin.

## Contexto

O Muro de Dores (Fase 1) tem 3 fases fixas no banco (`closed`/`wall_open`/`voting_open`)
— ver `migrations/add_pain_wall.sql` e `add_wall_identity.sql`. Cada voto já fica
amarrado a um participante: `pain_votes.registration_id` (FK `registrations`,
indexado, RLS deny-all + policy de leitura admin). Hoje nada disso é exposto:
`wall_list` (anon/telão) e `wall_admin_list` (admin) devolvem por ideia apenas
`title/description/author_name/axis/status/vote_count`.

`registrations` tem `full_name`, `email`, `phone` (este último serve de WhatsApp;
não há coluna separada). Helpers: `is_admin()` (escrita) e `is_admin_or_viewer()`
(leitura). `AdminRegistrations.jsx` consulta `supabase.from('registrations').select(...)`
direto (authenticated tem SELECT).

**Decisão mantida:** continuam sendo 3 fases. As novas telas de resultado e de
cadastro por admin são ferramentas do painel admin, não fases do telão.

## Objetivos

1. **Votantes no telão** — cada ideia mostra quem votou nela, ao vivo, durante
   `voting_open`, para ajudar a juntar interessados e formar grupos.
2. **Resultado no admin** — por ideia, ver votantes com nome + contato para
   direcionar a criação dos grupos.
3. **Admin cadastra dor por participante** — a organização registra uma dor em
   nome de um inscrito confirmado, pelo painel admin.

## Decisões (confirmadas com o usuário)

- **Telão:** chips compactos com "primeiro nome + inicial do último sobrenome"
  (ex.: "Ana S."), mostrando ~6 e `+N mais`. Nome encurtado **no servidor**.
- **Admin add dor:** permitido somente na fase `wall_open` (igual participante).
- **Resultado admin:** mostra nome + contato (email/phone) dos votantes.

## Abordagem

Estender os RPCs existentes com dois níveis de privacidade (Abordagem 1):

- nível público (anon/telão): nome encurtado, sem sobrenome completo nem contato;
- nível admin: nome completo + email + phone.

Rejeitadas: RPCs dedicados novos (duplica lógica, troca o RPC que o telão já usa)
e join no cliente (inviável — `pain_votes` é deny-all no RLS).

## Backend — nova migration `migrations/add_wall_voters.sql`

Idempotente (CREATE OR REPLACE / IF NOT EXISTS), aplicada via MCP pelo
orquestrador (não auto-aplica), seguindo o padrão das migrations do muro.

### Helper `wall_display_name(p_full_name TEXT) RETURNS TEXT`

- `IMMUTABLE`. Primeiro token + inicial do último token + ".".
- Nome de uma palavra só → retorna o primeiro token sem inicial.
- Trim + split em `\s+`; trata múltiplos espaços. Usado **só** no nível público.

### `wall_list(p_registration_id UUID)` — estender

- Quando `p_registration_id IS NULL` (telão): cada pain ganha
  `voters: [ { display } ]`, onde `display = wall_display_name(full_name)` do
  votante, vindo de `pain_votes JOIN registrations`. Ordenado por
  `registrations.full_name`.
- Quando chamado por participante (id não-nulo): **não** inclui `voters` (payload
  enxuto; celular do participante não lista votantes).
- Mantém todo o comportamento atual (phase, my_votes, votos_restantes, só pains
  `status='visible'`).

### `wall_admin_list()` — estender

- Cada pain ganha `voters: [ { full_name, email, phone } ]` de
  `pain_votes JOIN registrations`, ordenado por `full_name`.
- Continua gated por `is_admin_or_viewer()`; inclui dores ocultas como hoje.

### `wall_admin_add_pain(p_registration_id, p_title, p_description, p_axis)` — novo

- `SECURITY DEFINER`, `SET search_path = public`. Espelha `wall_submit_pain`.
- `IF NOT is_admin() THEN RAISE 'unauthorized'`.
- Lê `phase`; `IF phase <> 'wall_open' THEN RAISE 'wall_not_open'`.
- `author_name := wall_require_confirmed(p_registration_id)` (valida confirmado e
  devolve full_name; reaproveita o helper existente).
- `IF length(trim(coalesce(p_title,''))) = 0 THEN RAISE 'title_required'`.
- INSERT em `pains` (author_name do servidor, registration_id do participante).
- `REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO authenticated`.
- Sem limite de "5 dores/pessoa" do fluxo público (admin é ajuda manual).

## Frontend — Telão (`src/wall/WallScreen.jsx`)

- No card, abaixo da linha de eixo/autor, renderizar `p.voters` **só** quando
  `showVotes` (`phase === 'voting_open'`) e houver votantes.
- Fileira de chips: mostrar os primeiros 6 `voter.display`; se houver mais, chip
  final "+N mais". Estilo discreto (texto branco/60, fundo branco/5, arredondado),
  subordinado ao número de votos em dourado.
- Card sem votos: nenhuma fileira.

## Frontend — Admin (`src/admin/AdminWall.jsx`)

### Resultado / votantes

- Cada ideia na lista (já ordenada por votos) vira expansível (toggle por linha).
  Expandida: lista os `voters` com nome + email + phone.
- Botão "copiar" por votante (e/ou "copiar todos") reaproveitando o padrão de
  cópia já usado no admin. Direciona a montagem dos grupos.

### Adicionar dor por participante

- Bloco com:
  1. Busca de inscrito **confirmado**: input que consulta `registrations`
     (`supabase.from('registrations')`) filtrando `payment_status='confirmed'` e
     `full_name/email/cpf ILIKE`; lista de resultados selecionável.
  2. Campos título (obrigatório), descrição (opcional), eixo (opcional, mesma
     lista `ECONOMIC_AXES`).
  3. Botão "Adicionar em nome de \<nome\>" → `wall_admin_add_pain`.
- Habilitado somente quando `phase === 'wall_open'`; fora disso, mostrar aviso
  ("disponível apenas com o muro aberto").
- Após sucesso: limpar form, recarregar a lista (`load()`).

## Fluxo de dados

Telão: `WallScreen` → `wall_list(null)` (polling 2s) → pains + voters (curtos) →
chips. Admin: `AdminWall` → `wall_admin_list()` (polling 4s) → pains + voters
(contato) → expansível; e `wall_admin_add_pain` no cadastro.

## Privacidade / tradeoffs

- O telão expõe **publicamente** quem votou (nome curto), ao vivo na `voting_open`
  — pode gerar efeito manada. Aceito: o objetivo é juntar interessados por ideia.
- Contato (email/phone) aparece **só** no admin (gated server-side); o RPC anon
  nunca devolve sobrenome completo nem contato.
- Nome encurtado no servidor para o nível público — anon não recebe o full_name.

## Casos de borda

- Ideia com 0 votos: `voters = []`, sem fileira no telão / sem expandir no admin.
- Nome de uma palavra: `display` = só o primeiro nome.
- Dores ocultas: já excluídas do `wall_list`; admin continua vendo na seção
  "Ocultas".
- Admin add com participante não confirmado: `wall_require_confirmed` levanta
  `not_confirmed` → mensagem amigável no admin.
- Admin add fora de `wall_open`: bloqueado no front e no RPC (`wall_not_open`).
- Participante pode ter mais de uma dor (sem constraint), igual ao fluxo público.

## Verificação

- Sem suíte de testes para os RPCs. `npm run build` + `eslint` nos arquivos
  alterados.
- Preview do telão com mock (Edge headless) para validar os chips visualmente.
- RPCs testados via app/admin após a migration ser aplicada (MCP):
  `wall_admin_add_pain` em `wall_open`, votantes aparecendo no telão em
  `voting_open`, e contato na expansão do admin.

## Fora de escopo

- Fase de "resultado" dedicada (mantidas as 3 fases).
- Mostrar votantes no app do participante (só telão por enquanto).
- Limite de dores por participante no fluxo admin.
- Exportação/CSV dos votantes (só copiar na tela).

## Arquivos afetados

- novo: `migrations/add_wall_voters.sql`
- `src/wall/WallScreen.jsx` (chips de votantes)
- `src/admin/AdminWall.jsx` (resultado expansível + cadastro por participante)
- novo: `docs/changelog/2026-05-29-muro-votantes-e-admin.md`
