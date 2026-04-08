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

// M2: Simple in-memory rate limiter per IP (5 requests per minute)
const rateMap = new Map<string, number[]>()

function checkRate(ip: string, limit = 5, windowMs = 60000): boolean {
  const now = Date.now()
  const hits = (rateMap.get(ip) || []).filter(t => now - t < windowMs)
  if (hits.length >= limit) return false
  hits.push(now)
  rateMap.set(ip, hits)
  return true
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req)

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // M2: Rate limiting per IP
  const clientIp = req.headers.get('x-forwarded-for') || 'unknown'
  if (!checkRate(clientIp)) {
    return new Response(
      JSON.stringify({ error: 'Too many requests — try again in a minute' }),
      { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    // C4: Ignore the `amount` field from request body — price is determined server-side
    const { registration_id, email, full_name, description } = await req.json()

    if (!registration_id || !email) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: registration_id, email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const mpAccessToken = Deno.env.get('MP_ACCESS_TOKEN')
    if (!mpAccessToken) {
      return new Response(
        JSON.stringify({ error: 'MP_ACCESS_TOKEN not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const siteUrl = Deno.env.get('SITE_URL') || 'https://hackiasc.com'
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const webhookUrl = `${supabaseUrl}/functions/v1/mp-webhook`

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // C4 + C6: Use atomic RPC to claim early bird slot — eliminates race condition
    // The RPC handles all early bird logic atomically and returns true if early bird was applied
    const { error: rpcError } = await supabase.rpc('claim_early_bird_slot', {
      p_reg_id: registration_id,
    })

    if (rpcError) {
      console.error('claim_early_bird_slot error:', rpcError)
      return new Response(
        JSON.stringify({ error: 'Failed to determine ticket price' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch the registration after the RPC to get the final authoritative price
    const { data: reg, error: regError } = await supabase
      .from('registrations')
      .select('ticket_price, ticket_tier')
      .eq('id', registration_id)
      .single()

    if (regError || !reg) {
      return new Response(
        JSON.stringify({ error: 'Registration not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Server-side authoritative price — never trust client-supplied amount
    const effectiveAmount = reg.ticket_price

    // Create Mercado Pago preference
    const preference = {
      items: [
        {
          id: registration_id,
          title: description || 'Inscrição — AI Venture Hackathon Blumenau 2026',
          currency_id: 'BRL',
          quantity: 1,
          unit_price: effectiveAmount / 100, // amount in cents, MP expects BRL
        },
      ],
      payer: {
        email,
        name: full_name || '',
      },
      back_urls: {
        success: `${siteUrl}/#pagamento-sucesso`,
        failure: `${siteUrl}/#pagamento-erro`,
        pending: `${siteUrl}/#pagamento-pendente`,
      },
      auto_return: 'approved',
      notification_url: webhookUrl,
      external_reference: registration_id,
      statement_descriptor: 'HACKIA SC',
      payment_methods: {
        excluded_payment_types: [
          { id: 'ticket' }, // Exclude boleto — we handle PIX separately
        ],
        installments: 1, // No installments for event tickets
      },
    }

    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mpAccessToken}`,
      },
      body: JSON.stringify(preference),
    })

    if (!mpResponse.ok) {
      const errorData = await mpResponse.text()
      console.error('MP API error:', errorData)
      return new Response(
        JSON.stringify({ error: 'Failed to create payment preference' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const mpData = await mpResponse.json()

    // Store preference ID in registration for tracking
    await supabase
      .from('registrations')
      .update({ payment_notes: `mp_preference:${mpData.id}` })
      .eq('id', registration_id)

    // Audit log
    await supabase.from('audit_log').insert({
      action: 'payment.preference_created',
      actor_type: 'system',
      actor_email: email,
      target_table: 'registrations',
      target_id: registration_id,
      target_email: email,
      new_data: { preference_id: mpData.id, amount: effectiveAmount, ticket_tier: reg.ticket_tier },
      metadata: { full_name: full_name || null },
    })

    return new Response(
      JSON.stringify({
        init_point: mpData.init_point,
        preference_id: mpData.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const corsHeaders = getCorsHeaders(req)
    console.error('Error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
