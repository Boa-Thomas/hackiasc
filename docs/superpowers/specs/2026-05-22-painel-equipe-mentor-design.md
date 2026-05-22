# Design: Painel da Equipe + Sistema de Mentor

**Data:** 2026-05-22 · **Evento:** HackIA SC, 29-31/05/2026 · **Escopo:** completo (C)

## Contexto

O painel do participante (`src/participant/`) já existe: login por email+CPF (token custom via RPC, RLS deny-all), com abas Equipe / Meus Dados / Em Breve. A aba "Em Breve" é placeholder.

A metodologia oficial (`Metodologia_HackIA.pdf`) define o painel como o **"app de jornada"** da equipe, com entregáveis específicos por fase e o **mentor fixo** como diferencial central (1 mentor por equipe, presencial as 54h). Este design materializa isso.

## Objetivo

Três superfícies sobre uma **fundação de dados comum** (`teams`, com `id` estável):

1. **Painel da equipe** (login atual de participante) — preenche os 4 entregáveis da metodologia, organizados por fase, e lê as ponderações **públicas** do mentor.
2. **Painel do mentor** (login novo, email + código de 4 dígitos) — acompanha sua equipe (entregáveis em leitura) e escreve ponderações por fase (pública/privada).
3. **Admin → aba "Mentores"** — cadastra mentores (gera código de 4 dígitos) e pareia com equipes.

## Decisões confirmadas

- **Acesso da equipe:** mantém login individual (email+CPF); o painel passa a girar em torno da equipe. Entregáveis compartilhados, qualquer membro confirmado edita (last-write-wins + guarda por `updated_at`).
- **Auth do mentor:** token custom (email + código de 4 dígitos), **mesmo molde dos participantes** — NÃO Supabase Auth. Viabiliza cadastro 100% pelo admin, sem `service_role`/Edge Function.
- **Ponderações:** ancoradas por fase (`ignicao`/`construcao`/`apresentacao`), com flag `is_public`. Pública = equipe vê; privada = só organização (admin/viewer) + o mentor.
- **Vínculo mentor↔equipe:** 1 mentor : 1 equipe (fixo); admin reatribui.
- **Modelo de dados:** `team_name` continua canônico para pertença (intocado nos 9 pontos de escrita do admin); `teams.id` é o ID estável que carrega entregáveis e ponderações; `registrations.team_id` é espelho derivado por trigger.

## Modelo de dados

