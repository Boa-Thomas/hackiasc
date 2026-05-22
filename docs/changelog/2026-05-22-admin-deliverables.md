# feat: admin deliverables view, mentor comments, status, CSV, eval structure

**Data:** 2026-05-22
**Branch:** feat/admin-deliverables
**Arquivos alterados:** migrations/add_deliverable_status_and_evaluations.sql, supabase/functions/evaluate-team/index.ts, src/admin/AdminDeliverables.jsx, src/admin/AdminPanel.jsx

## O que foi feito
Aba "Entregas" 📦 no painel admin (visível a admin e viewer):
- Lista as equipes com status, nº de membros, nº de comentários de mentor e última atualização.
- Detalhe da equipe: os 4 canvases read-only (reuso de `DeliverableForm`/`LearningDiary`), comentários dos mentores (públicos **e** privados, com nome/fase/badge) e painel de avaliação por IA.
- Seletor de status (só admin); export CSV (1 linha por equipe, headers vindos de `deliverableFields.js`).

Migration adiciona `teams.status` (`draft|submitted|reviewing|evaluated`) e a tabela `team_evaluations` (estrutura da avaliação por IA, com RLS admin/viewer). Edge function `evaluate-team` é um stub: retorna 501 com a rubrica do edital embutida, pronta para plugar o agente depois.

## Por que
O participante já submetia entregas e o mentor já comentava, mas o admin não conseguia ver nada disso, controlar status nem exportar — gap do lado admin do que foi pedido.

## Decisões técnicas
- Rubrica do **edital** (4 critérios, pesos %, Técnica eliminatória) — escolha do organizador.
- Nova aba em vez de inchar `AdminTeams.jsx` (1556 linhas) — padrão "1 aba por concern".
- Reuso de `DeliverableForm`/`LearningDiary` em modo leitura (mesmos componentes do painel do mentor).
- Avaliação por IA: **só a estrutura** (tabela + edge function stub), agente pendente.
- `config.toml` não existe no master (está em outra branch); o deploy da função usa `verify_jwt=true` por padrão.

## Impacto
- Sem breaking changes. RLS já permitia leitura admin de `teams`/`mentor_notes`; adicionada RLS para `team_evaluations`.
- Bundle não muda materialmente (reuso de componentes existentes).

## Próximos passos
- Aplicar `migrations/add_deliverable_status_and_evaluations.sql` no Supabase.
- Deploy da edge function `evaluate-team`.
- Quando o agente de IA existir: implementar a chamada ao LLM dentro de `evaluate-team` e gravar em `team_evaluations`.
