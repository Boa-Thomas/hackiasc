# Unified Access-Grants — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make facilitator and mentor/juror personas work end-to-end on the access-grants system, and make grant revocation kill the live session immediately — while every legacy path keeps working (coexistence).

**Architecture:** Facilitator gets a dedicated minimal panel at `#facilitador` plus additive `is_facilitator()` RLS policies and an `is_admin() OR is_facilitator()` gate on its 7 RPCs. Mentor/juror auth RPCs switch `uuid → text` with a `grant_resolve` fallback (legacy uuid tokens still resolve). Revoke gains an `access-admin` edge that bans the per-grant backing Supabase user. The staff password-in-URL link is retired.

**Tech Stack:** Supabase Postgres (RLS + SECURITY DEFINER RPCs), Supabase Edge Functions (Deno/TS), React 19 + Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-01-unified-auth-phase2-design.md`

---

## How this plan is tested / applied (read first)

Same fence as Phase 1: vitest+build validate JS only. **SQL is applied to prod `qshrzfahotmjshtjuvno` via the Supabase MCP `apply_migration`** (with the user's standing authorization to apply via MCP) and verified with self-cleaning SQL smoke tests via `execute_sql`; the migration file is also saved under `migrations/`. The edge is deployed via `deploy_edge_function`. **All changes are additive/coexistent** — legacy tokens and routes keep working.

Environment facts (verified): pgcrypto in `extensions` schema; rate-limit via the `rate_limits` table; existing functions use `SET search_path TO 'public'`. Phase 1 already shipped `access_grants`, `grant_resolve(text)`, admin RPCs, `is_facilitator()`, and the `access-exchange` edge.

## Shared contracts

- `is_facilitator()` exists (Phase 1): `(auth.jwt()->'app_metadata'->>'role') = 'facilitator'`.
- `grant_resolve(p_token text)` returns `{auth_kind, role, scope, ref_id, grant_id, label}` or raises.
- Facilitator session = a `facilitator`-role grant via the existing `#acesso` token-exchange (Phase 1). `routeForRole('facilitator')` already returns `#facilitador`.
- Mentor/juror `#acesso` (rpc_token) stores the raw hex grant token (Phase 1 `useGrantAccess`); after this phase the text-param RPCs accept it.

---

## Task 1: Facilitator RLS policies (additive, SQL)

**Files:** Create `migrations/phase2_facilitator_rls.sql`

Additive permissive policies — RLS policies are OR'd, so these do NOT touch the existing admin policies.

- [ ] **Step 1: Write the migration**

```sql
-- Facilitator read/write scoped to exactly what FacilitatorPanel needs.
-- Additive permissive policies (OR'd with existing admin policies).

-- schedule_items: full CRUD (advance/toggle/edit/reorder/add/remove)
DROP POLICY IF EXISTS "Facilitator manages schedule_items" ON schedule_items;
CREATE POLICY "Facilitator manages schedule_items" ON schedule_items
  FOR ALL TO authenticated USING (is_facilitator()) WITH CHECK (is_facilitator());

-- schedule_days: read + update (window/note)
DROP POLICY IF EXISTS "Facilitator reads schedule_days" ON schedule_days;
CREATE POLICY "Facilitator reads schedule_days" ON schedule_days
  FOR SELECT TO authenticated USING (is_facilitator());
DROP POLICY IF EXISTS "Facilitator updates schedule_days" ON schedule_days;
CREATE POLICY "Facilitator updates schedule_days" ON schedule_days
  FOR UPDATE TO authenticated USING (is_facilitator()) WITH CHECK (is_facilitator());

-- announcements: read (write is via SECURITY DEFINER RPCs, Task 2)
DROP POLICY IF EXISTS "Facilitator reads announcements" ON announcements;
CREATE POLICY "Facilitator reads announcements" ON announcements
  FOR SELECT TO authenticated USING (is_facilitator());

-- registrations: read only (pulse: status/check-in). Column-level exposure is the
-- component's concern; the panel only selects id, payment_status, checked_in_at, team_id.
DROP POLICY IF EXISTS "Facilitator reads registrations" ON registrations;
CREATE POLICY "Facilitator reads registrations" ON registrations
  FOR SELECT TO authenticated USING (is_facilitator());

-- teams: read only (deliverable completion + name)
DROP POLICY IF EXISTS "Facilitator reads teams" ON teams;
CREATE POLICY "Facilitator reads teams" ON teams
  FOR SELECT TO authenticated USING (is_facilitator());
```

