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
// Hybrid scope schema (stored in SP1, enforced in SP3). Validate the SHAPE so a
// malformed/over-broad scope cannot be persisted now and silently inherited by
// SP3. Tab/team/idea VALUES are not whitelisted here (SP3 owns the canonical sets
// and treats unknown entries as no-ops, never deny).
const SCOPE_KEYS = ['read_only', 'allowed_tabs', 'team_ids', 'idea_ids']
function validScope(scope: unknown): boolean {
  if (typeof scope !== 'object' || scope === null || Array.isArray(scope)) return false
  for (const [k, v] of Object.entries(scope)) {
    if (!SCOPE_KEYS.includes(k)) return false
    if (k === 'read_only') {
      if (typeof v !== 'boolean') return false
    } else if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) {
      return false
    }
  }
  return true
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
    if (!validScope(scope)) return json({ error: 'invalid_scope' }, 400, origin)

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
