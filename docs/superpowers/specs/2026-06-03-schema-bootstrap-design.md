# Sub-project #1 — Schema Bootstrap (Design)

**Date:** 2026-06-03
**Status:** Design approved (verbatim-first) — proceed to plan
**Parent:** `docs/superpowers/specs/2026-06-03-multi-edition-instance-architecture-design.md` (sub-project #1)
**Prod source of truth:** `qshrzfahotmjshtjuvno` (LIVE catalog — migration files have drifted, so the live DB is authoritative)

## Goal
Produce a single idempotent `bootstrap.sql` that reproduces the prod **public** schema (+ required extensions, the `files` storage bucket and its policies, and structural seed singletons) so a **fresh Supabase project** for a new edition is stood up in **one run** — not by replaying ~40 drifted migrations.

## Scale (recon 2026-06-03)
37 public tables · **155 public functions** · 67 RLS policies (61 public + 6 storage) · 10 public triggers · 6 extensions (`plpgsql, pg_stat_statements, uuid-ossp, pgcrypto, supabase_vault, pg_net`) · 0 enums · 0 sequences · 1 private bucket `files`.

## Approach — generate DDL from the live catalog
155 functions makes hand-authoring infeasible and unsafe. Write SQL that **emits DDL** from `pg_catalog`/`information_schema` and assemble the returned text into `bootstrap.sql` with **minimal transformation** (lowest risk):
- **tables/columns/defaults:** from `information_schema.columns` + `pg_get_expr` for defaults.
- **constraints:** `pg_get_constraintdef` (PK/FK/CHECK/UNIQUE).
- **functions (155, verbatim):** `pg_get_functiondef`.
- **triggers:** `pg_get_triggerdef`.
- **policies (67):** reconstruct `CREATE POLICY` from `pg_policies` (cmd, roles, USING=qual, WITH CHECK=with_check) — both public and storage.
- **grants:** table grants (`information_schema.role_table_grants`) + function grants (`pg_proc.proacl`) for `anon`/`authenticated`/`service_role`.
- **extensions:** `CREATE EXTENSION IF NOT EXISTS` each, honoring schema (e.g. `pgcrypto` in `extensions`).
- **storage:** `INSERT INTO storage.buckets` for `files` (private) + the 6 storage policies.

### File ordering (dependency-correct)
extensions → tables (+ defaults/constraints; FKs last or deferred) → functions → triggers → `ALTER TABLE … ENABLE ROW LEVEL SECURITY` + policies → grants → storage bucket + policies → **structural seed**.

## Decisions
1. **VERBATIM of prod, not "clean."** Reproduce the exact schema; the inert legacy mentor/juror token path (`access_token` columns, `mentor_sessions`, legacy resolvers) ships along but is unused in a fresh instance. Faithful + catalog-diff-verifiable. Cleaning legacy is a deferred, optional follow-up (don't risk mis-excluding among 155 functions).
2. **NOT in bootstrap.sql** (separate, in the runbook): edge functions (~14, deployed via CLI/MCP), secrets/env, cron/scheduled jobs, real data, vault contents. **Supabase-managed schemas (`auth`, `storage` tables) are NOT recreated** — a new project already has them; we only add our bucket + policies that reference `storage.objects`.
3. **Seed = structural singletons only.** Rows the app code assumes exist (e.g. `wall_state` id=true, `slides_config` id=TRUE, `mp_sync_status` id=1, default `app_settings` keys). Enumerate during the build by grepping the code for assumed-present rows. **Zero event data** (no registrations/teams/mentors/jurors/config values).

## Verification (gold standard)
Stand up a **throwaway Supabase** (branch via `create_branch`, or a scratch project), run `bootstrap.sql`, then run the same recon + per-object signature queries on both and assert **parity** (counts of tables/functions/policies/triggers/grants, and a normalized diff of each object's definition) modulo the documented exclusions. **Confirm cost (`get_cost`/`confirm_cost`) before creating anything**; tear down after.

## Deliverables
- `bootstrap.sql` (the consolidated schema).
- A runbook snippet: how to run it against a new project + what still needs the runbook (edges, secrets, cron, DNS).

## Risks
- **Dependency ordering** — functions referencing tables, CHECK/defaults calling functions (e.g. `gen_random_uuid`), FKs. Mitigation: extensions+tables first, functions next, FKs/triggers/policies after; if a CHECK calls a function, emit functions before constraints (or add constraints in a later pass).
- **Policy/grant fidelity** — reconstruction must match `pg_policies`/acl exactly; verified by the parity diff.
- **Supabase-managed objects** — do NOT emit `auth`/`storage` table DDL; only our bucket + policies. Roles `anon`/`authenticated`/`service_role`/`postgres` exist in any project.
- **Extension schema quirks** — `pgcrypto` lives in `extensions` in prod; emit with the same schema or qualify usages (functions already qualify `extensions.` where needed).
- **Idempotency** — prefer `IF NOT EXISTS` / `CREATE OR REPLACE` / `DROP POLICY IF EXISTS` so a re-run is safe.

## Next
`writing-plans` → bite-sized plan (the exact generator queries per category, the assembly order, the verification harness), then execute.
