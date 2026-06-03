# Auth Phase 3 — SP3: Scope Enforcement (Design)

**Date:** 2026-06-03
**Status:** Design — awaiting user review before plan
**Sub-project:** SP3 of 3 (SP1 password accounts ✅, SP2 mentor/juror sessions ✅)
**Prod project:** `qshrzfahotmjshtjuvno`

---

## Goal

Enforce the per-grant **hybrid scope** (`read_only`, `allowed_tabs`) for the JWT roles (admin/viewer/checkin/staff/facilitator) at the **backend**, reading scope **live** from `access_grants.scope` via `current_grant_ref()`. Scope is already stored (SP1 collects it in AdminAccess) but read at no gate yet.

**Decision (user): Option 2 — "full backend, writes-only".**
- `read_only`: block ALL writes for a scoped grant (both choke points — see below).
- `allowed_tabs`: gate **writes** per tab. **Reads are NOT narrowed** (they stay gated by the broad `is_admin_or_viewer()` across ~22 tables; per-tab read RLS was rejected as disproportionate for a concluded event). **Explicit caveat: a tab-scoped grant cannot WRITE outside its tabs but can still READ all data its role allows.**
- mentor/juror are **out of scope** (relationship-based identity, no scope blob).

## Invariant (the #1 risk — codify exactly)
`{}` / null scope / **no `access_grants` row (legacy hand-made admin)** all == **unrestricted**. Every guard defaults to allow via `COALESCE(...,false)` / empty-set checks, so existing accounts are unaffected and the rollout is incremental + safe. A regression test MUST assert a no-grant admin can still write.

---

## Shared helpers (new — `migrations/phase3_sp3_scope_helpers.sql`)
All `STABLE SECURITY DEFINER SET search_path = pg_catalog, public`. They wrap the already-deployed `current_grant_ref()` (SP2/B1), which reads `access_grants.scope` live for `supabase_user_id = auth.uid()` and gates revoked/expired inline (→ instant revocation).

```sql
-- read_only flag, defaulting to false for {}/null/no-grant (unrestricted).
CREATE OR REPLACE FUNCTION public.scope_read_only() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$ SELECT COALESCE((SELECT (scope->>'read_only')::boolean FROM current_grant_ref()), false) $$;

-- write allowed = admin role AND not read_only-scoped.
CREATE OR REPLACE FUNCTION public.can_write() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$ SELECT is_admin() AND NOT scope_read_only() $$;

-- tab allowed = no allowed_tabs restriction (empty/absent) OR p_tab in the live set.
CREATE OR REPLACE FUNCTION public.scope_tab_allowed(p_tab text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    (SELECT CASE
       WHEN scope->'allowed_tabs' IS NULL OR jsonb_array_length(scope->'allowed_tabs') = 0 THEN true
       ELSE scope->'allowed_tabs' ? p_tab
     END FROM current_grant_ref()),
    true)  -- no grant row → unrestricted
$$;

-- RAISE variant for RPC bodies (writes). Accepts any of the RPC's owning tabs.
CREATE OR REPLACE FUNCTION public.assert_tab(VARIADIC p_tabs text[]) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM unnest(p_tabs) t WHERE scope_tab_allowed(t)) THEN
    RAISE EXCEPTION 'tab_not_allowed';
  END IF;
END $$;
```
GRANT EXECUTE to `authenticated` on all four; REVOKE from PUBLIC.

> Multi-tab: `assert_tab` is VARIADIC — a shared RPC passes all its owning tabs (`assert_tab('wall','facilitator')`); it passes if the grant is allowed ANY of them. (A no-restriction grant passes trivially.)

---

## Enforcement — read_only

### Choke point A — write RPCs (~25, guard in body)
SECURITY DEFINER RPCs bypass RLS, so the guard MUST be in the body. Prepend to each (verbatim-copy-change-preamble, mirroring `phase3_sp2_b1_rekey_rpcs.sql`):
```sql
  IF NOT can_write() THEN RAISE EXCEPTION 'read_only'; END IF;
  PERFORM assert_tab('<owning-tab>');   -- + allowed_tabs (writes)
```
In-scope write RPCs by tab:
- **access:** admin_create_grant, admin_revoke_grant, admin_regenerate_grant_token, admin_set_grant_expiry *(admin_list_grants is READ — no guard)*
- **bulk:** admin_create_bulk_order, admin_confirm_bulk_order, admin_cancel_bulk_order, admin_cancel_voucher
- **mentors:** admin_create_mentor, admin_reset_mentor_code · **teams:** admin_promote_leader
- **checkin:** set_checkin · **evaluation:** set_evaluation_open · **deliverables:** set_slides_deadline, set_team_scores_visible
- **jurors:** set_juror_idea_visible, juror_force_reload · **sugarcubes:** set_sugar_released, sugar_moderate
- **notifications:** set_notify_event, broadcast_notification
- **wall:** wall_set_phase, wall_hide_pain, wall_unhide_pain, wall_admin_add_pain (tabs: wall, facilitator)

**EXCLUDED (do NOT add read_only):** juror_submit_score, mentor_save_note, mentor_delete_note, mentor_prepitch_submit, participant_save_team_deliverable, sugar_send_mentor — relationship-based identity, not admin.

