# Design: Unified admin-managed access-grants (auth rework)

**Date:** 2026-06-01
**Status:** Approved (design phase)
**Author:** brainstorming session
**Related:** `docs/changelog/2026-06-01-security-sweep.md` (auth findings this rework consolidates)

## Problem

Auth today is fragmented across **three independent session systems** plus Supabase Auth, with no shared abstraction and several security gaps (catalogued in the 2026-06-01 security sweep):

- **Supabase Auth** (admin / viewer / checkin / staff) — accounts created by hand in the dashboard; no admin UI; the **staff link `#admin-acesso?t=<password>` embeds the real Supabase password in the URL**.
- **mentor** — email + 4-digit code (brute-forceable) OR static `mentors.access_token` link that **never expires and has no server-side revocation**.
- **juror** — static `jurors.access_token` link, **never expires** (revoke = manual `active=false`).
- **participant** — `participant_login` (email + CPF) → `participant_sessions` (7-day token).
- **facilitator** — **no role of its own**; runs as full `admin`.
- **wall/sugar** — identity via `registration_id` (public; see sweep findings).

The admin wants to **create and manage scoped access (accounts and tokenized links) for every persona from one place** — facilitator, mentors, staff, jurors, and ad-hoc named individuals ("FULANO") — with expiry and revocation.

## Locked decisions

1. **Unified access-grants system** — a single `access_grants` registry + an admin **"Acessos"** UI to mint/expire/revoke.
2. **Manage everything in the new UI** — including creating the privileged Supabase Auth accounts (admin/viewer/checkin) via a privileged edge function.
3. **Roles predefined + optional per-grant scope** (e.g., a mentor grant limited to teams X,Y; "FULANO" = base role + custom scope).
4. **Migrate** mentor/juror onto the new system and deprecate the old paths — via a **coexist → cutover** rollout (not big-bang).
5. **Substrate fork = X (token-exchange)** for JWT personas; **one backing Supabase user per grant** (per-person audit + "FULANO" identity).
6. **Spec covers the full target (Phases 1+2); the implementation plan covers only Phase 1.**

## The substrate fork (the load-bearing constraint)

A custom `access_grants` token is **not** a Supabase JWT, so it cannot satisfy any RLS policy that reads `auth.jwt() -> 'app_metadata' ->> 'role'`. Each persona therefore falls on one of two tracks, decided by whether its panel reads tables directly (needs a JWT) or only through `SECURITY DEFINER` RPCs (can be anon + token):

| Persona | Panel reads via | Track |
|---|---|---|
| admin, viewer, checkin, **staff**, **facilitator** | RLS (direct table reads) | **token-exchange (X)** |
| mentor, juror | `SECURITY DEFINER` RPCs | **rpc-token** |
| participant | RPCs (CPF self-login) | out of scope (self-service) |

The unification is at the **registry + admin UI + entry-route** layer; the substrate per persona is whatever its panel already needs. Both tracks are rows in `access_grants`.

## Architecture

### `access_grants` (the spine)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `label` | text | human name shown in UI, e.g. "FULANO", "Mentor João" |
| `role` | text (enum) | `admin` \| `viewer` \| `checkin` \| `staff` \| `facilitator` \| `mentor` \| `juror` |
| `auth_kind` | text (enum) | `jwt_exchange` \| `rpc_token` (derived from role, stored for clarity) |
| `scope` | jsonb | optional, e.g. `{ "team_ids": [...] }`; `{}` = full role scope |
| `token_hash` | text unique | `sha256` of a high-entropy token (`encode(gen_random_bytes(32),'hex')`); the **raw token exists only in the link**, never stored. Lookup is by hash. |
| `supabase_user_id` | uuid | for `jwt_exchange`: the per-grant backing user; null for `rpc_token` |
| `ref_id` | uuid | for `rpc_token`: links to `mentors.id` / `jurors.id` during coexistence |
| `email` | text | optional contact |
| `expires_at` | timestamptz | nullable; enforced server-side |
| `revoked_at` | timestamptz | nullable; enforced server-side |
| `created_by` | uuid | admin who minted it |
| `created_at` / `last_used_at` | timestamptz | |

RLS: only `is_admin()` can SELECT/INSERT/UPDATE. `anon`/others never read this table; resolution happens through the RPC/edge function below.

### Unified entry route `#acesso?t=<token>`

`App.jsx` adds one route. On load it calls a resolver:
- **`jwt_exchange` grant** → POST to the `access-exchange` edge function with the token. The function validates the grant (active, not expired/revoked, rate-limited), ensures the per-grant backing user exists with `app_metadata = { role, grant_id, scope }`, then `auth.admin.generateLink({ type: 'magiclink', email })` and returns `token_hash`. The client calls `supabase.auth.verifyOtp({ token_hash, type: 'email' })` → a real Supabase session with the role. App then routes to that role's panel. **All existing RLS and admin-panel reads work unchanged.**
- **`rpc_token` grant** → store the token in localStorage and route to the mentor/juror panel; those panels keep calling their `SECURITY DEFINER` RPCs, which validate via the unified resolver.

> Verified against Supabase docs: `auth.admin.generateLink` (magiclink) returns a `hashed_token`; the client establishes the session with `auth.verifyOtp({ token_hash, type })`. Backing users are created with `auth.admin.createUser({ email, app_metadata })`.

### `grant_resolve(p_token)` — unified `SECURITY DEFINER` RPC (rpc-token track)

`SET search_path = pg_catalog, public`. Looks up the grant by `token_hash = sha256(p_token)` (indexed exact match — the raw secret is never stored, so there is no timing-compare surface), checks `revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())`, refreshes `last_used_at`, returns `{ role, scope, ref_id }`. Rate-limited per token/IP. Mentor/juror RPCs call this instead of their bespoke `*_token_owner` checks (which become thin wrappers during coexistence).