- [ ] **Step 2: Apply + verify (MCP)**

Apply with `apply_migration` (name `phase2_facilitator_rls`). Verify:
```sql
SELECT tablename, policyname FROM pg_policies
WHERE policyname ILIKE 'Facilitator%' ORDER BY tablename;
```
Expected: 6 policies across schedule_items, schedule_days (×2), announcements, registrations, teams.

> Before applying, confirm these 5 tables have RLS enabled and that the column/table names match (`schedule_days`, `schedule_items`, `announcements`, `registrations`, `teams`) via `\d` / information_schema — adjust if a name differs.

- [ ] **Step 3: Commit**
```bash
git add migrations/phase2_facilitator_rls.sql
git commit -m "feat(auth): additive facilitator RLS policies (schedule/announcements/registrations/teams)"
```

---

## Task 2: Facilitator RPC gates `is_admin() → is_admin() OR is_facilitator()` (SQL)

**Files:** Create `migrations/phase2_facilitator_rpcs.sql`

The 7 RPCs self-check `is_admin()` in their body. Change ONLY the gate line; keep the rest identical and `SET search_path TO 'public'`. Two have the gate `is_admin()` raising `'forbidden'`, others `'unauthorized'` — preserve each function's existing error string.

- [ ] **Step 1: Fetch current defs, then write the migration**

For each of the 7 functions, fetch the live body and change only the gate. Fetch:
```sql
SELECT proname, pg_get_functiondef(oid) FROM pg_proc
WHERE proname IN ('set_announcement','clear_announcement','notify_schedule_start',
                  'wall_set_phase','set_team_scores_visible','wall_admin_list','get_team_scores_visible')
ORDER BY proname;
```
Then, for each, produce a `CREATE OR REPLACE FUNCTION` identical to the fetched def EXCEPT the gate line `IF NOT is_admin() THEN` becomes `IF NOT (is_admin() OR is_facilitator()) THEN`. Save all 7 into `migrations/phase2_facilitator_rpcs.sql`.

Worked example (`set_announcement`, verbatim from prod with only the gate changed):
```sql
CREATE OR REPLACE FUNCTION public.set_announcement(p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id UUID;
BEGIN
  IF NOT (is_admin() OR is_facilitator()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_body IS NULL OR length(btrim(p_body)) = 0 THEN RAISE EXCEPTION 'empty announcement'; END IF;
  UPDATE announcements SET active = false WHERE active;
  INSERT INTO announcements (body) VALUES (btrim(p_body)) RETURNING id INTO v_id;
  BEGIN
    PERFORM notify_event('announcement','Aviso 📣', btrim(p_body), '#participante',
      jsonb_build_object('kind','all_participants'));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN v_id;
END; $function$;
```
Worked example (`wall_set_phase`, gate changed; rest verbatim):
```sql
CREATE OR REPLACE FUNCTION public.wall_set_phase(p_phase text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (is_admin() OR is_facilitator()) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF p_phase NOT IN ('closed','wall_open','voting_open','results') THEN
    RAISE EXCEPTION 'invalid_phase';
  END IF;
  UPDATE wall_state SET phase = p_phase, updated_at = now() WHERE id = true;
  BEGIN
    IF p_phase = 'wall_open' THEN
      PERFORM notify_event('wall_phase','Muro de Dores aberto 🧱','Envie sua dor agora!','#muro',
        jsonb_build_object('kind','all_participants'));
    ELSIF p_phase = 'voting_open' THEN
      PERFORM notify_event('wall_phase','Votação aberta 🗳️','Vote nas dores que mais importam.','#muro',
        jsonb_build_object('kind','all_participants'));
    ELSIF p_phase = 'results' THEN
      PERFORM notify_event('wall_phase','Resultados no telão 🏆','Veja as dores mais votadas.','#muro',
        jsonb_build_object('kind','all_participants'));
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN json_build_object('ok', true, 'phase', p_phase);
END; $function$;
```
Apply the same gate-only edit to the remaining five (`clear_announcement`, `notify_schedule_start`, `set_team_scores_visible`, `wall_admin_list`, `get_team_scores_visible`) from their fetched defs. Do NOT change their bodies, return types, or `search_path`.

