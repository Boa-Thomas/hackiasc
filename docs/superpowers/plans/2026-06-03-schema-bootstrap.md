# Schema Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. **All `execute_sql`/`apply_migration`/`create_branch`/`deploy` run from the MAIN THREAD via the Supabase MCP** (prod `qshrzfahotmjshtjuvno`). The bootstrap is GENERATED from the live prod catalog and ASSEMBLED into one file.

**Goal:** Produce `bootstrap/bootstrap.sql` — a single idempotent script that recreates the prod `public` schema (+ extensions, the `files` bucket + its policies, structural seed singletons) on a fresh Supabase project in one run.

**Architecture:** Generate DDL per category by querying `pg_catalog`/`information_schema` on live prod (source of truth — migrations drifted), write each category to a part file under `bootstrap/parts/`, then `cat` the parts in dependency order into `bootstrap/bootstrap.sql`. Verify by standing up a throwaway Supabase branch, running the file, and asserting catalog parity vs prod.

**Tech Stack:** PostgreSQL system catalogs, Supabase MCP. `SET check_function_bodies = false` frees object ordering (the standard pg_dump technique).

**Spec:** `docs/superpowers/specs/2026-06-03-schema-bootstrap-design.md`.

---

## File structure
- `bootstrap/bootstrap.sql` — the assembled deliverable.
- `bootstrap/parts/{00_header,10_extensions,20_tables,30_functions,40_constraints,50_triggers,60_rls_policies,70_grants,80_storage,90_seed}.sql` — generated category parts (kept for maintainability/regeneration).
- `bootstrap/README.md` — runbook snippet (how to run it + what the runbook still owns: edges, secrets, cron, DNS).

## Ordering (dependency-correct, with check_function_bodies off)
header (`SET check_function_bodies=false;`) → extensions → tables (cols + safe defaults) → functions → constraints (PK/FK/UNIQUE/CHECK) → triggers → RLS enable + policies → grants → storage bucket + policies → seed.

---

## Task 0: Pre-flight checks (decide ordering edge cases)

- [ ] **Step 1 — custom-function defaults?** A column default that calls a *custom* public function would need that function before the table. Confirm none (only `now()`/`gen_random_uuid()`/literals):
```sql
SELECT c.relname, a.attname, pg_get_expr(ad.adbin, ad.adrelid) AS dflt
FROM pg_attrdef ad JOIN pg_class c ON c.oid=ad.adrelid JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_attribute a ON a.attrelid=ad.adrelid AND a.attnum=ad.adnum
WHERE n.nspname='public'
  AND pg_get_expr(ad.adbin, ad.adrelid) ~* '[a-z_]+\\s*\\('
  AND pg_get_expr(ad.adbin, ad.adrelid) !~* '^(now|gen_random_uuid|uuid_generate_v4|nextval|CURRENT_|timezone|extensions\\.)';
```
Expected: 0 rows. If rows appear, those defaults are added in a post-functions pass (note them).

- [ ] **Step 2 — seed singletons.** Find the tables the app assumes have a fixed row, by grepping code:
```bash
grep -rEn "\\.eq\\('id', ?(true|1|'true')\\)|WHERE id ?= ?(true|TRUE|1)|app_settings" src | grep -i "from\\|rpc\\|update\\|select" | head -40
```
And list candidate singleton tables + their current rows in prod:
```sql
SELECT 'wall_state' t, to_jsonb(w.*) r FROM wall_state w
UNION ALL SELECT 'slides_config', to_jsonb(s.*) FROM slides_config s
UNION ALL SELECT 'mp_sync_status', to_jsonb(m.*) FROM mp_sync_status m;
```
Record which rows are STRUCTURAL (singletons the code reads) vs event-specific. Seed only structural ones, with neutral values.

## Task 1: Header + extensions part

