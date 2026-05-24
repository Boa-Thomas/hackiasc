# feat: Muro de Dores + votação digital (Fase 1 — sexta abertura)

**Data:** 2026-05-24
**Branch:** feat/ia-evaluator
**Arquivos criados:**
- `migrations/add_pain_wall.sql`
- `src/wall/useWallDevice.js`
- `src/wall/WallParticipant.jsx`
- `src/wall/WallScreen.jsx`
- `src/admin/AdminWall.jsx`

## O que foi feito
Três telas para a dinâmica "Muro de Dores" da metodologia HackIA (Fase 1):
- `#muro` (WallParticipant): registra dores e vota (até 3), conforme a fase.
- `#telao` (WallScreen): projeção read-only em tempo real (polling 2s).
- AdminWall: alterna fase (closed/wall_open/voting_open), oculta/reexibe dores, ranking.

Backend em `add_pain_wall.sql`: tabelas `pains`, `pain_votes`, `wall_state` (singleton),
RLS deny-all + RPCs SECURITY DEFINER (`wall_submit_pain`, `wall_vote`, `wall_unvote`,
`wall_list` para anon; `wall_set_phase`, `wall_hide_pain`, `wall_unhide_pain`,
`wall_admin_list` para authenticated com `is_admin()`).

## Decisões técnicas
- **Sem login Supabase para participantes**: identidade leve por device_token (UUID em
  localStorage `hackiasc_wall_device`) + nome. Zero fricção na abertura presencial.
  Fraude não é risco crítico (~100 pessoas) — documentado.
- **Polling em vez de Realtime**: Realtime exigiria SELECT público via RLS, quebrando o
  padrão deny-all do projeto. Polling (3s participante / 2s telão / 4s admin) é barato.
- **Limite de 3 votos atômico**: `INSERT ... SELECT WHERE count < 3 ON CONFLICT DO NOTHING`
  + checagem de ROW_COUNT fecha a race do limite. Diferencia `already_voted` de
  `vote_limit_reached`.
- **Singleton `wall_state`**: `id BOOLEAN PK CHECK (id = true)` + INSERT ON CONFLICT.
- **wall_list aceita p_device NULL**: telão chama sem device, recebe my_votes vazio.

## Impacto
- Sem breaking changes. Migration NÃO auto-aplicada — orquestrador aplica via MCP.
- App.jsx e AdminPanel.jsx NÃO foram editados (outro agente em paralelo) — fiação
  documentada no relatório de entrega.

## Próximos passos
- Orquestrador: aplicar migration, fiar rotas em App.jsx e aba em AdminPanel.jsx.
