# feat: scorecard digital dos jurados (link secreto, sem auth)

**Data:** 2026-05-24
**Branch:** feat/ia-evaluator
**Arquivos:** migrations/add_jurors_scorecard.sql, src/juror/*, src/admin/AdminJurors.jsx, App.jsx, AdminPanel.jsx

## O que foi feito
Página de avaliação para os jurados acessível por LINK SECRETO (token UUID na
querystring do hash: `#jurado?t=<uuid>`), SEM login. O admin cria cada jurado,
gera e copia o link, e ativa/desativa. O jurado dá notas pela rubrica do EDITAL
(4 critérios 0–100 + justificativa) + parecer + flag eliminado, e pode reeditar.

## Decisões técnicas
- Reusa `team_evaluations` (`evaluator_type='human'`, nova coluna `juror_id`).
  Índice único parcial 1 scorecard por (jurado, equipe).
- RPCs `SECURITY DEFINER`: `juror_get_context`, `juror_submit_score` (anon, via
  token), `admin_list_jurors` (gate `is_admin()`), `juror_token_owner` (helper).
- **Total sempre server-side** (pesos 30/25/25/20); cliente nunca informa o total.
- Token sai da URL após carregar (`history.replaceState`) e fica em sessionStorage.
- Rubrica importada de `src/lib/iaEvaluator.js` (sem duplicação).
- Hardening: `SET search_path` e `REVOKE EXECUTE FROM PUBLIC` nas funções admin
  (ver add_evaluation_security_hardening.sql).

## Impacto
- Migration aplicada em produção (qshrzfahotmjshtjuvno). Advisor: só WARNs do mesmo
  tipo já presente no projeto; hardening aplicado nas funções novas.
- O IA Evaluator (evaluator_type='ai') e os jurados (human) coexistem em
  team_evaluations — o ranking final agregado (peso 1/N+1) é a próxima task.
