# SP3 Phase 2 — read_only + allowed_tabs guards on write RPCs (Choke point A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Prod gating:** all `apply_migration`/`execute_sql` run from the MAIN THREAD via the Supabase MCP (project `qshrzfahotmjshtjuvno`). Subagents only write/read files.

**Goal:** Enforce per-grant `read_only` and `allowed_tabs` scope on the 25 in-scope write RPCs by prepending a body guard, reading scope LIVE via the SP3/Phase-1 helpers — a no-op for every existing account (`{}`/no-grant == unrestricted).

**Architecture:** SECURITY DEFINER RPCs bypass RLS, so the gate must live in the function body. For each of the 25 RPCs we copy the prod body **verbatim** (`pg_get_functiondef`) and insert two lines **immediately after the existing role-authorization block**:
```sql
  IF public.scope_read_only() THEN RAISE EXCEPTION 'read_only'; END IF;
  PERFORM public.assert_tab('<owning-tab>'[, '<tab2>']);
```
We deliberately use `scope_read_only()` (the read_only flag only), **not** `can_write()`, because 6 of the 25 RPCs authorize non-admin roles (`is_checkin_staff`, `is_wall_staff`, `is_admin() OR is_facilitator()`); `can_write()` bundles `is_admin()` and would hard-block checkin/staff/facilitator entirely. Placed after the role check, `scope_read_only()` is identical to `NOT can_write()` for admin-only RPCs (is_admin already proven) and correct for multi-role RPCs.

**Tech Stack:** PostgreSQL/plpgsql (Supabase), Supabase MCP for prod apply. Verification is SQL-only (no edge functions needed): session simulation via `set_config('request.jwt.claims', …, true)` inside a `BEGIN … ROLLBACK` transaction.

**Spec:** `docs/superpowers/specs/2026-06-03-auth-phase3-sp3-scope-enforcement-design.md` (§ "Choke point A").

---

## Deviation from spec text (DOCUMENT THIS — do not "fix" it back)

The spec's choke-A pseudocode literally says `IF NOT can_write() THEN RAISE 'read_only'`. That is a **latent bug** for the 6 multi-role RPCs below. We use `scope_read_only()` placed after the role check instead. Verified role gates in prod:
- `set_checkin` → `is_checkin_staff()` (admin/checkin/staff)
- `wall_hide_pain`, `wall_unhide_pain`, `wall_admin_add_pain` → `is_wall_staff()` (admin/staff)
- `wall_set_phase`, `set_team_scores_visible` → `is_admin() OR is_facilitator()`

`can_write()` (= `is_admin() AND NOT scope_read_only()`) returns false for a legit checkin/staff/facilitator caller → would `RAISE 'read_only'` for them even with no scope. The regression smoke (Task 5) MUST include a non-admin role to lock this in.

## Invariant (the #1 risk)
`{}` / null scope / **no `access_grants` row** all == unrestricted. The helpers already default to allow via COALESCE. A no-grant admin MUST still write — asserted in Task 5. Never inline an ad-hoc null check; always call the helpers.

## Safe rollout
Confirmed in prod (2026-06-03): **zero** `access_grants` rows have non-empty `scope`. So every guard is a behavioral no-op until an admin sets `read_only`/`allowed_tabs`. The `allowed_tabs` gate ships dormant — the AdminAccess input is still free-text with a misleading placeholder; tab-gating is only declared "live" after SP3 Phase 4 fixes that input.

---

## RPC → owning-tab map (canonical AdminPanel tab IDs)

Tab IDs are the `ALL_TABS[].id` from `src/admin/AdminPanel.jsx`. Call-sites grep-confirmed. Multi-tag = more permissive (`assert_tab` passes on ANY listed tab) — used where a non-admin surface also calls the RPC.

| RPC | role gate (body, verbatim) | `assert_tab(...)` |
|---|---|---|
| `admin_create_grant` | is_admin | `'access'` |
| `admin_revoke_grant` | is_admin | `'access'` |
| `admin_regenerate_grant_token` | is_admin | `'access'` |
| `admin_set_grant_expiry` | is_admin | `'access'` |
| `admin_create_bulk_order` | is_admin | `'bulk'` |
| `admin_confirm_bulk_order` | is_admin | `'bulk'` |
| `admin_cancel_bulk_order` | is_admin | `'bulk'` |
| `admin_cancel_voucher` | is_admin | `'bulk'` |
| `admin_create_mentor` | is_admin | `'mentors'` |
| `admin_reset_mentor_code` | is_admin | `'mentors'` |
| `admin_promote_leader` | is_admin | `'teams'` |
| `set_checkin` | is_checkin_staff | `'checkin'` |
| `set_evaluation_open` | is_admin | `'evaluation'` |
| `set_slides_deadline` | is_admin | `'deliverables'` |
| `set_team_scores_visible` | is_admin OR is_facilitator | `'deliverables','facilitator'` |
| `set_juror_idea_visible` | is_admin | `'jurors'` |
| `juror_force_reload` | is_admin | `'jurors'` |
| `set_sugar_released` | is_admin | `'sugarcubes'` |
| `sugar_moderate` | is_admin | `'sugarcubes'` |
| `set_notify_event` | is_admin | `'notifications'` |
| `broadcast_notification` | is_admin | `'notifications'` |
| `wall_set_phase` | is_admin OR is_facilitator | `'wall','facilitator'` |
| `wall_hide_pain` | is_wall_staff | `'wall','facilitator'` |
| `wall_unhide_pain` | is_wall_staff | `'wall','facilitator'` |
| `wall_admin_add_pain` | is_wall_staff | `'wall','facilitator'` |

