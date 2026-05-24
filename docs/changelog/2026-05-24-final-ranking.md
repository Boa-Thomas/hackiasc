# feat: ranking final agregado

**Data:** 2026-05-24
**Branch:** feat/ia-evaluator
**Arquivos:** src/admin/AdminRanking.jsx, src/admin/AdminPanel.jsx

## O que foi feito
Aba admin "Ranking" que agrega as avaliações de `team_evaluations` e produz a
classificação final do evento.

## Decisões técnicas (edital vence)
- **Oficial = média das notas dos jurados humanos** (evaluator_type='human').
  A IA Evaluator é **menção complementar**, exibida à parte e sob botão "Revelar
  IA" — para ser anunciada após o resultado oficial (edital 5.3 / metodologia 9.4).
- **Desempate** (edital cláusula 11): Execução Técnica e IA → Validação → Escala
  (médias por critério entre jurados).
- **Eliminatório**: a coluna "Elim." mostra quantos jurados marcaram a equipe como
  eliminada no critério técnico. A desclassificação final cabe ao facilitador/
  organização (edital) — **não é automática**.
- Agregação 100% no cliente (admin tem SELECT em team_evaluations via RLS); sem RPC nova.

## Impacto
- Fecha o ciclo de avaliação: IA Evaluator (input/output manual) + scorecard dos
  jurados (link secreto) → ranking. Build e lint OK.
