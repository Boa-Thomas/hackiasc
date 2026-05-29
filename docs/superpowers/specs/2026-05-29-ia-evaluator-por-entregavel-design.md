# Design — IA Evaluator por entregável

**Data:** 2026-05-29
**Branch (proposta):** `feat/ia-evaluator-por-entregavel`
**Status:** aprovado para implementação

## Contexto e problema

Hoje o "Avaliação — IA Evaluator" (`src/admin/AdminDeliverables.jsx` + `src/lib/iaEvaluator.js`)
produz **uma avaliação holística por equipe**: um único pacote markdown com TODAS as fases
(Hipóteses + SLC-IA + Diário + Entregas + notas do mentor + pitch) e a rubrica completa do edital
(4 critérios transversais). O operador copia o pacote, roda no Claude, cola o JSON e grava 1 linha
em `team_evaluations` (`evaluator_type='ai'`).

Pós-evento (evento: 22–24 maio 2026; hoje 29 maio), o operador precisa avaliar várias equipes em
sequência. As dores: (a) o pacote único é um blob grande e a avaliação fica difusa; (b) é preciso
abrir cada equipe e descer até o card; (c) não há visão rápida do que falta avaliar.

### Restrições herdadas (não negociáveis)

- `team_evaluations` é **compartilhada** por IA e jurados humanos. As linhas humanas
  (`evaluator_type='human'`, `juror_id` setado) vêm da RPC `juror_submit_score` e são a **nota
  oficial** do ranking. **Não podem ser tocadas.**
- `AdminRanking.jsx` calcula: oficial = média do `total_score` das linhas `human`; menção IA = a
  **última** linha `ai` (`sort created_at desc → [0]`), lendo `total_score` e `scores` por
  `criterion_key`. Se as avaliações por entregável virarem novas linhas `ai`, essa seleção
  "última linha" passa a pegar uma nota parcial e corrompe a menção IA — **precisa de guarda.**
- A tabela já evoluiu com o padrão "coluna nova + índice único parcial" (ver
  `add_jurors_scorecard.sql`: `juror_id` + `uq_team_evaluations_juror_team`). Seguimos o mesmo padrão.
- Migrations são **aplicadas à mão** no projeto Supabase `qshrzfahotmjshtjuvno` (não auto-aplicam).

## Decisão (escolhas do usuário)

1. **Resultado:** a IA passa a produzir **1 avaliação por entregável**; a agregação dessas
   avaliações **substitui** a menção IA holística. Nota oficial dos jurados intacta.
2. **Pontuação:** cada entregável é avaliado só pelos critérios do edital que se aplicam a ele.
3. **Fila:** card lateral por **equipe × entregável**.
4. **Otimizações:** JSON robusto + processar em sequência rápida + reforçar evidência/eliminatório.
   (Enxugar tokens **não** foi priorizado — os pacotes por entregável já são naturalmente menores.)
5. **Agregação:** média simples entre fases. **Mapeamento:** tabela abaixo. **Eliminatório:** marca
   eliminado se **qualquer** fase técnica (Fase 2 **ou** Fase 3) reprovar.

## Unidades de avaliação e mapeamento de critérios

`EDITAL_RUBRIC` permanece a fonte de verdade de pesos/labels (Técnica 30% elim. · Validação 25% ·
Escala 25% · Pitch 20%). Definimos `DELIVERABLE_UNITS` em `iaEvaluator.js`:

| `id`    | Label                          | Fonte (JSONB)                       | Critérios (`criterion_key`)               | Pitch notes? |
|---------|--------------------------------|-------------------------------------|-------------------------------------------|--------------|
| `fase1` | Fase 1 · Hipóteses             | `hypotheses_canvas`                 | `validacao_problema`                      | não          |
| `fase2` | Fase 2 · SLC-IA + Diário BML   | `slc_ia_canvas` + `learning_diary`  | `tecnica_ia`, `validacao_problema`        | não          |
| `fase3` | Fase 3 · Entregas + Pitch/demo | `final_deliverables`                | `tecnica_ia`, `escala_negocio`, `pitch_equipe` | sim     |

Cobertura por critério → agregação:
- `tecnica_ia` (30%, elim.): Fase 2 + Fase 3 → média
- `validacao_problema` (25%): Fase 1 + Fase 2 → média
- `escala_negocio` (25%): Fase 3
- `pitch_equipe` (20%): Fase 3 (alimentado pelas observações do operador, `pitchNotes`)

## Algoritmo de agregação (`aggregateTeamEvaluation`)

Entrada: as linhas `ai` da equipe (cada uma com `deliverable` e `scores`).
Para cada um dos 4 critérios de `EDITAL_RUBRIC.criteria`:
- coletar a `score` daquele `criterion_key` em todas as unidades avaliadas que o pontuam;
- `crit.score = round1(média)` se houver ≥1; senão `null`.

