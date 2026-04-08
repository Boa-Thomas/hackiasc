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

// Event start date (from edital)
const EVENT_START = new Date('2026-05-29T08:00:00-03:00')

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
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // M2: Rate limiting per IP
  const clientIp = req.headers.get('x-forwarded-for') || 'unknown'
  if (!checkRate(clientIp)) {
    return new Response(
      JSON.stringify({ error: 'Too many requests — try again in a minute' }),
      { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // C3: Require authentication — extract and verify Bearer token
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // C3: Verify the JWT using the service role client
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify admin role (uses app_metadata which cannot be self-modified by users)
    const userRole = user.app_metadata?.role
    if (userRole !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Forbidden — admin role required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { registration_id, dry_run } = await req.json()

    if (!registration_id) {
      return new Response(
        JSON.stringify({ error: 'Missing registration_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch registration — include is_team_leader for M4 check
    const { data: reg, error: regError } = await supabase
      .from('registrations')
      .select('id, full_name, email, payment_status, payment_confirmed_at, payment_notes, ticket_price, ticket_tier, team_name, inscription_modality, is_team_leader')
      .eq('id', registration_id)
      .single()

    if (regError || !reg) {
      return new Response(
        JSON.stringify({ error: 'Registration not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // H4: Idempotency — prevent double refund
    if (reg.payment_status === 'cancelled') {
      return new Response(
        JSON.stringify({ error: 'Already cancelled/refunded' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
            'Authorization': `Bearer ${Deno.env.get('MP_ACCESS_TOKEN')}`,
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

    const updateData = {
      payment_status: 'cancelled' as const,
      payment_notes: refundNote,
    }

    // M4: Team refund — only the team leader triggers the full team cancellation
    const isTeam = reg.inscription_modality === 'team' && !!reg.team_name
    const isLeader = reg.is_team_leader === true

    if (isTeam && isLeader) {
      // Leader cancels → cancel the entire team
      await supabase
        .from('registrations')
        .update(updateData)
        .eq('team_name', reg.team_name)
    } else {
      // Individual cancellation or non-leader team member cancels only themselves
      await supabase
        .from('registrations')
        .update(updateData)
        .eq('id', registration_id)
    }

    const needsManualRefund = !mpPaymentId && refund.amount > 0

    // Audit log
    await supabase.from('audit_log').insert({
      action: 'payment.refund_processed',
      actor_type: 'user',
      actor_email: user.email,
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
        team_cancelled: isTeam && isLeader,
        triggered_by_leader: isLeader,
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
        team_cancelled: isTeam && isLeader,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const corsHeaders = getCorsHeaders(req)
    console.error('Refund error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
