import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Event start date (from edital)
const EVENT_START = new Date('2026-05-29T08:00:00-03:00')

/**
 * Calculate refund percentage based on edital rules (Cláusula 12):
 * - 12.1: Up to 7 days after purchase → 100% (CDC)
 * - 12.2: More than 10 days before event → 50%
 * - 12.2: 10 days or less before event → 0%
 * - 12.3: No-show → 0%
 */
function calculateRefund(
  paymentConfirmedAt: string,
  ticketPrice: number,
  now: Date = new Date()
): { percentage: number; amount: number; reason: string } {
  const confirmedDate = new Date(paymentConfirmedAt)
  const daysSincePurchase = Math.floor(
    (now.getTime() - confirmedDate.getTime()) / (1000 * 60 * 60 * 24)
  )
  const daysUntilEvent = Math.floor(
    (EVENT_START.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  )

  // CDC: full refund within 7 days of purchase
  if (daysSincePurchase <= 7) {
    return {
      percentage: 100,
      amount: ticketPrice,
      reason: `Reembolso integral (CDC) — ${daysSincePurchase} dia(s) após a compra`,
    }
  }

  // More than 10 days before event: 50%
  if (daysUntilEvent > 10) {
    const amount = Math.round(ticketPrice / 2)
    return {
      percentage: 50,
      amount,
      reason: `Reembolso de 50% — ${daysUntilEvent} dias antes do evento`,
    }
  }

  // 10 days or less before event: no refund
  return {
    percentage: 0,
    amount: 0,
    reason: `Sem reembolso — menos de 10 dias antes do evento (${daysUntilEvent} dias)`,
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const { registration_id, dry_run } = await req.json()

    if (!registration_id) {
      return new Response(
        JSON.stringify({ error: 'Missing registration_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Fetch registration
    const { data: reg, error: regError } = await supabase
      .from('registrations')
      .select('id, full_name, email, payment_status, payment_confirmed_at, payment_notes, ticket_price, ticket_tier, team_name, inscription_modality')
      .eq('id', registration_id)
      .single()

    if (regError || !reg) {
      return new Response(
        JSON.stringify({ error: 'Registration not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (reg.payment_status !== 'confirmed') {
      return new Response(
        JSON.stringify({ error: `Cannot refund — status is "${reg.payment_status}", expected "confirmed"` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!reg.payment_confirmed_at) {
      return new Response(
        JSON.stringify({ error: 'Cannot calculate refund — no payment confirmation date' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Calculate refund
    const refund = calculateRefund(reg.payment_confirmed_at, reg.ticket_price)

    // dry_run: return refund calculation without executing
    if (dry_run) {
      return new Response(
        JSON.stringify({
          registration_id: reg.id,
          full_name: reg.full_name,
          ticket_price: reg.ticket_price,
          refund_amount: refund.amount,
          refund_percentage: refund.percentage,
          reason: refund.reason,
          dry_run: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Extract MP payment ID from payment_notes (format: "mp_payment:12345 | status:approved")
    const mpPaymentMatch = reg.payment_notes?.match(/mp_payment:(\d+)/)
    const mpPaymentId = mpPaymentMatch?.[1]
    let mpRefundResult: { success: boolean; id?: string; error?: string } | null = null

    // Attempt MP refund if we have a payment ID and refund amount > 0
    if (mpPaymentId && refund.amount > 0) {
      const mpAccessToken = Deno.env.get('MP_ACCESS_TOKEN')
      if (!mpAccessToken) {
        return new Response(
          JSON.stringify({ error: 'MP_ACCESS_TOKEN not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const refundBody = refund.percentage === 100
        ? {} // full refund — no body needed
        : { amount: refund.amount / 100 } // partial refund in BRL (not cents)

      const mpResponse = await fetch(
        `https://api.mercadopago.com/v1/payments/${mpPaymentId}/refunds`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mpAccessToken}`,
          },
          body: JSON.stringify(refundBody),
        }
      )

      if (mpResponse.ok) {
        const mpData = await mpResponse.json()
        mpRefundResult = { success: true, id: mpData.id?.toString() }
      } else {
        const mpError = await mpResponse.text()
        console.error('MP refund failed:', mpError)
        mpRefundResult = { success: false, error: mpError }
        // Don't block cancellation if MP refund fails — admin can handle manually
      }
    }

    // Build payment_notes with refund info
    const refundNote = [
      reg.payment_notes || '',
      `refund:${refund.percentage}%`,
      `refund_amount:${refund.amount}`,
      mpRefundResult?.success ? `mp_refund:${mpRefundResult.id}` : null,
      mpRefundResult && !mpRefundResult.success ? 'mp_refund:FAILED' : null,
      !mpPaymentId && refund.amount > 0 ? 'refund_method:manual' : null,
    ].filter(Boolean).join(' | ')

    // Update registration(s)
    const updateData = {
      payment_status: 'cancelled' as const,
      payment_notes: refundNote,
    }

    if (reg.inscription_modality === 'team' && reg.team_name) {
      await supabase
        .from('registrations')
        .update(updateData)
        .eq('team_name', reg.team_name)
    } else {
      await supabase
        .from('registrations')
        .update(updateData)
        .eq('id', registration_id)
    }

    const needsManualRefund = !mpPaymentId && refund.amount > 0

    // Audit log (skip for dry_run which was handled above)
    await supabase.from('audit_log').insert({
      action: 'payment.refund_processed',
      actor_type: 'system',
      target_table: 'registrations',
      target_id: registration_id,
      target_email: reg.email,
      old_data: { payment_status: 'confirmed', ticket_price: reg.ticket_price },
      new_data: { payment_status: 'cancelled', refund_amount: refund.amount, refund_percentage: refund.percentage },
      metadata: {
        full_name: reg.full_name,
        reason: refund.reason,
        mp_refund: mpRefundResult,
        needs_manual_refund: needsManualRefund,
        team_cancelled: reg.inscription_modality === 'team' && !!reg.team_name,
      },
    })

    return new Response(
      JSON.stringify({
        registration_id: reg.id,
        full_name: reg.full_name,
        email: reg.email,
        ticket_price: reg.ticket_price,
        refund_amount: refund.amount,
        refund_percentage: refund.percentage,
        reason: refund.reason,
        mp_refund: mpRefundResult,
        needs_manual_refund: needsManualRefund,
        team_cancelled: reg.inscription_modality === 'team' && !!reg.team_name,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Refund error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