Saída:
```js
{
  criteria: [{ key, label, weight, score: number|null, contributors: ['fase2','fase3'] }, ...4],
  scoredCriteria: number,            // quantos dos 4 têm nota
  partial: scoredCriteria < 4,
  total_score: partial ? null : round1(Σ score*weight/100),
  eliminated: bool,                  // OR do `eliminated` das unidades que cobrem tecnica_ia
  evaluatedUnits: ['fase1','fase2'], // unidades com avaliação gravada
}
```
Mesma fórmula do `juror_submit_score`/jurados → a menção IA fica comparável à nota oficial.
Função pura, exportada de `iaEvaluator.js`, reutilizada por `AdminDeliverables` e `AdminRanking`.

## Modelo de dados

`migrations/add_evaluation_deliverable.sql` (novo; idempotente; **aplicar à mão**):
```sql
ALTER TABLE team_evaluations ADD COLUMN IF NOT EXISTS deliverable TEXT
  CHECK (deliverable IN ('fase1','fase2','fase3'));        -- NULL = holístico/humano (legado)
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_eval_ai_deliverable
  ON team_evaluations (team_id, deliverable)
  WHERE evaluator_type='ai' AND deliverable IS NOT NULL;   -- 1 avaliação AI por (equipe, entregável)
```
- Linhas humanas (`juror_id` setado) → `deliverable=NULL`, intactas.
- Linhas `ai` legadas (holísticas, `deliverable=NULL`) → **ignoradas** pela nova agregação. Não há
  migração de dados; opcionalmente o operador apaga as antigas de teste.
- Gravação: como o índice é parcial (target de conflito instável no PostgREST), seguimos o padrão do
  `juror_submit_score`: **SELECT-then-UPDATE/INSERT** no cliente (admin é `authenticated`, RLS
  `Admin write team evaluations` cobre ALL). Procurar a linha `ai` de `(team_id, deliverable)` no
  estado já carregado; se existir → `update().eq('id', …)`, senão → `insert`.

## Formato de I/O por entregável

`buildDeliverablePrompt({ unit, team, members, mentorNotes, pitchNotes })` monta um pacote focado:
identidade da equipe (nome, membros+perfis, eixos, projeto) + **apenas** o conteúdo daquele
entregável (campos da fonte; + Diário se `fase2`; + `pitchNotes` se `fase3`) + notas públicas do
mentor relevantes + **somente os critérios daquele entregável** + schema JSON explícito + instruções
reforçadas de evidência e (quando cobre `tecnica_ia`) do eliminatório.

JSON de saída por entregável (só os critérios da unidade):
```json
{
  "scores": [ { "criterion_key": "tecnica_ia", "score": 0, "justification": "..." } ],
  "eliminated": false,
  "summary": "...",
  "model": "claude-..."
}
```

`parseDeliverableEvaluation(text, unit)`: reutiliza `extractJson` (tolerante a cercas/lixo); valida
que `scores` contém **exatamente** os critérios da unidade (faltando/extra → erro PT-BR), faixa
0–100, normaliza `{criterion_key,label,weight,score,justification}`. `eliminated` só é considerado se
a unidade cobre `tecnica_ia` (senão forçado `false`). `total_score` da linha = média simples das notas
da unidade (apenas display "nota do entregável"; **o ranking não lê esse campo** — recalcula via
`aggregateTeamEvaluation` a partir de `scores`).

As funções holísticas antigas (`buildEvaluationPrompt`, `parseEvaluation`) saem do uso e são
**removidas** de `iaEvaluator.js` (nenhum outro consumidor após esta mudança).

## UI — duas superfícies (`AdminDeliverables.jsx`)

### A. Detalhe da equipe
- As abas de fase continuam mostrando o **conteúdo** dos entregáveis (forms read-only), como hoje.
- O card único "Avaliação — IA Evaluator" é substituído por **"Avaliações por entregável"**: um
  sub-card por unidade (`fase1`/`fase2`/`fase3`), cada um com: label + selos dos critérios, a
  avaliação gravada daquele entregável (notas por critério + justificativas + summary + selo
  eliminado), e os controles `[1. Copiar pacote]` → `[2. Colar JSON]` → `[3. Processar e gravar]`.
  Fase 3 também mostra o textarea de **observações do pitch/demo** (`pitchNotes`).
- Header da equipe ganha um **selo com a nota IA agregada** (via `aggregateTeamEvaluation`):
  `Nota IA: 72,5/100` ou `Nota IA: parcial (2/4 critérios)`, com aviso de eliminado se aplicável.

### B. Card lateral — fila de pendentes (vista de lista de Entregas)
- Layout responsivo: abaixo do card de prazo e da linha "N equipes / Exportar CSV", um grid
  `lg:grid-cols-[1fr_360px]`: **tabela à esquerda**, **card "Pendentes" à direita** (sticky no topo).
  Em telas pequenas, empilha (fila abaixo da tabela).
