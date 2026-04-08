-- ============================================================
-- pg_cron: sync MP payments every 15 minutes
-- Requires Supabase Pro plan (pg_cron + pg_net extensions)
-- If on free tier, use manual sync button in admin dashboard
-- ============================================================

-- Enable extensions (already available on Supabase Pro)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule sync every 15 minutes
-- NOTE: Replace <SUPABASE_URL> and <SERVICE_ROLE_KEY> with actual values
-- Or use Supabase Vault secrets if available
SELECT cron.schedule(
  'sync-mp-payments',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := '<SUPABASE_URL>/functions/v1/sync-mp-payments',
    headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- To verify the cron job was created:
-- SELECT * FROM cron.job;

-- To unschedule:
-- SELECT cron.unschedule('sync-mp-payments');
