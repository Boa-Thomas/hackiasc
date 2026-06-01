# Unified Access-Grants — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the admin-managed access-grants spine: one `access_grants` registry, a unified `#acesso?t=<token>` entry, a `grant_resolve` RPC, an `access-exchange` edge function that mints real Supabase sessions for JWT personas, an admin "Acessos" UI, and coexistent migration of mentor/juror — replacing the staff password-in-URL link.

**Architecture:** Two substrate tracks behind one registry. **JWT personas** (admin/viewer/checkin/staff/facilitator) authenticate via token-exchange: the `#acesso` link → `access-exchange` edge function validates the grant and `generateLink`s a magic link whose `hashed_token` the client redeems with `verifyOtp` → a real Supabase session carrying `app_metadata.role` (so all existing RLS works unchanged). **RPC personas** (mentor/juror) keep their `SECURITY DEFINER` RPCs, validated by a unified `grant_resolve`. Old tokens keep working until cutover.

**Tech Stack:** Supabase Postgres (SQL migrations + `SECURITY DEFINER` RPCs + RLS), Supabase Edge Functions (Deno/TS), React 19 + Vite, Vitest, `@supabase/supabase-js`.

**Spec:** `docs/superpowers/specs/2026-06-01-unified-auth-access-grants-design.md`

---

## How this plan is tested (read first)

The fix-eligibility fence from the 2026-06-01 security sweep applies: **vitest + build validate JS/JSX only.** So:
- **SQL tasks** are applied to the Supabase project `qshrzfahotmjshtjuvno` via the Supabase MCP (`mcp__plugin_supabase_supabase__apply_migration`) and verified with self-cleaning SQL smoke tests via `mcp__plugin_supabase_supabase__execute_sql`. The migration file is ALSO saved under `migrations/` (manual-apply policy — never auto-applied beyond the explicit MCP call in the step).
- **Edge function** is deployed via `mcp__plugin_supabase_supabase__deploy_edge_function` and exercised with a real test grant, then the test grant is cleaned up.
- **JS helpers** are TDD'd with vitest (`tests/**` / `src/**/*.test.js`).
- **React components/hooks** are verified by `npm run build` + targeted vitest on extracted logic; the end-to-end link flow is verified manually (open a minted link per role).

Run `npm install` once before starting if `node_modules` is stale (the repo recently added `@dnd-kit/*`).

## Shared contracts (all tasks must match these exactly)

**Table `access_grants`:** `id uuid pk default gen_random_uuid()`, `label text not null`, `role text not null check (role in ('admin','viewer','checkin','staff','facilitator','mentor','juror'))`, `auth_kind text not null check (auth_kind in ('jwt_exchange','rpc_token'))`, `scope jsonb not null default '{}'::jsonb`, `token_hash text unique not null`, `supabase_user_id uuid`, `ref_id uuid`, `email text`, `expires_at timestamptz`, `revoked_at timestamptz`, `created_by uuid`, `created_at timestamptz not null default now()`, `last_used_at timestamptz`.

**Token:** raw = `encode(gen_random_bytes(32),'hex')` (64 hex chars). Stored as `token_hash = encode(digest(raw,'sha256'),'hex')`. Raw token returned to admin ONCE; lives only in the `#acesso?t=<raw>` link.

**`auth_kind` derivation:** `role in ('mentor','juror') → 'rpc_token'`; else `'jwt_exchange'`.

**RPC `grant_resolve(p_token text) returns jsonb`** — `{ auth_kind, role, scope, ref_id, grant_id, label }`; raises `invalid_grant` if not found / revoked / expired. Refreshes `last_used_at`. Rate-limited.

**Admin RPCs** (all `is_admin()`-gated, `SET search_path = pg_catalog, public`):
- `admin_create_grant(p_label text, p_role text, p_scope jsonb default '{}', p_expires_at timestamptz default null, p_email text default null) returns jsonb` → `{ grant_id, token }` (raw token, once).
- `admin_list_grants() returns jsonb` → array of grants WITHOUT `token_hash`.
- `admin_revoke_grant(p_grant_id uuid) returns void`.
- `admin_regenerate_grant_token(p_grant_id uuid) returns jsonb` → `{ token }` (new raw).
- `admin_set_grant_expiry(p_grant_id uuid, p_expires_at timestamptz) returns void`.

**Edge `access-exchange`** (POST `{ token }`): for a valid `jwt_exchange` grant → ensure backing user `grant+<grant_id>@hackiasc.internal` with `app_metadata = { role, grant_id, scope }` → `generateLink({type:'magiclink', email})` → return `{ hashed_token }`. For `rpc_token` → return `{ rpc_token: true, role }`. Rate-limited; validates revoked/expired independently.

**Client redeem:** `supabase.auth.verifyOtp({ token_hash: hashed_token, type: 'email' })` → session with `app_metadata.role`.

**Frontend role → panel route map** (`src/lib/grantRouting.js`): `admin/viewer/checkin → #admin`, `staff → #admin` (staff is an admin-panel role), `facilitator → #facilitador`, `mentor → #mentor`, `juror → #jurado`.