**EXCLUDED (relationship-based — never add guards):** `juror_submit_score`, `mentor_save_note`, `mentor_delete_note`, `mentor_prepitch_submit`, `participant_save_team_deliverable`, `sugar_send_mentor`. `admin_list_grants` is READ — no guard.

---

## Guard placement rule (exact)

Insert the two lines on their own, **right after the closing `END IF;` of the first (role-authorization) IF block**, before any other logic. Use `public.`-qualified helper names (robust even for the 6 RPCs that lack `SET search_path`). Keep the entire rest of the body byte-identical to prod.

**Example A — admin-only, single-line role check (`admin_revoke_grant`):**
```sql
-- prod (verbatim):
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE access_grants SET revoked_at = now() WHERE id = p_grant_id AND revoked_at IS NULL;
END;
-- after:
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF public.scope_read_only() THEN RAISE EXCEPTION 'read_only'; END IF;
  PERFORM public.assert_tab('access');
  UPDATE access_grants SET revoked_at = now() WHERE id = p_grant_id AND revoked_at IS NULL;
END;
```

**Example B — multi-role, multiline role check (`wall_hide_pain`):**
```sql
-- after:
DECLARE v_updated INTEGER;
BEGIN
  IF NOT is_wall_staff() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF public.scope_read_only() THEN RAISE EXCEPTION 'read_only'; END IF;
  PERFORM public.assert_tab('wall','facilitator');

  UPDATE pains SET status = 'hidden' WHERE id = p_id AND status = 'visible';
  ...
```

**Example C — multi-tab (`set_team_scores_visible`):** after `IF NOT (is_admin() OR is_facilitator()) THEN RAISE EXCEPTION 'forbidden'; END IF;` insert `IF public.scope_read_only() … ; PERFORM public.assert_tab('deliverables','facilitator');`.

---

## Task 1: Author the migration file

**Files:**
- Create: `migrations/phase3_sp3_phase2_write_rpc_guards.sql`

- [ ] **Step 1:** Re-fetch all 25 bodies verbatim from prod (single source of truth — do not retype from memory):

```sql
SELECT p.proname, p.oid::regprocedure AS sig, pg_get_functiondef(p.oid) AS def
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
 ('admin_create_grant','admin_revoke_grant','admin_regenerate_grant_token','admin_set_grant_expiry',
  'admin_create_bulk_order','admin_confirm_bulk_order','admin_cancel_bulk_order','admin_cancel_voucher',
  'admin_create_mentor','admin_reset_mentor_code','admin_promote_leader',
  'set_checkin','set_evaluation_open','set_slides_deadline','set_team_scores_visible',
  'set_juror_idea_visible','juror_force_reload','set_sugar_released','sugar_moderate',
  'set_notify_event','broadcast_notification',
  'wall_set_phase','wall_hide_pain','wall_unhide_pain','wall_admin_add_pain')
ORDER BY p.proname;
```

- [ ] **Step 2:** For each function, write a `CREATE OR REPLACE FUNCTION …` block copying the prod body verbatim and inserting the guard per the placement rule + tab map above. Header comment must state: SP3 Phase 2; verbatim-copy + guard; deviation rationale (scope_read_only not can_write); no-op until scope set. Preserve accented Portuguese / emoji strings exactly. One file, all 25.

## Task 2: Capture baseline for the transcription-diff check

- [ ] **Step 1 (MAIN THREAD, execute_sql):** snapshot the 25 current defs into a real table so the post-apply diff can prove bodies are byte-identical modulo the guard:

```sql
DROP TABLE IF EXISTS public._sp3_p2_baseline;
CREATE TABLE public._sp3_p2_baseline AS
SELECT p.proname, p.oid::regprocedure::text AS sig, pg_get_functiondef(p.oid) AS def
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
 ('admin_create_grant','admin_revoke_grant','admin_regenerate_grant_token','admin_set_grant_expiry',
  'admin_create_bulk_order','admin_confirm_bulk_order','admin_cancel_bulk_order','admin_cancel_voucher',
  'admin_create_mentor','admin_reset_mentor_code','admin_promote_leader',
  'set_checkin','set_evaluation_open','set_slides_deadline','set_team_scores_visible',
  'set_juror_idea_visible','juror_force_reload','set_sugar_released','sugar_moderate',
  'set_notify_event','broadcast_notification',
  'wall_set_phase','wall_hide_pain','wall_unhide_pain','wall_admin_add_pain');
SELECT count(*) AS baseline_rows FROM public._sp3_p2_baseline;  -- expect 25
```

## Task 3: Review the migration BEFORE applying (gate)

- [ ] **Step 1:** Dispatch `code-reviewer` + `security-auditor` on the migration file. They must confirm: (a) each body is a faithful verbatim copy with only the 2 guard lines added; (b) guard sits after the role check; (c) tab tags match the map; (d) `scope_read_only()` (not `can_write()`) used; (e) no SELECT/relationship RPC touched.
- [ ] **Step 2:** Gate: 0 Critical/High unresolved before applying.

## Task 4: Apply to prod

- [ ] **Step 1 (MAIN THREAD):** `apply_migration(name='phase3_sp3_phase2_write_rpc_guards', query=<file contents>)`.

## Task 5: Verify — transcription diff + behavioral smoke

- [ ] **Step 1 — transcription diff (execute_sql).** Strip the guard + all whitespace from each NEW def and compare to baseline. Expect **0 rows**:

```sql
SELECT b.proname
FROM public._sp3_p2_baseline b
JOIN pg_proc p ON p.oid::regprocedure::text = b.sig
WHERE regexp_replace(
        regexp_replace(pg_get_functiondef(p.oid), '\s+', '', 'g'),
        'IFpublic\.scope_read_only\(\)THENRAISEEXCEPTION''read_only'';ENDIF;PERFORMpublic\.assert_tab\([^)]*\);',
        '', 'g')
      <> regexp_replace(b.def, '\s+', '', 'g');
```

- [ ] **Step 2 — guard presence (execute_sql).** Every one of the 25 must contain the guard. Expect **25**:

```sql
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ( … same 25 … )
  AND pg_get_functiondef(p.oid) ILIKE '%scope_read_only()%assert_tab(%';
```

- [ ] **Step 3 — behavioral smoke (execute_sql, fully self-cleaning via ROLLBACK).** Session simulation proven to work (current_grant_ref resolves by `supabase_user_id = sub`; is_admin from `app_metadata.role`). Final SELECT returns the result table; ROLLBACK discards test grants AND any allow-path side effects. **Every row must read `PASS`.**