- [ ] **Step 2: Apply + smoke (MCP)**

Apply (`phase2_facilitator_rpcs`). Verify the gate is present and search_path intact:
```sql
SELECT proname,
  pg_get_functiondef(oid) LIKE '%is_admin() OR is_facilitator()%' AS has_facilitator_gate,
  proconfig
FROM pg_proc
WHERE proname IN ('set_announcement','clear_announcement','notify_schedule_start',
                  'wall_set_phase','set_team_scores_visible','wall_admin_list','get_team_scores_visible')
ORDER BY proname;
```
Expected: all 7 `has_facilitator_gate = true`, `proconfig` still `{search_path=public}`.

- [ ] **Step 3: Commit**
```bash
git add migrations/phase2_facilitator_rpcs.sql
git commit -m "feat(auth): facilitator allowed on its 7 RPCs (is_admin OR is_facilitator)"
```

---

## Task 3: Facilitator panel + route + re-enable role (frontend)

**Files:**
- Create: `src/facilitator/FacilitatorPanel.jsx`
- Modify: `src/App.jsx` (`#facilitador` route), `src/admin/AdminAccess.jsx` (ROLES)

- [ ] **Step 1: Build `FacilitatorPanel.jsx`**

A lean panel reusing the SAME RPCs/queries `AdminFacilitator` uses, but standalone. Read `src/admin/AdminFacilitator.jsx` first and lift its schedule/announcement/wall/scores/pulse logic into a focused component (no admin shell, no PII tabs). Keep it to: schedule list + advance/toggle/edit/add/remove, announcement set/clear, wall phase buttons, scores-visible toggle, read-only pulse. Use `supabase` from `src/lib/supabase`. (Full component — model structure on `AdminFacilitator.jsx`; do not invent new RPCs, use the exact names: `set_announcement`, `clear_announcement`, `notify_schedule_start`, `wall_set_phase`, `set_team_scores_visible`, `wall_admin_list`, `get_team_scores_visible`, and the `schedule_days`/`schedule_items`/`announcements`/`registrations`/`teams` queries.)

- [ ] **Step 2: Route `#facilitador` in `App.jsx`**

Mirror the existing `startsWith` dispatch (as `#acesso`/`#mentor` do). Add:
```jsx
import FacilitatorPanel from './facilitator/FacilitatorPanel'
// ...
if (page.startsWith('#facilitador')) {
  return <FacilitatorPanel />
}
```
The session is established by the `#acesso` token-exchange before redirecting here; `FacilitatorPanel` should read the session and show a "sem acesso" state if no facilitator/admin session exists (mirror how other panels guard).

- [ ] **Step 3: Re-enable `facilitator` in Acessos**

In `src/admin/AdminAccess.jsx`, change `const ROLES = ['staff', 'checkin', 'viewer']` to `['facilitator', 'staff', 'checkin', 'viewer']` and set the default back to `role: 'facilitator'`.

- [ ] **Step 4: Build**
Run `npm run build` — expect success.

- [ ] **Step 5: Commit**
```bash
git add src/facilitator/FacilitatorPanel.jsx src/App.jsx src/admin/AdminAccess.jsx
git commit -m "feat(auth): facilitator panel (#facilitador) + re-enable facilitator grants"
```

---

