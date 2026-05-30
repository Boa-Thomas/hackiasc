# Avaliação da IA completa no painel do mentor

**Data:** 2026-05-30
**Branch:** `feat/mentor-ai-evaluations`

## Objetivo

O mentor sempre vê a avaliação completa da IA (IA Evaluator) das equipes que mentora,
assim que a organização roda a avaliação. "Completa" = nota agregada da equipe + nota e
justificativa de cada critério do edital + eixos do pitch (fase 3) + parecer (`summary`) +
flag de eliminação. **Sem switch** — o mentor é parte da organização.

O lado da **equipe permanece intocado**: a equipe continua vendo apenas a nota agregada por
fase, atrás do switch global `team_scores_visible` existente. Nada muda para o participante.

## Não-objetivos

- Não mexer no `AiScoresCard` / `aiScores.js` / `participant_get_team_scores` (lado da equipe).
- Não adicionar nenhum switch novo no admin.
- Não alterar a lógica de avaliação (`iaEvaluator.js`), parsing ou agregação.

## Arquitetura

### A) Backend — 1 migration

`migrations/mentor_ai_evaluations.sql`: `CREATE OR REPLACE FUNCTION mentor_serialize_me(p_mentor_id)`.

Copia o corpo atual (definido em `mentor_teams_nn.sql`) e adiciona uma chave **`evaluations`**
ao JSON de retorno, espelhando exatamente o padrão de `notes`:

- Array das linhas de `team_evaluations` de **todas** as equipes pareadas ao mentor
  (`mentor_teams`), filtrando `evaluator_type = 'ai'`, `status = 'done'`, `deliverable IS NOT NULL`.
- Cada item carrega: `team_id, deliverable, total_score, eliminated, scores, axes, summary,
model, updated_at`. O `team_id` permite o frontend filtrar pela equipe ativa (como em `notes`).

As RPCs `mentor_get_me(UUID)` e `mentor_get_me_by_token(UUID)` **não mudam** — já delegam ao
serializer. Sem novos `GRANT`. `SECURITY DEFINER` + join em `mentor_teams` garante que o mentor
só lê avaliações das próprias equipes (sem IDOR). Idempotente (CREATE OR REPLACE, mesma assinatura).

### B) Frontend

1. `src/mentor/useMentorAuth.js`: expor `evaluations: me?.evaluations ?? []` no retorno do hook
   (espelha `notes`). ~1 linha.

2. **Componente compartilhado** `src/lib/AiEvaluationView.jsx` (apresentacional, sem estado):
   recebe a linha de avaliação de **um** entregável (`scores`, `axes`, `summary`, `total_score`,
   `eliminated`, `label`) e renderiza nota + critérios/justificativas + eixos + parecer. É a
   extração literal do bloco que já existe em `AdminDeliverables.jsx` (linhas ~534-570).
   O `AdminDeliverables.jsx` passa a importar e usar esse componente — **uma fonte de verdade**,
   admin e mentor sempre idênticos.

3. `src/mentor/MentorPanel.jsx`: novo card **"Avaliação da IA"** para a equipe ativa:
   - **Nota IA agregada** da equipe via `aggregateTeamEvaluation(evals)` — `total / 100`, ou
     `parcial (x/4 critérios)`, ou `—`; com `⚠ eliminado` quando aplicável.
   - Um `AiEvaluationView` por entregável avaliado (fase 1/2/3), na ordem de `DELIVERABLE_UNITS`,
     usando o `label` da unidade.
   - **Empty state** quando a equipe ainda não tem avaliação da IA: "A organização ainda não
     rodou a avaliação da IA desta equipe."
   - Disclaimer: nota orientativa gerada por IA; a avaliação oficial é feita pelos jurados.

   O card não depende das abas de fase — mostra tudo de uma vez (mesma lógica do admin).

## Fluxo de dados

```
login mentor → mentor_get_me / mentor_get_me_by_token
            → mentor_serialize_me(p_mentor_id)
            → { mentor, teams, notes, evaluations }   (evaluations: todas as equipes)
MentorPanel → evaluations.filter(e => e.team_id === team.id)   (equipe ativa)
            → aggregateTeamEvaluation(evals)  +  AiEvaluationView por entregável
```

## Componentes e responsabilidades

| Unidade                          | Faz                                                  | Depende de                                                         |
| -------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------ |
| `mentor_serialize_me` (SQL)      | Devolve `evaluations` das equipes do mentor          | `team_evaluations`, `mentor_teams`                                 |
| `useMentorAuth`                  | Expõe `evaluations` do payload                       | `mentor_get_me*`                                                   |
| `AiEvaluationView` (novo)        | Render de 1 avaliação (nota+critérios+eixos+parecer) | `EDITAL_RUBRIC` (só leitura visual)                                |
| `MentorPanel`                    | Card agregado + lista de avaliações + empty state    | `aggregateTeamEvaluation`, `DELIVERABLE_UNITS`, `AiEvaluationView` |
| `AdminDeliverables` (refatorado) | Reusa `AiEvaluationView` no lugar do bloco inline    | `AiEvaluationView`                                                 |

## Riscos e mitigação

- **Estilo / prettier hook:** todos os arquivos JS/JSX editados via técnica `.txt` → `mv`
  (ver memória `formatter-hook-conflict`), nunca Edit/Write direto.
- **Refator do admin:** a extração é byte-equivalente ao bloco atual; conferir `git diff` do
  `AdminDeliverables.jsx` para garantir que o render não mudou (só virou `<AiEvaluationView/>`).
- **Migration em produção:** aplicar via Supabase MCP só após confirmação do organizador
  (ação outward-facing); o arquivo fica versionado independentemente.

## Verificação

- `npm run build` e `npm run lint` limpos.
- `git diff --stat` mostra mudança cirúrgica (sem reformatação whole-file).
- Manual: mentor logado vê o card; equipe sem avaliação mostra empty state; lado da equipe
  (`AiScoresCard`) inalterado.
