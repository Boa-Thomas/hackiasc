# Auth Phase 3 — SP1: Password Accounts Foundation (Design)

**Date:** 2026-06-02
**Status:** Design — awaiting user review before plan
**Sub-project:** SP1 of 3 (SP2 = mentor/juror unification + legacy cutover; SP3 = scope enforcement)
**Prod project:** `qshrzfahotmjshtjuvno`

---

## Goal

Let an admin **provision and manage password login accounts** (roles `admin` / `viewer` / `checkin` / `staff`) from the admin UI, with server-generated show-once passwords. This also exercises the `app_metadata → JWT claims → RLS read` path end-to-end (a **tracer bullet**) so SP2/SP3 build on a proven foundation.

> **No forced password change on first login** (user decision). The temp password is the working password; the holder may change it later via the normal Supabase flow if they wish.

## Why this is SP1

The brief surfaced that:
- `viewer`/`checkin`/`staff`/`admin` **already log in by password** through `src/admin/AdminLogin.jsx` + `src/admin/useAdminAuth.js` (`VALID_ROLES = ['admin','viewer','checkin','staff']`). The login UI is **not** the gap.
- Those accounts exist today **only because they were hand-made** via the Supabase Dashboard or one-off SQL (`create_viewer.sql`, `create_checkin_role.sql`). There is **no UI or API to provision them**.

So SP1 = the missing **provisioning** (edge + admin UI), plus the foundation invariants the later sub-projects depend on.

---

## Shared foundation (locked here; enforced in SP3)

These contracts are defined now so SP1 builds toward the right end-state. **SP1 implements only the parts marked [SP1]; the rest is documented intent for SP2/SP3.**

### Principal model
- `access_grants` is the **single canonical registry** of every non-public principal. Each principal = one `access_grants` row carrying `role` + `scope` (canonical) + lifecycle (`expires_at`/`revoked_at`).
- Each grant has a backing `auth.users` whose `app_metadata = { role, grant_id }`. **[SP1]** for password grants.
- **Scope is never trusted from the JWT.** It is read live from `access_grants.scope` via `app_metadata.grant_id` (decision: "ler ao vivo"). **Enforcement is SP3.**

### `current_grant()` — the live-resolution helper (CONTRACT ONLY here; built in SP3)
A single function every SP3 policy/RPC will route through. Documented now so SP1's `app_metadata` shape is correct:
- `SECURITY DEFINER` **and `STABLE`** (without `STABLE`, the planner may re-run it per-row and destroy RLS performance).
- Reads `access_grants` by the JWT's `app_metadata.grant_id`, returning `{ role, scope }` **and gating `revoked_at`/`expires_at` in the same read** → makes revocation **instant** (closes the "revocation durability" risk: today a mid-flight access token survives until JWT TTL).
- **Unrestricted-resolution invariant** — ALL of these resolve to *unrestricted*:
  - `scope` is `{}` or `null`,
  - no `access_grants` row found for the `grant_id`,
  - **no `grant_id` claim at all** (legacy/hand-made accounts must NOT be locked out mid-retrofit).
- Semantics: **restrict-only** — scope may only narrow the role, never expand it.

### Scope schema (hybrid) — stored in SP1, enforced in SP3
A small, typed shape (not free-form JSON). `{}` always means the role's full default (unrestricted):
- **mentor:** `{ "team_ids": ["<uuid>", …] }` — only their teams.
- **juror:** `{ "idea_ids": ["<uuid>", …] }` — only their ideas.
- **viewer:** `{ "read_only": true, "allowed_tabs": ["results","payments"] }`.
- **admin:** `{ "allowed_tabs": ["registrations","access", …] }`.

Row keys (`team_ids`/`idea_ids`) + capability flags (`read_only`, `allowed_tabs`). **[SP1]** stores this via a guided editor; **no enforcement** until SP3.

> **[SP1] obligation:** every password account this sub-project creates MUST have `grant_id` in `app_metadata` and a matching `access_grants` row, so the future `current_grant()` resolves it. Accounts made the old way (no `grant_id`) keep working via the no-grant_id → unrestricted rule; SP1 does **not** migrate them (deferred).

---

## SP1 components

