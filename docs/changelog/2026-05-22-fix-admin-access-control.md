# fix(admin): access control, session, and atomicity hardening

**Date:** 2026-05-22
**Branch:** fix/admin-access-control
**Files changed:** src/admin/AdminRegistrations.jsx, src/admin/AdminPanel.jsx,
  src/admin/useAdminAuth.js, src/admin/AdminTeams.jsx, src/admin/AdminDashboard.jsx,
  src/participant/useParticipantAuth.js, migrations/create_bulk_orders.sql,
  migrations/promote_leader_atomic.sql (new)

## What was done

Eight security and UX fixes targeting the admin panel and participant portal.

1. **#156 ExportDropdown CSV gate**: `ExportDropdown` now accepts a `readOnly` prop.
   When true, the CSV export option (which includes CPF, phone, birth_date) is hidden.
   The `ListView` render site passes `readOnly={readOnly}` down from `AdminRegistrations`.

2. **#36 admin_get_bulk_order voucher code masking**: The `bv.code` column in the
   voucher query now uses `CASE WHEN is_admin() THEN bv.code ELSE NULL END` so viewers
   receive a null instead of a redeemable bearer token.

3. **#159 AdminPanel bulk tab gated**: Added `adminOnly: true` to the `bulk` tab entry.
   Viewers are filtered by the existing `TABS.filter(t => !t.adminOnly)` logic.
   `financeiro` was left accessible — commit 4b47fa5 already made it aggregate-only.

4. **#157 useAdminAuth onAuthStateChange**: The mount effect now subscribes to
   `supabase.auth.onAuthStateChange`. On `SIGNED_OUT` or failed token refresh with no
   session, `performLogout()` is called. Subscription is torn down in the cleanup.
   Guarded against `supabase` being null.

5. **#158 promoteLeader atomic RPC**: Two sequential UPDATEs replaced with a single
   `supabase.rpc('admin_promote_leader', {...})` call. New migration
   `promote_leader_atomic.sql` defines a `SECURITY DEFINER` function that does a single
   `UPDATE ... SET is_team_leader = (id = p_new_leader_id)` guarded by `is_admin()`.

6. **#41 Postgres error leakage via alert()**: All `alert(error.message)` /
   `alert(err.message)` calls in `AdminRegistrations.jsx` replaced with
   `console.error(error)` + `alert('Ocorreu um erro. Tente novamente.')`.
   Business-level refund messages (alert(msg)/alert(result)) left unchanged.

7. **#38 AdminDashboard gross fallback**: `RevenueCard` updated to render `—` when
   `amount` is null. "Receita líquida" now passes `null` while `feeData` is loading
   (previously fell back to gross). "Receita projetada" also uses `—` until feeData loads.

8. **#40 useParticipantAuth localStorage + network resilience**: Token migrated from
   `sessionStorage` to `localStorage` (preserves 7-day session across tab closes).
   `refreshMe` now distinguishes genuine auth failures (structured `code`/4xx status from
   server) from transient network errors — only genuine failures clear the token.

## Why

Live event day (2026-05-22). LGPD compliance requires CPF/phone not be downloadable by
viewers. Voucher codes are bearer tokens and must not leak. Ghost sessions (token revoked
server-side but client still shows logged-in) needed fixing for security. The non-atomic
leader promotion risked leaving teams without a leader on partial failure.

## Technical decisions

- `isAuthFailure()` uses `rpcError.code` (Postgres/PostgREST) and `rpcError.status < 500`
  as discriminators; anything else is treated as transient to avoid false logouts.
- `onAuthStateChange` fires synchronously on `SIGNED_OUT`; using `TOKEN_REFRESHED` with
  `!session` catches expired refresh tokens without requiring a separate polling loop.
- `admin_promote_leader` uses a single UPDATE with `(id = p_new_leader_id)` boolean
  expression to atomically demote all and promote one in one statement.

## Impact

- Viewer role can no longer download PII via CSV or see voucher codes.
- Bulk tab hidden from viewer UI.
- Session revocation now propagates to frontend without page reload.
- Leader promotion is race-condition free.
- No Postgres constraint names or internal messages exposed to end users.
