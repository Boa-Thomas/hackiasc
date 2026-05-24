# feat: IA Evaluator (human-in-the-loop)

**Data:** 2026-05-24
**Branch:** feat/ia-evaluator
**Arquivos:** src/lib/iaEvaluator.js (novo), src/admin/AdminDeliverables.jsx

## O que foi feito
IA Evaluator sem API key/Whisper: o operador (admin) faz o input/output da
informação e o Claude faz a avaliação.

Fluxo no painel admin (Entregáveis → detalhe da equipe → "Avaliação — IA Evaluator"):
1. (opcional) Operador registra observações do pitch/demo ao vivo.
2. Botão **"Copiar pacote para o Claude"** — monta um prompt em markdown com os dados
   da equipe (membros + perfis, eixos econômicos, Canvas de Hipóteses, Canvas SLC-IA,
   Diário BML, entregas finais, notas públicas do mentor, observações do pitch) + a
   rubrica do edital + instruções + o formato JSON de saída.
3. Operador roda no Claude e cola o JSON de volta.
4. Botão **"Processar e gravar"** — o sistema parseia, valida, calcula a nota
   ponderada e grava em `team_evaluations` (`evaluator_type='ai'`).

## Decisões técnicas
- **Rubrica = EDITAL** (em divergência com a metodologia, o edital vence): 4 critérios
  ponderados — Execução Técnica e IA 30% (eliminatório), Validação 25%, Escala 25%,
  Pitch 20%. Avaliação do Mentor é extra (não soma).
- Nota por critério 0–100; `total_score` calculado server-side no parser
  (`Σ score×peso/100`) — o modelo não calcula o total, evitando erro aritmético.
- Parser tolerante a cercas ```json```; valida presença dos 4 critérios e ranges;
  mensagens de erro em PT-BR.
- Grava direto em `team_evaluations` (schema já existente) via supabase client (RLS admin),
  sem necessidade da edge function `evaluate-team` (que permanece como stub não usado).

## Impacto
- Lint sem regressão; build OK. Lógica de parser/builder testada via Node (cálculo,
  validação de critérios faltando e nota fora de range, montagem do pacote).
- Substitui o bloco "estrutura pronta — agente não conectado" por fluxo funcional.

## Próximos passos
- Scorecard digital dos jurados (página com link secreto) — o IA Evaluator entra como
  1 voto adicional (peso 1/N+1) junto às notas humanas na agregação do ranking.
