# Auth Phase 3 — SP1: Password Accounts Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin provision/manage password login accounts (admin/viewer/checkin/staff) from the admin UI, with server-generated show-once passwords (no forced first-login change).

**Architecture:** A new admin-gated edge function `access-account` creates a backing `auth.users` (CSPRNG password, `app_metadata={role,grant_id}`) + a canonical `access_grants` row (`auth_kind='password'`, `token_hash=null`). The existing `AdminAccess.jsx` gains a "password accounts" section. Scope is collected/stored (hybrid schema) but **not enforced** in SP1. Login + role gating already exist (`AdminLogin`/`useAdminAuth`).

**Tech Stack:** Supabase (Postgres + Auth + Deno edge), React 19, Vite, vitest.

**Spec:** `docs/superpowers/specs/2026-06-02-auth-phase3-sp1-accounts-design.md`

---

## File Structure

- `migrations/phase3_password_accounts.sql` — **create.** `token_hash` nullable; `auth_kind` += `'password'`; password-shape CHECK. Applied to prod as a gated main-thread step (not by subagents).
- `src/lib/grantRouting.js` — **modify.** Add `usesEdgeRevoke(authKind)`.
- `tests/grantRouting.test.js` — **modify.** Tests for `usesEdgeRevoke`.
- `src/admin/accountScope.js` — **create.** `buildScope()` + `ASSIGNABLE_TABS` (pure, hybrid-scope builder).
- `src/admin/accountScope.test.js` — **create.** Tests for `buildScope`.
- `supabase/functions/access-account/index.ts` — **create.** Admin-gated `create` + `reset_password`.
- `src/admin/AdminAccess.jsx` — **modify.** Password-accounts section + show-once + list "tipo"/reset + revoke routing via `usesEdgeRevoke`.

**Prod rollout (main-thread, gated — see "Integration" at the end):** apply migration → deploy edge → tracer smoke → build+vitest → PR (pre-deploy-verify) → merge (frontend auto-deploys).

---

## Task 1: DB migration — password-backed grants

**Files:**
- Create: `migrations/phase3_password_accounts.sql`

Verified facts (prod `qshrzfahotmjshtjuvno`): `token_hash text UNIQUE NOT NULL`; `auth_kind text NOT NULL CHECK (auth_kind IN ('jwt_exchange','rpc_token'))` (inline → constraint name `access_grants_auth_kind_check`); `role` CHECK already allows all 7 roles; UNIQUE index `access_grants_token_hash_key` (permits multiple NULLs). No local Postgres → this task writes the file; SQL is exercised in **Integration** via MCP.

- [ ] **Step 1: Write the migration**

```sql
-- migrations/phase3_password_accounts.sql
-- Auth Phase 3 / SP1: allow password-backed grants (admin/viewer/checkin/staff
-- login accounts provisioned via the access-account edge). A password grant has
-- an email + a backing auth.users but NO token (token_hash NULL).
-- Apply to prod (project qshrzfahotmjshtjuvno) as a gated main-thread step.

-- 1. Password grants have no token.
ALTER TABLE access_grants ALTER COLUMN token_hash DROP NOT NULL;
-- access_grants_token_hash_key is a UNIQUE index; Postgres UNIQUE permits
-- multiple NULLs, so dropping NOT NULL is safe and link grants are unaffected.

-- 2. Add 'password' to the auth_kind domain (was: jwt_exchange | rpc_token).
ALTER TABLE access_grants DROP CONSTRAINT IF EXISTS access_grants_auth_kind_check;
ALTER TABLE access_grants ADD CONSTRAINT access_grants_auth_kind_check
  CHECK (auth_kind IN ('jwt_exchange','rpc_token','password'));

-- 3. Shape integrity for the new kind: a password grant must carry an email and
--    must NOT carry a token.
ALTER TABLE access_grants ADD CONSTRAINT access_grants_password_shape_check
  CHECK (auth_kind <> 'password' OR (email IS NOT NULL AND token_hash IS NULL));
```

- [ ] **Step 2: Self-review the SQL**

Confirm: constraint name `access_grants_auth_kind_check` matches the inline CHECK (Postgres auto-names inline column checks `<table>_<column>_check`); the new shape CHECK does not constrain existing `jwt_exchange`/`rpc_token` rows; no `NOT NULL`-dependent logic elsewhere references `token_hash`.

