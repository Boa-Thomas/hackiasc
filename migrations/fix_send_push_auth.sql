-- send-push auth fix — DB side (the trigger that invokes the edge function).
-- ⚠️ DO NOT APPLY until the vault secret exists, or pushes stop:
--   RUNBOOK (in order):
--     1. Generate a secret:  openssl rand -hex 32
--     2. Set it as the edge function secret PUSH_WEBHOOK_SECRET (Supabase dashboard
--        → Edge Functions → send-push → Secrets).
--     3. Store the SAME value in vault:
--          SELECT vault.create_secret('<value>', 'push_webhook_secret');
--     4. Apply THIS migration (trigger now sends the x-webhook-secret header).
--     5. Deploy the updated supabase/functions/send-push/index.ts (fail-closed gate).
--   The trigger below fail-closes too: if the vault secret is missing it skips the
--   push (RETURN NEW) rather than calling the function without a secret.

CREATE OR REPLACE FUNCTION trg_notifications_send_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_anon_key text;
  v_secret   text;
  v_url      text := 'https://qshrzfahotmjshtjuvno.supabase.co/functions/v1/send-push';
BEGIN
  SELECT decrypted_secret INTO v_anon_key FROM vault.decrypted_secrets WHERE name = 'edge_anon_key';
  IF v_anon_key IS NULL THEN RETURN NEW; END IF;

  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'push_webhook_secret';
  IF v_secret IS NULL THEN RETURN NEW; END IF;  -- secret not provisioned yet → skip push

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type',     'application/json',
                 'Authorization',    'Bearer ' || v_anon_key,
                 'x-webhook-secret', v_secret
               ),
    body    := jsonb_build_object('record', jsonb_build_object('id', NEW.id)) -- id only; function re-fetches
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;  -- never block the notifications insert
END; $$;