### 1. DB changes (`migrations/phase3_password_accounts.sql`)
- `ALTER TABLE access_grants ALTER COLUMN token_hash DROP NOT NULL;` — password grants have no token. (Postgres `UNIQUE` already permits multiple `NULL`s, so the existing uniqueness on `token_hash` is unaffected; **verify** there is no separate `NOT NULL`-dependent CHECK/index first.)
- Extend the `auth_kind` domain to include `'password'` (today: `'jwt_exchange'` | `'rpc_token'`). **Verify** whether `auth_kind` has a CHECK constraint; if so, recreate it as `CHECK (auth_kind IN ('jwt_exchange','rpc_token','password'))`.
- Integrity CHECK for the new kind: `CHECK (auth_kind <> 'password' OR (email IS NOT NULL AND token_hash IS NULL))`.
- **No new columns.**

### 2. Edge function `supabase/functions/access-account/index.ts`
Mirrors `access-admin` exactly for structure: CORS allow-list, POST-only, **server-side admin check on the caller's JWT** (`user.app_metadata?.role !== 'admin' → 403`), service-role client for privileged ops. Single endpoint, dispatched by a body `action` field. Both actions are **admin-only**.

**`action: 'create'`**
- Input: `{ role, label, email, scope }`. Validate `role ∈ {admin,viewer,checkin,staff}` (the password roles) → else `400 invalid_role`. `email` required + format check. `scope` defaults to `{}`.
- Order (grant_id known before user creation → clean rollback):
  1. `INSERT access_grants (auth_kind='password', role, label, email, scope, token_hash=null, supabase_user_id=null, created_by=<caller id>) RETURNING id`.
  2. Generate a CSPRNG password (§4). `admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { role, grant_id: <id> } })`. On failure → `DELETE` the grant row; surface `email_exists` as `409`, else `500`.
  3. `UPDATE access_grants SET supabase_user_id = <user.id> WHERE id = <id>`. On failure → `deleteUser` + `DELETE` grant, return `500`. Never leave a half-built account.
- Return `{ ok: true, email, password }` — the password is shown **once** by the UI.

**`action: 'reset_password'`**
- Input: `{ grant_id }`. Look up the grant → its `supabase_user_id` (`404` if missing).
- Generate a new CSPRNG password; `admin.auth.admin.updateUserById(userId, { password })`.
- Return `{ ok: true, password }` (show once).

**Revoke** is NOT added here — it reuses the existing `access-admin` edge (deletes backing user + sets `revoked_at`), which already works for any grant with `supabase_user_id`. See §3 for the UI wiring change.

