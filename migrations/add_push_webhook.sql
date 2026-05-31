-- ============================================================
-- Push Notifications — Unit D
-- Database webhook (via pg_net) no INSERT de `notifications` -> Edge Function send-push.
-- O Bearer JWT (anon key, pública) fica no Vault sob o nome 'edge_anon_key'
-- (criado fora deste arquivo p/ não versionar a chave). pg_net é assíncrono:
-- enfileira o POST após o commit, então nunca bloqueia o INSERT.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION trg_notifications_send_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_key text;
  v_url text := 'https://qshrzfahotmjshtjuvno.supabase.co/functions/v1/send-push';
BEGIN
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'edge_anon_key';
  IF v_key IS NULL THEN RETURN NEW; END IF;  -- sem chave configurada: não envia, mas não quebra
  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_key),
    body    := jsonb_build_object('record', jsonb_build_object(
                 'id', NEW.id, 'title', NEW.title, 'body', NEW.body, 'url', NEW.url))
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;  -- falha no enfileiramento nunca quebra o insert da notificação
END; $$;

DROP TRIGGER IF EXISTS notifications_send_push ON notifications;
CREATE TRIGGER notifications_send_push AFTER INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION trg_notifications_send_push();