---

## Task 1: `is_facilitator()` helper + facilitator role plumbing (SQL)

**Files:**
- Create: `migrations/add_facilitator_role.sql`

- [ ] **Step 1: Write the migration**

Create `migrations/add_facilitator_role.sql`:

```sql
-- Facilitator is a first-class, non-admin role (closes "facilitator == admin").
-- Helper mirrors is_admin()/is_admin_or_viewer() and is search_path-pinned.
CREATE OR REPLACE FUNCTION is_facilitator()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'role') = 'facilitator', false);
$$;

REVOKE ALL ON FUNCTION is_facilitator() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_facilitator() TO authenticated, anon;
```

- [ ] **Step 2: Apply via MCP and smoke-test**

Apply with `mcp__plugin_supabase_supabase__apply_migration` (project `qshrzfahotmjshtjuvno`, name `add_facilitator_role`, the SQL above).
Smoke-test with `mcp__plugin_supabase_supabase__execute_sql`:
```sql
SELECT proname, prosecdef, proconfig
FROM pg_proc WHERE proname = 'is_facilitator';
```
Expected: one row, `prosecdef = true`, `proconfig` contains `search_path=pg_catalog, public`.

- [ ] **Step 3: Commit**

```bash
git add migrations/add_facilitator_role.sql
git commit -m "feat(auth): is_facilitator() role helper (search_path-pinned)"
```

---

## Task 2: `access_grants` table + RLS (SQL)

**Files:**
- Create: `migrations/add_access_grants.sql`

- [ ] **Step 1: Write the migration**

Create `migrations/add_access_grants.sql`:

```sql
CREATE TABLE IF NOT EXISTS access_grants (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label            text NOT NULL,
  role             text NOT NULL CHECK (role IN ('admin','viewer','checkin','staff','facilitator','mentor','juror')),
  auth_kind        text NOT NULL CHECK (auth_kind IN ('jwt_exchange','rpc_token')),
  scope            jsonb NOT NULL DEFAULT '{}'::jsonb,
  token_hash       text UNIQUE NOT NULL,
  supabase_user_id uuid,
  ref_id           uuid,
  email            text,
  expires_at       timestamptz,
  revoked_at       timestamptz,
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_used_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_access_grants_token_hash ON access_grants (token_hash);
CREATE INDEX IF NOT EXISTS idx_access_grants_role ON access_grants (role);

ALTER TABLE access_grants ENABLE ROW LEVEL SECURITY;

-- Admin-only direct access. Resolution for non-admins happens through
-- grant_resolve()/edge (SECURITY DEFINER), never via direct table reads.
DROP POLICY IF EXISTS "Admin manages access_grants" ON access_grants;
CREATE POLICY "Admin manages access_grants" ON access_grants
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
```

- [ ] **Step 2: Apply via MCP and smoke-test**

Apply with `apply_migration` (name `add_access_grants`).
Smoke-test:
```sql
SELECT
  (SELECT count(*) FROM pg_policies WHERE tablename='access_grants') AS policies,
  (SELECT relrowsecurity FROM pg_class WHERE relname='access_grants') AS rls_on;
```
Expected: `policies = 1`, `rls_on = true`.

- [ ] **Step 3: Commit**

```bash
git add migrations/add_access_grants.sql
git commit -m "feat(auth): access_grants table + admin-only RLS"
```

---

## Task 3: `grant_resolve` RPC (SQL, with rate limit)

**Files:**
- Create: `migrations/add_grant_resolve.sql`

Note: the repo already has `check_rate_limit(p_key text, p_max int, p_window interval)` (see `migrations/security_audit_2_fixes.sql`). Reuse it.

- [ ] **Step 1: Write the migration**

Create `migrations/add_grant_resolve.sql`:

```sql
-- Resolve a raw grant token to its role/scope. Anon-callable (the token IS the
-- credential). Enforces expiry/revocation and rate-limits per token-hash.
CREATE OR REPLACE FUNCTION grant_resolve(p_token text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_hash text;
  v_grant access_grants%ROWTYPE;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN
    RAISE EXCEPTION 'invalid_grant';
  END IF;
  v_hash := encode(digest(p_token, 'sha256'), 'hex');

  -- Rate-limit resolution attempts per token hash (5 / minute).
  IF NOT check_rate_limit('grant_resolve:' || v_hash, 5, interval '1 minute') THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  SELECT * INTO v_grant FROM access_grants WHERE token_hash = v_hash;
  IF NOT FOUND
     OR v_grant.revoked_at IS NOT NULL
     OR (v_grant.expires_at IS NOT NULL AND v_grant.expires_at <= now()) THEN
    RAISE EXCEPTION 'invalid_grant';
  END IF;

  UPDATE access_grants SET last_used_at = now() WHERE id = v_grant.id;

  RETURN jsonb_build_object(
    'auth_kind', v_grant.auth_kind,
    'role',      v_grant.role,
    'scope',     v_grant.scope,
    'ref_id',    v_grant.ref_id,
    'grant_id',  v_grant.id,
    'label',     v_grant.label
  );
END;
$$;

REVOKE ALL ON FUNCTION grant_resolve(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION grant_resolve(text) TO anon, authenticated;
```

