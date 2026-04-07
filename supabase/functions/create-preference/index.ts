import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { registration_id, email, full_name, amount, description } = await req.json()

    if (!registration_id || !email || !amount) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: registration_id, email, amount' }),
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

    // Check early bird expiration — if expired, use regular price (R$200)
    const REGULAR_PRICE = 20000
    let effectiveAmount = amount
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: reg } = await supabase
      .from('registrations')
      .select('price_expires_at, ticket_price')
      .eq('id', registration_id)
      .single()

    if (reg?.price_expires_at && new Date(reg.price_expires_at) < new Date()) {
      // Early bird expired — update to regular price
      effectiveAmount = REGULAR_PRICE
      await supabase
        .from('registrations')
        .update({ ticket_price: REGULAR_PRICE, ticket_tier: 'regular' })
        .eq('id', registration_id)
    }

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

    return new Response(
      JSON.stringify({
        init_point: mpData.init_point,
        preference_id: mpData.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