- [ ] **Step 3: Commit**

```bash
git add migrations/phase3_password_accounts.sql
git commit -m "feat(auth): migration for password-backed access grants (SP1)"
```

---

## Task 2: `usesEdgeRevoke` helper (TDD)

**Files:**
- Modify: `src/lib/grantRouting.js`
- Test: `tests/grantRouting.test.js`

- [ ] **Step 1: Write the failing test** (append to `tests/grantRouting.test.js`)

Add `usesEdgeRevoke` to the import on line 2, then append:

```js
describe('usesEdgeRevoke', () => {
  it('routes backing-user grants to the edge', () => {
    expect(usesEdgeRevoke('jwt_exchange')).toBe(true)
    expect(usesEdgeRevoke('password')).toBe(true)
  })
  it('routes token-only grants to the RPC', () => {
    expect(usesEdgeRevoke('rpc_token')).toBe(false)
    expect(usesEdgeRevoke(undefined)).toBe(false)
  })
})
```

The import line becomes:
```js
import { parseAccessToken, routeForRole, isExchangeRole, usesEdgeRevoke } from '../src/lib/grantRouting.js'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/grantRouting.test.js`
Expected: FAIL — `usesEdgeRevoke is not a function`.

- [ ] **Step 3: Implement** (append to `src/lib/grantRouting.js`)

```js
// Grants with a backing Supabase user (jwt_exchange link sessions and password
// accounts) are revoked via the access-admin edge, which deletes the backing
// user to kill the live session. Token-only grants (rpc_token: mentor/juror)
// are revoked via the admin_revoke_grant RPC.
export function usesEdgeRevoke(authKind) {
  return authKind === 'jwt_exchange' || authKind === 'password'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/grantRouting.test.js`