## Task 4: Mentor/juror owner resolvers `uuid → text` + grant fallback (SQL)

**Files:** Create `migrations/phase2_owner_resolvers_text.sql`

Changing the parameter type requires `DROP FUNCTION` + `CREATE` (CREATE OR REPLACE can't change arg type). Drop CASCADE is NOT used (the caller RPCs are changed in Task 5; do Task 4 then Task 5 together before re-granting, OR drop the dependents first). To avoid dependency errors, Task 4 and Task 5 SQL are applied in one migration. The owner resolvers' full new bodies (verbatim from prod, widened uuid→text + grant fallback):

```sql
-- juror_token_owner: text param; legacy uuid token first, then grant fallback.
DROP FUNCTION IF EXISTS juror_token_owner(uuid);
CREATE OR REPLACE FUNCTION public.juror_token_owner(p_token text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id UUID; v jsonb;
BEGIN
  IF p_token IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  BEGIN
    SELECT id INTO v_id FROM jurors WHERE access_token = p_token::uuid AND active = true LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  EXCEPTION WHEN invalid_text_representation THEN
    v_id := NULL;  -- not a uuid; try the unified grant path
  END;
  v := grant_resolve(p_token);                       -- raises invalid_grant if bad
  IF v->>'role' = 'juror' AND v->>'ref_id' IS NOT NULL THEN
    RETURN (v->>'ref_id')::uuid;
  END IF;
  RAISE EXCEPTION 'invalid_token';
END; $function$;

-- mentor_session_owner: text param; legacy session token, then static access_token, then grant.
DROP FUNCTION IF EXISTS mentor_session_owner(uuid);
CREATE OR REPLACE FUNCTION public.mentor_session_owner(p_token text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id UUID; v jsonb;
BEGIN
  BEGIN
    SELECT mentor_id INTO v_id FROM mentor_sessions
     WHERE token = p_token::uuid AND expires_at > now() LIMIT 1;
    IF v_id IS NOT NULL THEN
      UPDATE mentor_sessions SET last_used_at = now() WHERE token = p_token::uuid;
      RETURN v_id;
    END IF;
    SELECT id INTO v_id FROM mentors WHERE access_token = p_token::uuid LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  EXCEPTION WHEN invalid_text_representation THEN
    v_id := NULL;  -- not a uuid; try the unified grant path
  END;
  v := grant_resolve(p_token);
  IF v->>'role' = 'mentor' AND v->>'ref_id' IS NOT NULL THEN
    RETURN (v->>'ref_id')::uuid;
  END IF;
  RAISE EXCEPTION 'invalid_or_expired_session';
END; $function$;

REVOKE ALL ON FUNCTION juror_token_owner(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION mentor_session_owner(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION juror_token_owner(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION mentor_session_owner(text) TO anon, authenticated;
```

> `mentor_get_me_by_token(p_access_token uuid)` is a separate legacy path; handle it in Task 5 (it's a caller-style fn). The DROPs here will fail if caller RPCs still bind the `uuid` owner signature — so this migration MUST include Task 5's caller changes too (apply as one file `phase2_mentor_juror_text.sql`). Merge Task 4 + Task 5 SQL into that single migration before applying.

- [ ] **Step 2/3:** (apply + smoke together with Task 5 — see Task 5 Step 2).

---

## Task 5: Mentor/juror caller RPCs `uuid → text` (SQL, same migration as Task 4)

**Files:** Append to `migrations/phase2_mentor_juror_text.sql` (the merged Task 4+5 file)

Caller RPCs: `juror_get_context`, `juror_submit_score`, `juror_accept_consent`, `mentor_get_me`, `mentor_get_me_by_token`, `mentor_save_note`, `mentor_delete_note` (verify the full list via `pg_proc` — include any other `mentor_*`/`juror_*` taking the token).

- [ ] **Step 1: For each caller RPC, fetch + transform**

```sql
SELECT proname, pg_get_function_arguments(oid), pg_get_functiondef(oid)
FROM pg_proc WHERE proname IN
  ('juror_get_context','juror_submit_score','juror_accept_consent',
   'mentor_get_me','mentor_get_me_by_token','mentor_save_note','mentor_delete_note');
```
For each: produce `DROP FUNCTION IF EXISTS <name>(<old uuid sig>); CREATE OR REPLACE FUNCTION <name>(<same sig but token param uuid→text>) ...` with the body **identical** to the fetched def, EXCEPT:
- the token parameter type `uuid → text`;
- **verify p_token is only consumed via the owner resolver** (`juror_token_owner(p_token)` / `mentor_session_owner(p_token)`). If the body uses `p_token` anywhere else as a uuid (e.g. a direct `= p_token` comparison), wrap that specific use to keep legacy behaviour (`p_token::uuid` inside a guarded block) — but typically these only call the owner resolver.
- For `mentor_get_me_by_token(p_access_token uuid)`: widen to `text`; body does `WHERE access_token = p_access_token` → change to `WHERE access_token = p_access_token::uuid` guarded for `invalid_text_representation` (it's the legacy static-link path; grant tokens go through `mentor_session_owner`/`mentor_get_me`).
- Re-apply the original GRANTs (`anon`/`authenticated`) for each new signature.

Order in the file: caller DROPs may need to precede owner DROPs if callers bind the owner — Postgres resolves owner calls at runtime (plpgsql), so there's no hard bind; still, place owner-resolver definitions (Task 4) FIRST so they exist when callers are recreated.

- [ ] **Step 2: Apply the merged migration + dual smoke (MCP)**

Apply `phase2_mentor_juror_text` (Task 4 + Task 5 SQL). Then smoke BOTH paths self-cleaning:
```sql
DO $$
DECLARE v_jid uuid; v_raw text := encode(extensions.gen_random_bytes(32),'hex'); v_legacy uuid;
BEGIN
  INSERT INTO jurors(name,email,active) VALUES('smoke j','sj@x.com',true) RETURNING id, access_token INTO v_jid, v_legacy;
  -- legacy uuid token still works:
  ASSERT juror_token_owner(v_legacy::text) = v_jid, 'legacy juror token broke';
  -- grant hex token works:
  INSERT INTO access_grants(label,role,auth_kind,ref_id,token_hash)
  VALUES('sjg','juror','rpc_token',v_jid, encode(extensions.digest(v_raw,'sha256'),'hex'));
  ASSERT juror_token_owner(v_raw) = v_jid, 'juror grant token failed';
  -- garbage raises:
  BEGIN PERFORM juror_token_owner('not-a-token-xxxxxxxxxxxxxxxxxxxxxxxxx'); ASSERT false,'should raise';
  EXCEPTION WHEN others THEN NULL; END;
  DELETE FROM access_grants WHERE label='sjg';
  DELETE FROM jurors WHERE id=v_jid;
  DELETE FROM rate_limits WHERE key LIKE 'grant_resolve:%';
  RAISE NOTICE 'juror dual-path OK';
END $$;
```
Run an analogous block for mentor (create a mentor row, mint a `mentor_sessions` token for the legacy assert, create a `mentor` grant for the grant assert). All asserts must pass; confirm no leftover rows.

- [ ] **Step 3: Re-enable mentor/juror in Acessos + commit**

In `src/admin/AdminAccess.jsx`, expand `ROLES` to `['facilitator', 'staff', 'mentor', 'juror', 'checkin', 'viewer']`.
```bash
git add migrations/phase2_mentor_juror_text.sql src/admin/AdminAccess.jsx
git commit -m "feat(auth): mentor/juror auth RPCs uuid->text + grant fallback (coexistent)"
```

---

## Task 6: Backfill `access_grants` rows for existing mentors/jurors (SQL)

**Files:** Create `migrations/phase2_backfill_mentor_juror_grants.sql`

One `rpc_token` grant per active mentor/juror, `ref_id` = their id. Raw tokens are random (admin re-issues links from Acessos; stored hashes are one-way). Idempotent on `ref_id`+role.

- [ ] **Step 1: Write + apply**
```sql
INSERT INTO access_grants (label, role, auth_kind, ref_id, token_hash)
SELECT 'Mentor: '||m.name, 'mentor', 'rpc_token', m.id,
       encode(extensions.digest(encode(extensions.gen_random_bytes(32),'hex'),'sha256'),'hex')
FROM mentors m
WHERE NOT EXISTS (SELECT 1 FROM access_grants g WHERE g.ref_id=m.id AND g.role='mentor');

INSERT INTO access_grants (label, role, auth_kind, ref_id, token_hash)
SELECT 'Jurado: '||j.name, 'juror', 'rpc_token', j.id,
       encode(extensions.digest(encode(extensions.gen_random_bytes(32),'hex'),'sha256'),'hex')
FROM jurors j WHERE j.active = true
  AND NOT EXISTS (SELECT 1 FROM access_grants g WHERE g.ref_id=j.id AND g.role='juror');
```
> These grants have NO recoverable token (hash only) — they exist so the admin can "novo link" (regenerate) per person from Acessos to mint a usable link. Legacy `#mentor?t=`/`#jurado?t=` keep working meanwhile.

Apply via `apply_migration`. Verify counts:
```sql
SELECT role, count(*) FROM access_grants WHERE auth_kind='rpc_token' GROUP BY role;
```
Expected: one mentor row per mentor, one juror row per active juror.

- [ ] **Step 2: Commit**
```bash
git add migrations/phase2_backfill_mentor_juror_grants.sql
git commit -m "feat(auth): backfill rpc_token grants for existing mentors/jurors"
```

---

## Task 7: Full revoke — `access-admin` edge bans the backing user

**Files:**
- Create: `supabase/functions/access-admin/index.ts`
- Modify: `src/admin/AdminAccess.jsx` (revoke for jwt_exchange grants calls the edge)

- [ ] **Step 1: Write the edge**

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2'

const ALLOWED_ORIGINS = ['https://hackiasc.com','https://www.hackiasc.com','http://localhost:5173']
function corsHeaders(o: string | null) {
  const allow = o && ALLOWED_ORIGINS.includes(o) ? o : ALLOWED_ORIGINS[0]
  return { 'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS' }
}
const json = (b: unknown, s: number, o: string | null) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders(o), 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin)

  const url = Deno.env.get('SUPABASE_URL')!
  const svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  // Server-side admin check on the CALLER's JWT (never trust the UI).
  const authz = req.headers.get('Authorization') ?? ''
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authz } }, auth: { persistSession: false },
  })
  const { data: { user }, error: uErr } = await caller.auth.getUser()
  if (uErr || !user || user.app_metadata?.role !== 'admin') return json({ error: 'forbidden' }, 403, origin)

  let grantId = ''
  try { grantId = (await req.json())?.grant_id ?? '' } catch { /* ignore */ }
  if (!grantId) return json({ error: 'bad_request' }, 400, origin)

  const admin = createClient(url, svc, { auth: { persistSession: false } })
  const { data: grant } = await admin
    .from('access_grants').select('id, supabase_user_id').eq('id', grantId).maybeSingle()
  if (!grant) return json({ error: 'not_found' }, 404, origin)

  // Kill the live session by deleting the backing user (idempotent if already gone).
  if (grant.supabase_user_id) {
    await admin.auth.admin.deleteUser(grant.supabase_user_id).catch(() => {})
  }
  await admin.from('access_grants')
    .update({ revoked_at: new Date().toISOString(), supabase_user_id: null }).eq('id', grantId)
  return json({ ok: true }, 200, origin)
})
```

Deploy with `deploy_edge_function` (name `access-admin`, `verify_jwt: true`).

- [ ] **Step 2: Wire revoke in AdminAccess**

In `src/admin/AdminAccess.jsx`, change `revoke(id)` so that for a grant whose `auth_kind === 'jwt_exchange'` (the list from `admin_list_grants` includes `auth_kind`) it POSTs to the `access-admin` edge (with the user's session `Authorization` header) and for `rpc_token` it calls `admin_revoke_grant` as today. Reload on success.

- [ ] **Step 3: Smoke (MCP + curl) + build**

Create a temp jwt_exchange grant, exchange it once (so a backing user exists), call `access-admin` with an admin JWT to revoke, confirm the backing user is gone and `revoked_at` set, clean up. Confirm a non-admin JWT gets 403. `npm run build`.

- [ ] **Step 4: Commit**
```bash
git add supabase/functions/access-admin/index.ts src/admin/AdminAccess.jsx
git commit -m "feat(auth): full revoke — access-admin edge bans backing user (admin-gated)"
```

---

## Task 8: Retire the staff password-in-URL link

**Files:** Modify `src/App.jsx` (remove `#admin-acesso` route), delete `src/admin/StaffAccess.jsx`

