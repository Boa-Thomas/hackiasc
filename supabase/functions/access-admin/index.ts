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

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin)

  const url = Deno.env.get('SUPABASE_URL')!
  const svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // Server-side admin check on the CALLER's JWT (never trust the UI).
  const authz = req.headers.get('Authorization') ?? ''
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authz } },
    auth: { persistSession: false },
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
    .update({ revoked_at: new Date().toISOString(), supabase_user_id: null })
    .eq('id', grantId)
  return json({ ok: true }, 200, origin)
})