### `access-exchange` edge function (token-exchange track) — Phase 1

Service-role. Steps: parse token → look up grant → reject if revoked/expired/rate-limited → upsert backing user (`email = grant+<id>@hackiasc.internal`, `app_metadata = { role, grant_id, scope }`, `email_confirm: true`) → `generateLink({ type: 'magiclink' })` → return `token_hash`. **No `is_admin()` gate here** (the token itself is the credential for the holder to get *their own* session), but it must hard-validate the grant server-side and be rate-limited.

### `access-admin` edge function (account management) — Phase 2

Service-role + **server-side `is_admin()` JWT check** (the caller must already be an admin; do NOT rely on UI gating — this is the highest-blast-radius surface). Creates/disables the privileged Supabase users (admin/viewer/checkin) and mirrors them as `access_grants` rows. Revoke = `auth.admin.updateUserById(ban)` + set `revoked_at`.

### Admin "Acessos" UI (`src/admin/AdminAccess.jsx`)

Lists all grants (both kinds) with role, label, scope, expiry, last-used, status. Actions: **create** (role + label + optional scope + optional expiry → returns the `#acesso?t=…` link to copy), **revoke**, **set/extend expiry**, **regenerate token**. New `access` tab in `AdminPanel` (admin-only). Mentor/juror creation flows fold into this UI (replacing the bespoke bits of `AdminMentors`/`AdminJurors` over time).

### New role: `facilitator`

Add `is_facilitator()` (and include facilitator where appropriate in existing helpers). The facilitator panel becomes reachable via a `jwt_exchange` grant with a scoped, non-admin role — closing "facilitator == admin".

## Security (baked in from line 1 — do not reintroduce sweep findings)

- `SET search_path = pg_catalog, public` on **every** `SECURITY DEFINER` function added here.
- Tokens from `gen_random_bytes` (CSPRNG), never `random()`. Only the `sha256` hash is stored; the raw token lives solely in the link, so a DB read never leaks a usable credential and lookup-by-hash has no timing-compare surface.
- Expiry + revocation enforced **server-side** in `grant_resolve` and `access-exchange`.
- Rate-limit token resolution (per token + per IP).
- `access-admin` gated by a server-side `is_admin()` check on the caller's JWT (not UI-only).
- `access_grants` RLS: admin-only; tokens never selectable by non-admins.

## Data flow / contracts

- Admin mints grant (UI → `admin_create_grant` RPC, `is_admin`) → row in `access_grants` + (jwt_exchange) backing user provisioned lazily on first exchange or at creation.
- Holder opens `#acesso?t=<token>`:
  - jwt_exchange: client → `access-exchange` → `{ token_hash }` → `verifyOtp` → session → panel.
  - rpc_token: client stores token → panel RPCs → `grant_resolve` → `{ role, scope, ref_id }`.
- Revoke (UI → `admin_revoke_grant`): set `revoked_at`; jwt_exchange also bans the backing user.

## Rollout: coexist → cutover

This is auth on a live prod DB. Sequence:
1. Ship `access_grants` + resolver + exchange + UI **alongside** the existing paths. Old `mentors.access_token` / `jurors.access_token` / staff password link keep working.
2. Migrate existing mentors/jurors into `access_grants` (rpc_token rows referencing `ref_id`); mint new `#acesso` links.
3. Distribute new links; only then revoke old tokens / remove `#admin-acesso?t=<password>` and `#mentor?t=`/`#jurado?t=` legacy routes.
4. Phase 2: move admin/viewer/checkin creation into the UI; retire manual dashboard steps.

## Error handling

- Invalid/expired/revoked token → `#acesso` shows a clear "link inválido ou expirado" state; no panel access.
- Edge function failure (Supabase admin API down) → surfaced to the holder as a retryable error; never silently grants access.
- `grant_resolve` returns nothing → RPCs reject (raise), as the juror path already does.
- Backing-user provisioning is idempotent (lookup-then-create) to tolerate retries.

## Testing

- Pure JS units (vitest): grant link parsing/route selection; scope helpers; UI list/filter logic; `aiEval`-style helpers extracted from components.
- DB/RPC: `grant_resolve` expiry/revocation/rate-limit via the Supabase MCP (project `qshrzfahotmjshtjuvno`) in a self-cleaning smoke test.
- Edge functions: local invoke with a test grant; verify `verifyOtp` yields a session carrying the right `app_metadata.role`; verify `access-admin` rejects non-admin callers.
- Manual: open a minted `#acesso` link for each role; confirm the correct panel + RLS scope; confirm revoke kills access.

## Out of scope (YAGNI)

- Rewriting participant CPF self-login (stays as-is).
- Fully granular per-capability permissions (we use roles + optional scope).
- SSO / external IdP.
- The non-auth sweep findings (tracked separately in the sweep report).

## Phasing

- **Phase 1 (planned now):** `access_grants` + `grant_resolve` RPC + `access-exchange` edge function + `#acesso` route + `AdminAccess` UI + `facilitator` role/`is_facilitator()` + coexist-migrate mentor/juror + replace the staff password link with a `jwt_exchange` staff grant.
- **Phase 2 (later):** `access-admin` edge function for admin/viewer/checkin creation/management in the same UI; retire legacy routes/tokens after cutover.

## To verify before Phase 1 implementation

- Exact `auth.admin.generateLink` + `verifyOtp` flow and whether the project's email/SMTP settings affect magiclink generation server-side (we only need the `token_hash`, not delivery).
- Whether per-grant backing users (`grant+<id>@hackiasc.internal`) count against any plan limits at expected volume (low for this event).
