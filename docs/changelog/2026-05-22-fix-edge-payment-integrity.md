# fix(edge): payment-state integrity in mp-webhook and refund-payment

**Date:** 2026-05-22
**Commit:** (see git log)
**Branch:** fix/edge-payment-integrity
**Files changed:** supabase/functions/mp-webhook/index.ts, supabase/functions/refund-payment/index.ts

## What was done

Six audit findings fixed across two edge functions, all focused on preventing state corruption in a live payment flow.

**mp-webhook/index.ts:**
- **#58**: Removed `payment_confirmed_at: null` from the update payload for non-confirmed statuses. Used conditional spread so the field is only set (to `new Date().toISOString()`) when `paymentStatus === 'confirmed'`. A confirmed timestamp is never erased by a later webhook.
- **#131**: Added per-status WHERE guards on both the team and individual UPDATE paths. When `paymentStatus === 'pending'`, the query adds `.not('payment_status', 'in', '(confirmed,cancelled)')` so a late `in_process` webhook cannot downgrade an already-confirmed row. When `paymentStatus === 'confirmed'`, `.neq('payment_status', 'cancelled')` prevents resurrecting admin-cancelled rows. Same guard for `'cancelled'` status.
- **#34 (idempotency)**: Before the UPDATE, the SELECT now also fetches `payment_status`. The early-return short-circuit (return HTTP 200, no UPDATE, no duplicate audit_log row) fires **only for non-team registrations** where `registration.payment_status === paymentStatus`. For teams it does NOT fire: the SELECT reads a single row (the one matching `external_reference`), so a stale member still at `pending` (admin correction, late-added member) must not be skipped just because the leader already matches. Teams instead rely entirely on the #131 WHERE guards, which make rows already at the target status a safe no-op while still updating any lagging member. This is **guard-based idempotency** — chosen over a separate `processed_mp_payments` table because it requires no migration and adds one SELECT column.
- **#59**: `registrationId` is validated against the UUID regex before any DB access. The SELECT now destructures `error` and logs it if present.

**refund-payment/index.ts:**
- **#99**: The team-leader cancellation path was split into two queries: (1) `UPDATE SET payment_status='cancelled' WHERE team_name=X` — no `payment_notes` field; (2) `UPDATE SET payment_notes=<refundNote> WHERE id=registration_id` — applies only to the leader. Previously the leader's refund note overwrote `payment_notes` on every member row. Each step now checks its `error` and throws so the existing catch returns 500 (no silent partial state).
- **#138 (not fully fixed — documented)**: This fix stops the refund note from *clobbering* member rows. It does NOT make per-member `mp_payment_id` correct, because the mp-webhook team path still writes the *leader's* MP payment id into every member's `payment_notes`. So a per-member refund currently still reads the leader's payment id. Making each member carry their own `mp_payment_id` is a separate pre-existing issue (webhook write side) to address later.

## Why

Live event (2026-05-22). A late `in_process` webhook from Mercado Pago could downgrade a paid registration to `pending`, blocking entry. A retry could null out `payment_confirmed_at`, breaking refund calculations. During a leader-triggered team cancellation, the leader's refund note overwrote `payment_notes` on every team member's row.

## Technical decisions

- Guard-based idempotency preferred over a new DB table: zero migration, safe to deploy immediately.
- No pricing/amount logic touched. No new columns. No schema changes.
- All mp-webhook paths continue to return HTTP 200 to Mercado Pago on early returns.

## Impact

- No confirmed registration can be downgraded to pending by a late webhook.
- `payment_confirmed_at` is now write-once from the webhook's perspective.
- A leader-triggered team cancellation no longer clobbers each member's `payment_notes`.
- Idempotent: MP webhook retries are safe; team retries still reconcile lagging members via the #131 guards.
- Per-member `mp_payment_id` correctness (#138) remains a known follow-up on the webhook write side.

## Next steps

- Deploy: `supabase functions deploy mp-webhook && supabase functions deploy refund-payment`
- Monitor audit_log for duplicate `payment.pending_webhook` entries (should stop appearing after deploy).
