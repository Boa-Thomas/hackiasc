-- ============================================================
-- pg_cron: sync MP payments every 15 minutes
-- Requires Supabase Pro plan (pg_cron + pg_net extensions)
-- If on free tier, use manual sync button in admin dashboard
-- ============================================================
--
-- OPERATOR SETUP REQUIRED BEFORE RUNNING THIS FILE:
-- This file is a TEMPLATE — do NOT apply it as-is.
-- Steps:
--   1. Store the service role key in Supabase Vault:
--        SELECT vault.create_secret('mp_service_role_key', '<your-service-role-key>');
--   2. Replace <SUPABASE_URL> below with your actual project URL
--      (e.g. https://xxxxxxxxxxxxxxxxxxxx.supabase.co)
--   3. NEVER commit this file with a real key substituted in.
--      The service key grants full DB access; treat it as a secret.
-- ============================================================

-- Enable extensions (already available on Supabase Pro)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Fail-fast guard: abort if the URL placeholder was not replaced (#124/#128)
-- This prevents a mis-applied migration from creating a broken or insecure cron job.
DO $$
BEGIN
  IF '<SUPABASE_URL>' LIKE '%<%' THEN
    RAISE EXCEPTION
      'setup_mp_sync_cron.sql: <SUPABASE_URL> placeholder not replaced. '
      'Edit this file with your project URL before applying.';
  END IF;
END;
$$;

-- Schedule sync every 15 minutes using Vault-stored service key (#128)
-- The service key is read from Vault at schedule time and embedded in cron.job.command.
-- WARNING: Even with Vault, the decrypted key ends up stored in cron.job.command.
-- Mitigate by restricting SELECT on cron.job to superuser/postgres role only,
-- and rotating the service key regularly.
-- Alternative: use a dedicated, scoped edge function key with minimal permissions.
SELECT cron.schedule(
  'sync-mp-payments',
  '*/15 * * * *',
  format(
    $cmd$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'mp_service_role_key'
          LIMIT 1
        ),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
    $cmd$,
    '<SUPABASE_URL>/functions/v1/sync-mp-payments'
  )
);

-- To verify the cron job was created:
-- SELECT * FROM cron.job;

-- To unschedule:
-- SELECT cron.unschedule('sync-mp-payments');