- [ ] **Step 2: Apply + smoke-test (self-cleaning)**

Apply (`add_grant_resolve`). Then via `execute_sql`:
```sql
DO $$
DECLARE v jsonb; v_raw text := encode(gen_random_bytes(32),'hex');
BEGIN
  INSERT INTO access_grants(label, role, auth_kind, token_hash)
  VALUES ('smoke', 'juror', 'rpc_token', encode(digest(v_raw,'sha256'),'hex'));
  v := grant_resolve(v_raw);
  ASSERT v->>'role' = 'juror', 'role mismatch';
  ASSERT v->>'auth_kind' = 'rpc_token', 'kind mismatch';
  DELETE FROM access_grants WHERE label='smoke';
  RAISE NOTICE 'grant_resolve OK';
END $$;
```
Expected: `grant_resolve OK`, no rows left (`SELECT count(*) FROM access_grants WHERE label='smoke'` → 0).

- [ ] **Step 3: Commit**

```bash
git add migrations/add_grant_resolve.sql
git commit -m "feat(auth): grant_resolve RPC (hash lookup, expiry/revoke, rate-limited)"
```

---

## Task 4: Admin grant-management RPCs (SQL)

**Files:**
- Create: `migrations/add_grant_admin_rpcs.sql`

- [ ] **Step 1: Write the migration**

Create `migrations/add_grant_admin_rpcs.sql`:

```sql
-- Derive auth_kind from role.
CREATE OR REPLACE FUNCTION grant_auth_kind(p_role text)
RETURNS text LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, public
AS $$ SELECT CASE WHEN p_role IN ('mentor','juror') THEN 'rpc_token' ELSE 'jwt_exchange' END $$;

CREATE OR REPLACE FUNCTION admin_create_grant(
  p_label text, p_role text, p_scope jsonb DEFAULT '{}'::jsonb,
  p_expires_at timestamptz DEFAULT NULL, p_email text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_raw text := encode(gen_random_bytes(32),'hex'); v_id uuid;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF p_role NOT IN ('admin','viewer','checkin','staff','facilitator','mentor','juror') THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;
  INSERT INTO access_grants(label, role, auth_kind, scope, token_hash, email, expires_at, created_by)
  VALUES (p_label, p_role, grant_auth_kind(p_role), COALESCE(p_scope,'{}'::jsonb),
          encode(digest(v_raw,'sha256'),'hex'), p_email, p_expires_at, auth.uid())
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('grant_id', v_id, 'token', v_raw);
END; $$;

CREATE OR REPLACE FUNCTION admin_list_grants()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT COALESCE(jsonb_agg(g ORDER BY g.created_at DESC), '[]'::jsonb) INTO v
  FROM (
    SELECT id, label, role, auth_kind, scope, email, expires_at, revoked_at,
           created_at, last_used_at,
           (revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())) AS active
    FROM access_grants
  ) g;
  RETURN v;
END; $$;

CREATE OR REPLACE FUNCTION admin_revoke_grant(p_grant_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE access_grants SET revoked_at = now() WHERE id = p_grant_id AND revoked_at IS NULL;
END; $$;

CREATE OR REPLACE FUNCTION admin_regenerate_grant_token(p_grant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_raw text := encode(gen_random_bytes(32),'hex');
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE access_grants
     SET token_hash = encode(digest(v_raw,'sha256'),'hex'), revoked_at = NULL
   WHERE id = p_grant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  RETURN jsonb_build_object('token', v_raw);
END; $$;

CREATE OR REPLACE FUNCTION admin_set_grant_expiry(p_grant_id uuid, p_expires_at timestamptz)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE access_grants SET expires_at = p_expires_at WHERE id = p_grant_id;
END; $$;

REVOKE ALL ON FUNCTION admin_create_grant(text,text,jsonb,timestamptz,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_list_grants() FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_revoke_grant(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_regenerate_grant_token(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_set_grant_expiry(uuid,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_create_grant(text,text,jsonb,timestamptz,text) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_list_grants() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_revoke_grant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_regenerate_grant_token(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_set_grant_expiry(uuid,timestamptz) TO authenticated;
```

- [ ] **Step 2: Apply + smoke-test**

