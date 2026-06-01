# Design: Unified access-grants — Phase 2 (personas + full revoke)

**Date:** 2026-06-01
**Status:** Approved (design phase)
**Builds on:** `docs/superpowers/specs/2026-06-01-unified-auth-access-grants-design.md` (target architecture) and `docs/changelog/2026-06-01-unified-auth-phase1.md` (what shipped).

## Goal

Make the deferred personas work end-to-end on the access-grants system and complete the credential lifecycle:
1. **Facilitator** — a dedicated minimal panel + `is_facilitator()` wired into the RLS/RPCs it needs.
2. **Mentor / juror** — switch their auth RPCs `uuid → text` + a `grant_resolve` fallback, so unified `#acesso` grant tokens work; legacy tokens keep working (coexistence).
3. **Full revoke** — revoking a grant kills the session immediately (ban/delete the backing Supabase user), not just block new sessions.
4. **Retire the staff password-in-URL link** (`#admin-acesso?t=<senha>`) — staff is issued via Acessos now.

**Out of scope (→ Phase 3):** admin/viewer/checkin password-account creation via UI; `scope` enforcement; cutover/removal of the legacy `#mentor?t=` / `#jurado?t=` routes (after new links are distributed).

## Context from Phase 1 (already in prod)

`access_grants` registry, `grant_resolve(text)`, admin RPCs, `is_facilitator()`, and the `access-exchange` edge (token-exchange → real Supabase session) are live. The Acessos UI currently offers only `staff/checkin/viewer` (the roles whose panel + RLS already accept the session). pgcrypto is in the `extensions` schema; rate-limiting uses the `rate_limits` table; mentor/juror auth RPCs are `uuid`-typed (the blocker this phase removes).

## 1. Facilitator — dedicated panel + RLS

### Panel (`src/facilitator/FacilitatorPanel.jsx`, route `#facilitador`)
A lean, standalone view (NOT the full admin shell) rendered under a `facilitator` session, exposing only what the facilitator operates (footprint confirmed by inspecting `AdminFacilitator.jsx`):
- **Cronograma:** list `schedule_days` + `schedule_items`; advance / toggle `done` / edit / reorder / add / delete items; patch day window/note.
- **Anúncios:** `set_announcement(p_body)` / `clear_announcement`.
- **Muro:** read current phase (`wall_admin_list`) and `wall_set_phase(p_phase)`.
- **Notas dos jurados:** `get_team_scores_visible` + `set_team_scores_visible(p_visible)`.
- **Pulse (read-only):** confirmed count / check-ins from `registrations`; deliverable completion from `teams`.
- **Schedule push:** `notify_schedule_start(p_item_id)`.
Routing: `routeForRole('facilitator')` already returns `#facilitador`; `App.jsx` gains a `#facilitador` branch rendering `<FacilitatorPanel>` guarded by a facilitator (or admin) session.

### RLS / RPC gating
Add facilitator to the gate of exactly the objects above — nothing more:
- **Tables:** RLS policies allowing `is_facilitator()` for: `schedule_items` (SELECT/INSERT/UPDATE/DELETE), `schedule_days` (SELECT/UPDATE), `announcements` (SELECT), `registrations` (SELECT — status/check-in columns only; do NOT widen PII exposure), `teams` (SELECT — deliverable columns + name).
- **RPCs:** the 7 facilitator RPCs (`set_announcement`, `clear_announcement`, `notify_schedule_start`, `wall_set_phase`, `set_team_scores_visible`, `wall_admin_list`, `get_team_scores_visible`) currently self-check `is_admin()`. Change each internal gate to `is_admin() OR is_facilitator()`. Keep `SET search_path` pinned; add `is_facilitator` to the existing pinned definitions only.
- Re-enable `facilitator` in the Acessos `ROLES` list.

> Principle: facilitator gets the **minimum** set above. It must NOT gain read of CPF/payment/PII columns beyond what the pulse needs (confirmed count / check-in flag), and never write to `registrations`/`teams`/payments.

## 2. Mentor / juror — `uuid → text` + grant fallback

Switch the token parameter of every mentor/juror auth RPC from `uuid` to `text`, and in each, try the legacy path first (cast text→uuid for the existing lookup) then fall back to `grant_resolve` for a hex grant token.

- **Functions to change:** `juror_token_owner`, `juror_get_context`, `juror_submit_score`, `juror_accept_consent`, `mentor_session_owner`, `mentor_get_me`, `mentor_get_me_by_token`, `mentor_save_note`, `mentor_delete_note` (and any other `mentor_*`/`juror_*` that take the token). Verify the full live list via `pg_proc` before writing.
- **Owner-resolver pattern** (e.g. `juror_token_owner(p_token text)`):
  1. `BEGIN ... WHERE access_token = p_token::uuid AND active ... EXCEPTION WHEN invalid_text_representation THEN NULL END` — legacy uuid token.
  2. If not found, `grant_resolve(p_token)`; if `role = 'juror' AND ref_id` → return `ref_id::uuid`.
  3. Else raise/return null as the function currently does.
  Mentor mirrors this (session-table token → static `access_token` → grant fallback) and keeps its `last_used_at` refresh.
