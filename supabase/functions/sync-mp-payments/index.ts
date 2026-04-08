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

// Rate limiter: 2 requests per minute (manual sync only)
const rateMap = new Map<string, number[]>()

function checkRate(ip: string, limit = 2, windowMs = 60000): boolean {
  const now = Date.now()
  const hits = (rateMap.get(ip) || []).filter(t => now - t < windowMs)
  if (hits.length >= limit) return false
  hits.push(now)
  rateMap.set(ip, hits)
  if (rateMap.size > 100) {
    for (const [key, val] of rateMap) {
      if (val.every(t => now - t >= windowMs)) rateMap.delete(key)
    }
  }
  return true
}

// UUID v4 validation
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isValidUUID(s: unknown): s is string {
  return typeof s === 'string' && UUID_RE.test(s)
}

// Detect auth mode: service_role key (cron) or user JWT (admin button)
async function detectAuth(
  req: Request,
  supabase: ReturnType<typeof createClient>
): Promise<{ valid: boolean; mode?: 'cron' | 'user'; actor?: string }> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return { valid: false }

  const token = authHeader.replace('Bearer ', '')

  // Check if service role key (pg_cron / pg_net calls)
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (token === serviceKey) {
    return { valid: true, mode: 'cron', actor: 'system' }
  }

  // Verify as user JWT
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return { valid: false }
  return { valid: true, mode: 'user', actor: user.email ?? 'unknown' }
}

// Fetch all payments from MP API with pagination
async function fetchAllPayments(mpToken: string): Promise<any[]> {
  const all: any[] = []
  let offset = 0
  const limit = 30 // MP max per page

  while (true) {
    const url = new URL('https://api.mercadopago.com/v1/payments/search')
    url.searchParams.set('sort', 'date_created')
    url.searchParams.set('criteria', 'desc')
    url.searchParams.set('offset', String(offset))
    url.searchParams.set('limit', String(limit))

    const resp = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${mpToken}` },
    })

    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`MP API error ${resp.status}: ${text}`)
    }

    const data = await resp.json()
    all.push(...(data.results ?? []))

    if (offset + limit >= (data.paging?.total ?? 0)) break
    offset += limit

    // Small delay to respect MP rate limits
    if (offset > 0) await new Promise(r => setTimeout(r, 200))
  }

  return all
}

// Map MP payment response to mp_payments row
function mapPayment(p: any) {
  const fees: Record<string, number> = {}
  for (const fd of p.fee_details ?? []) {
    fees[fd.type] = Math.round((fd.amount ?? 0) * 100)
  }

  return {
    payment_id: p.id,
    registration_id: isValidUUID(p.external_reference) ? p.external_reference : null,
    status: p.status,
    gross_amount: Math.round((p.transaction_amount ?? 0) * 100),
    net_amount: Math.round((p.transaction_details?.net_received_amount ?? 0) * 100),
    marketplace_fee: fees['mercadopago_fee'] ?? 0,
    financing_fee: fees['financing_fee'] ?? 0,
    shipping_fee: fees['shipping_fee'] ?? 0,
    discount_fee: fees['discount_fee'] ?? 0,
    payment_method: p.payment_method_id ?? null,
    payment_type: p.payment_type_id ?? null,
    payer_email: p.payer?.email ?? null,
    date_approved: p.date_approved ?? null,
    date_created: p.date_created ?? null,
    synced_at: new Date().toISOString(),
    raw_data: p,
    updated_at: new Date().toISOString(),
  }
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req)

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    // Auth: service_role key (cron) or user JWT (admin)
    const auth = await detectAuth(req, supabase)
    if (!auth.valid) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Rate limit only for user-initiated syncs (not cron)
    if (auth.mode === 'user') {
      const clientIp = req.headers.get('x-forwarded-for') || 'unknown'
      if (!checkRate(clientIp)) {
        return new Response(
          JSON.stringify({ error: 'Too many requests — try again in a minute' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Staleness guard: if is_syncing is true for > 5 min, allow new sync
    const { data: syncStatus } = await supabase
      .from('mp_sync_status')
      .select('*')
      .eq('id', 1)
      .single()

    if (syncStatus?.is_syncing) {
      const staleThreshold = 5 * 60 * 1000 // 5 minutes
      const updatedAt = new Date(syncStatus.updated_at).getTime()
      if (Date.now() - updatedAt < staleThreshold) {
        return new Response(
          JSON.stringify({ error: 'Sync already in progress' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Mark sync as started
    await supabase
      .from('mp_sync_status')
      .update({ is_syncing: true, last_sync_error: null, updated_at: new Date().toISOString() })
      .eq('id', 1)

    const mpAccessToken = Deno.env.get('MP_ACCESS_TOKEN')
    if (!mpAccessToken) {
      await supabase
        .from('mp_sync_status')
        .update({ is_syncing: false, last_sync_error: 'MP_ACCESS_TOKEN not configured', updated_at: new Date().toISOString() })
        .eq('id', 1)

      return new Response(
        JSON.stringify({ error: 'MP_ACCESS_TOKEN not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch all payments from MP
    const payments = await fetchAllPayments(mpAccessToken)
    const rows = payments.map(mapPayment)

    // Batch upsert in chunks of 50
    let synced = 0
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50)
      const { error: upsertError } = await supabase
        .from('mp_payments')
        .upsert(batch, { onConflict: 'payment_id' })

      if (upsertError) {
        throw new Error(`Upsert error at batch ${i}: ${upsertError.message}`)
      }
      synced += batch.length
    }

    // Calculate totals for response
    const approved = rows.filter(r => r.status === 'approved')
    const totalGross = approved.reduce((s, r) => s + r.gross_amount, 0)
    const totalNet = approved.reduce((s, r) => s + r.net_amount, 0)
    const totalFees = approved.reduce(
      (s, r) => s + r.marketplace_fee + r.financing_fee + r.shipping_fee + r.discount_fee, 0
    )

    // Update sync status
    await supabase
      .from('mp_sync_status')
      .update({
        is_syncing: false,
        last_sync_at: new Date().toISOString(),
        last_sync_count: synced,
        last_sync_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)

    // Audit log
    const auditAction = auth.mode === 'cron' ? 'mp_payments.sync' : 'mp_payments.manual_sync'
    await supabase.from('audit_log').insert({
      action: auditAction,
      actor_type: auth.mode === 'cron' ? 'system' : 'admin',
      actor_email: auth.actor,
      target_table: 'mp_payments',
      new_data: { synced, total_gross: totalGross, total_net: totalNet, total_fees: totalFees },
      metadata: { approved_count: approved.length, total_fetched: payments.length },
    })

    const result = {
      synced,
      total_fetched: payments.length,
      approved_count: approved.length,
      total_gross: totalGross,
      total_net: totalNet,
      total_fees: totalFees,
    }

    console.log(`MP sync complete: ${JSON.stringify(result)}`)

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Sync error:', err)

    // Update sync status with error
    await supabase
      .from('mp_sync_status')
      .update({
        is_syncing: false,
        last_sync_error: err instanceof Error ? err.message : 'Unknown error',
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)

    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
