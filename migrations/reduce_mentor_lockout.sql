-- ============================================================
-- Reduz o lockout do login do mentor: 1 hora -> 1 minuto
-- Run in Supabase SQL Editor.
-- ============================================================
-- Espelha reduce_participant_lockout.sql para a RPC mentor_login. Unico diff
-- vs supabase-setup.sql / add_team_and_mentors.sql e o `v_lockout`.

CREATE OR REPLACE FUNCTION mentor_login(p_email TEXT, p_code TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_mentor RECORD;
  v_token UUID;
  v_now TIMESTAMPTZ := now();
  v_max CONSTANT INTEGER := 10;
  v_lockout CONSTANT INTERVAL := interval '1 minute';
BEGIN
  IF p_email IS NULL OR p_email = '' OR p_code IS NULL OR p_code = '' THEN
    RETURN NULL;
  END IF;

  SELECT id, access_code_hash, failed_login_until, failed_login_count
  INTO v_mentor FROM mentors WHERE LOWER(email) = LOWER(TRIM(p_email)) LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_mentor.failed_login_until IS NOT NULL AND v_mentor.failed_login_until > v_now THEN
    RETURN NULL;
  END IF;

  IF crypt(p_code, v_mentor.access_code_hash) <> v_mentor.access_code_hash THEN
    UPDATE mentors
    SET failed_login_count = failed_login_count + 1,
        failed_login_until = CASE
          WHEN failed_login_count + 1 >= v_max THEN v_now + v_lockout
          ELSE failed_login_until END
    WHERE id = v_mentor.id;
    RETURN NULL;
  END IF;

  UPDATE mentors SET failed_login_count = 0, failed_login_until = NULL WHERE id = v_mentor.id;
  INSERT INTO mentor_sessions (mentor_id) VALUES (v_mentor.id) RETURNING token INTO v_token;
  RETURN json_build_object('token', v_token, 'expires_at', v_now + interval '7 days');
END; $$;

GRANT EXECUTE ON FUNCTION mentor_login(TEXT, TEXT) TO anon;
