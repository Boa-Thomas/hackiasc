-- SP2/B2: re-key the mentor push + notification RPCs to session-first dual-mode
-- (same pattern as B1). These were missed in B1 (they live outside
-- phase2_mentor_juror_text.sql). Bodies verbatim from prod (pg_get_functiondef);
-- only the identity preamble is prepended: current_mentor_id() session-first, then
-- the existing inline token resolution (mentor_sessions -> mentors.access_token).
-- Additive/coexistent: legacy token path unchanged; session branch dormant until
-- the B2 frontend passes p_token=null. CREATE OR REPLACE keeps existing GRANTs.

CREATE OR REPLACE FUNCTION public.push_subscribe_mentor(p_token text, p_endpoint text, p_p256dh text, p_auth text, p_ua text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_mentor uuid;
BEGIN
  v_mentor := current_mentor_id();
  IF v_mentor IS NULL AND p_token IS NOT NULL THEN
    SELECT mentor_id INTO v_mentor FROM mentor_sessions
     WHERE token::text = p_token AND (expires_at IS NULL OR expires_at > now());
    IF v_mentor IS NULL THEN SELECT id INTO v_mentor FROM mentors WHERE access_token::text = p_token; END IF;
  END IF;
  IF v_mentor IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  INSERT INTO push_subscriptions (user_key, endpoint, p256dh, auth, user_agent)
  VALUES ('mentor:' || v_mentor::text, p_endpoint, p_p256dh, p_auth, p_ua)
  ON CONFLICT (endpoint) DO UPDATE SET user_key=EXCLUDED.user_key, p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth, user_agent=EXCLUDED.user_agent;
  RETURN true;
END; $function$;

CREATE OR REPLACE FUNCTION public.notifications_list_mentor(p_token text, p_limit integer DEFAULT 30)
 RETURNS TABLE(id uuid, title text, body text, url text, event_key text, created_at timestamp with time zone, read boolean)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_mentor uuid;
BEGIN
  v_mentor := current_mentor_id();
  IF v_mentor IS NULL AND p_token IS NOT NULL THEN
    SELECT mentor_id INTO v_mentor FROM mentor_sessions
     WHERE token::text = p_token AND (expires_at IS NULL OR expires_at > now());
    IF v_mentor IS NULL THEN SELECT id INTO v_mentor FROM mentors WHERE access_token::text = p_token; END IF;
  END IF;
  IF v_mentor IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  RETURN QUERY SELECT n.id,n.title,n.body,n.url,n.event_key,n.created_at,(r.read_at IS NOT NULL)
    FROM notification_recipients r JOIN notifications n ON n.id=r.notification_id
   WHERE r.user_key='mentor:'||v_mentor::text ORDER BY n.created_at DESC LIMIT p_limit;
END; $function$;

CREATE OR REPLACE FUNCTION public.notifications_mark_read_mentor(p_token text, p_ids uuid[])
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_mentor uuid;
BEGIN
  v_mentor := current_mentor_id();
  IF v_mentor IS NULL AND p_token IS NOT NULL THEN
    SELECT mentor_id INTO v_mentor FROM mentor_sessions
     WHERE token::text = p_token AND (expires_at IS NULL OR expires_at > now());
    IF v_mentor IS NULL THEN SELECT id INTO v_mentor FROM mentors WHERE access_token::text = p_token; END IF;
  END IF;
  IF v_mentor IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  UPDATE notification_recipients SET read_at=now()
   WHERE user_key='mentor:'||v_mentor::text AND notification_id=ANY(p_ids) AND read_at IS NULL;
  RETURN true;
END; $function$;