- [ ] **Step 1: Remove**

Remove the `#admin-acesso` branch from `App.jsx` and its `StaffAccess` import; delete `src/admin/StaffAccess.jsx`. Staff is now issued via Acessos (role `staff`) → `#acesso` token-exchange. (Coexistence note: do this only after confirming staff onboarding uses the new links — operational, but the code change is safe since `#acesso` staff already works.)

- [ ] **Step 2: Build + commit**
```bash
npm run build
git add src/App.jsx src/admin/StaffAccess.jsx
git commit -m "feat(auth): retire #admin-acesso staff password link (use Acessos staff grant)"
```

---

## Task 9: Changelog + final

**Files:** Create `docs/changelog/2026-06-01-unified-auth-phase2.md`

- [ ] **Step 1:** Write the changelog (what shipped, prod state, coexistence, what Phase 3 holds). Run `npx vitest run` + `npm run build` (green). Commit.

- [ ] **Step 2: Manual E2E (post-merge):** mint facilitator/mentor/juror links via Acessos; open each; confirm scoped access; revoke a jwt_exchange grant and confirm the live session dies on next request; confirm a legacy `#mentor?t=`/`#jurado?t=` still works.

---

## Self-Review

**Spec coverage:**
- Facilitator panel + route + role re-enable → Task 3. RLS → Task 1. RPC gates → Task 2. ✓
- Mentor/juror uuid→text + grant fallback (owners + callers) + coexistence + re-enable → Tasks 4, 5. Backfill → Task 6. ✓
- Full revoke (ban backing user, admin-gated edge) → Task 7. ✓
- Retire staff password link → Task 8. ✓
- Out of scope (admin/viewer/checkin accounts, scope enforcement, mentor/juror legacy-route cutover) → not present. ✓

