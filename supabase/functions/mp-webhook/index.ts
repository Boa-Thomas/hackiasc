import { createClient } from 'npm:@supabase/supabase-js@2'

// H1: Server-to-server webhook — no CORS needed

// C2: Verify Mercado Pago webhook signature
async function verifyMpSignature(req: Request, body: { data?: { id?: string } }): Promise<boolean> {
  const secret = Deno.env.get('MP_WEBHOOK_SECRET')

  if (!secret) {
    console.error('MP_WEBHOOK_SECRET not configured — rejecting request for safety')
    return false
  }

  const xSignature = req.headers.get('x-signature')
  const xRequestId = req.headers.get('x-request-id')

  if (!xSignature || !xRequestId) {
    console.warn('Missing x-signature or x-request-id headers')
    return false
  }

  // Parse ts= and v1= from x-signature header
  const parts = Object.fromEntries(
    xSignature.split(',').map(p => p.split('=') as [string, string])
  )
  const ts = parts['ts']
  const v1 = parts['v1']

  if (!ts || !v1) {
    console.warn('Invalid x-signature format')
    return false
  }

  // Build the template string as per MP docs
  const dataId = body.data?.id ?? ''
  const template = `id:${dataId};request-id:${xRequestId};ts:${ts};`

  // HMAC-SHA256 using Web Crypto API (available in Deno)
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(template))
  const computed = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  if (computed !== v1) {
    console.warn('Signature mismatch — possible replay or spoofed request')
    return false
  }

  return true
}

Deno.serve(async (req: Request) => {
  // MP sends GET for endpoint verification — allow without signature check
  if (req.method === 'GET') {
    return new Response('ok', { status: 200 })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const body = await req.json()

    // C2: Verify signature before processing any business logic
    const signatureValid = await verifyMpSignature(req, body)
    if (!signatureValid) {
      return new Response('Unauthorized', { status: 401 })
    }

    // MP sends different notification types — we only care about 'payment'
    if (body.type !== 'payment' && body.action !== 'payment.created' && body.action !== 'payment.updated') {
      return new Response('ok', { status: 200 })
    }

    // Extract payment ID from notification
    const paymentId = body.data?.id
    if (!paymentId) {
      console.error('No payment ID in webhook body:', body)
      return new Response('ok', { status: 200 })
    }

    const mpAccessToken = Deno.env.get('MP_ACCESS_TOKEN')
    if (!mpAccessToken) {
      console.error('MP_ACCESS_TOKEN not configured')
      return new Response('Server error', { status: 500 })
    }

    // Fetch payment details from MP to verify status
    const paymentResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: { 'Authorization': `Bearer ${mpAccessToken}` },
      }
    )

    if (!paymentResponse.ok) {
      console.error('Failed to fetch payment:', await paymentResponse.text())
      return new Response('ok', { status: 200 })
    }

    const payment = await paymentResponse.json()
    const registrationId = payment.external_reference

    if (!registrationId) {
      console.error('No external_reference in payment:', paymentId)
      return new Response('ok', { status: 200 })
    }

    // Map MP status to our payment_status
    let paymentStatus: string
    switch (payment.status) {
      case 'approved':
        paymentStatus = 'confirmed'
        break
      case 'rejected':
      case 'cancelled':
      case 'refunded':
      case 'charged_back':
        paymentStatus = 'cancelled'
        break
      default:
        // pending, in_process, in_mediation — keep as pending
        paymentStatus = 'pending'
    }

    // Update registration in Supabase using service role (bypass RLS)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // #59: Validate registrationId is a UUID before touching the DB
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
    if (!uuidRegex.test(registrationId)) {
      console.error('Invalid registrationId format (not a UUID):', registrationId, 'for payment:', paymentId)
      return new Response('ok', { status: 200 })
    }

    // For team registrations, update all members with the same team_name
    // #34: Include payment_status for idempotency check
    // #59: Destructure error from SELECT
    const { data: registration, error: regSelectError } = await supabase
      .from('registrations')
      .select('team_name, inscription_modality, payment_status')
      .eq('id', registrationId)
      .single()

    if (regSelectError) {
      console.error('Error fetching registration:', registrationId, regSelectError)
    }

    // #34: Guard-based idempotency — if the row is already at the target status,
    // skip the UPDATE and skip writing a duplicate audit_log entry.
    // Combined with the #131 guards below, reprocessing is a true no-op.
    if (registration?.payment_status === paymentStatus) {
      console.log(`Payment ${paymentId} already at status "${paymentStatus}" for registration ${registrationId} — skipping (idempotent)`)
      return new Response('ok', { status: 200 })
    }

    // #58: Only include payment_confirmed_at when confirming — never null it out
    // #131: Conditional WHERE guards prevent confirmed→pending downgrade
    const updateData = {
      payment_status: paymentStatus,
      ...(paymentStatus === 'confirmed' ? { payment_confirmed_at: new Date().toISOString() } : {}),
      payment_notes: `mp_payment:${paymentId} | status:${payment.status}`,
    }

    if (registration?.inscription_modality === 'team' && registration?.team_name) {
      // Update all team members
      let teamQuery = supabase
        .from('registrations')
        .update(updateData)
        .eq('team_name', registration.team_name)

      if (paymentStatus === 'pending') {
        // #131: Late webhook must not downgrade an already-confirmed or cancelled row
        teamQuery = teamQuery.not('payment_status', 'in', '("confirmed","cancelled")')
      } else if (paymentStatus === 'confirmed') {
        // Allow upgrade to confirmed, but never resurrect an admin-cancelled row
        teamQuery = teamQuery.neq('payment_status', 'cancelled')
      } else {
        // paymentStatus === 'cancelled' — apply to all (except already cancelled)
        teamQuery = teamQuery.neq('payment_status', 'cancelled')
      }

      await teamQuery
    } else {
      // Update single registration
      let singleQuery = supabase
        .from('registrations')
        .update(updateData)
        .eq('id', registrationId)

      if (paymentStatus === 'pending') {
        // #131: Late webhook must not downgrade an already-confirmed or cancelled row
        singleQuery = singleQuery.not('payment_status', 'in', '("confirmed","cancelled")')
      } else if (paymentStatus === 'confirmed') {
        // Allow upgrade to confirmed, but never resurrect an admin-cancelled row
        singleQuery = singleQuery.neq('payment_status', 'cancelled')
      } else {
        // paymentStatus === 'cancelled' — apply unless already cancelled
        singleQuery = singleQuery.neq('payment_status', 'cancelled')
      }

      await singleQuery
    }

    console.log(`Payment ${paymentId} → registration ${registrationId} → ${paymentStatus}`)

    // Audit log
    await supabase.from('audit_log').insert({
      action: paymentStatus === 'confirmed' ? 'payment.confirmed_webhook' : `payment.${paymentStatus}_webhook`,
      actor_type: 'system',
      target_table: 'registrations',
      target_id: registrationId,
      new_data: { payment_status: paymentStatus, mp_payment_id: paymentId, mp_status: payment.status },
      metadata: registration?.team_name ? { team_name: registration.team_name } : null,
    })

    return new Response('ok', { status: 200 })
  } catch (err) {
    console.error('Webhook error:', err)
    return new Response('ok', { status: 200 }) // Always return 200 to MP to avoid retries
  }
})
