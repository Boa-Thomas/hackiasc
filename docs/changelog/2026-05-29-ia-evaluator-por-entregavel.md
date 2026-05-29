# feat: IA Evaluator por entregável

**Data:** 2026-05-29
**Branch:** feat/ia-evaluator-por-entregavel
**Arquivos:** src/lib/iaEvaluator.js, src/lib/iaEvaluator.test.js, src/admin/AdminDeliverables.jsx, src/admin/AdminRanking.jsx, migrations/add_evaluation_deliverable.sql

## O que foi feito
A IA Evaluator deixou de produzir 1 avaliação holística por equipe e passou a
avaliar cada entregável (Fase 1 Hipóteses / Fase 2 SLC-IA+Diário / Fase 3
Entregas+Pitch) pelos critérios do edital que se aplicam a ele. As avaliações por
entregável agregam (média entre fases) na nota IA da equipe, que substitui a
menção IA holística no ranking. Card lateral na vista de Entregas lista pendentes
por (equipe × entregável) com copiar/colar/gravar inline (processamento rápido).

## Por que
Pós-evento, o operador precisa avaliar muitas equipes em sequência; o pacote único
era um blob difuso e exigia abrir cada equipe. Separar por entregável dá avaliações
focadas e a fila lateral agiliza o processamento.

## Decisões técnicas
- Mapeamento critério→fase: Validação (Fase1+Fase2), Técnica (Fase2+Fase3),
  Escala/Pitch (Fase3). Agregação por média; total só fecha com os 4 critérios.
- Eliminatório (Técnica): OR entre Fase 2 e Fase 3.
- Coluna `deliverable` + índice único parcial em team_evaluations (1 ai por
  equipe×entregável, re-executável via UPDATE). Linhas humanas (jurados) ficam com
  deliverable NULL — nota oficial intacta.
- Gravação SELECT-then-UPDATE/INSERT no cliente (índice parcial não é conflict
  target confiável no PostgREST), espelhando juror_submit_score.
- Ranking agrega as linhas ai por entregável e ignora linhas ai legadas (NULL).
- Funções holísticas (buildEvaluationPrompt/parseEvaluation) removidas; componente
  reutilizável DeliverableEvaluator usado no detalhe e na fila.

## Impacto
- Migration `add_evaluation_deliverable.sql` precisa ser aplicada À MÃO no Supabase
  (projeto qshrzfahotmjshtjuvno) antes do recurso funcionar em produção.
- Testes Vitest novos (14) em iaEvaluator.test.js; suíte completa 24/24, lint dos
  arquivos tocados limpo, build OK.

## Próximos passos
- Limpeza opcional das linhas ai holísticas legadas de teste (deliverable NULL).
