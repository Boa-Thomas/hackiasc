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
