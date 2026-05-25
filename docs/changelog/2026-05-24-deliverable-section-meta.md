# feat: per-section deliverable edit meta (who/when per entregável)

**Data:** 2026-05-24
**Branch:** feat/deliverable-meta
**Arquivos alterados:**
- migrations/add_deliverable_meta.sql (novo)
- src/participant/SectionMeta.jsx (novo)
- src/participant/DeliverablesSection.jsx
- src/mentor/MentorPanel.jsx
- src/admin/AdminDeliverables.jsx

## O que foi feito
Além do "Última edição por {nome}" GERAL por equipe (teams.updated_by), agora cada
entregável (hypotheses_canvas, slc_ia_canvas, learning_diary, final_deliverables) mostra
quem editou e há quanto tempo, de forma discreta, nos 3 painéis (participante, mentor, admin).

## Por que
Equipes têm vários membros editando seções diferentes. O meta geral não dizia QUEM mexeu em
CADA entregável — útil para mentores e organização acompanharem a divisão de trabalho.

## Decisões técnicas
- Nova tabela `team_deliverable_meta` (team_id, field) PK, RLS SELECT só is_admin_or_viewer();
  escrita só via RPC SECURITY DEFINER.
- `participant_save_team_deliverable` preservado 100% (cópia exata via pg_get_functiondef),
  só adicionado UPSERT na meta ao fim, gravando full_name do registration do token.
- Exposição da meta: participant_get_me e mentor_serialize_me ganham `deliverable_meta`
  ({ field: { updated_by_name, updated_at } }) — ambos cópias exatas + o campo novo.
  Admin lê direto `team_deliverable_meta` (RLS admin) e mapeia por team/field.
- Frontend: componente compartilhado `SectionMeta` (reusado pelos 3 painéis), texto pequeno
  text-muted, usa relativeTime. "Última edição" geral mantido.

## Impacto
- Sem breaking changes. Equipes sem meta ainda não preenchida: SectionMeta não renderiza nada.
- Migration NÃO aplicada aqui (orquestrador aplica via MCP).

## Próximos passos
- Aplicar migrations/add_deliverable_meta.sql no projeto qshrzfahotmjshtjuvno.
