# SP3 Phase 3 — read_only on direct-write RLS policies (Choke point B)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. **Prod gating:** all DDL/SQL from the MAIN THREAD via Supabase MCP (project `qshrzfahotmjshtjuvno`). Subagents only read/write files.

**Goal:** Block a `read_only`-scoped grant from mutating the ~13 admin-direct-write tables + 6 storage policies via raw PostgREST, while keeping reads broad (Option 2). The ~25 RPC writes are already gated (Phase 2); these tables are written **directly** (`.from().insert/update/delete`), so RLS is the only gate.

**Architecture:** Add `AND NOT public.scope_read_only()` to every admin/facilitator **write** policy. Because `ALL` policies govern SELECT (via USING) *and* DELETE/UPDATE-row-selection, and DELETE has no WITH CHECK, the gate goes on **both** USING and WITH CHECK — which would also strip that policy's SELECT. To preserve reads, **first CREATE a SELECT policy that mirrors the write policy's *current* USING verbatim** for any table whose narrowed policy was its only SELECT source. RLS OR-semantics then keep reads working while writes are gated.

**Tech Stack:** PostgreSQL RLS (`ALTER POLICY` / `CREATE POLICY`), Supabase MCP. Helper `public.scope_read_only()` (SP3 Phase 1) defaults to `false` for `{}`/null/no-grant → no-op for legacy.

**Spec:** `docs/superpowers/specs/2026-06-03-auth-phase3-sp3-scope-enforcement-design.md` (§ Choke point B).

---

## Critical facts established (prod recon)
- `execute_sql` runs as `postgres` (**rolbypassrls=true**) → a Phase-2-style smoke gives FALSE GREENS for RLS. Smoke MUST `SET LOCAL ROLE authenticated` after setting JWT claims. (Proven: under the switch, admin reads teams=12, participant reads=0.)
- RLS-blocked UPDATE/DELETE → **0 rows, NO exception** (USING filters silently). INSERT with_check violation → RAISES. Assert accordingly.
- `authenticated` holds SELECT/INSERT/UPDATE/DELETE grants on all 13 tables (so a normal-admin control write proves RLS, not a GRANT artifact). `mentors` SELECT grant is false (reads go via RPC) — narrowing its ALL qual is harmless.
- `ALTER POLICY` on `storage.objects` works as the MCP role (proven in a ROLLBACK probe).
- Zero grants have non-empty scope → behavioral no-op on rollout.

## Scope decision: read_only ONLY (no tab terms in RLS this phase)
The spec marks `scope_tab_allowed` on direct writes **optional**. We gate `read_only` (the mandatory, high-value win) and DEFER per-tab gating of direct writes: the tab vocabulary is still free-text/unreliable until Phase 4, and per-row `scope_tab_allowed()` in RLS adds cost. Documented asymmetry: RPC writes are tab-gated (Phase 2); direct-write tab-gating is a Phase 4 follow-up. (allowed_tabs is dormant regardless — no grant sets it.)

## Reads-preservation mirror rule (the foolproof step)
Before narrowing an `ALL`/`USING` policy that is a table's only SELECT source for some role, CREATE a SELECT policy copying that policy's **current** USING verbatim. Tables needing mirrors (others already have a broad SELECT policy):
- `jurors` → `FOR SELECT USING (is_admin())`
- `resources` → `FOR SELECT USING (is_admin())`
- `schedule_items` → TWO: `USING (is_admin())` and `USING (is_facilitator())` (it has admin **and** facilitator ALL policies → a read_only facilitator must keep reads)
- `schedule_days` → `FOR SELECT USING (is_admin())` (facilitator SELECT already exists)

---

## Task 1: Author migration `migrations/phase3_sp3_phase3_rls_with_check.sql`

- [ ] **Step 1:** Mirror SELECT policies (idempotent via DROP IF EXISTS):

```sql
DROP POLICY IF EXISTS "sp3_jurors_read" ON public.jurors;
CREATE POLICY "sp3_jurors_read" ON public.jurors FOR SELECT TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "sp3_resources_read" ON public.resources;
CREATE POLICY "sp3_resources_read" ON public.resources FOR SELECT TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "sp3_schedule_items_read_admin" ON public.schedule_items;
CREATE POLICY "sp3_schedule_items_read_admin" ON public.schedule_items FOR SELECT TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "sp3_schedule_items_read_facilitator" ON public.schedule_items;
CREATE POLICY "sp3_schedule_items_read_facilitator" ON public.schedule_items FOR SELECT TO authenticated USING (is_facilitator());
DROP POLICY IF EXISTS "sp3_schedule_days_read_admin" ON public.schedule_days;
CREATE POLICY "sp3_schedule_days_read_admin" ON public.schedule_days FOR SELECT TO authenticated USING (is_admin());
```

