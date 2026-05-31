-- ============================================================
-- Push Notifications + Central de Avisos  (Unit A)
-- Tabelas base + helpers + RPCs de inscrição/leitura + broadcast
-- ============================================================

-- ---------- Tabelas ----------
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_key    text NOT NULL,
  endpoint    text NOT NULL UNIQUE,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_sub_user_key ON push_subscriptions (user_key);

CREATE TABLE IF NOT EXISTS notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key   text NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL,
  url         text,
  audience    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (created_at DESC);

CREATE TABLE IF NOT EXISTS notification_recipients (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_key        text NOT NULL,
  read_at         timestamptz
);
CREATE INDEX IF NOT EXISTS idx_notif_recip_user ON notification_recipients (user_key, read_at);
CREATE INDEX IF NOT EXISTS idx_notif_recip_notif ON notification_recipients (notification_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_recip ON notification_recipients (notification_id, user_key);

ALTER TABLE push_subscriptions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications           ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_recipients ENABLE ROW LEVEL SECURITY;
-- Sem POLICY de SELECT => acesso só via RPC SECURITY DEFINER; service_role (edge) ignora RLS.

-- ---------- Expansão de público ----------
CREATE OR REPLACE FUNCTION expand_recipients(p_notification_id uuid, p_audience jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_kind text := p_audience->>'kind'; v_count integer;
BEGIN
  WITH keys AS (
    SELECT 'participant:' || r.id::text AS user_key
      FROM registrations r
     WHERE r.payment_status = 'confirmed'
       AND v_kind IN ('all_participants','participants_and_mentors')
    UNION
    SELECT 'mentor:' || m.id::text FROM mentors m
     WHERE v_kind IN ('all_mentors','participants_and_mentors')
    UNION
    SELECT 'participant:' || r.id::text FROM registrations r
     WHERE v_kind = 'team_members' AND r.team_id = (p_audience->>'team_id')::uuid
    UNION
    SELECT 'participant:' || r.id::text FROM registrations r
     WHERE v_kind = 'teams_members'
       AND r.team_id = ANY (SELECT (jsonb_array_elements_text(p_audience->'team_ids'))::uuid)
    UNION
    SELECT 'mentor:' || mt.mentor_id::text FROM mentor_teams mt
     WHERE v_kind = 'team_mentors' AND mt.team_id = (p_audience->>'team_id')::uuid
    UNION
    SELECT 'participant:' || (p_audience->>'reg_id')::uuid::text WHERE v_kind = 'participant'
    UNION
    SELECT 'mentor:' || (p_audience->>'mentor_id')::uuid::text WHERE v_kind = 'mentor'
  )
  INSERT INTO notification_recipients (notification_id, user_key)
  SELECT p_notification_id, user_key FROM keys WHERE user_key IS NOT NULL
  ON CONFLICT (notification_id, user_key) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;
REVOKE EXECUTE ON FUNCTION expand_recipients(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION expand_recipients(uuid, jsonb) FROM anon;

-- ---------- notify_event + switches ----------
CREATE OR REPLACE FUNCTION notify_event(p_event_key text, p_title text, p_body text, p_url text, p_audience jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_enabled boolean; v_id uuid;
BEGIN
  SELECT COALESCE((SELECT value <> 'off' FROM app_settings WHERE key = 'notify_event_' || p_event_key), true)
    INTO v_enabled;
  IF NOT v_enabled THEN RETURN NULL; END IF;
  INSERT INTO notifications (event_key, title, body, url, audience)
  VALUES (p_event_key, p_title, p_body, p_url, p_audience) RETURNING id INTO v_id;
  PERFORM expand_recipients(v_id, p_audience);
  RETURN v_id;
END; $$;
REVOKE EXECUTE ON FUNCTION notify_event(text,text,text,text,jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION notify_event(text,text,text,text,jsonb) FROM anon;

INSERT INTO app_settings (key, value, updated_at) VALUES
  ('notify_event_sugar_released','on',now()),
  ('notify_event_team_scores_visible','on',now()),
  ('notify_event_wall_phase','on',now()),
  ('notify_event_payment_confirmed','on',now()),
  ('notify_event_evaluation_open','on',now()),
  ('notify_event_announcement','on',now()),
  ('notify_event_team_lunch','on',now()),
  ('notify_event_deliverable_started','on',now()),
  ('notify_event_slides_deadline','on',now()),
  ('notify_event_mentor_assigned','on',now()),
  ('notify_event_schedule_start','on',now())
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION get_notify_events()
RETURNS TABLE(event_key text, enabled boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT substring(key from 14), value <> 'off'
    FROM app_settings WHERE key LIKE 'notify_event_%' ORDER BY key;
$$;
REVOKE EXECUTE ON FUNCTION get_notify_events() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_notify_events() FROM anon;
GRANT  EXECUTE ON FUNCTION get_notify_events() TO authenticated;

CREATE OR REPLACE FUNCTION set_notify_event(p_event_key text, p_on boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO app_settings (key, value, updated_at)
  VALUES ('notify_event_' || p_event_key, CASE WHEN p_on THEN 'on' ELSE 'off' END, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  RETURN p_on;
END; $$;
REVOKE EXECUTE ON FUNCTION set_notify_event(text,boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION set_notify_event(text,boolean) FROM anon;
GRANT  EXECUTE ON FUNCTION set_notify_event(text,boolean) TO authenticated;

-- ---------- Inscrição de push (por silo) ----------
CREATE OR REPLACE FUNCTION push_subscribe_participant(p_token text, p_endpoint text, p_p256dh text, p_auth text, p_ua text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_reg uuid;
BEGIN
  SELECT registration_id INTO v_reg FROM participant_sessions
   WHERE token::text = p_token AND (expires_at IS NULL OR expires_at > now());
  IF v_reg IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  INSERT INTO push_subscriptions (user_key, endpoint, p256dh, auth, user_agent)
  VALUES ('participant:' || v_reg::text, p_endpoint, p_p256dh, p_auth, p_ua)
  ON CONFLICT (endpoint) DO UPDATE SET user_key=EXCLUDED.user_key, p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth, user_agent=EXCLUDED.user_agent;
  RETURN true;
END; $$;
REVOKE EXECUTE ON FUNCTION push_subscribe_participant(text,text,text,text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION push_subscribe_participant(text,text,text,text,text) TO anon, authenticated;

-- Mentor: resolve token de sessão OU access_token de link (mesma função).
CREATE OR REPLACE FUNCTION push_subscribe_mentor(p_token text, p_endpoint text, p_p256dh text, p_auth text, p_ua text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mentor uuid;
BEGIN
  SELECT mentor_id INTO v_mentor FROM mentor_sessions
   WHERE token::text = p_token AND (expires_at IS NULL OR expires_at > now());
  IF v_mentor IS NULL THEN
    SELECT id INTO v_mentor FROM mentors WHERE access_token::text = p_token;
  END IF;
  IF v_mentor IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  INSERT INTO push_subscriptions (user_key, endpoint, p256dh, auth, user_agent)
  VALUES ('mentor:' || v_mentor::text, p_endpoint, p_p256dh, p_auth, p_ua)
  ON CONFLICT (endpoint) DO UPDATE SET user_key=EXCLUDED.user_key, p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth, user_agent=EXCLUDED.user_agent;
  RETURN true;
END; $$;
REVOKE EXECUTE ON FUNCTION push_subscribe_mentor(text,text,text,text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION push_subscribe_mentor(text,text,text,text,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION push_subscribe_admin(p_endpoint text, p_p256dh text, p_auth text, p_ua text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  INSERT INTO push_subscriptions (user_key, endpoint, p256dh, auth, user_agent)
  VALUES ('admin:' || v_uid::text, p_endpoint, p_p256dh, p_auth, p_ua)
  ON CONFLICT (endpoint) DO UPDATE SET user_key=EXCLUDED.user_key, p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth, user_agent=EXCLUDED.user_agent;
  RETURN true;
END; $$;
REVOKE EXECUTE ON FUNCTION push_subscribe_admin(text,text,text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION push_subscribe_admin(text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION push_unsubscribe(p_endpoint text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM push_subscriptions WHERE endpoint = p_endpoint;
  RETURN true;
END; $$;
REVOKE EXECUTE ON FUNCTION push_unsubscribe(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION push_unsubscribe(text) TO anon, authenticated;

-- ---------- Leitura do sininho (por silo) ----------
CREATE OR REPLACE FUNCTION notifications_list_participant(p_token text, p_limit int DEFAULT 30)
RETURNS TABLE(id uuid, title text, body text, url text, event_key text, created_at timestamptz, read boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_reg uuid;
BEGIN
  SELECT registration_id INTO v_reg FROM participant_sessions
   WHERE token::text = p_token AND (expires_at IS NULL OR expires_at > now());
  IF v_reg IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  RETURN QUERY SELECT n.id,n.title,n.body,n.url,n.event_key,n.created_at,(r.read_at IS NOT NULL)
    FROM notification_recipients r JOIN notifications n ON n.id=r.notification_id
   WHERE r.user_key='participant:'||v_reg::text ORDER BY n.created_at DESC LIMIT p_limit;
END; $$;
REVOKE EXECUTE ON FUNCTION notifications_list_participant(text,int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION notifications_list_participant(text,int) TO anon, authenticated;

CREATE OR REPLACE FUNCTION notifications_mark_read_participant(p_token text, p_ids uuid[])
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_reg uuid;
BEGIN
  SELECT registration_id INTO v_reg FROM participant_sessions
   WHERE token::text = p_token AND (expires_at IS NULL OR expires_at > now());
  IF v_reg IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  UPDATE notification_recipients SET read_at=now()
   WHERE user_key='participant:'||v_reg::text AND notification_id=ANY(p_ids) AND read_at IS NULL;
  RETURN true;
END; $$;
REVOKE EXECUTE ON FUNCTION notifications_mark_read_participant(text,uuid[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION notifications_mark_read_participant(text,uuid[]) TO anon, authenticated;

CREATE OR REPLACE FUNCTION notifications_list_mentor(p_token text, p_limit int DEFAULT 30)
RETURNS TABLE(id uuid, title text, body text, url text, event_key text, created_at timestamptz, read boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mentor uuid;
BEGIN
  SELECT mentor_id INTO v_mentor FROM mentor_sessions
   WHERE token::text = p_token AND (expires_at IS NULL OR expires_at > now());
  IF v_mentor IS NULL THEN SELECT id INTO v_mentor FROM mentors WHERE access_token::text = p_token; END IF;
  IF v_mentor IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  RETURN QUERY SELECT n.id,n.title,n.body,n.url,n.event_key,n.created_at,(r.read_at IS NOT NULL)
    FROM notification_recipients r JOIN notifications n ON n.id=r.notification_id
   WHERE r.user_key='mentor:'||v_mentor::text ORDER BY n.created_at DESC LIMIT p_limit;
END; $$;
REVOKE EXECUTE ON FUNCTION notifications_list_mentor(text,int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION notifications_list_mentor(text,int) TO anon, authenticated;

CREATE OR REPLACE FUNCTION notifications_mark_read_mentor(p_token text, p_ids uuid[])
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mentor uuid;
BEGIN
  SELECT mentor_id INTO v_mentor FROM mentor_sessions
   WHERE token::text = p_token AND (expires_at IS NULL OR expires_at > now());
  IF v_mentor IS NULL THEN SELECT id INTO v_mentor FROM mentors WHERE access_token::text = p_token; END IF;
  IF v_mentor IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  UPDATE notification_recipients SET read_at=now()
   WHERE user_key='mentor:'||v_mentor::text AND notification_id=ANY(p_ids) AND read_at IS NULL;
  RETURN true;
END; $$;
REVOKE EXECUTE ON FUNCTION notifications_mark_read_mentor(text,uuid[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION notifications_mark_read_mentor(text,uuid[]) TO anon, authenticated;

CREATE OR REPLACE FUNCTION notifications_list_admin(p_limit int DEFAULT 30)
RETURNS TABLE(id uuid, title text, body text, url text, event_key text, created_at timestamptz, read boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  RETURN QUERY SELECT n.id,n.title,n.body,n.url,n.event_key,n.created_at,(r.read_at IS NOT NULL)
    FROM notification_recipients r JOIN notifications n ON n.id=r.notification_id
   WHERE r.user_key='admin:'||v_uid::text ORDER BY n.created_at DESC LIMIT p_limit;
END; $$;
REVOKE EXECUTE ON FUNCTION notifications_list_admin(int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION notifications_list_admin(int) TO authenticated;

CREATE OR REPLACE FUNCTION notifications_mark_read_admin(p_ids uuid[])
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  UPDATE notification_recipients SET read_at=now()
   WHERE user_key='admin:'||v_uid::text AND notification_id=ANY(p_ids) AND read_at IS NULL;
  RETURN true;
END; $$;
REVOKE EXECUTE ON FUNCTION notifications_mark_read_admin(uuid[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION notifications_mark_read_admin(uuid[]) TO authenticated;

-- ---------- Broadcast + histórico + lista de times ----------
CREATE OR REPLACE FUNCTION broadcast_notification(p_title text, p_body text, p_audience_kind text, p_team_ids uuid[] DEFAULT NULL, p_url text DEFAULT '#participante')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_aud jsonb; v_id uuid;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_audience_kind NOT IN ('all_participants','all_mentors','participants_and_mentors','teams_members') THEN
    RAISE EXCEPTION 'invalid_audience';
  END IF;
  IF p_audience_kind = 'teams_members' THEN
    v_aud := jsonb_build_object('kind','teams_members','team_ids', to_jsonb(p_team_ids));
  ELSE
    v_aud := jsonb_build_object('kind', p_audience_kind);
  END IF;
  INSERT INTO notifications (event_key, title, body, url, audience, created_by)
  VALUES ('broadcast', p_title, p_body, p_url, v_aud, 'admin:'||coalesce(auth.uid()::text,'?'))
  RETURNING id INTO v_id;
  PERFORM expand_recipients(v_id, v_aud);
  RETURN v_id;
END; $$;
REVOKE EXECUTE ON FUNCTION broadcast_notification(text,text,text,uuid[],text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION broadcast_notification(text,text,text,uuid[],text) TO authenticated;

CREATE OR REPLACE FUNCTION admin_notifications_history(p_limit int DEFAULT 50)
RETURNS TABLE(id uuid, event_key text, title text, body text, audience jsonb, recipients bigint, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT n.id,n.event_key,n.title,n.body,n.audience,
    (SELECT count(*) FROM notification_recipients r WHERE r.notification_id=n.id), n.created_at
    FROM notifications n ORDER BY n.created_at DESC LIMIT p_limit;
END; $$;
REVOKE EXECUTE ON FUNCTION admin_notifications_history(int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION admin_notifications_history(int) TO authenticated;

CREATE OR REPLACE FUNCTION admin_teams_for_broadcast()
RETURNS TABLE(id uuid, name text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT t.id, t.name FROM teams t ORDER BY t.name;
END; $$;
REVOKE EXECUTE ON FUNCTION admin_teams_for_broadcast() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION admin_teams_for_broadcast() TO authenticated;
