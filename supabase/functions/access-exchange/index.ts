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

  // Validate + rate-limit via the unified resolver (hash lookup, expiry/revocation,
  // 5/min per token-hash). Keeps validation DRY and rate-limited in one place.
  const { data: resolved, error: rErr } = await admin.rpc('grant_resolve', { p_token: token })
  if (rErr || !resolved) {
    const msg = (rErr?.message || '').includes('rate_limited') ? 'rate_limited' : 'invalid_grant'
    return json({ error: msg }, msg === 'rate_limited' ? 429 : 401, origin)
  }

  const role = resolved.role as string
  const grantId = resolved.grant_id as string
  const scope = resolved.scope ?? {}

  if (resolved.auth_kind === 'rpc_token') {
    // Mentor/juror: no Supabase session; client stores the token and routes.
    return json({ rpc_token: true, role }, 200, origin)
  }

  // jwt_exchange: ensure a per-grant backing user with the right role/scope.
  const email = `grant+${grantId}@hackiasc.internal`
  const appMeta = { role, grant_id: grantId, scope }

  // Look up the stored backing user id (avoids re-creating on every exchange).
  const { data: grantRow } = await admin
    .from('access_grants')
    .select('supabase_user_id')
    .eq('id', grantId)
    .maybeSingle()
  let userId = (grantRow?.supabase_user_id as string | null) ?? null

  if (!userId) {
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email, email_confirm: true, app_metadata: appMeta,
    })
    if (cErr || !created?.user) {
      // Likely already created in a prior attempt — find it (paginate generously).
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
      const found = list?.users?.find((u) => u.email === email)
      if (!found) return json({ error: 'provision_failed' }, 500, origin)
      userId = found.id
    } else {
      userId = created.user.id
    }
    await admin.from('access_grants').update({ supabase_user_id: userId }).eq('id', grantId)
  } else {
    // Keep role/scope current on the backing user.
    await admin.auth.admin.updateUserById(userId, { app_metadata: appMeta })
  }

  const { data: link, error: lErr } = await admin.auth.admin.generateLink({
    type: 'magiclink', email,
  })
  if (lErr || !link?.properties?.hashed_token) {
    return json({ error: 'link_failed' }, 500, origin)
  }
  return json({ hashed_token: link.properties.hashed_token, role }, 200, origin)
})
