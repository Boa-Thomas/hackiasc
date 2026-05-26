import { createClient } from 'npm:@supabase/supabase-js@2'

// H1: Server-to-server webhook — no CORS needed

// Tolerance (in cents) for floating-point rounding when comparing MP amount (BRL)
// to ticket_price (cents). MP returns transaction_amount as a float in BRL, so a
// 1-cent slop after `Math.round(x * 100)` is acceptable; anything larger is a
// real discrepancy.
const AMOUNT_TOLERANCE_CENTS = 1

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

    // Categorize the MP status into an INTENT, not a 1:1 status map.
    //
    // A single registration can have MULTIPLE payments: a Pix QR expires unpaid
    // and the payer generates a new one (same external_reference). Treating every
    // notification as "last event wins" let an EXPIRED/cancelled charge that
    // arrived AFTER an approved one downgrade an already-paid registration to
    // cancelled (real incidents 2026-05: Jenyfer/Lucas/Jean — all had approved
    // Pix yet were flipped to cancelled by a later "expired" notification of an
    // earlier unpaid QR). So we map to intent instead:
    //   approved              -> confirm  (run the amount gate, set confirmed)
    //   refunded/charged_back -> reverse  (money actually returned: downgrade)
    //   everything else       -> ignore   (cancelled/rejected = charge that never
    //     succeeded; pending/in_process = still in flight). These MUST NOT
    //     overwrite the registration: it already reflects the best payment made.
    let intent: 'confirm' | 'reverse' | 'ignore'
    switch (payment.status) {
      case 'approved':
        intent = 'confirm'
        break
      case 'refunded':
      case 'charged_back':
        intent = 'reverse'
        break
      default:
        intent = 'ignore'
    }
    const paymentStatus = intent === 'confirm' ? 'confirmed' : 'cancelled'

    // Update registration in Supabase using service role (bypass RLS)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // For team registrations, update all members with the same team_name
    const { data: registration } = await supabase
      .from('registrations')
      .select('id, team_name, inscription_modality, ticket_price, payment_status, email')
      .eq('id', registrationId)
      .single()

    const updateData = {
      payment_status: paymentStatus,
      payment_confirmed_at: paymentStatus === 'confirmed' ? new Date().toISOString() : null,
      payment_notes: `mp_payment:${paymentId} | status:${payment.status}`,
    }

    const isTeam = registration?.inscription_modality === 'team' && !!registration?.team_name

    // Root-cause fix (2026-05): an 'ignore' event (a charge that never succeeded
    // — expired Pix QR, rejected card — or one still pending) must NOT touch the
    // registration. Previously these mapped to 'cancelled' and a later such event
    // flipped an already-confirmed registration to cancelled. We record it for
    // forensics and stop. The registration keeps whatever state its best payment
    // produced; only an 'approved' (confirm) or a real refund/chargeback
    // (reverse) changes payment_status from here on.
    if (intent === 'ignore') {
      await supabase.from('audit_log').insert({
        action: 'payment.ignored_webhook',
        actor_type: 'system',
        target_table: 'registrations',
        target_id: registrationId,
        target_email: registration?.email ?? null,
        new_data: {
          mp_payment_id: paymentId,
          mp_status: payment.status,
          current_payment_status: registration?.payment_status ?? null,
        },
        metadata: {
          reason: 'charge not successful (cancelled/rejected) or still in flight (pending) — registration status left unchanged',
          team_name: registration?.team_name ?? null,
          inscription_modality: registration?.inscription_modality ?? null,
        },
      })
      console.log(`Payment ${paymentId} (${payment.status}) → registration ${registrationId}: ignored (status unchanged)`)
      return new Response('ok', { status: 200 })
    }

    // #31: Validate transaction_amount against expected ticket_price total BEFORE
    // any UPDATE that confirms the registration. This is the financial gate that
    // prevents an attacker from manipulating the MP preference URL and paying R$1
    // for a confirmed ticket.
    //
    // We use payment.transaction_amount (gross BRL paid by payer) rather than
    // payment.transaction_details.net_received_amount because the latter has MP's
    // marketplace fees already deducted — that would always be less than
    // ticket_price and cause false mismatches. transaction_amount is the
    // face-value the payer authorized, which is what our ticket_price represents.
    if (paymentStatus === 'confirmed' && registration) {
      // Build expected total in cents:
      //   - team: sum of ticket_price of all active (non-cancelled) members of the team
      //   - individual: this registration's ticket_price
      let expectedCents = 0
      let activeMemberCount = 0

      if (isTeam) {
        const { data: activeMembers, error: membersErr } = await supabase
          .from('registrations')
          .select('id, ticket_price, payment_status')
          .eq('team_name', registration.team_name)
          .neq('payment_status', 'cancelled')

        if (membersErr) {
          console.error('Failed to fetch team members for amount validation:', membersErr)
          // Fail closed — don't confirm if we can't validate
          await supabase.from('audit_log').insert({
            action: 'payment.amount_validation_error',
            actor_type: 'system',
            target_table: 'registrations',
            target_id: registrationId,
            new_data: { mp_payment_id: paymentId, error: membersErr.message },
            metadata: { team_name: registration.team_name },
          })
          return new Response('ok', { status: 200 })
        }

        activeMemberCount = activeMembers?.length ?? 0
        expectedCents = (activeMembers ?? []).reduce(
          (sum, m) => sum + (m.ticket_price ?? 0),
          0
        )
      } else {
        expectedCents = registration.ticket_price ?? 0
        activeMemberCount = 1
      }

      // MP transaction_amount is in BRL (float). Convert to cents for comparison.
      const receivedCents = Math.round((payment.transaction_amount ?? 0) * 100)
      const diffCents = Math.abs(receivedCents - expectedCents)

      if (diffCents > AMOUNT_TOLERANCE_CENTS) {
        console.warn(
          `Amount mismatch on payment ${paymentId}: expected ${expectedCents} cents, received ${receivedCents} cents (diff ${diffCents})`
        )

        // Audit log — but do NOT confirm. Return 200 so MP does not retry forever.
        await supabase.from('audit_log').insert({
          action: 'payment.amount_mismatch',
          actor_type: 'system',
          target_table: 'registrations',
          target_id: registrationId,
          target_email: registration.email ?? null,
          new_data: {
            mp_payment_id: paymentId,
            mp_status: payment.status,
            expected_cents: expectedCents,
            received_cents: receivedCents,
            diff_cents: diffCents,
            transaction_amount_brl: payment.transaction_amount,
          },
          metadata: {
            inscription_modality: registration.inscription_modality,
            team_name: registration.team_name ?? null,
            active_member_count: activeMemberCount,
            reason: 'transaction_amount did not match sum of ticket_price for active members',
          },
        })

        return new Response('ok', { status: 200 })
      }
    }

    // #55: When confirming a team payment, never resurrect members who cancelled
    // individually. The .neq('payment_status', 'cancelled') filter preserves
    // cancellations regardless of how the leader's preference is paid.
    //
    // Edge case: if external_reference points at a registration whose own
    // payment_status is already 'cancelled' (e.g. a member cancelled then their
    // preference URL got paid somehow), the team UPDATE path still skips them
    // because of the same .neq filter — they will not be revived. For the
    // individual-update path below we add the same guard.
    let affectedRows = 0
    let updateError: { message: string } | null = null

    if (isTeam) {
      // Update all team members EXCEPT those who individually cancelled.
      // .select() returns the affected rows so we can audit the count.
      const { data: updated, error } = await supabase
        .from('registrations')
        .update(updateData)
        .eq('team_name', registration!.team_name)
        .neq('payment_status', 'cancelled')
        .select('id')
      affectedRows = updated?.length ?? 0
      updateError = error
    } else {
      // Individual update — also guard against confirming a cancelled record.
      // For pending/confirmed → fine. For cancelled → leave alone (return 200).
      const { data: updated, error } = await supabase
        .from('registrations')
        .update(updateData)
        .eq('id', registrationId)
        .neq('payment_status', 'cancelled')
        .select('id')
      affectedRows = updated?.length ?? 0
      updateError = error
    }

    if (updateError) {
      console.error(`Update failed for registration ${registrationId}:`, updateError)
    }

    console.log(
      `Payment ${paymentId} → registration ${registrationId} → ${paymentStatus} (rows affected: ${affectedRows})`
    )

    // Audit log — record affected row count so admins can spot inconsistencies
    // (e.g. team of 5 but only 4 rows updated means 1 member was cancelled and
    // legitimately skipped).
    await supabase.from('audit_log').insert({
      action: paymentStatus === 'confirmed' ? 'payment.confirmed_webhook' : `payment.${paymentStatus}_webhook`,
      actor_type: 'system',
      target_table: 'registrations',
      target_id: registrationId,
      target_email: registration?.email ?? null,
      new_data: {
        payment_status: paymentStatus,
        mp_payment_id: paymentId,
        mp_status: payment.status,
        transaction_amount_brl: payment.transaction_amount ?? null,
        affected_rows: affectedRows,
      },
      metadata: {
        team_name: registration?.team_name ?? null,
        inscription_modality: registration?.inscription_modality ?? null,
        is_team_update: isTeam,
        preserved_cancellations: isTeam, // filter was applied
        update_error: updateError?.message ?? null,
      },
    })

    return new Response('ok', { status: 200 })
  } catch (err) {
    console.error('Webhook error:', err)
    return new Response('ok', { status: 200 }) // Always return 200 to MP to avoid retries
  }
})
