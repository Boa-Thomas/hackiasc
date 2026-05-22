# Admin: visão e gestão de entregas, comentários de mentor e avaliação

**Data:** 2026-05-22
**Branch:** master (criar branch `feat/admin-deliverables`)
**Status:** aprovado (design)

## Contexto

A infraestrutura de entregas já existe e **não será reconstruída**:

- Tabela `teams` com 4 canvases em JSONB: `hypotheses_canvas` (Fase 1), `slc_ia_canvas` + `learning_diary` (Fase 2), `final_deliverables` (Fase 3). Coluna `updated_by`.
- Participante submete via RPC `participant_save_team_deliverable(token, field, data)` — qualquer membro confirmado edita. UI: `src/participant/DeliverablesSection.jsx`, `DeliverableForm.jsx`, `deliverableFields.js`.
- Mentor autentica (email + código 4 dígitos) e vê entregas read-only + escreve `mentor_notes` (texto livre, por fase, `is_public`). UI: `src/mentor/`.
- Admin já gerencia mentores (`src/admin/AdminMentors.jsx`, geração de código).
- RLS: admin/viewer já têm SELECT em `teams` e `mentor_notes`.

**Gap:** o admin **não consegue ver as entregas, nem os comentários dos mentores**, não há status de entrega, export CSV, nem estrutura de avaliação por IA. Este documento cobre exatamente esse gap.

## Objetivo

Dar ao admin uma aba "Entregas" para visualizar as entregas das equipes, ler os comentários dos mentores (públicos e privados), controlar o status de cada entrega, exportar CSV, e deixar pronta — mas não ligada — a estrutura de avaliação automática por IA seguindo a rubrica do **edital**.

## Decisões

1. **Rubrica = edital** (documento assinado, cap. 6): 4 critérios com pesos % — Execução Técnica e IA 30% (eliminatório), Validação do Problema 25%, Escalabilidade e Negócio 25%, Pitch e Equipe 20%, + Avaliação do Mentor (extra). Armazenada como `rubric_version='edital_v1'`.
2. **Nova aba `AdminDeliverables`**, não estender `AdminTeams.jsx` (já tem 1556 linhas). Segue o padrão "1 aba por concern".
3. **Reusar `DeliverableForm` em read-only** (o mesmo componente que o mentor usa em leitura) — não criar view nova de canvas.
4. **Status manual** pelo admin — não auto-derivar de canvases preenchidos.
5. **Avaliação IA: só estrutura** (tabela + edge function stub 501). Sem botão de disparo, sem agente.

## Mudanças no banco (1 migration: `add_deliverable_status_and_evaluations.sql`)

### `teams.status`
```sql
ALTER TABLE teams ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft','submitted','reviewing','evaluated'));
```

### Tabela `team_evaluations`
- `id uuid pk default gen_random_uuid()`
- `team_id uuid not null references teams(id) on delete cascade`
- `evaluator_type text not null default 'ai' check (evaluator_type in ('ai','human'))`
- `rubric_version text not null default 'edital_v1'`
- `scores jsonb not null default '[]'::jsonb` — array de `{criterion_key, label, weight, score, justification}`
- `total_score numeric` — soma ponderada (0–100)
- `eliminated boolean not null default false` — critério técnico é eliminatório
- `summary text`
- `model text` — qual LLM gerou (null por enquanto)
- `status text not null default 'pending' check (status in ('pending','processing','done','error'))`
- `error text`
- `created_by uuid` — admin/serviço que disparou (nullable)
- `created_at timestamptz default now()`, `updated_at timestamptz default now()`
- Índice: `idx_team_evaluations_team_id`
- RLS: admin/viewer SELECT; admin INSERT/UPDATE/DELETE; `service_role` bypassa (edge function).

Nenhum RPC novo para leitura: admin lê `teams`, `mentor_notes`, `team_evaluations` direto via cliente autenticado (RLS permite).

## Frontend (`src/admin/AdminDeliverables.jsx`)

Nova aba no `AdminPanel.jsx`: `{ id: 'deliverables', label: 'Entregas', icon: '📦' }` (visível a admin e viewer; mutações só admin via prop `readOnly`).

**Lista:** todas as equipes de `teams` — nome, badge de status, nº de membros (join com `registrations` por `team_id`), última atualização, nº de comentários de mentor, status de avaliação.

**Detalhe da equipe (modal ou painel expandido):**
- 4 canvases read-only via `DeliverableForm` (modo leitura) + `deliverableFields.js` como config.
- Comentários dos mentores (`mentor_notes`): públicos e privados, com badge "privada/pública", nome do mentor e fase.
- Seletor de status (admin) → `UPDATE teams SET status=... WHERE id=...`.
- Painel de avaliação IA: lista linhas de `team_evaluations` (vazio por ora) + placeholder "estrutura pronta, agente pendente". Sem botão de disparo.

**Export CSV:** botão que gera **1 linha por equipe**, colunas achatadas dos 4 canvases (headers derivados de `deliverableFields.js`) + `status`. Client-side, no padrão de `exportCSV()` do `AdminRegistrations.jsx`.

## Edge function stub (`supabase/functions/evaluate-team/index.ts`)

- `POST {team_id}`. Valida input.
- Constante `EDITAL_RUBRIC` embutida (4 critérios + pesos + flag eliminatório).
- Retorna **501** JSON `{ error: 'not_implemented', rubric: EDITAL_RUBRIC }`. Sem chamada a LLM.
- Registrar no `supabase/config.toml` (`verify_jwt`).

## Fora de escopo

- Agente de IA real (só a estrutura).
- Fluxo de submissão do participante e auth de mentor (já funcionam).
- Scorecard de jurado humano (porta aberta via `evaluator_type='human'`, sem UI agora).

## Verificação

- `npm run build` passa; `npm run lint` sem novos erros.
- Migration aplica sem erro (idempotente — `IF NOT EXISTS`).
- Admin vê os 4 canvases de uma equipe que preencheu via painel do participante.
- Admin vê notas pública e privada de um mentor.
- Mudar status persiste e reflete na lista.
- CSV abre no Excel com 1 linha por equipe.
- `POST evaluate-team` retorna 501 com a rubrica.