```sql
-- Identidade estável da equipe + entregáveis (JSONB flexível)
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  hypotheses_canvas  JSONB NOT NULL DEFAULT '{}'::jsonb,  -- Fase 1
  slc_ia_canvas      JSONB NOT NULL DEFAULT '{}'::jsonb,  -- Fase 2
  learning_diary     JSONB NOT NULL DEFAULT '{}'::jsonb,  -- Fase 2 (array de ciclos)
  final_deliverables JSONB NOT NULL DEFAULT '{}'::jsonb,  -- Fase 3
  updated_by UUID REFERENCES registrations(id)
);
-- registrations.team_id = espelho derivado de team_name (trigger)

-- Mentores (auth por código, token custom)
CREATE TABLE mentors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  access_code_hash TEXT NOT NULL,              -- pgcrypto crypt(code, gen_salt('bf'))
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  failed_login_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE mentor_sessions (   -- espelha participant_sessions
  token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id UUID NOT NULL REFERENCES mentors(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days')
);

-- Ponderações do mentor sobre a equipe
CREATE TABLE mentor_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  mentor_id UUID NOT NULL REFERENCES mentors(id) ON DELETE CASCADE,
  phase TEXT NOT NULL CHECK (phase IN ('ignicao','construcao','apresentacao')),
  body TEXT NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

RLS: `teams`, `mentors`, `mentor_sessions`, `mentor_notes` com RLS habilitado. Admin/viewer fazem SELECT (`is_admin_or_viewer()`); admin gerencia. Mentores e participantes **não** acessam direto — só via RPC `SECURITY DEFINER`.

## A. Fundação `teams`

- `ALTER TABLE registrations ADD COLUMN team_id UUID REFERENCES teams(id)`.
- Trigger **`sync_registration_team_id`** (`BEFORE INSERT OR UPDATE OF team_name`, `SECURITY DEFINER`): find-or-create da `teams`-row pelo nome, seta `NEW.team_id` (ou NULL).
- Trigger **`cascade_team_rename`** (**`AFTER UPDATE OF name ON teams`**, `SECURITY DEFINER`): renomear `teams.name` propaga para `registrations.team_name` (por `team_id`) e `team_join_requests` pendentes. **AFTER** (não BEFORE) para o sync interno enxergar o nome já persistido e não criar row órfã.
- Backfill idempotente: 1 `teams`-row por `team_name` distinto não-cancelado; popula `team_id`.
- Triggers `check_team_size`/`check_team_size_update` permanecem intactos (contam por `team_name`).
- Refactor mínimo no admin: `AdminTeams.jsx` rename passa a escrever em `teams.name` (cascade cuida do resto); incluir `team_id` no `.select(...)`.

## B. Entregáveis da equipe (4, por fase)

Campos JSONB (chaves em inglês, labels PT-BR na UI):
- **`hypotheses_canvas`** (Fase 1 · Ignição): `cliente_alvo`, `hipotese_valor`, `hipotese_crescimento`, `hipotese_tecnica_ia`, `priorizacao`.
- **`slc_ia_canvas`** (Fase 2 · Construção): `hipotese_a_testar`, `tipo_prototipo` (select: Concierge IA / Mágico de Oz IA / IA-real mínima / Pré-venda+Landing / Combinação), `escopo`, `camada_ia`, `experimento`, `plano_execucao`, `entregaveis`.
- **`learning_diary`** (Fase 2 · Construção): `{ cycles: [{ hipotese, experimento, dados, conclusao, decisao('pivotar'|'perseverar'|'parar') }] }` — lista repetível (≥2 ciclos pela metodologia).
- **`final_deliverables`** (Fase 3 · Apresentação): `repo_url`, `deploy_url`, `slides_url`, `proximos_passos`.

- RPC `participant_save_team_deliverable(p_token, p_field, p_data)` (`SECURITY DEFINER`): valida `participant_session_owner_confirmed`, whitelist de `p_field`, exige `team_id`, limita tamanho do payload, faz UPDATE escopado + `updated_at`/`updated_by`.
- `participant_get_me` estendido: inclui objeto `team { id, name, hypotheses_canvas, slc_ia_canvas, learning_diary, final_deliverables, updated_at, updated_by_name, public_notes }` quando confirmado e em equipe.
- UI: `DeliverablesSection` substitui `ComingSoon` no painel; sub-abas por fase. Reusa o padrão de `EditProfile.jsx` (estado, dirty, salvar via RPC, `refreshMe`, feedback). Diário tem UI de lista (adicionar/remover ciclo). Componentes: `DeliverablesSection`, `HypothesesCanvas`, `SlcIaCanvas`, `LearningDiary`, `FinalDeliverables`.

## C. Mentor — autenticação (token custom)

- RPC `mentor_login(p_email, p_code)` (`SECURITY DEFINER`): valida `crypt(p_code, access_code_hash)`, lockout anti-brute-force (10 tentativas → bloqueio 1h, espelha `participant_login`), cria sessão, retorna token.
- RPC `mentor_session_owner(p_token)`: valida token → `mentor_id` (espelha `participant_session_owner`).
- RPC `mentor_logout(p_token)`.
- `useMentorAuth.js`: espelha `useParticipantAuth` (token em `sessionStorage`, chave `hackiasc_mentor_token`).

## D. Painel do mentor (rota `#mentor`)

- `App.jsx` ganha roteamento `#mentor` / `#mentor-login` (espelha `#participante`).
- `MentorLogin.jsx`: email + código de 4 dígitos.
- `MentorPanel.jsx`: cabeçalho com a equipe pareada; **entregáveis em leitura** (4, por fase — reusa os componentes com prop `readOnly`); **área de ponderações** por fase (escrever/editar, toggle público/privado).
- RPC `mentor_get_me(p_token)`: retorna `{ mentor, team (entregáveis), notes (todas da equipe) }`.

## E. Ponderações (`mentor_notes`)

- RPC `mentor_save_note(p_token, p_phase, p_body, p_is_public, p_note_id?)`: insere ou edita (se autor); valida `mentor_session_owner` e que a nota é da equipe do mentor.
- RPC `mentor_delete_note(p_token, p_note_id)`: remove se autor.
- Públicas na equipe: `participant_get_me` inclui `team.public_notes` = notas `is_public=true` da equipe, agrupadas por fase (read-only).
- Privadas: visíveis a admin/viewer (RLS SELECT) e ao mentor (via `mentor_get_me`). Equipe nunca vê.
- UI mentor: por fase, lista notas + form (toggle público/privado). UI equipe: seção read-only "Comentários do mentor" por fase (só públicas).