### 3. Admin UI — `src/admin/AdminAccess.jsx`
Add a second section ("Contas (login por senha)") alongside the existing link-grants UI; keep both in the same component (they share `admin_list_grants`).
- **Create form:** `label`, `role` (select limited to `admin`/`viewer`/`checkin`/`staff`), `email`, and a **guided scope editor** (hybrid schema, see *Scope schema* above; stored only, not enforced in SP1). Submit → `fetch` `access-account` `{action:'create'}` with the admin's bearer token (same pattern the existing `revoke()` already uses) → render the returned password **show-once** with a copy button and "copie agora" warning (reuse the existing `newLink` UI pattern, relabeled for passwords).
- **List:** the existing `admin_list_grants` table gains a "tipo" column (`link` vs `senha`, from `auth_kind`) and, for password rows, **"resetar senha"** (→ `access-account {action:'reset_password'}`, show-once) and **"revogar"**.
- **Revoke wiring fix:** the current `revoke(g)` routes only `auth_kind === 'jwt_exchange'` to the edge. Change the condition so password grants also use the edge (they have `supabase_user_id`): route to the `access-admin` edge when `g.supabase_user_id` is present (i.e. `jwt_exchange` **or** `password`), and to `admin_revoke_grant` RPC only for token-only `rpc_token` grants.
- `admin_list_grants` must return `auth_kind` and `email` (verify it already selects them; if not, that's a one-line RPC update in the same migration).

### 4. CSPRNG password helper (in the edge)
`crypto.getRandomValues` over a safe charset (e.g. `A–Z a–z 2–9`, excluding `0/O/1/l/I`), length ≥ 16, rejection-sampled to avoid modulo bias (same technique as `generate_voucher_code()` in `migrations/fix_voucher_code_csprng.sql`). Never logged.

---

## Build order (tracer bullet first)

1. **[Task 1 — TRACER] Prove the foundation before any UI.** Via the Supabase MCP / a throwaway script: create one password account through the *path SP1 will use* (manually exercise `createUser` with `app_metadata={role:'viewer',grant_id}` + an `access_grants` row), then: sign in, assert the JWT carries `role` + `grant_id`, assert `is_admin_or_viewer()` (or a viewer-readable RLS path) sees the role, then revoke (delete user + `revoked_at`) and assert the session is dead. **Self-clean** (delete the test user + grant). This validates `app_metadata → JWT → RLS` — the part that matters most — before building on it.
   - Flag carried to SP2: the **magic-link `verifyOtp` exchange** (`access-exchange` hashed_token) is a *different* unexercised path (0/17 grants). SP1 does **not** prove it; SP2 must tracer-bullet it before cutting mentor/juror over.
2. DB migration (§1).
3. Edge `access-account` (§2) + edge-level smoke (create → reset → revoke) self-cleaning.
4. Admin UI (§3).
5. Full manual E2E: admin creates a `viewer` account → log in as it (incognito) with the show-once password → reach the panel → admin resets the password → re-login with the new password → admin revokes → login denied. Clean up.

---

## Data flow (create + login)

```
Admin (role=admin session)
  └─ POST access-account {action:create, role, label, email, scope}
       edge verifies caller.app_metadata.role==='admin'
       ├─ INSERT access_grants(auth_kind=password, role, label, email, scope, token_hash=null) RETURNING id
       ├─ createUser(email, csprng_pw, app_metadata{role, grant_id:id})
       └─ UPDATE access_grants SET supabase_user_id=user.id
       → { email, password }   (UI shows once)

New user
  └─ AdminLogin → signInWithPassword(email, password)
       JWT app_metadata{role, grant_id} → useAdminAuth accepts role → panel
```

## Error handling
- Edge: structured JSON errors (`invalid_role`, `email_exists`(409), `not_found`(404), `forbidden`(403), `bad_request`(400)), same `json(body,status,origin)` helper as `access-admin`.
- `create` is **transactional in effect**: a failure at any step rolls back the prior steps (delete grant row and/or backing user); no half-built account survives.
- Frontend surfaces edge errors inline (reuse existing `error` state patterns).

## Testing
- **Unit (vitest):** CSPRNG charset/length/no-bias; scope-editor produces valid hybrid JSON; UI revoke-routing predicate (`password`/`jwt_exchange` → edge, `rpc_token` → RPC). Pure functions extracted where needed.
- **Integration smokes (manual / MCP, self-cleaning):** the Task-1 tracer; the edge create → reset → revoke cycle; the full E2E in build-order step 5.
- `npm run build` + `npx vitest run` green before any prod apply. **Honesty:** vitest covers JS/JSX only; the migration + edge are validated by the manual smokes against prod, not by vitest.

## Security considerations
- Passwords: server-generated CSPRNG, show-once; never logged, never stored in plaintext (Supabase Auth hashes them). Admin-typed passwords were explicitly rejected.
- `access-account` reuses the proven admin-gating of `access-admin` (caller JWT, never the UI).
- Revoke deletes the backing user (instant session kill) **and** sets `revoked_at` (so the future `current_grant()` also rejects it) — defense in depth.
- No forced rotation (user decision); the show-once delivery keeps the temp password off the admin's persistent surfaces.

## Invariants (must hold after SP1)
- `{}` / null scope == **unrestricted**. SP1 stores scope but enforces nothing → all 17 live grants + new accounts remain unrestricted. (Flipping empty→deny is a SP3 concern and must migrate all grants in the same change.)
- Every SP1-created account has `grant_id` in `app_metadata` + a matching `access_grants` row.
- Existing hand-made accounts (no `grant_id`) keep working unchanged.

## Explicitly out of scope (deferred)
- **Scope enforcement** anywhere — SP3.
- **Mentor/juror** changes, the `mentor_get_me_by_token` bug fix, legacy `#mentor?t=`/`#jurado?t=` cutover, retiring `mentors.access_token`/`jurors.access_token` — SP2.
- **Magic-link `verifyOtp`** validation — SP2 precondition.
- Migrating/adopting the existing hand-made viewer/checkin accounts into the grant registry — later (they keep working).
- Email/SMTP (invite flow was not chosen).
- Forced password change on first login (explicitly dropped by the user).

## Open questions resolved (defaults taken)
- Password delivery → auto-generate + show-once, **no forced change** (user decision).
- Scope schema → hybrid (chosen); SP1 stores it via a guided editor, no enforcement.
- Scope freshness → read live via `grant_id` (chosen); SP1 only guarantees `grant_id` presence.
- Account email → a real email the admin types (it is the login identity); uniqueness enforced by Supabase Auth.
