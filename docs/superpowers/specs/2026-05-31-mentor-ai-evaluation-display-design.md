# Avaliação da IA no painel do mentor — exibição mais clara

**Data:** 2026-05-31
**Status:** aprovado (brainstorming) — pronto para plano de implementação
**Escopo:** compartilhado mentor + admin (aba Entregas)

## Problema

A avaliação do IA Evaluator aparece hoje no painel do mentor (`MentorPanel.jsx`) e na aba Entregas do admin (`AdminDeliverables.jsx`) de forma pobre, escondendo informação que **já existe nos dados**:

1. **Nota agregada é só um número.** `aggregateTeamEvaluation` já calcula `agg.criteria` — os 4 critérios oficiais com nota ponderada e de quais fases vieram (`contributors`) — mas a tela mostra apenas `total_score / 100`. A quebra é descartada. Esse box-só-número é **código idêntico triplicado**: MentorPanel:158, AdminDeliverables:276 (e `AdminRanking` consome o mesmo `agg`).
2. **O parecer da IA (`summary`) é o artefato exclusivo do mentor** — o participante vê só as barras (sem justificativa), o jurado não vê a IA. Mesmo assim ele é renderizado como um `<p>` cinza no rodapé de cada bloco, sem rótulo, do mesmo tamanho do resto. É o que o mentor leva pra conversa com o time e não tem destaque.
3. **Sem hierarquia visual.** Tudo é número monoespaçado gold/cyan. Sem barras, sem cor semântica, sem destaque do critério ELIMINATÓRIO.
4. **Proveniência ignorada.** `model` e `updated_at` já chegam ao mentor na RPC, mas não são exibidos.
5. **Dois conceitos de "nota" sem rótulo.** A nota por entregável é média **simples**; a agregada é **ponderada**. Hoje parecem a mesma coisa e geram dúvida.

## Mecanismo atual (verificado no código)

- **Dado que o mentor recebe** (RPC `mentor_serialize_me`, `migrations/mentor_ai_evaluations.sql`), uma linha por entregável avaliado (`evaluator_type='ai'`, `status='done'`, `deliverable` não nulo):
  `team_id, deliverable, total_score, eliminated, scores[], axes[], summary, model, updated_at`.
- **`scores[]`** item: `{ criterion_key, label, weight, score, justification }`.
- **`axes[]`** (só `fase3`) item: `{ key, label, score, justification }`.
- **`total_score` por entregável** = média simples dos critérios daquela unidade (`parseDeliverableEvaluation`).
- **`aggregateTeamEvaluation(rows)`** (front, `src/lib/iaEvaluator.js`) devolve:
  `criteria[] ({ key, label, weight, score|null, contributors[] }), scoredCriteria, partial, total_score|null, eliminated, evaluatedUnits[]`.
  `total_score` só é número quando os **4 critérios** têm nota; antes disso é `partial` → "parcial (n/4)".
- **`AiEvaluationView`** (`src/lib/AiEvaluationView.jsx`) é **compartilhado**: usado pelo mentor (com prop `label`) e pelo admin dentro do `DeliverableEvaluator` (sem `label`, com controles copiar/colar logo abaixo).

**Nenhuma mudança de backend é necessária.** Todo o dado já vem na RPC; o `agg` já é calculado.

## Decisões

- **Escopo compartilhado:** melhorar o `AiEvaluationView` (atinge mentor + admin) e extrair o overview num componente único usado nos dois lados. Mata a triplicação.
- **Estado parcial é o caso principal** durante o evento (ex.: meio da Fase 2, Fase 3 ainda não avaliada). O design trata parcial como normal, não como exceção.
- **Parecer no rodapé** de cada bloco (escolha do usuário): o mentor varre as notas e o parecer arremata com a ação. Evita 3 callouts violeta empilhados abrindo cada bloco.
- **Cores semânticas:** verde (cyan) ≥ 75, amarelo (gold) 50–74, vermelho (hot) < 50. Helper único de cor por nota.

## Design

### Componente novo: `AiAggregateView` (overview)

Substitui o box-só-número (`Nota IA agregada XX / 100`) no MentorPanel e no AdminDeliverables.

- Recebe `agg` (saída de `aggregateTeamEvaluation`).
- **Hero** à esquerda: a nota ponderada `XX / 100` quando completa; senão **"parcial · n/4 critérios"**. Marca `⚠ eliminado` quando `agg.eliminated`. Legenda curta: "Ponderada (cl. 6) só fecha com os 4 critérios".
- **Barras** à direita: os 4 critérios oficiais (`agg.criteria`), cada um com nome, peso, barra com cor semântica e nota. Critério com `score == null` → rótulo "aguardando" + barra tracejada/vazia. O critério `tecnica_ia` ganha selo **ELIM**.
- Sem estado, sem fetch (igual ao `AiEvaluationView`). Retorna um estado vazio amigável quando `agg.scoredCriteria === 0`.

### `AiEvaluationView` enriquecido (por entregável)

Mantém a assinatura `{ evaluation, label }` e o retorno `null` quando vazio.

- **Cabeçalho do bloco:** `label` + nota do entregável rotulada **"média do entregável"** (desfaz a confusão com a ponderada). `⚠ eliminado` quando aplicável.
- **Proveniência:** linha pequena `modelo · avaliado há Xh` (usa `evaluation.model` + `evaluation.updated_at` + helper `relativeTime`). Omitida quando faltam os campos.
- **Critérios:** cada um com nome, peso, **barra com cor semântica**, nota e justificativa (mantida).
- **Eixos da cláusula 5.3** (fase3): mesmas barras/cores, em grid.
- **Parecer (`summary`) elevado:** callout violeta no **rodapé** do bloco, separado por divisória, com rótulo "Parecer · leve pro time". Tom: é o texto exclusivo do mentor.

### Integração

- **MentorPanel:** troca o box agregado por `<AiAggregateView agg={agg} />`; mantém o loop `DELIVERABLE_UNITS.map` renderizando `<AiEvaluationView evaluation={ev} label={unit.label} />` dentro do bloco bordeado.
- **AdminDeliverables:** troca o box agregado (linhas 276–286) por `<AiAggregateView agg={agg} />`. O `DeliverableEvaluator` continua usando `<AiEvaluationView evaluation={existing} />` (sem `label`) — herda o visual novo automaticamente; os controles copiar/colar seguem abaixo, intactos.

## Não-objetivos (YAGNI)

- Não mexer no lado do participante (`AiScoresCard`) nem do jurado.
- Não criar parecer consolidado por equipe — o `summary` é e continua **por entregável**.
- Nenhuma alteração de schema, RPC, RLS ou edge function.
- Sem novo fetch de dados.

## Verificação

- `npx vitest run` (cobre `aiScores`/`iaEvaluator`) + `npm run build` verdes.
- Conferir manualmente os estados: sem avaliação, parcial (1–3 critérios), completa, eliminada, com e sem eixos (fase1/2 vs fase3), com e sem `model`.
- `AiEvaluationView` continua correto no contexto do admin (sem `label`, controles abaixo).
- `/pre-deploy-verify` antes de push pra master (regra do projeto).
