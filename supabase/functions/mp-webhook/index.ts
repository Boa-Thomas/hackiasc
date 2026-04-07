import { createClient } from 'npm:@supabase/supabase-js@2'

Deno.serve(async (req: Request) => {
  // MP sends both GET (for verification) and POST (for notifications)
  if (req.method === 'GET') {
    return new Response('ok', { status: 200 })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const body = await req.json()

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

    // For team registrations, update all members with the same team_name
    const { data: registration } = await supabase
      .from('registrations')
      .select('team_name, inscription_modality')
      .eq('id', registrationId)
      .single()

    const updateData = {
      payment_status: paymentStatus,
      payment_confirmed_at: paymentStatus === 'confirmed' ? new Date().toISOString() : null,
      payment_notes: `mp_payment:${paymentId} | status:${payment.status}`,
    }

    if (registration?.inscription_modality === 'team' && registration?.team_name) {
      // Update all team members
      await supabase
        .from('registrations')
        .update(updateData)
        .eq('team_name', registration.team_name)
    } else {
      // Update single registration
      await supabase
        .from('registrations')
        .update(updateData)
        .eq('id', registrationId)
    }

    console.log(`Payment ${paymentId} → registration ${registrationId} → ${paymentStatus}`)

    return new Response('ok', { status: 200 })
  } catch (err) {
    console.error('Webhook error:', err)
    return new Response('ok', { status: 200 }) // Always return 200 to MP to avoid retries
  }
})
