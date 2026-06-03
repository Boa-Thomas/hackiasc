# Auth Phase 3 — SP2: Mentor/Juror → Real Sessions (Option B) (Design)

**Date:** 2026-06-02
**Status:** Design — awaiting user review before plan
**Sub-project:** SP2 of 3 (SP1 = password accounts ✅ shipped; SP3 = scope enforcement)
**Prod project:** `qshrzfahotmjshtjuvno`

---

## Goal

Move mentor and juror auth from the **rpc_token** pattern (a token in `localStorage` passed as `p_token` to ~16 `SECURITY DEFINER` RPCs that bypass RLS) onto **real Supabase `jwt_exchange` sessions** (like admin/viewer/facilitator), re-keying those RPCs to derive identity from the session — **not** a token param. This removes the localStorage-token attack surface, closes the anon-callable RPC surface, and gives mentor/juror a real session identity (`app_metadata.grant_id`) that SP3 can build on.

**This is Option B, deliberately not A.** A (full direct-table RLS) was rejected after correcting a false premise: the most sensitive read — the juror `idea_visible` column-masking + `json_agg` aggregations in `juror_get_context` — **cannot** be expressed in RLS (row-level only), so it stays in a `SECURITY DEFINER` RPC under both A and B. Realistic-A = B + risky write-table RLS for the same real-world win. Mentor/juror row-filtering is **relationship-based** (`mentor_teams` pairing / own `juror_id`), not a scope blob.