- [ ] **Step 2:** Narrow write policies — add `AND NOT public.scope_read_only()` to USING+WITH CHECK (INSERT-only policies: WITH CHECK only). `public.`-qualified for the storage-schema policies.

```sql
ALTER POLICY "Admin can manage jurors"              ON public.jurors                USING (is_admin() AND NOT public.scope_read_only()) WITH CHECK (is_admin() AND NOT public.scope_read_only());
ALTER POLICY "Admin can manage mentors"             ON public.mentors               USING (is_admin() AND NOT public.scope_read_only()) WITH CHECK (is_admin() AND NOT public.scope_read_only());
ALTER POLICY "Admin can manage mentor teams"        ON public.mentor_teams          USING (is_admin() AND NOT public.scope_read_only()) WITH CHECK (is_admin() AND NOT public.scope_read_only());
ALTER POLICY "Admin manages prepitch rooms"         ON public.prepitch_rooms        USING (is_admin() AND NOT public.scope_read_only()) WITH CHECK (is_admin() AND NOT public.scope_read_only());
ALTER POLICY "Admin manages prepitch room mentors"  ON public.prepitch_room_mentors USING (is_admin() AND NOT public.scope_read_only()) WITH CHECK (is_admin() AND NOT public.scope_read_only());
ALTER POLICY "Admin manages prepitch room teams"    ON public.prepitch_room_teams   USING (is_admin() AND NOT public.scope_read_only()) WITH CHECK (is_admin() AND NOT public.scope_read_only());
ALTER POLICY "resources_admin_all"                  ON public.resources             USING (is_admin() AND NOT public.scope_read_only()) WITH CHECK (is_admin() AND NOT public.scope_read_only());
ALTER POLICY "schedule_items_admin_all"             ON public.schedule_items        USING (is_admin() AND NOT public.scope_read_only()) WITH CHECK (is_admin() AND NOT public.scope_read_only());
ALTER POLICY "Facilitator manages schedule_items"   ON public.schedule_items        USING (is_facilitator() AND NOT public.scope_read_only()) WITH CHECK (is_facilitator() AND NOT public.scope_read_only());
ALTER POLICY "schedule_days_admin_all"              ON public.schedule_days         USING (is_admin() AND NOT public.scope_read_only()) WITH CHECK (is_admin() AND NOT public.scope_read_only());
ALTER POLICY "Facilitator updates schedule_days"    ON public.schedule_days         USING (is_facilitator() AND NOT public.scope_read_only()) WITH CHECK (is_facilitator() AND NOT public.scope_read_only());
ALTER POLICY "Admin can update registrations"       ON public.registrations         USING (is_admin() AND NOT public.scope_read_only()) WITH CHECK (is_admin() AND NOT public.scope_read_only());
ALTER POLICY "Admin can insert teams"               ON public.teams                 WITH CHECK (is_admin() AND NOT public.scope_read_only());
ALTER POLICY "Admin can update teams"               ON public.teams                 USING (is_admin() AND NOT public.scope_read_only()) WITH CHECK (is_admin() AND NOT public.scope_read_only());
ALTER POLICY "Admin can update team join requests"  ON public.team_join_requests    USING (is_admin() AND NOT public.scope_read_only()) WITH CHECK (is_admin() AND NOT public.scope_read_only());
-- team_evaluations: standardize off hardcoded auth.jwt()->>'role'='admin'
ALTER POLICY "Admin write team evaluations"         ON public.team_evaluations      USING (is_admin() AND NOT public.scope_read_only()) WITH CHECK (is_admin() AND NOT public.scope_read_only());
-- storage.objects
ALTER POLICY "deliverables_storage_admin_insert" ON storage.objects WITH CHECK ((bucket_id='files') AND (name ~~ 'deliverables/%') AND is_admin() AND NOT public.scope_read_only());
ALTER POLICY "deliverables_storage_admin_delete" ON storage.objects USING ((bucket_id='files') AND (name ~~ 'deliverables/%') AND is_admin() AND NOT public.scope_read_only());
ALTER POLICY "resources_storage_admin_insert"    ON storage.objects WITH CHECK ((bucket_id='files') AND (name ~~ 'resources/%') AND is_admin() AND NOT public.scope_read_only());
ALTER POLICY "resources_storage_admin_delete"    ON storage.objects USING ((bucket_id='files') AND (name ~~ 'resources/%') AND is_admin() AND NOT public.scope_read_only());
```