- [ ] **Step 1 (execute_sql):** generate the extensions block:
```sql
SELECT string_agg(format('CREATE EXTENSION IF NOT EXISTS %I WITH SCHEMA %I;', extname, n.nspname), E'\n' ORDER BY extname)
FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
WHERE extname <> 'plpgsql';
```
- [ ] **Step 2:** Write `bootstrap/parts/00_header.sql`:
```sql
-- HackIA schema bootstrap — generated from prod qshrzfahotmjshtjuvno (verbatim).
-- Run on a FRESH Supabase project to stand up a new edition's schema.
-- Out of scope (see bootstrap/README.md): edge functions, secrets, cron, real data.
SET check_function_bodies = false;
SET client_min_messages = warning;
```
- [ ] **Step 3:** Write the extensions output to `bootstrap/parts/10_extensions.sql` (prefix `CREATE SCHEMA IF NOT EXISTS extensions;` so pgcrypto's schema exists).

## Task 2: Tables part (columns + defaults only)

- [ ] **Step 1 (execute_sql):** generate `CREATE TABLE` per table (constraints come later):
```sql
SELECT string_agg(stmt, E'\n\n' ORDER BY relname) FROM (
  SELECT c.relname,
    format('CREATE TABLE IF NOT EXISTS public.%I (%s\n);', c.relname,
      string_agg(format(E'\n  %I %s%s%s', a.attname,
        format_type(a.atttypid, a.atttypmod),
        CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END,
        CASE WHEN ad.adbin IS NOT NULL THEN ' DEFAULT '||pg_get_expr(ad.adbin, ad.adrelid) ELSE '' END
      ), ',' ORDER BY a.attnum)) AS stmt
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
  LEFT JOIN pg_attrdef ad ON ad.adrelid=c.oid AND ad.adnum=a.attnum
  WHERE n.nspname='public' AND c.relkind='r'
  GROUP BY c.relname
) q;
```
- [ ] **Step 2:** Write the output to `bootstrap/parts/20_tables.sql`.

## Task 3: Functions part (155, verbatim, chunked)

- [ ] **Step 1 (execute_sql, repeat per chunk):** `pg_get_functiondef` is idempotent (`CREATE OR REPLACE`). Output is large → chunk by row number. Run with `OFFSET 0/40/80/120` (LIMIT 40):
```sql
SELECT string_agg(def, E'\n\n') FROM (
  SELECT pg_get_functiondef(p.oid) AS def
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
  ORDER BY p.proname, p.oid
  LIMIT 40 OFFSET 0
) q;
```
- [ ] **Step 2:** Append each chunk to `bootstrap/parts/30_functions.sql` (write chunk files `30_functions_aa.sql` … then `cat` them, OR write incrementally). Confirm total function count emitted = 155.

## Task 4: Constraints part

- [ ] **Step 1 (execute_sql):** PK/UNIQUE/CHECK first (no cross-table deps issue), FK after — but ordering inside one file is fine since all tables exist by now. Emit all via `pg_get_constraintdef` (which for `ALTER TABLE ADD CONSTRAINT` excludes the implicit ones already inlined? No — none inlined since we built tables without constraints):
```sql
SELECT string_agg(format('ALTER TABLE public.%I ADD CONSTRAINT %I %s;', c.relname, con.conname, pg_get_constraintdef(con.oid)),
                  E'\n' ORDER BY (con.contype='f'), c.relname, con.conname)
FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND con.contype IN ('p','u','c','f');
```
(`ORDER BY (contype='f')` puts FKs last.)
- [ ] **Step 2:** Write to `bootstrap/parts/40_constraints.sql`.

## Task 5: Triggers part

- [ ] **Step 1 (execute_sql):**
```sql
SELECT string_agg(pg_get_triggerdef(t.oid) || ';', E'\n' ORDER BY c.relname, t.tgname)
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND NOT t.tgisinternal;
```
- [ ] **Step 2:** Write to `bootstrap/parts/50_triggers.sql`.

## Task 6: RLS enable + policies part

- [ ] **Step 1 (execute_sql) — enable RLS:**
```sql
SELECT string_agg(format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', c.relname), E'\n' ORDER BY c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity;
```
- [ ] **Step 2 (execute_sql) — public policies** (reconstruct CREATE POLICY; idempotent via DROP IF EXISTS):
```sql
SELECT string_agg(
  format('DROP POLICY IF EXISTS %I ON %I.%I;', policyname, schemaname, tablename) || E'\n' ||
  format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s;',
    policyname, schemaname, tablename, permissive, cmd, array_to_string(roles, ', '),
    CASE WHEN qual IS NOT NULL THEN ' USING ('||qual||')' ELSE '' END,
    CASE WHEN with_check IS NOT NULL THEN ' WITH CHECK ('||with_check||')' ELSE '' END),
  E'\n\n' ORDER BY tablename, policyname)
FROM pg_policies WHERE schemaname='public';
```
- [ ] **Step 3:** Write RLS-enable + public policies to `bootstrap/parts/60_rls_policies.sql`.

## Task 7: Grants part (tables + functions, incl. REVOKE PUBLIC)

- [ ] **Step 1 (execute_sql) — table grants** for the Supabase roles:
```sql
SELECT string_agg(format('GRANT %s ON public.%I TO %I;', privilege_type, table_name, grantee), E'\n'
                  ORDER BY table_name, grantee, privilege_type)
FROM information_schema.role_table_grants
WHERE table_schema='public' AND grantee IN ('anon','authenticated','service_role');
```
- [ ] **Step 2 (execute_sql) — function EXECUTE grants + REVOKE FROM PUBLIC** where prod revoked it:
```sql
WITH fns AS (
  SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.proacl
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
)
SELECT string_agg(line, E'\n') FROM (
  -- explicit REVOKE PUBLIC when proacl is set and has no PUBLIC entry
  SELECT format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC;', proname, args) AS line, proname, args, 0 ord
  FROM fns WHERE proacl IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM aclexplode(proacl) a WHERE a.grantee=0)
  UNION ALL
  SELECT format('GRANT %s ON FUNCTION public.%I(%s) TO %I;', a.priv, f.proname, f.args, r.rolname), f.proname, f.args, 1
  FROM fns f CROSS JOIN LATERAL aclexplode(f.proacl) a JOIN pg_roles r ON r.oid=a.grantee
  WHERE f.proacl IS NOT NULL AND r.rolname IN ('anon','authenticated','service_role')
    AND a.privilege_type='EXECUTE'
) s(line, proname, args, ord) ;
```
(Functions with `proacl IS NULL` use the default EXECUTE-to-PUBLIC — no statement needed.)
- [ ] **Step 3:** Write to `bootstrap/parts/70_grants.sql`.

## Task 8: Storage part (bucket + policies)

- [ ] **Step 1 (execute_sql) — bucket:**
```sql
SELECT format('INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES (%L,%L,%L,%s,%L) ON CONFLICT (id) DO NOTHING;',
  id, name, public, COALESCE(file_size_limit::text,'NULL'), allowed_mime_types)
FROM storage.buckets WHERE id='files';
```
- [ ] **Step 2 (execute_sql) — storage policies** (same reconstruction, schemaname='storage'):
```sql
SELECT string_agg(
  format('DROP POLICY IF EXISTS %I ON storage.objects;', policyname) || E'\n' ||
  format('CREATE POLICY %I ON storage.objects AS %s FOR %s TO %s%s%s;',
    policyname, permissive, cmd, array_to_string(roles, ', '),
    CASE WHEN qual IS NOT NULL THEN ' USING ('||qual||')' ELSE '' END,
    CASE WHEN with_check IS NOT NULL THEN ' WITH CHECK ('||with_check||')' ELSE '' END),
  E'\n\n' ORDER BY policyname)
FROM pg_policies WHERE schemaname='storage' AND tablename='objects';
```
- [ ] **Step 3:** Write to `bootstrap/parts/80_storage.sql`.

## Task 9: Seed singletons part

- [ ] **Step 1:** Using Task 0 Step 2's findings, write `bootstrap/parts/90_seed.sql` — `INSERT … ON CONFLICT DO NOTHING` for ONLY the structural singletons (neutral values, no event data). Example shape (adjust to actual columns/rows found):
```sql
INSERT INTO public.mp_sync_status (id, is_syncing) VALUES (1, false) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.wall_state (id, phase) VALUES (true, 'closed') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.slides_config (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;
```

## Task 10: Assemble bootstrap.sql

- [ ] **Step 1 (Bash):** concatenate parts in order:
```bash
cat bootstrap/parts/00_header.sql bootstrap/parts/10_extensions.sql bootstrap/parts/20_tables.sql \
    bootstrap/parts/30_functions.sql bootstrap/parts/40_constraints.sql bootstrap/parts/50_triggers.sql \
    bootstrap/parts/60_rls_policies.sql bootstrap/parts/70_grants.sql bootstrap/parts/80_storage.sql \
    bootstrap/parts/90_seed.sql > bootstrap/bootstrap.sql
wc -l bootstrap/bootstrap.sql
```

## Task 11: Verify on a throwaway Supabase (parity diff)

- [ ] **Step 1 — cost gate:** `get_cost(type='branch')` then `confirm_cost`. If branches are not free/acceptable, STOP and report; fall back to applying `bootstrap.sql` to prod as a no-op idempotency check (CREATE OR REPLACE / IF NOT EXISTS / DROP-CREATE policy → proves syntax + that prod already matches, but NOT completeness on an empty DB) and flag the residual.
- [ ] **Step 2 (main thread):** `create_branch(name='bootstrap-verify')`. On the branch, run `bootstrap/bootstrap.sql` (via `apply_migration` or `execute_sql` against the branch project_id).
- [ ] **Step 3 — parity diff (run the SAME recon on BRANCH and PROD; assert equal):**
```sql
SELECT
 (SELECT count(*) FROM pg_tables WHERE schemaname='public') tables,
 (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') funcs,
 (SELECT count(*) FROM pg_policies WHERE schemaname IN ('public','storage')) policies,
 (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal) triggers,
 (SELECT count(*) FROM storage.buckets) buckets;
```
Expect identical to prod (37 / 155 / 67 / 10 / 1). Then a per-object normalized diff for functions + policies (strip whitespace; compare definition sets). Expect empty diff.
- [ ] **Step 4:** `delete_branch`. Record the parity result.

## Task 12: README + commit + PR

- [ ] **Step 1:** Write `bootstrap/README.md`: one-paragraph "how to provision a new edition's schema" (create project → run `bootstrap.sql`) + the explicit list of what the runbook (sub-project #4) still owns: deploy the ~14 edge functions, set per-instance secrets (Supabase service role auto; Mercado Pago, push VAPID, WHISPER_URL), set up cron/scheduled jobs, set deploy env + DNS.
- [ ] **Step 2:** Branch `feat/schema-bootstrap`; commit `bootstrap/`; English changelog `docs/changelog/2026-06-03-schema-bootstrap.md` (what/why + the parity result). PR; merge.

---

## Self-review
- Spec coverage: extraction-from-live-catalog ✓; verbatim ✓; ordering with `check_function_bodies=false` ✓; in/out scope ✓ (edges/secrets/cron/data excluded, Supabase-managed `auth`/`storage` tables not recreated — only bucket+policies); seed singletons ✓; throwaway-Supabase parity verification ✓ (cost-gated).
- Placeholder scan: generator queries are concrete; seed values are illustrative and Task 0 Step 2 pins the real set before writing Task 9.
- Risk: grants reconstruction (Task 7) is the fiddliest — the Task 11 parity diff is its safety net; iterate the grant query until the diff is empty.

---

## EXECUTION STATUS — COMPLETE (2026-06-03, branch `feat/schema-bootstrap-impl`)

**All parts generated verbatim from prod + assembled + verified.** `bootstrap/bootstrap.sql` = 6254 lines.
- Parts: `00_header`, `10_extensions` (9), `20_tables` (37), `30_functions` (155), `40_constraints` (111), **`45_indexes` (52, NEW — see below)**, `50_triggers` (10), `55_rls_enable` (37), `60_policies` (61 public), `70_grants` (table + 72 REVOKE-PUBLIC + 435 GRANT EXECUTE), `80_storage` (bucket + 6 policies), `90_seed` (3 singletons).
- Assembly order (final): `00 10 20 30 40 45 50 55 60 70 80 90`.

**Plan corrections applied (pre-flight + advisor review):**
- **NEW part `45_indexes.sql`** — the plan's file structure jumped 40_constraints → 50_triggers, omitting the **52 non-constraint indexes** (partial/functional/UNIQUE). Added after constraints; parity now counts them.
- **Grants generator bug fixed:** Task 7's function-grants query used `a.priv` (does not exist) → use `a.privilege_type`.
- Pre-flight confirmed: `prokind` all `f` (no aggregates that break `pg_get_functiondef`), 0 extension-owned functions, **0 column defaults call custom functions** (ordering free).

**Fidelity technique (what actually worked):** transcribing 136KB of function bodies via the MCP JSON channel is escaping-hell (dollar-quoting + CRLF). Solution: generators emit `replace(encode(convert_to(<sql>,'UTF8'),'base64'),chr(10),'')` → single base64 string; large results overflow to a saved `.txt` (MCP token cap), decoded with python (`base64.b64decode` of the longest base64 run) straight to the part file — base64 is corruption-proof and the SQL never enters agent context. Function bodies carry 610 `\r` (CRLF) chars, preserved byte-exact.

**Task 11 verification — DONE (user chose the free apply-to-prod path, no branch):**
- **Structural parity:** counts in assembled file == prod: 37 tables / 155 funcs / 111 constraints / 52 indexes / 10 triggers / 37 RLS / 67 policies.
- **Byte-exact fidelity:** per-category `md5(trim(both E'\n' from <generator-expr>))` on prod == local file md5 (read in binary): func `145a2d…`, cons `ede892…`, idx `402fe5…`, pol `11cd8f…`, grant `4b25fb…` — all match.
- **Residual (accepted):** empty-DB execution (dependency order) not run — needs a paid branch. Mitigated by `check_function_bodies=false`, dependency-safe order, and the 0-custom-default pre-flight.

**Task 12 — DONE:** `bootstrap/README.md` (runbook + out-of-scope: 14 edges, secrets/vault, cron, DNS) + changelog `docs/changelog/2026-06-03-schema-bootstrap.md`.

**Branch note:** prior WIP lived on `feat/schema-bootstrap` (plan + spec + 7 partial parts + scratch `.py`). This session's git state had drifted to `master`; the completed deliverable was consolidated onto **`feat/schema-bootstrap-impl`** (cut from master, with plan/spec/parts/.gitignore pulled in) to avoid a risky checkout. PR target: master.
