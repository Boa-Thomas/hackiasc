# Auth Phase 3 — SP2 / Phase B2 (frontend session migration) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Make mentor/juror authenticate as **real Supabase sessions** (jwt_exchange) on the frontend — calling the (B1) re-keyed RPCs **tokenless** (`p_token: null`) — while keeping the legacy link/token path as a **coexistence fallback** (removed in B3). Flip mentor/juror grants to `jwt_exchange` so `#acesso` mints sessions for them. Drop the mentor **email+code** login (decided). Then the admin **re-onboards the 17** via `#acesso` links.

**Architecture:** Session-first in the hooks (mirrors B1's RPC pattern): detect `supabase.auth.getSession()` with `app_metadata.role==='mentor'|'juror'` → call RPCs with `p_token: null`; else fall back to the legacy localStorage token (coexistence). `useGrantAccess` (the `#acesso` consumer) fixes `verifyOtp` to `type:'magiclink'`.

**Tech Stack:** React 19, Vite, vitest, Supabase JS. Backend = 1 migration (flip + UPDATE).

**Spec:** `docs/superpowers/specs/2026-06-02-auth-phase3-sp2-mentor-juror-sessions-design.md`

### Coexistence stance (honors "coexist → hard cutoff")
B2 **keeps** the legacy `#mentor?t=`/`#jurado?t=` link path working as a fallback (the B1 RPCs are dual-mode; the hooks keep token-seeding). B2 removes only the **email+code login UI** (that mechanism is being dropped). B3 removes the legacy link/token paths + backend branches + columns. So nothing hard-breaks during re-onboarding.

---

## File Structure
- `migrations/phase3_sp2_b2_flip_grants.sql` — **create.** `grant_auth_kind()` → jwt_exchange for mentor/juror + one-shot `UPDATE` of the 17.
- `src/hooks/useGrantAccess.js` — **modify.** `verifyOtp` `type:'email'`→`'magiclink'` + single-use-failure retry.
- `src/juror/useJuror.js` — **modify.** Session-first; tokenless RPC calls; keep legacy-token fallback.
- `src/mentor/useMentorAuth.js` — **modify.** Session-first; tokenless RPC calls; keep legacy link-token fallback; remove `login` (email+code) + `mentor_login`/`mentor_logout` calls (logout → `supabase.auth.signOut()`).
- `src/App.jsx` — **modify.** `#mentor` gate: when not authenticated, show a "request access link" notice instead of `<MentorLogin>`.
- `src/mentor/MentorLogin.jsx` — **delete** (email+code form, dropped). (Keep the file only if other routes import it — verify.)
- Push coupling — **modify as needed** (`src/components/NotificationBell.jsx`, `EnablePushPrompt.jsx`, `src/lib/push.js`): a session mentor/juror has no localStorage token; push identity must derive from the session (mentor/juror id) — see Task 6.

---

## Task 1: backend — flip grant_auth_kind + migrate the 17

**Files:** Create `migrations/phase3_sp2_b2_flip_grants.sql`

- [ ] **Step 1: Write the migration**
```sql
-- SP2/B2: mentor/juror now use real jwt_exchange sessions. Flip grant_auth_kind
-- so NEW mentor/juror grants are jwt_exchange, and migrate the existing 17 in
-- place. Backing users are provisioned lazily on first #acesso exchange, so the
-- 17 keep supabase_user_id=NULL until each is re-onboarded; the B1 dual-mode RPCs
-- + legacy access_token columns keep them working until then.
CREATE OR REPLACE FUNCTION public.grant_auth_kind(p_role text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public
AS $$ SELECT 'jwt_exchange' $$;  -- all roles use jwt_exchange now (mentor/juror included)

UPDATE access_grants SET auth_kind = 'jwt_exchange'
WHERE role IN ('mentor','juror') AND auth_kind = 'rpc_token';
```
> Note: `grant_auth_kind` previously returned `rpc_token` for mentor/juror, else `jwt_exchange`. With B2, **every** role is `jwt_exchange` — so the function can return the constant. Verify no other caller depends on the old mentor/juror branch (grep: only `admin_create_grant` uses it).

- [ ] **Step 2: Self-review** — confirm the `UPDATE` only touches `rpc_token` mentor/juror rows; `IMMUTABLE` retained; no signature change.
- [ ] **Step 3: Commit** (`git add` + `feat(auth): flip grant_auth_kind to jwt_exchange + migrate 17 mentor/juror grants (SP2 B2)`).

> **Apply timing:** this migration is applied in Integration **together with the frontend deploy** (a flipped grant mints a session only the B2 frontend can consume). Do NOT apply before the frontend ships.

---

## Task 2: `useGrantAccess` — verifyOtp magiclink + retry

**Files:** Modify `src/hooks/useGrantAccess.js`

- [ ] **Step 1:** Change the `verifyOtp` call (currently `type: 'email'`) to `type: 'magiclink'` (the tracer proved magiclink works; `access-exchange` mints with `generateLink({type:'magiclink'})`).
```js
const { error } = await supabase.auth.verifyOtp({
  token_hash: data.hashed_token,
  type: 'magiclink',
})
```
- [ ] **Step 2:** On a `verifyOtp` failure that indicates a consumed/expired single-use token, surface a clear error and allow re-trying the `#acesso` link (the link is single-use; a refresh re-exchanges). Keep it minimal: set `state` to `error` with a message instructing to reopen the link. (Full auto-retry is optional; the re-exchange on reload already covers it.)
- [ ] **Step 3:** Build (`npm run build`) + commit.

---

## Task 3: `useJuror` — session-first

**Files:** Modify `src/juror/useJuror.js`

- [ ] **Step 1:** On init, resolve auth in this order: (a) `await supabase.auth.getSession()`; if `session.user.app_metadata.role === 'juror'` → **session mode** (`isSession=true`, no token); (b) else `seedTokenFromUrl()` legacy token (coexistence). Store which mode.
- [ ] **Step 2:** In `refresh`/`submitScore`/`acceptConsent`, call the RPCs with `p_token: isSession ? null : token`. Everything else (polling, reload signal, mutatingRef) unchanged.
- [ ] **Step 3:** `isValid` = session-with-context OR token-with-context. Keep the 30s poll for both.
- [ ] **Step 4:** vitest if any pure helper is extracted; otherwise build. Commit.

---

## Task 4: `useMentorAuth` — session-first, drop email+code

**Files:** Modify `src/mentor/useMentorAuth.js`

- [ ] **Step 1:** On init, resolve in order: (a) `getSession()` with `role==='mentor'` → session mode; (b) else `seedFromUrl()` legacy link token (coexistence). Drop the email+code `mode==='session'` localStorage path's *creation* (no `login`), but a legacy link token still resolves via `mentor_get_me` (B1 dual-mode).
- [ ] **Step 2:** `refreshMe` calls `mentor_get_me` (session mode: `p_token: null`; legacy: `p_token: token` — note: the B1 re-key routes `mentor_get_me` through `current_mentor_id()`/`mentor_session_owner`; the legacy *link* bootstrap `mentor_get_me_by_token` is no longer needed once the hook calls `mentor_get_me` for both, since `mentor_session_owner`'s token branch handles the legacy uuid). Use `mentor_get_me` for both modes.
- [ ] **Step 3:** Remove `login` (email+code). `logout` → `await supabase.auth.signOut()` (session) and clear any legacy localStorage token.
- [ ] **Step 4:** Keep the return shape (`token`, `mentor`, `teams`, `notes`, `evaluations`, `isAuthenticated`, `refreshMe`, `logout`) so `MentorPanel` needs minimal change. For session users, expose a stable `token` substitute for push (see Task 6) or a separate `pushKey`.
- [ ] **Step 5:** Build. Commit.

---

## Task 5: `App.jsx` — mentor gate without email+code

**Files:** Modify `src/App.jsx` (mentor route, lines ~129-155); delete `src/mentor/MentorLogin.jsx` (verify no other importer first).

- [ ] **Step 1:** Replace `<MentorLogin .../>` (shown when `!mentorAuth.isAuthenticated`) with a small notice component: "Acesse pelo seu link `#acesso` (peça um novo ao organizador se expirou)." No email+code form.
- [ ] **Step 2:** Remove the `import MentorLogin` line (and delete the file if unused elsewhere — grep `MentorLogin`).
- [ ] **Step 3:** Build. Commit.

---

## Task 6: push identity for session mentor/juror

**Files:** Read `src/lib/push.js`, `src/components/NotificationBell.jsx`, `src/components/EnablePushPrompt.jsx` (they receive `{kind, token}`). Modify as needed.

- [ ] **Step 1:** Determine how push subscriptions are keyed (likely `user_key` from the token). A session mentor/juror has no localStorage token — derive a stable `user_key` from the session (mentor/juror id, available via the hook's `mentor`/`juror` object, or `app_metadata.grant_id`).
- [ ] **Step 2:** Pass that stable key from `App.jsx`/panels instead of `auth.token` for session users (keep token for legacy-fallback users during coexistence). Ensure `notification_recipients.user_key` matching still works (so broadcast/push still reaches them).
- [ ] **Step 3:** Build + a manual push subscribe check in the E2E. Commit.

---

## Task 7: JurorPanel / MentorPanel adjustments

**Files:** `src/juror/JurorPanel.jsx`, `src/mentor/MentorPanel.jsx`

- [ ] **Step 1:** These consume the hooks; with the return shapes preserved (Tasks 3-4), changes should be minimal. Verify they don't reference the removed `login`/email+code or assume a non-null `token`. Adjust the push prop per Task 6. Build. Commit.

---

## Integration (main-thread, gated — atomic backend+frontend)

- [ ] **1. Pre-flight:** `npx vitest run` + `npm run build` green.
- [ ] **2. Apply** `phase3_sp2_b2_flip_grants.sql` to prod **immediately before/with** the frontend deploy (flip + UPDATE). Verify: `SELECT auth_kind, count(*) FROM access_grants WHERE role IN ('mentor','juror') GROUP BY 1` → all `jwt_exchange`.
- [ ] **3. Deploy frontend** (merge PR → Pages).
- [ ] **4. E2E (real session):** from `AdminAccess`, "novo link" for one mentor + one juror grant → open each `#acesso` link (incognito) → assert it lands on the panel via a real session (no token in localStorage), reads data, and a write works (mentor note / juror score on a test team if safe, else read-only check). Confirm push subscribe works. Confirm a **legacy** `#mentor?t=`/`#jurado?t=` link still works (coexistence).
- [ ] **5. Re-onboarding (USER):** the admin regenerates `#acesso` links for all 17 from `AdminAccess` and distributes them. Track who has migrated (a backing user appears: `supabase_user_id` set on their grant).
- [ ] **6. PR** with `/pre-deploy-verify`-equivalent review (auth-sensitive). Gate on no Critical/High.

---

## Risks
- **Push coupling (Task 6):** the most likely breakage — session users lose the token-keyed push identity. Must derive a stable key from the session or push silently stops for them.
- **MentorPanel `auth.token` usages:** grep for `auth.token`/`mentorAuth.token` (NotificationBell, EnablePushPrompt) — they break for session users unless Task 6 handles it.
- **verifyOtp single-use:** reopening a consumed `#acesso` link fails; Task 2 must message it clearly.
- **Flip-before-frontend:** applying Task 1 before the frontend ships makes a mentor `#acesso` link mint a session the old frontend can't use — Integration applies them together.
- **#jurado has no App gate:** JurorPanel must require a session OR a valid token (the hook's `isValid`); ensure no unauthenticated render leaks data.
- Re-onboarding is a **human dependency** (17 links) — coexistence means no hard lockout meanwhile.

## Notes for the executor
- Subagents write files only; prod apply + deploy + re-onboarding are main-thread/user.
- Keep legacy fallback paths (removed in B3). CRLF repo: edit directly.
- Changelog under `docs/changelog/` when B2 ships.
