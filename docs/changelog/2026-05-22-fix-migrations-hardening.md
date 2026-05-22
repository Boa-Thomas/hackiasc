# fix(migrations): RLS/consent/cron secret hardening

**Date:** 2026-05-22
**Branch:** fix/migrations-hardening
**Files altered:**
- `migrations/security_fixes.sql`
- `migrations/create_audit_log.sql`
- `migrations/create_bulk_orders.sql`
- `migrations/setup_mp_sync_cron.sql`

## What was done

Four security defects identified in a prior audit were fixed in-place across migration files.

1. **#122/#117 — audit_log INSERT policy (security_fixes.sql + create_audit_log.sql)**
   Changed `WITH CHECK (true)` to `WITH CHECK (is_admin())` on the authenticated INSERT
   policy, preventing any authenticated user from forging audit rows. All edge functions
   write to audit_log via `SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS — confirmed safe.

2. **#120 — anonymize_user_data lacks role check (security_fixes.sql)**
   Added an inline `IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden: admin role required'`
   as the first statement in the function body. The `GRANT EXECUTE TO authenticated` was
   already present but provided no protection without this guard.

3. **#109 — redeem_voucher consent bypass LGPD (create_bulk_orders.sql)**
   Added explicit guards before the INSERT in `redeem_voucher()`: raises
   `lgpd_consent_required` or `code_ip_consent_required` when the caller omits or sends
   `false` for either consent field. Matches the surrounding `RAISE EXCEPTION 'snake_case'`
   exception style.

4. **#128/#124 — setup_mp_sync_cron.sql placeholder + plaintext key**
   Added a `DO $$ ... $$` fail-fast guard that raises if `<SUPABASE_URL>` was not replaced,
   preventing silent mis-applied cron jobs. Switched to Vault-based key retrieval using
   `vault.decrypted_secrets` so the service key is not committed in plaintext. Added
   operator setup instructions as header comments.

## Why

Live event (2026-05-22). These defects allowed privilege escalation (audit forgery, data
anonymization by non-admins), LGPD bypass on voucher redemption, and a cron job that
silently fails or leaks a plaintext service key.

## Technical decisions

- **is_admin() ordering**: Both `security_fixes.sql` and `create_audit_log.sql` now reference
  `is_admin()`, which is defined in `fix_admin_rls_policies.sql`. Dependency comments were
  added to each site. The files are operator-applied in known order; no auto-migration runner
  is involved.
- **Vault vs template**: No `vault.decrypted_secrets` usage existed in the project. The cron
  file uses Vault at schedule time (fail-fast guard + Vault retrieval in `format()`), with a
  comment noting the key still ends up in `cron.job.command` and must be ACL-protected.
- **create_audit_log.sql caveat**: This file runs before `fix_admin_rls_policies.sql` on a
  fresh DB. A comment warns operators to apply `fix_admin_rls_policies.sql` immediately after
  if bootstrapping from scratch; `fix_admin_rls_policies.sql` drops and recreates all
  audit_log policies correctly.

## Impact

- Audit log forgery by authenticated non-admins is now blocked.
- LGPD data anonymization is admin-only at the function level.
- Voucher redemption enforces both consent fields.
- Cron setup fails loudly on misconfiguration instead of silently broken.

## Next steps

- Rotate service role key if it was ever stored in `cron.job.command` in plaintext.
- Consider a scoped edge function key (minimal permissions) for cron instead of service_role.