Expected: PASS (all suites green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/grantRouting.js tests/grantRouting.test.js
git commit -m "feat(auth): usesEdgeRevoke routing helper (SP1)"
```

---

## Task 3: `buildScope` helper (TDD)

**Files:**
- Create: `src/admin/accountScope.js`
- Test: `src/admin/accountScope.test.js`

- [ ] **Step 1: Write the failing test**

```js
// src/admin/accountScope.test.js
import { describe, it, expect } from 'vitest'
import { buildScope } from './accountScope'

describe('buildScope', () => {
  it('returns {} when nothing is set (unrestricted)', () => {
    expect(buildScope()).toEqual({})
    expect(buildScope({ readOnly: false, allowedTabs: [] })).toEqual({})
  })
  it('includes read_only only when true', () => {
    expect(buildScope({ readOnly: true })).toEqual({ read_only: true })
  })
  it('includes trimmed, de-duped, non-empty tabs', () => {
    expect(buildScope({ allowedTabs: [' results ', 'results', '', 'payments'] }))
      .toEqual({ allowed_tabs: ['results', 'payments'] })
  })
  it('combines flags and tabs', () => {
    expect(buildScope({ readOnly: true, allowedTabs: ['results'] }))
      .toEqual({ read_only: true, allowed_tabs: ['results'] })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/admin/accountScope.test.js`
Expected: FAIL — cannot import `buildScope` (module missing).

- [ ] **Step 3: Implement**

```js
// src/admin/accountScope.js
// Builds the hybrid scope object for a password account (SP1 stores it; SP3
// enforces it). Empty/unset => {} which always means "unrestricted".
// Row-scope keys (team_ids/idea_ids) are NOT collected here: SP1 only provisions
// admin/viewer/checkin/staff (capability/UI scope), never mentor/juror.
export const ASSIGNABLE_TABS = ['registrations', 'payments', 'results', 'teams', 'access', 'checkin']

export function buildScope({ readOnly = false, allowedTabs = [] } = {}) {
  const scope = {}
  if (readOnly) scope.read_only = true
  const tabs = (Array.isArray(allowedTabs) ? allowedTabs : [])
    .map((t) => String(t).trim())
    .filter(Boolean)
  if (tabs.length) scope.allowed_tabs = [...new Set(tabs)]
  return scope
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/admin/accountScope.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/admin/accountScope.js src/admin/accountScope.test.js
git commit -m "feat(auth): buildScope hybrid-scope helper (SP1)"
```

---

## Task 4: Edge function `access-account`

**Files:**
- Create: `supabase/functions/access-account/index.ts`

Mirrors `supabase/functions/access-admin/index.ts` (CORS allow-list, POST-only, admin check on caller JWT, service-role client). No vitest (Deno runtime) — validated by the manual smoke in **Integration**. **Do NOT deploy here.**

- [ ] **Step 1: Write the edge function**

```ts
// supabase/functions/access-account/index.ts
// Admin-gated provisioning of password login accounts (admin/viewer/checkin/staff)
// for Auth Phase 3 SP1. Creates a backing auth.users (CSPRNG password,
// app_metadata={role,grant_id}) + a canonical access_grants row (auth_kind='password',
// token_hash=null). Returns the password ONCE. No forced first-login change.
// Revocation reuses the access-admin edge. Mirrors access-admin's structure.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const ALLOWED_ORIGINS = ['https://hackiasc.com', 'https://www.hackiasc.com', 'http://localhost:5173']
function corsHeaders(o: string | null) {
  const allow = o && ALLOWED_ORIGINS.includes(o) ? o : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}
const json = (b: unknown, s: number, o: string | null) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders(o), 'Content-Type': 'application/json' } })

const PASSWORD_ROLES = ['admin', 'viewer', 'checkin', 'staff']
// CSPRNG password, rejection-sampled to avoid modulo bias. Charset excludes 0/O/1/l/I.
const PW_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
function generatePassword(len = 20): string {
  const max = Math.floor(256 / PW_CHARSET.length) * PW_CHARSET.length
  const out: string[] = []
  while (out.length < len) {
    const buf = new Uint8Array(len)
    crypto.getRandomValues(buf)
    for (const b of buf) {
      if (out.length >= len) break
      if (b < max) out.push(PW_CHARSET[b % PW_CHARSET.length])
    }
  }
  return out.join('')
}
function isEmail(s: unknown): s is string {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin)

  const url = Deno.env.get('SUPABASE_URL')!
  const svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!

  // Server-side admin check on the CALLER's JWT (never trust the UI).
  const authz = req.headers.get('Authorization') ?? ''
  const caller = createClient(url, anon, {
    global: { headers: { Authorization: authz } },
    auth: { persistSession: false },
  })
  const { data: { user }, error: uErr } = await caller.auth.getUser()
  if (uErr || !user || user.app_metadata?.role !== 'admin') return json({ error: 'forbidden' }, 403, origin)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'bad_request' }, 400, origin) }
  const action = body?.action
  const admin = createClient(url, svc, { auth: { persistSession: false } })

  if (action === 'create') {
    const role = body?.role
    const label = String(body?.label ?? '').trim()
    const email = String(body?.email ?? '').trim()
    const scope = body?.scope ?? {}
    if (typeof role !== 'string' || !PASSWORD_ROLES.includes(role)) return json({ error: 'invalid_role' }, 400, origin)
    if (!label) return json({ error: 'label_required' }, 400, origin)
    if (!isEmail(email)) return json({ error: 'invalid_email' }, 400, origin)
    if (typeof scope !== 'object' || Array.isArray(scope) || scope === null) return json({ error: 'invalid_scope' }, 400, origin)

    // 1. Insert the grant first so grant_id is known before user creation (clean rollback).
    const { data: grant, error: gErr } = await admin
      .from('access_grants')
      .insert({ auth_kind: 'password', role, label, email, scope, token_hash: null, supabase_user_id: null, created_by: user.id })
      .select('id').single()
    if (gErr || !grant) return json({ error: 'grant_insert_failed' }, 500, origin)

    // 2. Create the backing user with role + grant_id baked into app_metadata.
    const password = generatePassword()
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, app_metadata: { role, grant_id: grant.id },
    })
    if (cErr || !created?.user) {
      await admin.from('access_grants').delete().eq('id', grant.id)
      const msg = (cErr?.message ?? '').toLowerCase()
      if (msg.includes('already') || msg.includes('exist') || msg.includes('registered'))
        return json({ error: 'email_exists' }, 409, origin)
      return json({ error: 'user_create_failed' }, 500, origin)
    }

    // 3. Link the backing user to the grant.
    const { error: upErr } = await admin
      .from('access_grants').update({ supabase_user_id: created.user.id }).eq('id', grant.id)
    if (upErr) {
      await admin.auth.admin.deleteUser(created.user.id).catch(() => {})
      await admin.from('access_grants').delete().eq('id', grant.id)
      return json({ error: 'link_failed' }, 500, origin)
    }
    return json({ ok: true, email, password }, 200, origin)
  }

  if (action === 'reset_password') {
    const grantId = body?.grant_id
    if (!grantId || typeof grantId !== 'string') return json({ error: 'bad_request' }, 400, origin)
    const { data: grant } = await admin
      .from('access_grants').select('id, supabase_user_id, auth_kind').eq('id', grantId).maybeSingle()
    if (!grant || grant.auth_kind !== 'password' || !grant.supabase_user_id) return json({ error: 'not_found' }, 404, origin)
    const password = generatePassword()
    const { error: rErr } = await admin.auth.admin.updateUserById(grant.supabase_user_id, { password })
    if (rErr) return json({ error: 'reset_failed' }, 500, origin)
    return json({ ok: true, password }, 200, origin)
  }

  return json({ error: 'unknown_action' }, 400, origin)
})
```

- [ ] **Step 2: Self-review**

Confirm: admin gate identical to `access-admin`; rollback covers each failure point; `reset_password` only touches `auth_kind='password'` grants; password never logged; CORS allow-list matches `access-admin`.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/access-account/index.ts
git commit -m "feat(auth): access-account edge for password accounts (SP1)"
```