- **Caller RPCs** (`juror_get_context`, etc.): change their own `p_token` param to `text` and pass it straight to the owner resolver (which now accepts text). No body logic change beyond the param type.
- **Frontend:** `useMentorAuth.js` / `useJuror.js` already store/pass the token as a string — no change needed. The `#acesso` `rpc_token` branch (Phase 1) already stores the raw hex grant token; it now resolves.
- **Backfill (coexistence):** create one `access_grants` `rpc_token` row per existing active mentor/juror with `ref_id` = their id (hash a freshly-generated token; the admin re-issues links from Acessos). Legacy `#mentor?t=`/`#jurado?t=` and `mentors.access_token`/`jurors.access_token` keep working — no drop this phase.
- **Re-enable `mentor`/`juror`** in the Acessos `ROLES` list.

**Risk:** this edits live mentor/juror auth on prod. Every changed function must be smoke-tested both ways (legacy uuid token STILL resolves; a grant hex token resolves) before relying on it. Additive/coexistent — no signatures removed, only widened uuid→text (a widening that accepts everything the uuid version did).

## 3. Full revoke (kill session immediately)

Today `admin_revoke_grant` sets `revoked_at` (blocks new exchanges) but an already-minted Supabase session lives to its TTL. Phase 2:
- A small **`access-admin` edge function** (service-role + **server-side `is_admin()` JWT check** on the caller) that, given a grant id, looks up `supabase_user_id` and **deletes/bans the backing user** (`auth.admin.deleteUser` or `updateUserById({ban_duration})`), then sets `revoked_at`. The Acessos UI's "revogar" calls this edge instead of (or in addition to) the RPC.
- For `rpc_token` grants (mentor/juror), revoke = `revoked_at` (grant_resolve already rejects revoked) — no Supabase user to ban.
- Consider lowering the backing-user session/JWT TTL where configurable to shrink the residual window for any path not covered.

> The `access-admin` edge is the highest-privilege surface; its `is_admin()` gate is server-side on the caller's JWT, never UI-only (the 2026-06-01 sweep found siblings failing exactly this).

## 4. Retire the staff password link

Remove the `#admin-acesso?t=<senha>` route + `StaffAccess.jsx` once staff are issued via Acessos (role `staff`). This closes the password-in-URL finding from the sweep. Coexistence note: do this only after confirming staff are being onboarded via the new links (operational check, not just code).

## Data flow / contracts (changes from Phase 1)

- `#acesso` for mentor/juror: edge returns `{ rpc_token: true, role }` (unchanged); the hex token is stored and now accepted by the text-param RPCs.
- Revoke: Acessos UI → `access-admin` edge (jwt_exchange) → ban backing user + `revoked_at`; or `admin_revoke_grant` RPC (rpc_token).
- Facilitator: `#facilitador` → token-exchange session (role=facilitator) → `FacilitatorPanel` → RPCs/tables now gated `is_admin() OR is_facilitator()`.

## Error handling

- Mentor/juror owner resolvers: an unparseable/invalid token must behave exactly as today (raise for juror, the existing null/raise for mentor) — never silently grant.
- `access-admin`: missing/non-admin caller → 403; backing user already deleted → still set `revoked_at` (idempotent).
- Facilitator RPCs: a non-admin/non-facilitator caller still hits the `is_admin() OR is_facilitator()` gate → unauthorized.

## Testing

- **SQL (MCP smoke):** for each changed mentor/juror function, assert legacy-uuid resolves AND grant-hex resolves AND garbage raises. Facilitator: a simulated facilitator JWT path is hard via MCP; instead assert the gate logic (`is_admin() OR is_facilitator()`) is present and `is_facilitator()` returns true for the right role claim.
- **Edge:** `access-admin` rejects non-admin; revoke deletes the backing user (create temp grant+user, revoke, confirm user gone), self-cleaning.
- **JS:** `routeForRole('facilitator')` already tested; add `FacilitatorPanel` logic units where extractable; `npm run build`.
- **Manual E2E:** mint facilitator / mentor / juror links via Acessos; open each; confirm scoped access; revoke a jwt_exchange grant and confirm the open session dies on next request.

## Rollout

Additive/coexistent, same as Phase 1: widen RPCs (uuid→text) and add facilitator gates without removing anything; legacy mentor/juror tokens and the staff legacy route keep working until their respective cutovers (staff link removal is in this phase; mentor/juror route removal is Phase 3, post-distribution). Backend (SQL/edge) applied via Supabase MCP; frontend ships on merge.