**Left unchanged (documented):** `registrations` INSERT policies (`Allow public/authenticated registration insert`) are participant-facing self-registration, not admin-UI writes → out of Choke-B scope; a read_only admin could still self-register (irrelevant). All SELECT policies untouched (reads stay broad).

## Task 2: Review (gate) — code-reviewer + security-auditor on the migration. 0 Critical/High before apply.

## Task 3: Apply — `apply_migration(name='phase3_sp3_phase3_rls_with_check', query=<file>)`.

## Task 4: Verify — policy snapshot + RLS-aware behavioral smoke

- [ ] **Step 1 — policy snapshot.** Confirm every targeted write policy's qual/with_check now contains `scope_read_only`, SELECT policies untouched, 5 mirror policies exist:
```sql
SELECT schemaname,tablename,policyname,cmd,
       (qual ILIKE '%scope_read_only%') AS using_gated,
       (with_check ILIKE '%scope_read_only%') AS check_gated
FROM pg_policies
WHERE (schemaname='public' AND tablename IN ('registrations','teams','team_evaluations','jurors','mentors','mentor_teams','resources','schedule_items','schedule_days','prepitch_rooms','prepitch_room_mentors','prepitch_room_teams','team_join_requests'))
   OR (schemaname='storage' AND tablename='objects' AND policyname LIKE '%storage_admin_%')
ORDER BY schemaname,tablename,cmd,policyname;
```

- [ ] **Step 2 — RLS-aware smoke (self-cleaning, ROLLBACK).** Every assertion via `SET LOCAL ROLE authenticated`. UPDATE/DELETE blocked = 0 rows; INSERT blocked = exception; reads = count>0. **All rows PASS.**