### Choke point B — direct-PostgREST writes (RLS WITH CHECK is the ONLY gate)
The admin UI writes ~13 tables directly via `.from().update/insert/delete` (bypassing RPCs). Rewrite each table's write policy `WITH CHECK` from `is_admin()` to `is_admin() AND NOT scope_read_only()` (+ optional `scope_tab_allowed('<tab>')`):
`registrations`, `teams`, `team_evaluations`, `jurors`, `mentors`, `mentor_teams`, `resources`, `schedule_items`, `schedule_days`, `prepitch_rooms`, `prepitch_room_mentors`, `prepitch_room_teams`, `team_join_requests` + **6 `storage.objects`** policies (deliverables_/resources_ insert/delete).
- **`team_evaluations` gotcha:** its policy uses a hardcoded `auth.jwt()->>'role'='admin'` (not `is_admin()`); standardize it onto `can_write()` or the gate won't apply.
- Keep SELECT policies unchanged (reads stay broad — the chosen caveat).

### Defense-in-depth
Where an RPC ALSO writes a table that has a WITH CHECK, keep BOTH guards (a future direct exposure or missed RPC can't bypass read_only).

---

## Enforcement — allowed_tabs (writes only)
- Write RPCs: `PERFORM assert_tab('<tab>')` (see list; shared RPCs multi-tag).
- Direct-write tables: add `scope_tab_allowed('<owning-tab>')` to WITH CHECK alongside the read_only term.
- **Reads NOT narrowed** (documented caveat).

## Frontend (`src/admin/AdminPanel.jsx`)
Already filters tabs by role + `show()` gates content. Add **per-grant** narrowing on top:
- Read the grant's scope (live, from the session) — expose `scope` from `useAdminAuth` (read `current_grant_ref` via a small RPC `my_scope()` OR from app_metadata for link grants; for password accounts use a `my_scope()` RPC since scope isn't baked). Simplest: a `my_scope()` SECURITY DEFINER RPC returning `current_grant_ref().scope`.
- Intersect `allowed_tabs` with the role's `TABS`; if `read_only` true, hide write actions (a `readOnly` prop already exists for viewer — extend it to `scope.read_only`).
- This is UX (the backend is the real gate). Unknown `allowed_tabs` entries are no-ops (don't add tabs the role lacks).

---

## Build phases (incremental, each additive + no-op for legacy)
The `{}` invariant makes every guard a no-op for existing accounts, so phases land safely one at a time:
1. **Helpers + tests** (`scope_read_only`/`can_write`/`scope_tab_allowed`/`assert_tab` + `my_scope()`) + a regression smoke (no-grant admin can write; read_only grant cannot; tab-scoped grant blocked off-tab write).
2. **read_only on write RPCs** (choke A) — start with `admin_*` (high value), then `set_*`/`wall_*`/`sugar_moderate`/`broadcast_notification`/`checkin`. + `assert_tab` tags.
3. **RLS WITH CHECK** rewrite on the 13 direct-write tables (+ 6 storage; + team_evaluations standardize). + tab tags.
4. **Frontend** AdminPanel per-grant narrowing (`my_scope()` + tab intersect + read_only actions).
Each phase: spec=this doc; plan per phase via writing-plans; subagent execution; gated prod rollout (SQL by main thread; self-cleaning scope smokes like SP1/SP2).

---

## Risks
- **#1 LOCKOUT OF LEGACY ADMINS** — any guard missing the COALESCE/empty default denies no-grant accounts. Mitigation: single helpers + regression test (no-grant admin writes OK). Never inline ad-hoc null checks.
- **Choke B missed** — RPC-only guarding leaves the 13 direct-write tables open to a read_only admin. RLS WITH CHECK is mandatory, not optional.
- **SECURITY DEFINER bypasses RLS** — the ~25 RPCs need the body guard; RLS alone misses them. The two halves are complementary.
- **team_evaluations** hardcoded role check — must be standardized onto `can_write()`.
- **Shared/transitive RPC tagging** — under-tag denies legit tabs, over-tag (single tab) breaks facilitator wall access; mis-tag is a correctness bug. Use multi-tag.
- **Perf** — `current_grant_ref()` is a per-call table read; STABLE + low post-event volume make it fine; wrap once per RPC, avoid per-row in RLS.
- **Edge functions** (access-account, sync-mp-payments, transcribe-pitch) check role=admin but NOT scope — a read_only admin could still invoke them. Out of scope for SP3 (note as follow-up).
- **YAGNI** — surfaced + accepted: writes-only allowed_tabs leaves reads broad.

## Invariants (after SP3)
- `{}`/null/no-grant == unrestricted (writes + tabs).
- Scope read LIVE via `current_grant_ref()` (instant revocation; password accounts have no baked scope).
- Reads remain role-gated (not narrowed by allowed_tabs).
- mentor/juror untouched.

## Out of scope / deferred
- Per-tab READ narrowing (Option C — ~22 SELECT policies).
- Edge-function scope checks (access-account/sync-mp-payments/transcribe-pitch).
- Baking scope into app_metadata (rejected — live read is correct + instant).

## Open questions resolved (defaults)
- Depth → Option 2 (writes-only allowed_tabs) — user.
- RLS WITH CHECK as primary gate for direct-write tables → yes.
- Live scope read → yes (mandatory; password accounts don't bake scope).
- Multi-tab RPCs → VARIADIC assert_tab (any owning tab).
- Helpers + invariant codified + regression test → yes.