Apply (`add_grant_admin_rpcs`). Smoke-test the non-admin gate and the create→resolve→revoke cycle via `execute_sql` (run as the function owner; the `is_admin()` checks will pass under the MCP service connection only if it reports admin — if not, assert the unauthorized path instead). Minimal cycle that does not depend on JWT role (insert directly, then exercise resolve/revoke logic):
```sql
DO $$
DECLARE v_raw text := encode(gen_random_bytes(32),'hex'); v_id uuid; v jsonb;
BEGIN
  INSERT INTO access_grants(label, role, auth_kind, token_hash)
  VALUES ('smoke2','mentor','rpc_token', encode(digest(v_raw,'sha256'),'hex'))
  RETURNING id INTO v_id;
  UPDATE access_grants SET revoked_at = now() WHERE id = v_id;        -- simulate revoke
  BEGIN v := grant_resolve(v_raw); ASSERT false, 'should have raised';
  EXCEPTION WHEN others THEN ASSERT SQLERRM = 'invalid_grant', 'wrong error: '||SQLERRM; END;
  DELETE FROM access_grants WHERE id = v_id;
  RAISE NOTICE 'revoke gate OK';
END $$;
```
Expected: `revoke gate OK`.

- [ ] **Step 3: Commit**

```bash
git add migrations/add_grant_admin_rpcs.sql
git commit -m "feat(auth): admin grant-management RPCs (create/list/revoke/regen/expiry)"
```

---

## Task 5: `access-exchange` edge function (token-exchange → Supabase session)

**Files:**
- Create: `supabase/functions/access-exchange/index.ts`

Model the CORS/structure on an existing function (e.g. `supabase/functions/refund-payment/index.ts`) — reuse its `ALLOWED_ORIGINS` allowlist (NOT `*`).

- [ ] **Step 1: Write the function**

Create `supabase/functions/access-exchange/index.ts`:

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2'

const ALLOWED_ORIGINS = [
  'https://hackiasc.com',
  'https://www.hackiasc.com',
  'http://localhost:5173',
]
function corsHeaders(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}
const json = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  })

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  let token = ''
  try { token = (await req.json())?.token ?? '' } catch { /* ignore */ }
  if (!token || token.length < 32) return json({ error: 'invalid_grant' }, 400, origin)

  const tokenHash = await sha256Hex(token)
  const { data: grant, error: gErr } = await admin
    .from('access_grants')
    .select('id, role, auth_kind, scope, supabase_user_id, email, expires_at, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (gErr || !grant || grant.revoked_at ||
      (grant.expires_at && new Date(grant.expires_at) <= new Date())) {
    return json({ error: 'invalid_grant' }, 401, origin)
  }

  if (grant.auth_kind === 'rpc_token') {
    // Mentor/juror: no Supabase session; client stores the token and routes.
    return json({ rpc_token: true, role: grant.role }, 200, origin)
  }

  // jwt_exchange: ensure a per-grant backing user with the right role/scope.
  const email = `grant+${grant.id}@hackiasc.internal`
  const appMeta = { role: grant.role, grant_id: grant.id, scope: grant.scope ?? {} }
  let userId = grant.supabase_user_id as string | null

  if (!userId) {
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email, email_confirm: true, app_metadata: appMeta,
    })
    if (cErr || !created?.user) {
      // Could already exist from a prior attempt — try to find it.
      const { data: list } = await admin.auth.admin.listUsers()
      const found = list?.users?.find((u) => u.email === email)
      if (!found) return json({ error: 'provision_failed' }, 500, origin)
      userId = found.id
    } else {
      userId = created.user.id
    }
    await admin.from('access_grants').update({ supabase_user_id: userId }).eq('id', grant.id)
  } else {
    // Keep role/scope current.
    await admin.auth.admin.updateUserById(userId, { app_metadata: appMeta })
  }

  const { data: link, error: lErr } = await admin.auth.admin.generateLink({
    type: 'magiclink', email,
  })
  if (lErr || !link?.properties?.hashed_token) {
    return json({ error: 'link_failed' }, 500, origin)
  }
  return json({ hashed_token: link.properties.hashed_token, role: grant.role }, 200, origin)
})
```

- [ ] **Step 2: Deploy via MCP and exercise**

Deploy with `mcp__plugin_supabase_supabase__deploy_edge_function` (name `access-exchange`, the file above).
Create a temp jwt_exchange grant via `execute_sql`:
```sql
-- returns the raw token to use in the curl below
SELECT (admin_create_grant_direct := NULL); -- placeholder; instead:
DO $$ DECLARE v_raw text := encode(gen_random_bytes(32),'hex');
BEGIN
  INSERT INTO access_grants(label, role, auth_kind, token_hash)
  VALUES ('edge-smoke','staff','jwt_exchange', encode(digest(v_raw,'sha256'),'hex'));
  RAISE NOTICE 'token=%', v_raw;
END $$;
```
Invoke the function (via the user running `! curl` or the MCP logs): POST `{ "token": "<raw>" }` to the function URL. Expected JSON: `{ "hashed_token": "...", "role": "staff" }`. Confirm a backing user `grant+<id>@hackiasc.internal` now exists (`SELECT supabase_user_id FROM access_grants WHERE label='edge-smoke'` is non-null). Then clean up: delete the grant row and the backing user (`auth.admin.deleteUser`).
> If the response shape differs (`properties.hashed_token`), capture the real shape from `get_logs` and adjust before committing — do NOT guess.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/access-exchange/index.ts
git commit -m "feat(auth): access-exchange edge function (grant -> Supabase session)"
```

