# Avaliação do Evento — Design

**Data:** 2026-05-30
**Status:** Aprovado (design), pendente spec review do usuário
**Escopo:** Coleta de feedback pós-evento de participantes e mentores + dashboard de resultados no admin.

## Objetivo

Permitir que participantes e mentores avaliem o HackIA SC 2026 em várias dimensões
(nota 0–10 com slider) e deixem um comentário livre. O admin vê os resultados
agregados dentro do app.

## Decisões (do brainstorming)

| Decisão             | Escolha                                                        |
| ------------------- | -------------------------------------------------------------- |
| Acesso              | Logado e **identificado** (token atual de participante/mentor) |
| Anti-duplicata      | 1 resposta por pessoa, **travada** após envio                  |
| Edição              | Não editável (vira tela de "obrigado")                         |
| Abertura            | Switch no admin (`app_settings.evaluation_open`)               |
| Escala              | 0–10, **step 0,5**                                             |
| Comentário          | **Um só**, geral, opcional (textarea no final)                 |
| Gating participante | Exige **pagamento confirmado** (como as demais abas)           |
| Resultados          | **Dashboard no admin** (médias + comentários)                  |

## Dimensões

Cada dimensão é um slider 0–10 (step 0,5), começando "sem nota" (precisa interagir
para registrar — evita viés de todos em 5).

**Participante (10 dimensões):**

| key            | rótulo                                   |
| -------------- | ---------------------------------------- |
| `venue`        | Local / estrutura física                 |
| `methodology`  | Metodologia / dinâmica                   |
| `food`         | Comida / coffee                          |
| `platform`     | Plataforma (este app/site)               |
| `organization` | Organização e comunicação                |
| `mentorship`   | Mentoria _(só participante)_             |
| `criteria`     | Critérios e premiação                    |
| `networking`   | Networking / clima                       |
| `talks`        | Palestras / conteúdos                    |
| `nps`          | Recomendaria o evento a um colega? (NPS) |

**Mentor (9 dimensões):** mesma lista **menos `mentorship`** (mentor não se auto-avalia).

A lista de dimensões vive em um único módulo de config no front
(`src/lib/evaluationDimensions.js`) para ser a fonte única usada pelo formulário e
pelo dashboard.

## Modelo de dados

Nova tabela `event_evaluations`:

```sql
create table if not exists public.event_evaluations (
  id              uuid primary key default gen_random_uuid(),
  respondent_type text not null check (respondent_type in ('participant','mentor')),
  respondent_id   uuid not null,        -- registrations.id ou mentors.id
  scores          jsonb not null,       -- { "venue": 8, "methodology": 9.5, ... }
  comment         text,
  created_at      timestamptz not null default now(),
  unique (respondent_type, respondent_id)
);
```

- `scores` guarda apenas as dimensões que a pessoa pontuou (chaves do módulo de config).
  Dimensão não tocada simplesmente não aparece no JSON → contabilizada como "sem resposta"
  na média (não conta como 0).
- O `UNIQUE (respondent_type, respondent_id)` é o que garante "1 resposta, travada".
- RLS: deny-all para `anon`/`authenticated`; todo acesso via RPCs `SECURITY DEFINER`
  (mesmo padrão do resto do app). Admin/viewer leem resultados via RPC, não via tabela.

### app_settings

Adicionar a chave `evaluation_open` (boolean, default `false`), seguindo o padrão já
usado por `team_scores_visible`.

## RPCs (SECURITY DEFINER)

Todas validam token via `participant_sessions` / `mentor_sessions` (reusando o padrão
existente de `participant_get_me` / `mentor_get_me`).

1. **`submit_event_evaluation(p_token uuid, p_type text, p_scores jsonb, p_comment text)`**
   - Valida token e resolve `respondent_id`.
   - Recusa se `app_settings.evaluation_open` for `false` → erro `evaluation_closed`.
   - Valida que as chaves de `p_scores` pertencem ao conjunto permitido para o tipo
     e que os valores estão em `[0,10]` com step 0,5.
   - `INSERT ... ON CONFLICT (respondent_type, respondent_id) DO NOTHING`.
     Se nada inseriu → erro `already_submitted`.
   - Registra no `audit_log` (padrão do repo).

2. **`get_my_event_evaluation(p_token uuid, p_type text)`**
   - Valida token. Retorna `{ open: bool, submitted: bool, scores, comment, created_at }`.
   - É o que o front usa para decidir o estado da tela (fechado / formulário / obrigado).

3. **`get_event_evaluation_results()`** — gated por `is_admin_or_viewer()`
   - Retorna, por `respondent_type`:
     - `response_count`
     - média por dimensão (`avg` ignorando ausentes) e `count` de quem respondeu cada uma
   - Lista de comentários (`comment`, `respondent_type`, `created_at`) não vazios.

4. **`set_evaluation_open(p_open boolean)`** — gated por `is_admin()`
   - Atualiza `app_settings.evaluation_open`. Registra no `audit_log`.

## Frontend

### Componente compartilhado

`src/components/evaluation/EventEvaluationForm.jsx` (ou pasta equivalente ao padrão atual)

- Props: `dimensions` (lista do módulo de config), `respondentType`, `token`, `onSubmitted`.
- Cada dimensão = um slider `<input type="range" min=0 max=10 step=0.5>` reaproveitando
  o padrão de `JurorTeamCard` (accentColor variando pela nota) + número grande mostrando
  a nota atual (ou "—" se ainda não tocada).
- Textarea de comentário no final.
- Estados: **loading**, **fechado** (mensagem), **formulário**, **enviando**, **enviado**
  (tela de obrigado + resumo read-only do que foi enviado).
- Validação leve no front (pode enviar com algumas dimensões em branco; comentário opcional).

### Painel do participante

- Nova aba **"Avaliação"** em `ParticipantPanel`, na lista de abas **gated por pagamento**
  (`ALL_TABS`, não `UNPAID_TABS`).
- Componente de seção que monta `EventEvaluationForm` com as 10 dimensões e o token do
  participante.

### Painel do mentor

- Nova aba/sub **"Avaliação"** em `MentorPanel`, montando `EventEvaluationForm` com as
  9 dimensões (sem `mentorship`) e o token do mentor.

### Painel admin

- Nova aba **"Avaliação"** em `AdminPanel` → `EvaluationResults.jsx`:
  - Toggle liga/desliga (chama `set_evaluation_open`), refletindo `evaluation_open`.
  - Contador de respostas (participantes / mentores).
  - Para cada dimensão: barra de média com o valor, comparando **participante × mentor**
    lado a lado (mentoria aparece só para participante).
  - Lista de comentários livres (com tag do tipo de respondente).

## Migration

`migrations/add_event_evaluation.sql`, idempotente (padrão do repo: `IF NOT EXISTS`,
`CREATE OR REPLACE`, `ON CONFLICT DO NOTHING`):

- cria tabela `event_evaluations` + índice/constraint
- insere chave `evaluation_open` em `app_settings`
- cria as 4 RPCs e concede `EXECUTE` para `anon`/`authenticated` conforme o padrão
- políticas RLS deny-all na tabela

## Fora de escopo (YAGNI)

- Edição/reenvio de resposta.
- Avaliação anônima ou via link público.
- Comentário por dimensão.
- Export CSV (pode virar follow-up; dashboard cobre a necessidade atual).
- Gráficos avançados/temporais — só barras de média.