## Already done (de-risked before this spec)
- **Mentor link bug FIXED + in prod** (PR #242): `mentor_get_me_by_token` delegates to `mentor_prepitch_resolve` (grant fallback).
- **`jwt_exchange`/`verifyOtp` path PROVEN in prod** (7-step self-cleaning tracer, 2026-06-02): `access-exchange` (jwt) → `{hashed_token}` → `verifyOtp(type:magiclink)` → session; RLS allow (`is_admin_or_viewer`=true) + deny (`access_grants`=`[]`); re-exchange reuses the single backing user (no dup); magic link single-use (1st 200, 2nd 403). **access-exchange needs `Authorization: Bearer <anon>`** (verify_jwt on) — `useGrantAccess` already sends it.

---

## Current state (verified)

- **Juror:** `#jurado?t=<token>` → `useJuror` seeds the token to `localStorage['hackiasc_juror_token']`, polls `juror_get_context(p_token)` every 30s. RPCs: `juror_get_context` (computed/gated read), `juror_submit_score` (write), `juror_accept_consent` (write), `juror_token_owner` (resolver). All take `p_token text` with a `grant_resolve_internal` fallback.
- **Mentor — TWO modes** (`localStorage['hackiasc_mentor_token']` + `['hackiasc_mentor_mode']`):
  - **`session`**: email+code via `mentor_login(p_email,p_code)` → a `mentor_sessions` row (custom token, NOT a Supabase session) → `mentor_get_me(p_token)`.
  - **`link`**: `#mentor?t=<token>` → `mentor_get_me_by_token(p_access_token)`.
  - RPCs: `mentor_get_me`, `mentor_save_note`, `mentor_delete_note`, `mentor_prepitch_list`, `mentor_prepitch_submit`, `mentor_logout`, resolvers `mentor_session_owner`/`mentor_prepitch_resolve`, bootstrap `mentor_get_me_by_token`. Sugar: `sugar_my_received_mentor`, `sugar_send_mentor`, `sugar_roster` (mentor-token side).
- **Routing:** `useGrantAccess` (`#acesso?t=`) is already generic: for `rpc_token` it stores the token + routes; for `jwt_exchange` it `verifyOtp`s into a session then routes via `routeForRole`. Mentor→`#mentor`, juror→`#jurado`. **`useGrantAccess` needs no change for the happy path** — once mentor/juror grants are `jwt_exchange`, its existing `hashed_token` branch runs.
- **Admin link UI:** `AdminMentors` builds `#mentor?t=<mentors.access_token>`; `AdminJurors` builds `#jurado?t=<jurors.access_token>` — both from the **legacy uuid columns**, NOT grants.
- **Prod counts:** 12 mentor + 5 juror grants, all `rpc_token`; 0 `jwt_exchange` of any role. Legacy `access_token` populated for all 17.

---

## DECISION TO CONFIRM AT REVIEW: the email+code mentor login

Mentor (unlike juror) has a self-service **email+code** login (`mentor_login` → `mentor_sessions`). Under B ("real sessions, no custom token in localStorage"), a parallel `mentor_sessions` custom-token login contradicts the goal. Two options:

- **(Recommended) Drop email+code; mentors enter via `#acesso` jwt link only** (consistent with juror). Re-onboarding already redistributes `#acesso` links, so no capability is lost during the cutover; the tradeoff is no self-service re-login if a mentor loses their link (admin re-sends). Retires `mentor_login`/`mentor_sessions`/`mentor_logout`. **Simplest, fully consistent.**
- **Keep email+code, converted to mint a jwt session** — requires a new edge/RPC that exchanges email+code → a Supabase session (an access-exchange variant). More work; only justified if self-service mentor re-login matters post-event.

The plan assumes **Drop** unless you choose otherwise at review.

---

## Design

### 1. `current_grant_ref()` — session identity helper (foundation for B and SP3)
```
current_grant_ref() RETURNS TABLE(grant_id uuid, role text, ref_id uuid, scope jsonb)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
```
- Resolves the **caller's** grant from the session: `SELECT ... FROM access_grants WHERE supabase_user_id = auth.uid() AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())`.
- `STABLE` (planner may cache per-statement; never per-row hot-loop) + `SECURITY DEFINER` (reads `access_grants` regardless of the caller's RLS). Returns no row when there's no session / no grant / revoked / expired → callers treat as unauthorized. **Gating revoked/expires here = instant revocation on the RPC data path** (every call re-reads `access_grants`); a lingering JWT only survives for non-RPC use until its TTL, and `usesEdgeRevoke` already deletes the backing user on revoke.
- Thin role helpers: `current_mentor_id()` / `current_juror_id()` = `ref_id` from `current_grant_ref()` filtered to the matching role, **returning NULL when absent** (no session / wrong role / revoked / expired); the calling RPC raises `unauthorized`. NULL-not-RAISE is required so the dual-mode guard in §3 works.

> Note: `auth.uid()` is readable inside `SECURITY DEFINER` (it reads the request JWT, not the definer). Deriving by `supabase_user_id = auth.uid()` avoids trusting `app_metadata` and auto-honors revocation.

### 2. `grant_auth_kind()` flip
Change `grant_auth_kind(p_role)` so mentor/juror map to `jwt_exchange` (today they map to `rpc_token`). Affects **new** grants from `admin_create_grant`. **Existing 17** are migrated by a one-shot `UPDATE access_grants SET auth_kind='jwt_exchange' WHERE role IN ('mentor','juror') AND auth_kind='rpc_token'` (so `access-exchange` provisions jwt sessions for them on next exchange).

### 3. Re-key the ~16 RPCs (dual-mode during coexistence)
Each RPC derives identity from the **session** instead of a token param. To support **coexistence** (legacy links must keep working during the re-onboarding window), each keeps `p_token` as an **optional** param and resolves identity with a **guarded, session-first fallback — NOT a literal `COALESCE`**. (Trap caught in red-team: the legacy resolvers `juror_token_owner`/`mentor_session_owner` **RAISE** on NULL/miss rather than returning NULL, so `COALESCE(resolver, session)` would abort before the session branch and every tokenless call would hard-fail.) Pattern:
```
v_id := current_<role>_id();                  -- session first (real jwt session; NULL if none)
IF v_id IS NULL AND p_token IS NOT NULL THEN
  v_id := <legacy_resolver>(p_token);         -- coexistence fallback (legacy link); only here
END IF;
IF v_id IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
```
Precedence is **session-first**: a real session always wins and a stale localStorage token is ignored when a session exists; the legacy resolver is only called in the `p_token IS NOT NULL` branch (so its RAISE-on-miss can't abort a session call). Per-resolver caveat: `mentor_prepitch_resolve` already returns NULL on miss (callable directly); `juror_token_owner`/`mentor_session_owner` RAISE. New frontend calls **without** a token; legacy cached frontend still passes the token. **B1 smoke (positive + negative):** the same principal resolves via token AND via session; a tokenless call with no session is rejected `unauthorized`. Classification:
- **Writes / simple reads** (`juror_submit_score`, `juror_accept_consent`, `mentor_save_note`, `mentor_delete_note`, `mentor_prepitch_submit`, `mentor_get_me`, `sugar_send_mentor`): re-key; same row-filtering logic, identity from session.
- **Computed/gated reads** stay RPC, re-keyed (`juror_get_context` with `idea_visible` masking + aggregations; `mentor_prepitch_list`; `sugar_my_received_mentor`; `sugar_roster` mentor side).
- **Resolvers** (`juror_token_owner`, `mentor_session_owner`, `mentor_prepitch_resolve`) keep their legacy fallback during coexistence; at cutoff their token branches are removed.
- **GRANT:** during coexistence keep `anon, authenticated` (legacy token is anon-callable); at cutoff narrow to `authenticated` only (sessions are authenticated) — closes the anon surface.
- **Coexistence-window coverage (state it, don't leave it implicit):** the 17 grants flipped to `jwt_exchange` (§2) have `supabase_user_id = NULL` until each person first clicks their fresh `#acesso` link (backing users are provisioned only on first exchange). Until then `current_grant_ref()` returns no row for them — the **legacy token path is exactly what keeps them working** in the meantime. Flipping `auth_kind` does NOT touch the `mentors`/`jurors.access_token` UUID columns (index-separated), so legacy UUID links and hex grant tokens resolve in parallel throughout coexistence.

### 4. Frontend → real sessions
- `useGrantAccess`: the jwt branch exists but has **never run in prod** (0 jwt grants). **Landmine:** it calls `verifyOtp({type:'email'})` (line 44) while `access-exchange` mints the link with `generateLink({type:'magiclink'})` — the tracer proved **`type:'magiclink'`** works; `'email'` is unverified for a magiclink token. **B2 must change it to `type:'magiclink'`.** Also add explicit handling for the single-use `verifyOtp` failure (re-exchange/retry) since mentor/juror now depend on this path.
- `useJuror`: detect a real session (`supabase.auth.getSession()`, `app_metadata.role==='juror'`) and call `juror_get_context()` with **no** token; keep the 30s poll + reload signal. Remove `seedTokenFromUrl`/localStorage token after cutoff.
- `useMentorAuth`: same — session-based `mentor_get_me()`; **drop link mode + email+code** (per the decision above); `logout` = `supabase.auth.signOut()`.
- Panels (`MentorPanel`/`JurorPanel`) call the re-keyed RPCs without the token arg.

### 5. Admin link UI emits `#acesso`
`AdminMentors`/`AdminJurors` stop building `#mentor?t=<access_token>` / `#jurado?t=<access_token>`. Instead surface the **grant** `#acesso?t=<token>` for each mentor/juror (their backfilled grant, matched by `ref_id`). Mechanism: a "copiar link de acesso" action that calls `admin_regenerate_grant_token(grant_id)` (returns a fresh plaintext token) → `#acesso?t=<token>`. (The grant's plaintext is not stored, so a fresh link is minted on demand.)

### 6. Cutover (coexist → re-onboard → hard cutoff)
1. **Ship B** (helper + flip + dual-mode RPCs + new frontend). Legacy links still work (dual-mode + bug-fixed resolvers).
2. **Re-onboard the 17:** admin copies fresh `#acesso` links from `AdminMentors`/`AdminJurors` and sends them; each click mints a jwt session.
3. **Hard cutoff — strict ordering (only after re-onboarding + legacy drained):**
   a. Confirm B2 frontend is live AND legacy token-path usage has **drained** — monitor `get_logs` / `access_grants.last_used_at` / resolver usage for `juror_token_owner`/`mentor_session_owner` token calls until ~zero. Do NOT drop anything while in-flight legacy links are still used (they'd 404 mid-deploy).
   b. (Safety) export/back up `mentors.access_token` + `jurors.access_token` before dropping — a stale bookmarked legacy link could surface post-cutover and the drop is irreversible.
   c. Drop the `p_token` branches + the now-unused resolvers / `mentor_get_me_by_token`; **drop `mentor_login` (RPC) before `mentor_sessions` (table)** for usage/FK order; drop `mentor_logout`.
   d. Narrow GRANTs to `authenticated` (closes the anon surface).
   e. Drop columns `mentors.access_token` / `jurors.access_token` / table `mentor_sessions`. **Irreversible.**

---

## Build phases (each its own ship + gated rollout)

- **B1 — backend foundation (additive, coexistent):** `current_grant_ref()` + `current_mentor_id()`/`current_juror_id()`; `grant_auth_kind()` flip; one-shot `UPDATE` of the 17 grants to `jwt_exchange`; re-key the ~16 RPCs to dual-mode (token OR session). Legacy keeps working. Prod-probe smoke (a jwt mentor/juror grant resolves + a re-keyed RPC works via session AND via token).
- **B2 — frontend session migration:** `useJuror`/`useMentorAuth` session-based; drop mentor link+email mode; `useGrantAccess` verifyOtp-retry; panels call tokenless RPCs; admin UI emits `#acesso`. Build + vitest + manual E2E (open a real mentor/juror `#acesso` link → session → panel reads/writes).
- **B3 — hard cutoff (after re-onboarding):** drop token branches/legacy resolvers/`mentor_login`/`mentor_sessions`; narrow GRANTs to `authenticated`; drop `access_token` columns. Gated; irreversible — only after confirming all 17 migrated.

Each phase: spec is this doc; plan per phase via writing-plans; subagent execution; gated prod rollout (migrations/edge by main thread; never by subagents).

---

## Risks & mitigations
- **Re-keying regression (dominant):** a re-keyed RPC must preserve EXACT row-filtering (`mentor_teams` pairing, own-`juror_id`, `idea_visible` masking). Mitigation: re-key keeps the existing plpgsql body; only the identity source changes (token → `current_*_id()`); dual-mode lets both paths be smoke-tested side by side before cutoff.
- **Unexercised jwt path:** PROVEN by the tracer (above). Residual: `verifyOtp` single-use → frontend must re-exchange on failure (B2 handles it).
- **Re-onboarding friction:** 17 humans need fresh `#acesso` links for a concluded event; coexistence means no hard lockout until B3.
- **Stale app_metadata on live sessions:** scope/role baked at exchange; `current_grant_ref()` reads `access_grants` live (by `supabase_user_id`), so revocation/expiry are honored on the data path immediately even if the JWT lingers. (`usesEdgeRevoke` already deletes the backing user on revoke.)
- **Backing-user provisioning fragility:** `access-exchange` createUser→listUsers(1000) fallback won't scale and parallel exchanges race; acceptable at 17 users, noted for the future.
- **Contract-stability landmines:** keep `grant_resolve_internal`'s `{role,ref_id,grant_id,scope,...}` shape, `access_grants.ref_id`, `routeForRole` constants, and (until B2 ships) the localStorage keys additive — changing them breaks live persistence/resolvers.
- **App.jsx `#jurado?t=` has no auth gate today:** after B2, the juror panel must require a session (no token) — ensure no unauthenticated path renders juror data.

## Invariants
- Coexistence: every legacy `#mentor?t=`/`#jurado?t=` link keeps working until B3.
- `current_grant_ref()` is the single session-identity source; revoked/expired → no identity.
- No mentor/juror scope blob — identity + relationship drives filtering; SP3 won't add scope to these roles.

## Out of scope (deferred)
- SP3 scope enforcement for jwt roles (admin/viewer/checkin/staff/facilitator).
- Replacing access-exchange's listUsers(1000) fallback (future hardening).
- Any direct-table RLS for mentor/juror (that was Option A — rejected).

## Open questions resolved (defaults)
- A vs B → **B** (premise-corrected).
- Tracer → self-cleaning prod probe (**done**, passed).
- Cutover → coexist → hard cutoff + retire columns.
- Mentor/juror scope → none (relationship-based).
- Email+code mentor login → **drop** (confirm at review).