```sql
BEGIN;
INSERT INTO access_grants(label, role, auth_kind, scope, supabase_user_id, email) VALUES
  ('__sp3smoke_admin_unscoped','admin','password','{}','00000000-0000-0000-0000-0000000000c0','c0@x.internal'),
  ('__sp3smoke_admin_ro','admin','password','{"read_only":true}','00000000-0000-0000-0000-0000000000c1','c1@x.internal'),
  ('__sp3smoke_admin_tab','admin','password','{"allowed_tabs":["dashboard"]}','00000000-0000-0000-0000-0000000000c2','c2@x.internal'),
  ('__sp3smoke_checkin','checkin','password','{}','00000000-0000-0000-0000-0000000000c3','c3@x.internal'),
  ('__sp3smoke_checkin_ro','checkin','password','{"read_only":true}','00000000-0000-0000-0000-0000000000c4','c4@x.internal');

CREATE TEMP TABLE _r(scenario text, expected text, got text, pass boolean);

DO $smoke$
DECLARE
  C0 constant text := '{"sub":"00000000-0000-0000-0000-0000000000c0","role":"authenticated","app_metadata":{"role":"admin"}}';
  C1 constant text := '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated","app_metadata":{"role":"admin"}}';
  C2 constant text := '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated","app_metadata":{"role":"admin"}}';
  C3 constant text := '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated","app_metadata":{"role":"checkin"}}';
  C4 constant text := '{"sub":"00000000-0000-0000-0000-0000000000c4","role":"authenticated","app_metadata":{"role":"checkin"}}';
  CN constant text := '{"sub":"00000000-0000-0000-0000-00000000000f","role":"authenticated","app_metadata":{"role":"admin"}}'; -- no grant row
  v_reg uuid;
  err text;
BEGIN
  SELECT id INTO v_reg FROM registrations WHERE payment_status='confirmed' LIMIT 1;

  -- helper inline via a sub-block per scenario; record PASS/FAIL.

  -- 1) no-grant admin (invariant #1) → admin_revoke_grant must NOT raise read_only/tab (passes guard; no-op update)
  PERFORM set_config('request.jwt.claims', CN, true);
  BEGIN
    PERFORM admin_revoke_grant('00000000-0000-0000-0000-0000000000ee');  -- random id; update hits 0 rows, returns void
    INSERT INTO _r VALUES('no_grant_admin_write','OK','OK',true);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES('no_grant_admin_write','OK',SQLERRM,false);
  END;

  -- 2) unscoped admin → admin_create_grant allowed
  PERFORM set_config('request.jwt.claims', C0, true);
  BEGIN
    PERFORM admin_create_grant('__sp3smoke_made','viewer','{}'::jsonb,NULL,NULL);
    INSERT INTO _r VALUES('unscoped_admin_write','OK','OK',true);
  EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES('unscoped_admin_write','OK',SQLERRM,false); END;

  -- 3) read_only admin → admin_create_grant blocked with read_only
  PERFORM set_config('request.jwt.claims', C1, true);
  BEGIN
    PERFORM admin_create_grant('__sp3smoke_blocked','viewer','{}'::jsonb,NULL,NULL);
    INSERT INTO _r VALUES('readonly_admin_blocked','read_only','no_error',false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES('readonly_admin_blocked','read_only',SQLERRM, SQLERRM='read_only');
  END;

  -- 4) tab-scoped admin (dashboard only) → admin_create_grant (access tab) blocked tab_not_allowed
  PERFORM set_config('request.jwt.claims', C2, true);
  BEGIN
    PERFORM admin_create_grant('__sp3smoke_tab','viewer','{}'::jsonb,NULL,NULL);
    INSERT INTO _r VALUES('tab_scoped_offtab_blocked','tab_not_allowed','no_error',false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES('tab_scoped_offtab_blocked','tab_not_allowed',SQLERRM, SQLERRM='tab_not_allowed');
  END;

  -- 5) NON-ADMIN regression: checkin (no read_only) → set_checkin must WORK (proves can_write() not used)
  PERFORM set_config('request.jwt.claims', C3, true);
  BEGIN
    IF v_reg IS NULL THEN
      INSERT INTO _r VALUES('checkin_role_write','OK (skipped no reg)','OK',true);
    ELSE
      PERFORM set_checkin(v_reg, false);  -- un-checkin: writes; rolled back at end
      INSERT INTO _r VALUES('checkin_role_write','OK','OK',true);
    END IF;
  EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES('checkin_role_write','OK',SQLERRM,false); END;

  -- 6) NON-ADMIN read_only: checkin_ro → set_checkin blocked read_only
  PERFORM set_config('request.jwt.claims', C4, true);
  BEGIN
    PERFORM set_checkin(COALESCE(v_reg,'00000000-0000-0000-0000-0000000000ab'), false);
    INSERT INTO _r VALUES('checkin_readonly_blocked','read_only','no_error',false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES('checkin_readonly_blocked','read_only',SQLERRM, SQLERRM='read_only');
  END;
END $smoke$;

SELECT scenario, expected, got, pass FROM _r ORDER BY scenario;
ROLLBACK;
```

- [ ] **Step 4:** Confirm all 6 rows `pass = true`. If any fails, do NOT proceed — diagnose (likely a mis-placed guard or wrong helper). 

## Task 6: Drop baseline + commit + PR + changelog

- [ ] **Step 1 (execute_sql):** `DROP TABLE IF EXISTS public._sp3_p2_baseline;`
- [ ] **Step 2:** Branch `feat/auth-phase3-sp3-phase2`. Commit the migration. English Conventional Commit.
- [ ] **Step 3:** `docs/changelog/2026-06-03-auth-phase3-sp3-phase2.md` — what/why, the scope_read_only-vs-can_write deviation + rationale, tab map, smoke results, "allowed_tabs dormant until Phase 4".
- [ ] **Step 4:** Open PR (English body). Gate on 0 Critical/High. Merge.
- [ ] **Step 5:** Update memory `auth-phase3-progress` (Phase 2 done + the deviation note).

---

## Self-review checklist
- Spec coverage: all 25 choke-A RPCs mapped; excluded set honored; `admin_list_grants` left as READ. ✓
- Invariant: no-grant admin write asserted (smoke #1). ✓
- Non-admin regression: smoke #5/#6 (checkin) lock in scope_read_only-not-can_write. ✓
- Transcription safety: baseline normalized diff (Task 5 step 1) catches any body change. ✓
- allowed_tabs honesty: shipped dormant; declared live only after Phase 4. ✓
