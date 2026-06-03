# feat(auth): Phase 3 SP3/Phase 1 — scope-enforcement helpers

**Data:** 2026-06-03
**Branch:** feat/auth-phase3-sp3
**Spec:** docs/superpowers/specs/2026-06-03-auth-phase3-sp3-scope-enforcement-design.md
**Arquivos:** migrations/phase3_sp3_scope_helpers.sql

## O que foi feito
Fundação do enforcement de scope (SP3, Option 2 — writes-only): helpers que leem o scope **ao vivo** via `current_grant_ref()`:
- `scope_read_only()` — `COALESCE((scope->>'read_only')::bool, false)` (false p/ {}/null/sem-grant).
- `can_write()` — `is_admin() AND NOT scope_read_only()`.
- `scope_tab_allowed(tab)` / `assert_tab(VARIADIC)` — gate de aba (true quando sem restrição; multi-tab p/ RPCs compartilhadas).
- `my_scope()` — scope do chamador ({} sem grant), p/ o frontend (Phase 4).

## Por que
SP3 Phase 1. Helpers aditivos, **no-op** até serem consumidos (Phase 2 = guards nas RPCs de escrita; Phase 3 = RLS WITH CHECK; Phase 4 = frontend). A invariante `{}`/sem-grant == irrestrito (via COALESCE) garante que contas legadas (admin feito à mão, sem grant) nunca são trancadas — risco #1 mitigado.

## Impacto
- Aplicado em prod + smoke (`scope_read_only`=false, `can_write`=false, `scope_tab_allowed`=true, `my_scope`={} no contexto sem grant). Nada consome ainda → zero impacto comportamental.

## Próximos passos (SP3, retrofit grande — auth-crítico)
- **Phase 2:** guard `IF NOT can_write() THEN RAISE 'read_only'` + `assert_tab('<aba>')` nas ~25 RPCs de escrita (admin_* → set_* → wall_* → checkin/sugar/notif).
- **Phase 3:** RLS WITH CHECK das 13 tabelas escritas direto (+6 storage; padronizar team_evaluations no `can_write()`).
- **Phase 4:** AdminPanel narra abas por `my_scope()` + esconde ações em read_only.
- Cada fase com teste de regressão (admin sem grant ESCREVE; read_only NÃO; tab-scoped bloqueado fora da aba).
