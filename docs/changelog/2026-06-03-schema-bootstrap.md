# feat: schema bootstrap (single idempotent recreate of prod public schema)

**Data:** 2026-06-03
**Branch:** feat/schema-bootstrap
**Arquivos alterados:** bootstrap/bootstrap.sql, bootstrap/parts/*.sql, bootstrap/README.md, docs/superpowers/plans/2026-06-03-schema-bootstrap.md

## O que foi feito
Produced `bootstrap/bootstrap.sql` — one idempotent script that recreates the **entire prod `public`
schema** on a fresh Supabase project. Generated **verbatim from the live prod catalog** (project
`qshrzfahotmjshtjuvno`), assembled in dependency order from `bootstrap/parts/`:

- 9 extensions, **37 tables**, **155 functions**, **111 constraints**, **52 indexes**, **10 triggers**,
  RLS enabled on 37 tables + **67 policies** (61 public + 6 storage), table/function grants
  (incl. `REVOKE … FROM PUBLIC`), the `files` storage bucket + policies, and 3 structural seed singletons.

This is **sub-project #1** of the multi-edition architecture (each future edition = an isolated Supabase
project stood up with this script). See `bootstrap/README.md`.

## Por que
The historical `migrations/` had drifted from prod, so they could not reliably recreate the schema for a
new edition. Extracting verbatim from the live catalog (source of truth) guarantees a new edition starts
from an exact copy of the proven schema.

## Decisões técnicas
- **Source = live `pg_catalog`/`information_schema`**, not migrations (drift). `pg_get_functiondef`,
  `pg_get_constraintdef`, `pg_get_indexdef`, `pg_policies`, `aclexplode` reconstruct each object.
- **base64 transport for fidelity:** generators return `encode(convert_to(…,'UTF8'),'base64')`, decoded
  with `base64 -d` / python — eliminates JSON-escaping / dollar-quoting / CRLF corruption risk. Function
  bodies contain 610 `\r` chars (dashboard-edited CRLF), preserved byte-exact.
- **Large outputs overflow to a saved `.txt`** (MCP token cap) and are decoded via Bash/python, keeping
  the 187KB of SQL out of the agent context.
- **`SET check_function_bodies = false`** frees object ordering (standard pg_dump technique).
- **Added `45_indexes.sql`** (52 non-constraint indexes) — the original plan omitted indexes entirely
  (caught in pre-flight review); the parity check now counts them.
- **Fixed the grants generator** (`a.priv` → `a.privilege_type`) from the plan draft.
- **Verification = structural parity + byte-exact md5** per category (prod == generated). Empty-DB
  execution deferred (would need a paid branch; user chose the free path). Mitigated by ordering +
  `check_function_bodies=false` + pre-flight (0 column defaults call custom functions).

## Impacto
- New directory `bootstrap/`. No runtime/app code touched; no breaking changes.
- Unblocks multi-edition provisioning (DB layer). Runbook (sub-project #4) still owns edge functions,
  secrets/vault, cron, and deploy env/DNS — listed in `bootstrap/README.md`.

## Próximos passos
- Optional gold-standard check: run `bootstrap.sql` on a throwaway Supabase branch and assert empty-DB
  parity (counts + normalized diffs) — pending if/when an edition is actually scheduled.
- Grants on a fresh project: Supabase `ALTER DEFAULT PRIVILEGES` may grant beyond what the explicit
  `GRANT`s cover; a branch parity diff would confirm whether any `REVOKE`s are also needed.