**Placeholder scan:** The "fetch live def + apply this exact transform" steps (Tasks 2, 5) are concrete executable procedures with the exact edit specified + worked verbatim examples — not vague placeholders. This is the correct approach for modifying live prod functions whose bodies are the source of truth (repo ≠ prod). Owner resolvers (Task 4), RLS (Task 1), edge (Task 7), backfill (Task 6) are fully verbatim. FacilitatorPanel (Task 3) is the one component that says "model on AdminFacilitator" rather than full code — acceptable because it must mirror an existing large file's exact RPC/query usage; the implementer reads that file.

**Type/contract consistency:** owner resolvers return `uuid` (unchanged), now `text` param; callers pass `p_token text` to them; `grant_resolve` contract (`role`,`ref_id`) consistent across Tasks 4/5/6; `access_grants` columns (`auth_kind`, `ref_id`, `supabase_user_id`, `revoked_at`) consistent with Phase 1; Acessos `ROLES` grows monotonically across Tasks 3/5; `access-admin` reads `auth_kind` from `admin_list_grants` (Phase 1 returns it). ✓

## Out of scope (Phase 3)
admin/viewer/checkin password-account creation via UI; `scope` enforcement; removal of legacy `#mentor?t=`/`#jurado?t=` routes after new-link distribution; folding AdminMentors/AdminJurors creation fully into Acessos.