## F. Admin → "Mentores"

- RPC `admin_create_mentor(p_email, p_name, p_team_id)` (`SECURITY DEFINER`, checa `is_admin()`): gera código de 4 dígitos, hasheia, insere em `mentors`, **retorna o código em claro uma única vez**.
- RPC `admin_reset_mentor_code(p_mentor_id)`: regenera o código.
- `AdminMentors.jsx`: form (email + nome + equipe) → exibe código gerado (botão copiar); lista mentores (sem expor `access_code_hash`), reatribui equipe, regenera código, remove. Aba `adminOnly` em `AdminPanel.jsx`.

## Roteamento e superfícies de UI

| Rota (hash) | Auth | Quem |
|---|---|---|
| `#participante` | email+CPF (existe) | equipe — entregáveis + notas públicas |
| `#mentor` (novo) | email+código 4 díg. | mentor — vê equipe, escreve notas |
| `#admin` (existe) | Supabase Auth | organização — aba Mentores |

## Segurança

- Código de 4 dígitos (10 mil combinações) protegido por **lockout** (10 tentativas → 1h). Dado de baixa criticidade (entregáveis da própria equipe + notas). Migrar para 6 dígitos é trivial.
- `access_code_hash` via `pgcrypto` (`bf`), nunca exposto ao frontend (admin seleciona só `id,email,name,team_id`).
- Todas as tabelas novas com RLS deny-all para anon; acesso via RPC `SECURITY DEFINER` (padrão do projeto).
- `admin_create_mentor` retorna o código em claro só na resposta (não logar).

## Ordem de implementação

1. **Fundação `teams`** — schema, backfill, triggers (sync + cascade AFTER), RLS, refactor `AdminTeams` rename.
2. **Entregáveis** — RPC `save_team_deliverable`, estender `participant_get_me` (sem notas ainda), UI da equipe (`DeliverablesSection` + 4 forms), trocar `ComingSoon`.
3. **Mentor auth** — tabelas `mentors`/`mentor_sessions`, RPCs login/logout/session_owner, `useMentorAuth`.
4. **Painel do mentor** — rota `#mentor`, `MentorLogin`, `MentorPanel` (entregáveis read-only).
5. **Ponderações** — tabela `mentor_notes`, RPCs save/delete + `mentor_get_me`, estender `participant_get_me` com `public_notes`, UI mentor + seção read-only na equipe.
6. **Admin Mentores** — RPCs `admin_create_mentor`/`reset_code`, `AdminMentors.jsx`, aba no `AdminPanel`.

Cada bloco é aditivo e termina num estado verificável. Migração de produção: `migrations/add_team_and_mentors.sql` (idempotente).

## Verificação (end-to-end)

- **SQL:** backfill cria 1 `teams`-row por equipe + `team_id` populado; inscrever/mover/remover membro mantém `team_id`; **rename → `teams.id` inalterado, entregáveis/notas preservados, sem loop de trigger**; limite de 6 e RPCs existentes seguem funcionando.
- **Equipe:** login → aba Entregáveis → preencher/salvar cada um dos 4; recarregar confirma persistência + "última edição por X"; ver comentários públicos do mentor.
- **Mentor:** admin cria mentor (recebe código) → mentor loga (email+código) → vê equipe + entregáveis (leitura) → escreve nota pública e privada por fase; lockout após 10 erros.
- **Visibilidade:** equipe vê só públicas; admin/viewer vê todas; privada não vaza ao participante (checar `participant_get_me`).
- `npm run lint` e `npm run build` limpos.

## Riscos / débito consciente

- **Escopo × 7 dias:** escopo C é ambicioso; a ordem em 6 blocos permite parar com valor entregue a cada etapa (bloco 2 já entrega o painel da equipe).
- **Código de 4 dígitos:** fraco por natureza; mitigado por lockout. Trade-off aceito pelo usuário.
- **Last-write-wins** nos entregáveis (sem realtime): guarda por `updated_at` + salvar explícito.
- **Nome reciclado:** se uma equipe esvazia e outra recria o mesmo `team_name`, herda a `teams`-row antiga (entregáveis). Risco ~nulo em hackathon; documentado.