- Item = `(equipe, entregável)` **pendente**. "Pendente" =
  - o entregável está **preenchido** (fonte JSONB com algum valor não-vazio; `fase2` = `slc_ia_canvas`
    não-vazio **ou** `learning_diary` com ciclos; `fase3` = qualquer de repo/deploy/slides/próximos),
    **e**
  - **não** há avaliação `ai` para `(equipe, entregável)` **ou** o entregável foi editado após a
    última avaliação (`max(team_deliverable_meta.updated_at` dos campos-fonte da unidade`) >
    eval.updated_at` → marca "atualizado").
- Cada item recolhido mostra `▸ Equipe · Fase N` (+ tag "atualizado" se stale). Expandir (1 ativo por
  vez, `activeQueueKey`) revela inline: `[copiar]`, textarea para colar JSON, `[enviar]` — **sem abrir
  a equipe**. Fase 3 expandida também mostra o textarea de pitch. Ao enviar com sucesso, refetch e o
  item sai da fila (ou re-rankeia). Realiza o "processar em sequência rápida".
- A mesma lógica de copiar/parsear/gravar das funções de `iaEvaluator.js` é usada nos dois lugares.

## Ranking (`AdminRanking.jsx`)

- **Oficial (humanos): inalterado.**
- **Menção IA:** para cada equipe, filtrar `evaluator_type==='ai' && deliverable != null`, rodar
  `aggregateTeamEvaluation`, usar `total_score` (null se `partial`) como `aiScore`. Linhas `ai`
  legadas (`deliverable == null`) são **ignoradas** (a guarda exigida). A seção "Menção do IA
  Evaluator" e o CSV passam a usar a nota agregada; equipes com agregação parcial mostram
  "parcial" / `—`.

## Estado React (resumo)

- Detalhe: `evalDrafts` (`{ [`${teamId}:${unit}`]: jsonInput }`), `pitchNotes` (por equipe/fase3),
  `evalError`, `evalSaving`, `copiedKey`. Limpar ao trocar de equipe (como hoje).
- Lista: `activeQueueKey`, `queueJson`, `queuePitch`, `queueError`, `queueSaving`. O fetch já carrega
  `teams`, `members`, `notes`, `evals`, `deliverableMeta` — adicionar `deliverable` ao `select` de
  `team_evaluations`.

## Edge cases

- Entregável vazio → não aparece na fila; no detalhe o pacote pode ser copiado mas a IA é instruída a
  sinalizar ausência de entrega.
- Equipe sem nenhuma avaliação por entregável → `aiScore = null` (parcial total).
- Eliminado: OR entre Fase 2 e Fase 3; desclassificação final continua humana (nota do ranking).
- Reavaliar um entregável: UPDATE da linha existente (índice único garante 1 por equipe×entregável).
- Clipboard bloqueado: fallback mostrando o texto para cópia manual (como hoje).

## Testes

Testes Node (sem framework, como o changelog anterior fez) cobrindo `iaEvaluator.js`:
- `buildDeliverablePrompt`: cada unidade inclui só seus campos-fonte e só seus critérios; `fase3`
  inclui `pitchNotes`; ausência de pitch é sinalizada.
- `parseDeliverableEvaluation`: aceita JSON válido da unidade; rejeita critério faltando/extra e nota
  fora de 0–100; ignora `eliminated` em `fase1`; tolera cercas ```json```.
- `aggregateTeamEvaluation`: média entre fases (ex.: Técnica = média Fase2/Fase3); `partial`/`total`
  null quando faltam critérios; `eliminated` = OR; fórmula ponderada confere com pesos do edital.
- `npm run lint` sem regressão; `npm run build` OK.

## Arquivos

1. `migrations/add_evaluation_deliverable.sql` — **novo** (coluna + índice; aplicar à mão).
2. `src/lib/iaEvaluator.js` — `DELIVERABLE_UNITS`, `buildDeliverablePrompt`,
   `parseDeliverableEvaluation`, `aggregateTeamEvaluation`; remove holístico.
3. `src/admin/AdminDeliverables.jsx` — avaliações por entregável (detalhe) + card lateral inline (lista).
4. `src/admin/AdminRanking.jsx` — menção IA agregada + guarda contra linhas legadas.
5. `docs/changelog/2026-05-29-ia-evaluator-por-entregavel.md` — registro.

## Fora de escopo

- Nota oficial / fluxo dos jurados / `juror_submit_score`.
- Integração de API/Whisper (continua human-in-the-loop: operador faz I/O).
- Enxugar agressivamente tokens do prompt (não priorizado).
- Migração das linhas `ai` holísticas legadas (ignoradas; limpeza manual opcional).
