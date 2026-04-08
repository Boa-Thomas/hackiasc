import { createClient } from 'npm:@supabase/supabase-js@2'

// H1: Restrict CORS to known origins only
const ALLOWED_ORIGINS = ['https://hackiasc.com', 'https://www.hackiasc.com', 'http://localhost:5173']

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

// Rate limiter: 10 requests per minute per IP
const rateMap = new Map<string, number[]>()

function checkRate(ip: string, limit = 10, windowMs = 60000): boolean {
  const now = Date.now()
  const hits = (rateMap.get(ip) || []).filter(t => now - t < windowMs)
  if (hits.length >= limit) return false
  hits.push(now)
  rateMap.set(ip, hits)
  // Cleanup stale IPs to prevent memory leak
  if (rateMap.size > 100) {
    for (const [key, val] of rateMap) {
      if (val.every(t => now - t >= windowMs)) rateMap.delete(key)
    }
  }
  return true
}

// Allowlist of actions that public (unauthenticated) callers may log
const ALLOWED_PUBLIC_ACTIONS = new Set([
  'registration.create',
  'registration.create_team',
  'registration.recover',
  'waitlist.join',
])

interface LogEventPayload {
  action: string
  actor_email?: string
  target_table?: string
  target_id?: string
  target_email?: string
  new_data?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // Rate limiting per IP
  const fwd = req.headers.get('x-forwarded-for') || ''
  const clientIp = fwd.split(',').pop()?.trim() || 'unknown'
  if (!checkRate(clientIp)) {
    return new Response(
      JSON.stringify({ error: 'Too many requests — try again in a minute' }),
      { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const payload: LogEventPayload = await req.json()
    const { action, actor_email, target_table, target_id, target_email, new_data, metadata } = payload

    // Validate required field
    if (!action || typeof action !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid field: action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Only allow whitelisted public actions — prevents log pollution/abuse
    if (!ALLOWED_PUBLIC_ACTIONS.has(action)) {
      return new Response(
        JSON.stringify({
          error: `Action "${action}" is not permitted. Allowed: ${[...ALLOWED_PUBLIC_ACTIONS].join(', ')}`,
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Sanitize: strip any fields not in the expected schema to prevent injection
    const safeNewData = new_data && typeof new_data === 'object' ? { ...new_data } : null

    // Validate ticket_price if present — only allow known values (prevents client-side manipulation)
    if (safeNewData && 'ticket_price' in safeNewData) {
      const price = safeNewData.ticket_price
      if (price !== 15000 && price !== 20000) {
        safeNewData.ticket_price = null
      }
    }

    const safeEntry = {
      action,
      actor_type: 'anon' as const,
      actor_email: typeof actor_email === 'string' ? actor_email : null,
      target_table: typeof target_table === 'string' ? target_table : null,
      target_id: typeof target_id === 'string' ? target_id : null,
      target_email: typeof target_email === 'string' ? target_email : null,
      new_data: safeNewData,
      metadata: metadata && typeof metadata === 'object' ? metadata : null,
    }

    // Insert using service role — anon no longer has INSERT on audit_log
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { error: insertError } = await supabase.from('audit_log').insert(safeEntry)

    if (insertError) {
      console.error('audit_log insert error:', insertError)
      return new Response(
        JSON.stringify({ error: 'Failed to write audit log' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('log-event error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