---

## Task 6: Grant routing + scope helpers (JS, TDD)

**Files:**
- Create: `src/lib/grantRouting.js`
- Test: `tests/grantRouting.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/grantRouting.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { parseAccessToken, routeForRole, isExchangeRole } from '../src/lib/grantRouting.js'

describe('parseAccessToken', () => {
  it('extracts the token from a #acesso hash', () => {
    expect(parseAccessToken('#acesso?t=abc123')).toBe('abc123')
  })
  it('returns null when absent', () => {
    expect(parseAccessToken('#admin')).toBeNull()
    expect(parseAccessToken('#acesso')).toBeNull()
  })
})

describe('routeForRole', () => {
  it('maps roles to panel hashes', () => {
    expect(routeForRole('admin')).toBe('#admin')
    expect(routeForRole('viewer')).toBe('#admin')
    expect(routeForRole('checkin')).toBe('#admin')
    expect(routeForRole('staff')).toBe('#admin')
    expect(routeForRole('facilitator')).toBe('#facilitador')
    expect(routeForRole('mentor')).toBe('#mentor')
    expect(routeForRole('juror')).toBe('#jurado')
  })
  it('returns null for unknown roles', () => {
    expect(routeForRole('nope')).toBeNull()
  })
})

describe('isExchangeRole', () => {
  it('classifies JWT vs rpc-token personas', () => {
    expect(isExchangeRole('staff')).toBe(true)
    expect(isExchangeRole('facilitator')).toBe(true)
    expect(isExchangeRole('mentor')).toBe(false)
    expect(isExchangeRole('juror')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/grantRouting.test.js`
Expected: FAIL — cannot resolve `../src/lib/grantRouting.js`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/grantRouting.js`:

```js
const ROLE_ROUTE = {
  admin: '#admin',
  viewer: '#admin',
  checkin: '#admin',
  staff: '#admin',
  facilitator: '#facilitador',
  mentor: '#mentor',
  juror: '#jurado',
}
const RPC_TOKEN_ROLES = new Set(['mentor', 'juror'])

export function parseAccessToken(hash) {
  const m = String(hash || '').match(/^#acesso\?t=(.+)$/)
  return m ? m[1] : null
}

export function routeForRole(role) {
  return ROLE_ROUTE[role] ?? null
}

export function isExchangeRole(role) {
  return role in ROLE_ROUTE && !RPC_TOKEN_ROLES.has(role)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/grantRouting.test.js`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/grantRouting.js tests/grantRouting.test.js
git commit -m "feat(auth): grant routing + role-classification helpers (TDD)"
```

---

## Task 7: `useGrantAccess` hook + `#acesso` route wiring

**Files:**
- Create: `src/hooks/useGrantAccess.js`
- Modify: `src/App.jsx` (add the `#acesso` route)

- [ ] **Step 1: Write the hook**

Create `src/hooks/useGrantAccess.js`:

```js
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { parseAccessToken, routeForRole, isExchangeRole } from '../lib/grantRouting'

const EXCHANGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/access-exchange`

// Resolves a #acesso?t=<token> link: rpc-token roles store the token and route;
// jwt-exchange roles call the edge function and verifyOtp into a real session.
export function useGrantAccess() {
  const [state, setState] = useState({ status: 'idle', error: null })

  useEffect(() => {
    const token = parseAccessToken(window.location.hash)
    if (!token || !supabase) return
    let cancelled = false

    ;(async () => {
      setState({ status: 'resolving', error: null })
      try {
        const res = await fetch(EXCHANGE_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ token }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || 'invalid_grant')

        if (data.rpc_token) {
          // mentor/juror: persist token for the panel's RPC calls
          const key = data.role === 'mentor' ? 'hackiasc_mentor_token' : 'hackiasc_juror_token'
          localStorage.setItem(key, token)
          if (data.role === 'mentor') localStorage.setItem('hackiasc_mentor_mode', 'link')
        } else if (data.hashed_token) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: data.hashed_token,
            type: 'email',
          })
          if (error) throw error
        } else {
          throw new Error('invalid_grant')
        }

        if (cancelled) return
        const dest = routeForRole(data.role)
        // Clean the token out of the URL, then route.
        window.history.replaceState(null, '', window.location.pathname)
        window.location.hash = dest || '#'
        setState({ status: 'done', error: null })
      } catch (e) {
        if (!cancelled) setState({ status: 'error', error: e.message || 'invalid_grant' })
      }
    })()

    return () => { cancelled = true }
  }, [])

  return state
}