---

## Task 5: Admin UI — password accounts in `AdminAccess.jsx`

**Files:**
- Modify: `src/admin/AdminAccess.jsx` (full replacement below)

Consumes `usesEdgeRevoke` (Task 2) + `buildScope`/`ASSIGNABLE_TABS` (Task 3). No component unit test in this repo → gated by `npm run build` + the manual E2E in **Integration**. Renames the show-once state from `newLink` to a generic `secret` ({kind,value}) covering both link tokens and passwords; factors a `callEdge` helper.

- [ ] **Step 1: Replace the component**

```jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usesEdgeRevoke } from '../lib/grantRouting'
import { buildScope } from './accountScope'

// Link grants (magic-link personas).
const LINK_ROLES = ['facilitator', 'staff', 'mentor', 'juror', 'checkin', 'viewer']
// Password accounts (persistent login).
const PASSWORD_ROLES = ['admin', 'viewer', 'checkin', 'staff']

function accessLink(token) {
  const base = window.location.origin + window.location.pathname
  return `${base}#acesso?t=${token}`
}
function grantKind(authKind) {
  if (authKind === 'password') return 'senha'
  if (authKind === 'rpc_token') return 'token'
  return 'link'
}

export default function AdminAccess() {
  const [grants, setGrants] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ label: '', role: 'facilitator', expires_at: '' })
  const [acct, setAcct] = useState({ label: '', role: 'viewer', email: '', readOnly: false, allowedTabs: '' })
  // Show-once secret: a link token OR a password.
  const [secret, setSecret] = useState(null) // { kind: 'link'|'password', value: string }
  const [error, setError] = useState(null)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.rpc('admin_list_grants')
    if (error) setError(error.message)
    else setGrants(Array.isArray(data) ? data : [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // Call an admin-gated edge function with the current admin bearer token.
  async function callEdge(fnName, payload) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) { setError('Sessão admin expirada — refaça login.'); return null }
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fnName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(`Falha: ${data?.error ?? res.status}`); return null }
      return data
    } catch {
      setError('Falha de rede.')
      return null
    }
  }

  async function create(e) {
    e.preventDefault()
    setError(null); setSecret(null)
    const { data, error } = await supabase.rpc('admin_create_grant', {
      p_label: form.label.trim(),
      p_role: form.role,
      p_scope: {},
      p_expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      p_email: null,
    })
    if (error) { setError(error.message); return }
    setSecret({ kind: 'link', value: accessLink(data.token) })
    setForm({ label: '', role: form.role, expires_at: '' })
    load()
  }

  async function createAccount(e) {
    e.preventDefault()
    setError(null); setSecret(null)
    const scope = buildScope({
      readOnly: acct.readOnly,
      allowedTabs: acct.allowedTabs.split(',').map((t) => t.trim()).filter(Boolean),
    })
    const data = await callEdge('access-account', {
      action: 'create', role: acct.role, label: acct.label.trim(), email: acct.email.trim(), scope,
    })
    if (!data) return
    setSecret({ kind: 'password', value: `${data.email} · ${data.password}` })
    setAcct({ label: '', role: acct.role, email: '', readOnly: false, allowedTabs: '' })
    load()
  }

  async function resetPassword(g) {
    setError(null); setSecret(null)
    const data = await callEdge('access-account', { action: 'reset_password', grant_id: g.id })
    if (!data) return
    setSecret({ kind: 'password', value: `${g.email} · ${data.password}` })
  }

  async function revoke(g) {
    setError(null)
    if (usesEdgeRevoke(g.auth_kind)) {
      const data = await callEdge('access-admin', { grant_id: g.id })
      if (data) load()
    } else {
      const { error } = await supabase.rpc('admin_revoke_grant', { p_grant_id: g.id })
      if (error) setError(error.message); else load()
    }
  }

  async function regenerate(id) {
    setError(null); setSecret(null)
    const { data, error } = await supabase.rpc('admin_regenerate_grant_token', { p_grant_id: id })
    if (error) { setError(error.message); return }
    setSecret({ kind: 'link', value: accessLink(data.token) }); load()
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="card-glass p-4 space-y-3">
        <h3 className="font-display text-lg">Criar acesso por link</h3>
        <div className="flex flex-wrap gap-3">
          <input required value={form.label} onChange={e => setForm({ ...form, label: e.target.value })}
            placeholder="Nome (ex: FULANO)" className="bg-dark/50 border border-white/10 rounded px-3 py-2" />
          <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
            className="bg-dark/50 border border-white/10 rounded px-3 py-2">
            {LINK_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <input type="datetime-local" value={form.expires_at}
            onChange={e => setForm({ ...form, expires_at: e.target.value })}
            className="bg-dark/50 border border-white/10 rounded px-3 py-2" />
          <button className="glow-cyan rounded px-4 py-2 font-mono">Gerar link</button>
        </div>
      </form>

      <form onSubmit={createAccount} className="card-glass p-4 space-y-3">
        <h3 className="font-display text-lg">Criar conta (login por senha)</h3>
        <div className="flex flex-wrap gap-3">
          <input required value={acct.label} onChange={e => setAcct({ ...acct, label: e.target.value })}
            placeholder="Nome (ex: FULANO)" className="bg-dark/50 border border-white/10 rounded px-3 py-2" />
          <select value={acct.role} onChange={e => setAcct({ ...acct, role: e.target.value })}
            className="bg-dark/50 border border-white/10 rounded px-3 py-2">
            {PASSWORD_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <input required type="email" value={acct.email} autoComplete="off"
            onChange={e => setAcct({ ...acct, email: e.target.value })}
            placeholder="email@exemplo.com" className="bg-dark/50 border border-white/10 rounded px-3 py-2" />
          <button className="glow-cyan rounded px-4 py-2 font-mono">Criar conta</button>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm text-white/70">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={acct.readOnly}
              onChange={e => setAcct({ ...acct, readOnly: e.target.checked })} />
            somente leitura
          </label>
          <input value={acct.allowedTabs} onChange={e => setAcct({ ...acct, allowedTabs: e.target.value })}
            placeholder="abas (ex: results, payments)"
            className="bg-dark/50 border border-white/10 rounded px-3 py-2 flex-1 min-w-[12rem]" />
          <span className="text-white/30 font-mono text-xs">scope é armazenado; aplicado na SP3</span>
        </div>
      </form>

      {secret && (
        <div className="text-sm font-mono break-all bg-cyan/10 border border-cyan/30 rounded p-2">
          {secret.value}
          <button type="button" onClick={() => navigator.clipboard?.writeText(secret.value)}
            className="ml-2 text-electric underline">copiar</button>
          <p className="text-gold mt-1">
            {secret.kind === 'password'
              ? 'Copie a senha agora — ela não será mostrada de novo.'
              : 'Copie o link agora — o token não será mostrado de novo.'}
          </p>
        </div>
      )}
      {error && <p className="text-hot text-sm">{error}</p>}

      <div className="card-glass p-4">
        <h3 className="font-display text-lg mb-3">Acessos</h3>
        {loading ? <p className="text-white/50">Carregando…</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-white/50 text-left">
              <th className="py-1">Nome</th><th>Papel</th><th>Tipo</th><th>Expira</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              {grants.map(g => (
                <tr key={g.id} className="border-t border-white/5">
                  <td className="py-2">{g.label}</td>
                  <td>{g.role}</td>
                  <td className="text-white/60">{grantKind(g.auth_kind)}</td>
                  <td>{g.expires_at ? new Date(g.expires_at).toLocaleString('pt-BR') : '—'}</td>
                  <td className={g.active ? 'text-cyan' : 'text-hot'}>{g.active ? 'ativo' : 'inativo'}</td>
                  <td className="text-right space-x-2">
                    {g.auth_kind === 'password'
                      ? (g.active && <button onClick={() => resetPassword(g)} className="text-electric underline">resetar senha</button>)
                      : <button onClick={() => regenerate(g.id)} className="text-electric underline">novo link</button>}
                    {g.active && <button onClick={() => revoke(g)} className="text-hot underline">revogar</button>}
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

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build succeeds, no unused-import/syntax errors.

- [ ] **Step 3: Run the full unit suite (no regressions)**

Run: `npx vitest run`
Expected: PASS (existing suites + the two new helper suites).

- [ ] **Step 4: Commit**

```bash
git add src/admin/AdminAccess.jsx
git commit -m "feat(auth): admin UI for password accounts (SP1)"
```

---

## Integration (main-thread, gated — NOT a subagent task)

Run after all 5 tasks are reviewed. Prod is `qshrzfahotmjshtjuvno`; backend (migration + edge) is applied manually BEFORE the frontend merges so the UI works on deploy.

- [ ] **1. Apply the migration** via Supabase MCP `apply_migration` (`phase3_password_accounts`). Verify:
  - `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname IN ('access_grants_auth_kind_check','access_grants_password_shape_check');` → both present, `password` allowed.
  - `SELECT is_nullable FROM information_schema.columns WHERE table_name='access_grants' AND column_name='token_hash';` → `YES`.
- [ ] **2. Deploy** the `access-account` edge function. Match `access-admin`'s `verify_jwt` setting (the function self-gates on the caller JWT regardless).
- [ ] **3. Tracer smoke (FOUNDATION GATE — before trusting/merging the UI).** As an existing admin session token (or via a short-lived admin JWT), POST `access-account {action:create, role:'viewer', label:'__smoke__', email:'<unique>+smoke@hackiasc.com', scope:{read_only:true}}`. Then verify, via MCP:
  - `auth.users` for that email has `raw_app_meta_data->>'role'='viewer'` and a non-null `grant_id`.
  - `access_grants` row: `auth_kind='password'`, `token_hash IS NULL`, `supabase_user_id` = that user id.
  - (Thorough) `curl` gotrue `/auth/v1/token?grant_type=password` with the returned creds → JWT → call an RPC like `is_admin_or_viewer()` (`/rest/v1/rpc/...`) with that JWT → `true` (proves app_metadata → JWT → RLS).
  - Then `reset_password` → confirm a new password logs in and the old one fails.
  - Then revoke via `access-admin {grant_id}` → confirm the backing user is gone (`auth.users` row absent), `revoked_at` set, and the password no longer logs in.
  - **Clean up** any residue (the revoke deletes the user; delete the `__smoke__` grant row).
  - **SP2 flag (record, do not act):** the magic-link `verifyOtp` exchange remains unproven (0/17 grants) — SP2 must tracer-bullet it before mentor/juror cutover.
- [ ] **4. Regression gate:** `npx vitest run` + `npm run build` green.
- [ ] **5. Open a PR** for the frontend + committed migration/edge source. **Gate:** run `/pre-deploy-verify` (per CLAUDE.md); resolve any Critical/High before merge. Merge to `master` auto-deploys the frontend (the backend is already live from steps 1–2).
- [ ] **6. Post-deploy manual E2E:** admin creates a real `viewer` account → log in (incognito) with the show-once password → reach the panel → admin "resetar senha" → re-login with the new password → admin "revogar" → login denied. Clean up the test account.

---

## Notes for the executor
- **Subagents must not touch prod.** Tasks 1 & 4 write files only; all prod application is the main-thread Integration section.
- CRLF repo: edit files directly (LLM unified diffs fail `git apply` here).
- Keep `{}`/empty scope == unrestricted everywhere. SP1 stores scope; it is **not** enforced (SP3).
- A changelog doc under `docs/changelog/` should be written when SP1 ships (per repo convention).
