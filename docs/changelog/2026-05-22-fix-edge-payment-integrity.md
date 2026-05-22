# fix(edge): payment-state integrity in mp-webhook and refund-payment

**Date:** 2026-05-22
**Commit:** (see git log)
**Branch:** fix/edge-payment-integrity
**Files changed:** supabase/functions/mp-webhook/index.ts, supabase/functions/refund-payment/index.ts

## What was done

Six audit findings fixed across two edge functions, all focused on preventing state corruption in a live payment flow.

**mp-webhook/index.ts:**
- **#58**: Removed `payment_confirmed_at: null` from the update payload for non-confirmed statuses. Used conditional spread so the field is only set (to `new Date().toISOString()`) when `paymentStatus === 'confirmed'`. A confirmed timestamp is never erased by a later webhook.
- **#131**: Added per-status WHERE guards on both the team and individual UPDATE paths. When `paymentStatus === 'pending'`, the query adds `.not('payment_status', 'in', '("confirmed","cancelled")')` so a late `in_process` webhook cannot downgrade an already-confirmed row. When `paymentStatus === 'confirmed'`, `.neq('payment_status', 'cancelled')` prevents resurrecting admin-cancelled rows. Same guard for `'cancelled'` status.
- **#34 (idempotency)**: Before the UPDATE, the SELECT now also fetches `payment_status`. If `registration.payment_status === paymentStatus`, the handler returns HTTP 200 immediately without touching the DB or writing a duplicate audit_log row. This is **guard-based idempotency** — chosen over a separate `processed_mp_payments` table because it requires no migration, adds one SELECT column, and combined with the #131 WHERE guards makes re-processing a true no-op. The trade-off: it only skips at the granularity of the leader's row (teams); individual members may still receive the no-op UPDATE, but they won't be corrupted.
- **#59**: `registrationId` is validated against the UUID regex before any DB access. The SELECT now destructures `error` and logs it if present.

**refund-payment/index.ts:**
- **#99/#138**: The team-leader cancellation path was split into two queries: (1) `UPDATE SET payment_status='cancelled' WHERE team_name=X` — no `payment_notes` field, preserving each member's own `mp_payment:<id>`; (2) `UPDATE SET payment_notes=<refundNote> WHERE id=registration_id` — applies only to the leader. The per-member refund path at line 202 reads `reg.payment_notes` from `.eq('id', registration_id)`, which is already the member's own row — no change needed there, just verified.

## Why

Live event (2026-05-22). A late `in_process` webhook from Mercado Pago could downgrade a paid registration to `pending`, blocking entry. A retry could null out `payment_confirmed_at`, breaking refund calculations. Team members' `payment_notes` (holding their MP payment IDs) were overwritten during leader-triggered cancellations, making per-member refunds impossible.

## Technical decisions

- Guard-based idempotency preferred over a new DB table: zero migration, safe to deploy immediately.
- No pricing/amount logic touched. No new columns. No schema changes.
- All mp-webhook paths continue to return HTTP 200 to Mercado Pago on early returns.

## Impact

- No confirmed registration can be downgraded to pending by a late webhook.
- `payment_confirmed_at` is now write-once from the webhook's perspective.
- Team member cancellations now preserve per-member payment references, enabling correct per-member MP refunds.
- Idempotent: MP webhook retries are safe.

## Next steps

- Deploy: `supabase functions deploy mp-webhook && supabase functions deploy refund-payment`
- Monitor audit_log for duplicate `payment.pending_webhook` entries (should stop appearing after deploy).