```sql
BEGIN;
INSERT INTO access_grants(label,role,auth_kind,scope,supabase_user_id,email) VALUES
  ('__p3_admin','admin','password','{}','00000000-0000-0000-0000-0000000000e0','e0@x.internal'),
  ('__p3_admin_ro','admin','password','{"read_only":true}','00000000-0000-0000-0000-0000000000e1','e1@x.internal'),
  ('__p3_fac','facilitator','rpc_token','{}','00000000-0000-0000-0000-0000000000e2'),
  ('__p3_fac_ro','facilitator','rpc_token','{"read_only":true}','00000000-0000-0000-0000-0000000000e3');
CREATE TEMP TABLE _r(scenario text, expected text, got text, pass boolean);
DO $smoke$
DECLARE
  A0 text:='{"sub":"00000000-0000-0000-0000-0000000000e0","role":"authenticated","app_metadata":{"role":"admin"}}';
  A1 text:='{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated","app_metadata":{"role":"admin"}}';
  F0 text:='{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated","app_metadata":{"role":"facilitator"}}';
  F1 text:='{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated","app_metadata":{"role":"facilitator"}}';
  AN text:='{"sub":"00000000-0000-0000-0000-00000000000f","role":"authenticated","app_metadata":{"role":"admin"}}';
  n int; ok boolean;
BEGIN
  -- helper macro inlined per scenario.
  -- 1) no-grant admin UPDATE teams -> allowed (rows>0)  [invariant #1]
  PERFORM set_config('request.jwt.claims',AN,true); SET LOCAL ROLE authenticated;
  WITH u AS (UPDATE teams SET name=name WHERE id IN (SELECT id FROM teams LIMIT 1) RETURNING 1) SELECT count(*) INTO n FROM u;
  RESET ROLE; INSERT INTO _r VALUES('1_nogrant_admin_update','>0',n::text,n>0);
  -- 2) read_only admin UPDATE teams -> blocked (0 rows)
  PERFORM set_config('request.jwt.claims',A1,true); SET LOCAL ROLE authenticated;
  WITH u AS (UPDATE teams SET name=name WHERE id IN (SELECT id FROM teams LIMIT 1) RETURNING 1) SELECT count(*) INTO n FROM u;
  RESET ROLE; INSERT INTO _r VALUES('2_ro_admin_update_blocked','0',n::text,n=0);
  -- 3) read_only admin DELETE resources -> blocked (0 rows)
  PERFORM set_config('request.jwt.claims',A1,true); SET LOCAL ROLE authenticated;
  WITH d AS (DELETE FROM resources WHERE id IN (SELECT id FROM resources LIMIT 1) RETURNING 1) SELECT count(*) INTO n FROM d;
  RESET ROLE; INSERT INTO _r VALUES('3_ro_admin_delete_blocked','0',n::text,n=0);
  -- 4) read_only admin INSERT resources -> blocked (exception)
  PERFORM set_config('request.jwt.claims',A1,true); SET LOCAL ROLE authenticated;
  BEGIN INSERT INTO resources(title) VALUES('__p3'); RESET ROLE; INSERT INTO _r VALUES('4_ro_admin_insert_blocked','rls_violation','no_error',false);
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN RESET ROLE; INSERT INTO _r VALUES('4_ro_admin_insert_blocked','rls_violation',SQLERRM,true);
           WHEN OTHERS THEN RESET ROLE; INSERT INTO _r VALUES('4_ro_admin_insert_blocked','rls_violation',SQLERRM, SQLERRM ILIKE '%row-level security%'); END;
  -- 5) read_only admin SELECT teams -> preserved (rows>0)
  PERFORM set_config('request.jwt.claims',A1,true); SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM teams; RESET ROLE; INSERT INTO _r VALUES('5_ro_admin_read_preserved','>0',n::text,n>0);
  -- 6) read_only FACILITATOR SELECT schedule_items -> preserved (mirror policy)
  PERFORM set_config('request.jwt.claims',F1,true); SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM schedule_items; RESET ROLE; INSERT INTO _r VALUES('6_ro_fac_read_schedule_items','>0',n::text,n>0);
  -- 7) normal admin UPDATE teams -> allowed (control)
  PERFORM set_config('request.jwt.claims',A0,true); SET LOCAL ROLE authenticated;
  WITH u AS (UPDATE teams SET name=name WHERE id IN (SELECT id FROM teams LIMIT 1) RETURNING 1) SELECT count(*) INTO n FROM u;
  RESET ROLE; INSERT INTO _r VALUES('7_admin_update_allowed','>0',n::text,n>0);
  -- 8) read_only facilitator UPDATE schedule_days -> blocked (0); 9) normal facilitator -> allowed
  PERFORM set_config('request.jwt.claims',F1,true); SET LOCAL ROLE authenticated;
  WITH u AS (UPDATE schedule_days SET label=label WHERE day_key IN (SELECT day_key FROM schedule_days LIMIT 1) RETURNING 1) SELECT count(*) INTO n FROM u;
  RESET ROLE; INSERT INTO _r VALUES('8_ro_fac_update_blocked','0',n::text,n=0);
  PERFORM set_config('request.jwt.claims',F0,true); SET LOCAL ROLE authenticated;
  WITH u AS (UPDATE schedule_days SET label=label WHERE day_key IN (SELECT day_key FROM schedule_days LIMIT 1) RETURNING 1) SELECT count(*) INTO n FROM u;
  RESET ROLE; INSERT INTO _r VALUES('9_fac_update_allowed','>0',n::text,n>0);
END $smoke$;
SELECT scenario,expected,got,pass FROM _r ORDER BY scenario;
ROLLBACK;
```

- [ ] **Step 3:** All 9 PASS. If `mentors`/junction reads were affected unexpectedly, recheck mirrors.

## Task 5: Commit + PR + changelog + memory
- Branch `feat/auth-phase3-sp3-phase3`; commit migration; English changelog `docs/changelog/2026-06-03-auth-phase3-sp3-phase3.md`; PR (English, 0 Critical/High gate); merge; update memory `auth-phase3-progress`.

## Self-review
- read_only blocks INSERT+UPDATE+DELETE on all admin-write tables + storage (DELETE via USING, INSERT via WITH CHECK). ✓
- Reads preserved (mirror rule incl. read_only facilitator schedule_items). ✓
- Invariant: no-grant admin writes. ✓
- team_evaluations standardized off hardcoded jwt. ✓
- No tab terms (deferred, documented). ✓