export { isExchangeRole }
```

- [ ] **Step 2: Wire the route in App.jsx**

Read `src/App.jsx` to find the existing hash-route switch. Add a branch: when `hash.startsWith('#acesso')`, render an `<AccessExchange />` gate that uses `useGrantAccess()` and shows a "Validando acesso…" spinner / "Link inválido ou expirado" error, then the hook redirects to the right panel. Add (in `src/App.jsx` or a tiny `src/components/AccessExchange.jsx`):

```jsx
function AccessExchange() {
  const { status, error } = useGrantAccess()
  if (status === 'error') {
    return (
      <div className="min-h-screen grid place-items-center text-center p-6">
        <div>
          <p className="text-hot font-mono">Link inválido ou expirado.</p>
          <a href="#" className="text-electric underline">Voltar ao início</a>
        </div>
      </div>
    )
  }
  return (
    <div className="min-h-screen grid place-items-center">
      <p className="text-cyan font-mono animate-pulse">Validando acesso…</p>
    </div>
  )
}
```
Import `useGrantAccess` and render `<AccessExchange />` for the `#acesso` route (mirror how `#jurado`/`#mentor` are dispatched).

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: builds OK (no import/syntax errors). (Manual end-to-end is in Task 10's verification.)

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useGrantAccess.js src/App.jsx src/components/AccessExchange.jsx
git commit -m "feat(auth): useGrantAccess hook + #acesso route"
```

---

## Task 8: Admin "Acessos" UI

**Files:**
- Create: `src/admin/AdminAccess.jsx`
- Modify: `src/admin/AdminPanel.jsx` (add the `access` tab, admin-only)

- [ ] **Step 1: Write the component**

Create `src/admin/AdminAccess.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const ROLES = ['facilitator', 'staff', 'mentor', 'juror', 'viewer', 'checkin', 'admin']

function accessLink(token) {
  const base = window.location.origin + window.location.pathname
  return `${base}#acesso?t=${token}`
}

export default function AdminAccess() {
  const [grants, setGrants] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ label: '', role: 'facilitator', expires_at: '' })
  const [newLink, setNewLink] = useState(null)
  const [error, setError] = useState(null)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.rpc('admin_list_grants')
    if (error) setError(error.message)
    else setGrants(Array.isArray(data) ? data : [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function create(e) {
    e.preventDefault()
    setError(null); setNewLink(null)
    const { data, error } = await supabase.rpc('admin_create_grant', {
      p_label: form.label.trim(),
      p_role: form.role,
      p_scope: {},
      p_expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      p_email: null,
    })
    if (error) { setError(error.message); return }
    setNewLink(accessLink(data.token))
    setForm({ label: '', role: form.role, expires_at: '' })
    load()
  }

  async function revoke(id) {
    const { error } = await supabase.rpc('admin_revoke_grant', { p_grant_id: id })
    if (error) setError(error.message); else load()
  }

  async function regenerate(id) {
    const { data, error } = await supabase.rpc('admin_regenerate_grant_token', { p_grant_id: id })
    if (error) { setError(error.message); return }
    setNewLink(accessLink(data.token)); load()
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="card-glass p-4 space-y-3">
        <h3 className="font-display text-lg">Criar acesso</h3>
        <div className="flex flex-wrap gap-3">
          <input required value={form.label} onChange={e => setForm({ ...form, label: e.target.value })}
            placeholder="Nome (ex: FULANO)" className="bg-dark/50 border border-white/10 rounded px-3 py-2" />
          <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
            className="bg-dark/50 border border-white/10 rounded px-3 py-2">
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <input type="datetime-local" value={form.expires_at}
            onChange={e => setForm({ ...form, expires_at: e.target.value })}
            className="bg-dark/50 border border-white/10 rounded px-3 py-2" />
          <button className="glow-cyan rounded px-4 py-2 font-mono">Gerar link</button>
        </div>
        {newLink && (
          <div className="text-sm font-mono break-all bg-cyan/10 border border-cyan/30 rounded p-2">
            {newLink}
            <button type="button" onClick={() => navigator.clipboard?.writeText(newLink)}
              className="ml-2 text-electric underline">copiar</button>
            <p className="text-gold mt-1">Copie agora — o token não será mostrado de novo.</p>
          </div>
        )}
        {error && <p className="text-hot text-sm">{error}</p>}
      </form>

      <div className="card-glass p-4">
        <h3 className="font-display text-lg mb-3">Acessos</h3>
        {loading ? <p className="text-white/50">Carregando…</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-white/50 text-left">
              <th className="py-1">Nome</th><th>Papel</th><th>Expira</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              {grants.map(g => (
                <tr key={g.id} className="border-t border-white/5">
                  <td className="py-2">{g.label}</td>
                  <td>{g.role}</td>
                  <td>{g.expires_at ? new Date(g.expires_at).toLocaleString('pt-BR') : '—'}</td>
                  <td className={g.active ? 'text-cyan' : 'text-hot'}>{g.active ? 'ativo' : 'inativo'}</td>
                  <td className="text-right space-x-2">
                    <button onClick={() => regenerate(g.id)} className="text-electric underline">novo link</button>
                    {g.active && <button onClick={() => revoke(g.id)} className="text-hot underline">revogar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add the tab to AdminPanel.jsx**

In `src/admin/AdminPanel.jsx`: import `AdminAccess`; add `{ id: 'access', label: 'Acessos', adminOnly: true }` to `ALL_TABS` (near the other admin-only tabs); add a render branch guarded by the role gate added in the security-sweep fix: `{!readOnly && show('access') && <AdminAccess />}`.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: builds OK.

- [ ] **Step 4: Commit**

```bash
git add src/admin/AdminAccess.jsx src/admin/AdminPanel.jsx
git commit -m "feat(auth): admin Acessos UI (create/list/revoke/regenerate grants)"
```

---

## Task 9: Coexistent migration of mentor/juror onto grants

**Files:**
- Create: `migrations/migrate_mentor_juror_to_grants.sql`

The goal: every existing mentor/juror gets an `access_grants` rpc_token row whose `token_hash` corresponds to a NEW raw token (printed for distribution), with `ref_id` = the mentor/juror id. Old `mentors.access_token` / `jurors.access_token` **keep working** (no drop). Mentor/juror RPCs gain a grant fallback so a new `#acesso` link routes correctly.

- [ ] **Step 1: Write the migration (grant fallback in owners)**

Create `migrations/migrate_mentor_juror_to_grants.sql`:

```sql
-- Make mentor/juror identity RPCs ALSO accept a unified grant token (rpc_token),
-- resolving ref_id -> mentor/juror id. Legacy tokens are checked FIRST and keep
-- working; only a non-uuid token (i.e. a hex grant token) falls through to grant_resolve.

CREATE OR REPLACE FUNCTION juror_token_owner(p_token text)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_id uuid; v jsonb;
BEGIN
  -- legacy path: direct juror access_token (a uuid). Guard the uuid cast.
  BEGIN
    SELECT id INTO v_id FROM jurors WHERE access_token = p_token::uuid AND active = true;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  EXCEPTION WHEN invalid_text_representation THEN
    v_id := NULL;  -- not a uuid; try the unified grant path
  END;
  -- unified grant path (hex token)
  v := grant_resolve(p_token);          -- raises invalid_grant if bad/expired/revoked
  IF v->>'role' = 'juror' AND v->>'ref_id' IS NOT NULL THEN
    RETURN (v->>'ref_id')::uuid;
  END IF;
  RAISE EXCEPTION 'invalid_grant';
END; $$;

CREATE OR REPLACE FUNCTION mentor_session_owner(p_token text)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_id uuid; v jsonb;
BEGIN
  -- legacy paths: session-table token, then static mentor access_token (both uuid).
  BEGIN
    SELECT mentor_id INTO v_id FROM mentor_sessions
     WHERE token = p_token::uuid AND expires_at > now();
    IF v_id IS NOT NULL THEN
      UPDATE mentor_sessions SET last_used_at = now() WHERE token = p_token::uuid;
      RETURN v_id;
    END IF;
    SELECT id INTO v_id FROM mentors WHERE access_token = p_token::uuid;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  EXCEPTION WHEN invalid_text_representation THEN
    v_id := NULL;  -- not a uuid; try the unified grant path
  END;
  -- unified grant path (hex token)
  v := grant_resolve(p_token);
  IF v->>'role' = 'mentor' AND v->>'ref_id' IS NOT NULL THEN
    RETURN (v->>'ref_id')::uuid;
  END IF;
  RETURN NULL;
END; $$;

-- No raw-token backfill here: stored hashes are one-way, so existing mentors/jurors
-- get NEW links minted per person from the Acessos UI when the admin is ready
-- (ref_id links the grant to the mentor/juror row). This migration only installs
-- the fallback resolvers above; legacy tokens remain valid until cutover.
```

> Before applying: confirm the LIVE signatures (param + return type) of `juror_token_owner` and `mentor_session_owner` (Step 2 query) and match them EXACTLY — if the live param is `uuid` rather than `text`, adapt (the unified path needs a `text` param to carry a hex token, so you may add a `text` overload rather than replacing a `uuid` one). These single final bodies are what gets applied.

- [ ] **Step 2: Verify signatures, apply, smoke-test**

First confirm the live signatures with `execute_sql`:
```sql
SELECT proname, pg_get_function_arguments(oid), pg_get_function_result(oid)
FROM pg_proc WHERE proname IN ('juror_token_owner','mentor_session_owner');
```
Adjust the param/return types in the migration to match EXACTLY, then `apply_migration` (`migrate_mentor_juror_to_grants`). Smoke-test the grant fallback:
```sql
DO $$
DECLARE v_raw text := encode(gen_random_bytes(32),'hex'); v_jid uuid;
BEGIN
  INSERT INTO jurors(name, email, active) VALUES ('smoke juror','sj@x.com', true) RETURNING id INTO v_jid;
  INSERT INTO access_grants(label, role, auth_kind, ref_id, token_hash)
  VALUES ('sj','juror','rpc_token', v_jid, encode(digest(v_raw,'sha256'),'hex'));
  ASSERT juror_token_owner(v_raw) = v_jid, 'juror grant fallback failed';
  DELETE FROM access_grants WHERE label='sj';
  DELETE FROM jurors WHERE id = v_jid;
  RAISE NOTICE 'juror grant fallback OK';
END $$;
```
Expected: `juror grant fallback OK`. (Also confirm a legacy juror `access_token` still resolves.)

- [ ] **Step 3: Commit**

```bash
git add migrations/migrate_mentor_juror_to_grants.sql
git commit -m "feat(auth): mentor/juror token owners accept unified grants (coexistence)"
```

---

## Task 10: Staff cutover + end-to-end manual verification

**Files:**
- Modify: `src/admin/StaffAccess.jsx` (or its route in `App.jsx`)

- [ ] **Step 1: Point staff at the grant flow**

Staff now uses a `staff`-role `jwt_exchange` grant via `#acesso`. Keep `#admin-acesso?t=<password>` working during coexistence but stop advertising it. The cleanest change: in `App.jsx`, leave the legacy `#admin-acesso` route as-is for now (do NOT delete — cutover step), and ensure `#acesso` handles staff (it already does via `routeForRole('staff') → #admin`). No code change is strictly required for staff to work via `#acesso`; the deletion of `#admin-acesso` happens in Phase 2 after distribution.

Add a short note to `docs/changelog/` (Step 3) recording that staff should be issued via Acessos → role `staff`.

- [ ] **Step 2: Manual end-to-end verification (per role)**

With the app running (`npm run dev`), in the admin panel → Acessos:
1. Create a `staff` grant → open its `#acesso?t=…` link in a clean browser/profile → expect a real Supabase session and the admin panel in staff scope (no PII tabs beyond staff's RLS). Confirm `supabase.auth.getSession()` returns a user with `app_metadata.role === 'staff'`.
2. Create a `facilitator` grant → link → expect the facilitator route (`#facilitador`) and is_facilitator()-gated reads. (If the facilitator standalone panel route is not built yet, confirm the session role is `facilitator`; full panel routing can be a follow-up.)
3. Create a `juror` grant pointing at a test juror (set `ref_id`) → link → expect the juror panel works via the grant token (rpc_token path).
4. Revoke a grant → its link no longer mints a session (expect "Link inválido ou expirado").

Record results. If any role fails, fix the responsible task before proceeding.

- [ ] **Step 3: Changelog + commit**

Create `docs/changelog/2026-06-01-unified-auth-phase1.md` summarizing Phase 1 (what shipped, the coexistence state, what Phase 2 will do). Commit:
```bash
git add docs/changelog/2026-06-01-unified-auth-phase1.md src/App.jsx
git commit -m "docs(auth): Phase 1 access-grants changelog + staff via Acessos"
```

---

## Self-Review

**Spec coverage:**
- `access_grants` registry → Task 2. ✓
- Substrate fork: jwt_exchange (Tasks 5,7) + rpc_token (Tasks 3,9). ✓
- Unified `#acesso` route → Task 7. ✓
- `grant_resolve` (search_path, hash lookup, expiry/revoke, rate-limit) → Task 3. ✓
- Admin RPCs + Acessos UI → Tasks 4, 8. ✓
- `access-exchange` edge (generateLink + per-grant backing user) → Task 5. ✓
- `facilitator` role/`is_facilitator()` → Task 1. ✓
- Coexist-migrate mentor/juror; old tokens keep working → Task 9. ✓
- Staff password-link replaced by staff grant (coexistence; delete in Phase 2) → Task 10. ✓
- Security baked in: every SECURITY DEFINER fn has `SET search_path`; tokens `gen_random_bytes`; hash-only storage; admin RPCs `is_admin()`-gated; resolve rate-limited. ✓
- Phase 2 items (admin/viewer/checkin creation, legacy-route deletion) intentionally OUT of this plan. ✓

**Placeholder scan:** No TBD/TODO. Task 9 explicitly flags "confirm live signatures before applying" (a real verification step, not a placeholder) and shows the exact final bodies. Task 5 flags "capture real response shape from logs if it differs" (verification, code uses `properties.hashed_token`). ✓

**Type/contract consistency:** `access_grants` columns identical across Tasks 2/3/4/5/8/9. `grant_resolve` returns `{auth_kind,role,scope,ref_id,grant_id,label}` — consumed by Task 9 (`role`,`ref_id`) and Task 7 (via edge, not directly). `admin_create_grant` returns `{grant_id,token}` — consumed by Task 8 (`data.token`). Edge returns `{hashed_token,role}` / `{rpc_token,role}` — consumed by Task 7. `routeForRole`/`isExchangeRole`/`parseAccessToken` names identical in Tasks 6/7. localStorage keys (`hackiasc_mentor_token`/`hackiasc_juror_token`/`hackiasc_mentor_mode`) match the existing hooks per the auth map. ✓

## Out of scope (Phase 2)
admin/viewer/checkin creation via `access-admin` edge; deletion of legacy `#admin-acesso`/`#mentor?t=`/`#jurado?t=` routes after cutover; folding AdminMentors/AdminJurors creation fully into Acessos; banning the backing user on revoke (Phase 1 revoke blocks new sessions via `revoked_at`; existing sessions expire naturally).
