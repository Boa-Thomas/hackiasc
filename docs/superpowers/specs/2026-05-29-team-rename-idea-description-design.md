# Edição de nome de equipe + descrição da ideia (com vitrine pública)

**Data:** 2026-05-29
**Status:** Aprovado (aguardando review do spec)

## Objetivo

Permitir que **participantes** troquem o nome da própria equipe e adicionem uma
pequena **descrição da ideia**. A descrição fica visível a todos, incluindo um
**telão/vitrine público** novo de equipes.

## Decisões (confirmadas com o usuário)

- **Quem edita:** qualquer membro confirmado da equipe (não só o líder).
- **Visibilidade da descrição:** todos — equipe, browse de equipes, mentor,
  admin e uma **vitrine pública** nova.
- **Tamanho da descrição:** parágrafo curto, **≤ 500 caracteres**.
- **Vitrine pública:** construída **agora** (rota `#vitrine`).

## Modelo de dados

- Nova coluna **`teams.idea_description TEXT`** (nullable). O nome da equipe já
  existe em `teams.name`.
- O nome continua tendo o índice único existente `uq_teams_name`.

Nenhuma alteração em `registrations` — o nome dos membros continua espelhado por
`registrations.team_name` via o trigger existente `cascade_team_rename`.

## RPCs

### `participant_update_team(p_token UUID, p_team_name TEXT, p_idea_description TEXT)`

- `SECURITY DEFINER`, `GRANT ... TO anon`.
- Resolve o dono da sessão com `participant_session_owner_confirmed(p_token)`.
- Deriva o `team_id` do próprio participante a partir de `registrations` —
  **nunca recebe `team_id` do cliente** (sem IDOR). Se `team_id` for NULL →
  `not_in_team`.
- Validações:
  - `p_team_name`: `TRIM`; não-vazio; `length ≤ 120` → senão `team_name_required`.
  - `p_idea_description`: `TRIM` → `NULLIF(..., '')`; `length ≤ 500` → senão
    `idea_too_long`.
- Atualiza a linha `teams` (por `id = team_id`): `name`, `idea_description`,
  `updated_at = now()`, `updated_by = v_reg_id`.
- Atualizar `teams.name` dispara o trigger existente `cascade_team_rename`, que
  sincroniza `registrations.team_name` de todos os membros e os pedidos de
  entrada pendentes em `team_join_requests`. **Reuso total — sem lógica nova de
  sincronização.**
- Unicidade do nome: capturar `unique_violation` (do `uq_teams_name`) →
  `RAISE EXCEPTION 'team_name_taken'`.
- Retorna `BOOLEAN` (`true`).

### `public_list_teams()`

- `SECURITY DEFINER`, `GRANT ... TO anon`. Sem token.
- Para cada equipe (`teams`) com ≥ 1 membro com `payment_status = 'confirmed'`,
  retorna: `name`, `idea_description`, `member_count` (INTEGER) e
  `economic_axes` (array agregado/distinto dos membros).
- **Sem dados pessoais** — nenhum nome/e-mail de pessoa. Só vitrine de equipe +
  ideia.
- Ordena por `name`.

## Atualizações em RPCs existentes

- **`participant_get_me`** (`migrations/add_team_and_mentors.sql`): adicionar
  `idea_description` ao objeto `team` retornado.
- **`participant_list_teams`** (`supabase-setup.sql`): retornar também a
  `idea_description` de cada equipe (subtítulo no browse). Como a função agrupa
  por `registrations.team_name`, buscar a descrição via join em `teams` pelo
  nome (ou `team_id`).
- **`mentor_serialize_me`** (`migrations/mentor_teams_nn.sql`): adicionar
  `idea_description` ao objeto de cada equipe.

## Frontend

### Portal do participante — `src/participant/TeamSection.jsx`

- No `CurrentTeamView`, adicionar um botão **"Editar equipe"** (visível a
  qualquer membro, não só líder) que abre um painel inline com 2 campos:
  - input de nome (maxLength 120, pré-preenchido com `profile.team_name`);
  - textarea de descrição (maxLength 500, contador `n/500`, pré-preenchido com
    `team.idea_description`).
- Salvar chama `participant_update_team` via o helper `callRpc` existente; em
  sucesso → `flash(...)` + `refreshMe()`.
- Exibir a descrição da ideia no card da equipe (abaixo do nome/contagem),
  quando houver.
- Novas chaves em `ERROR_LABELS`: `idea_too_long`, e reaproveitar
  `team_name_required` / `team_name_taken` / `not_in_team` já existentes.
- No browse "Equipes abertas" (`NoTeamView`), mostrar `t.idea_description` como
  subtítulo discreto de cada equipe, quando houver.

### Portal do mentor

- Onde a equipe é exibida (visão do mentor), mostrar `idea_description` como bloco
  de leitura.

### Admin — `src/admin/AdminTeams.jsx`

- Mostrar `idea_description` (leitura) na visão/detalhe da equipe.

### Vitrine pública — `src/teams/TeamsShowcase.jsx` (novo) + rota `#vitrine`

- Componente no estilo do `src/wall/WallScreen.jsx`: `min-h-screen bg-dark
bg-grid`, orbs de fundo, cabeçalho HackIA SC, grid de cards `card-glass`
  grandes para projeção.
- Busca via `supabase.rpc('public_list_teams')`, polling ~5s.
- Cada card: nome da equipe + descrição da ideia + nº de membros + chips dos
  eixos econômicos. Equipe sem descrição → placeholder discreto
  ("Ideia em construção…").
- Registrar a rota `#vitrine` em `src/App.jsx` (junto das rotas públicas como
  `#telao`).

## Erros e validação

| Código                       | Quando                  | Label PT                                                             |
| ---------------------------- | ----------------------- | -------------------------------------------------------------------- |
| `team_name_required`         | nome vazio ou > 120     | "Informe um nome de equipe válido (até 120 caracteres)." (já existe) |
| `team_name_taken`            | nome já usado           | "Esse nome de equipe já está em uso." (já existe)                    |
| `idea_too_long`              | descrição > 500         | "A descrição da ideia deve ter até 500 caracteres." (novo)           |
| `not_in_team`                | participante sem equipe | "Você não está em nenhuma equipe." (já existe)                       |
| `invalid_or_expired_session` | token inválido          | "Sessão expirou. Faça login novamente." (já existe)                  |

- Edição é last-write-wins entre membros (aceitável para o caso de uso).

## Testes / verificação

Sem framework de teste no repo → verificação manual:

1. Membro não-líder edita o nome → todos os membros veem o novo nome (cascata).
2. Editar a descrição → aparece no card, no browse, no mentor, no admin e em
   `#vitrine`.
3. Tentar nome já em uso → erro `team_name_taken` traduzido.
4. Descrição > 500 → bloqueada no front (maxLength) e no RPC (`idea_too_long`).
5. `#vitrine` lista equipes confirmadas sem expor dados pessoais.
6. `npm run build` e `npm run lint` limpos.

## Fora de escopo (YAGNI)

- Histórico de edições / auditoria de mudança de nome.
- Edição restrita só ao líder (decidido: qualquer membro).
- Moderação da descrição.
