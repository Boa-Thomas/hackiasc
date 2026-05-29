-- ============================================================
-- Reduz o lockout do login do participante: 1 hora -> 1 minuto
-- Run in Supabase SQL Editor.
-- ============================================================
-- O rate limit anti-brute-force de participant_login bloqueava o acesso por
-- 1 hora após 10 tentativas inválidas — agressivo demais para participantes
-- legítimos que erram email/CPF. Reduzido para 1 minuto. Único diff vs
-- supabase-setup.sql é `v_lockout_duration`.

CREATE OR REPLACE FUNCTION participant_login(p_email TEXT, p_cpf TEXT)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_reg RECORD;
  v_clean_cpf TEXT;
  v_token UUID;
  v_now TIMESTAMPTZ := now();
  v_max_attempts CONSTANT INTEGER := 10;
  v_lockout_duration CONSTANT INTERVAL := interval '1 minute';
BEGIN
  v_clean_cpf := REGEXP_REPLACE(COALESCE(p_cpf, ''), '\D', '', 'g');

  IF p_email IS NULL OR p_email = '' OR length(v_clean_cpf) <> 11 THEN
    RETURN NULL;
  END IF;

  SELECT id, full_name, email, payment_status, failed_login_until
  INTO v_reg
  FROM registrations
  WHERE LOWER(email) = LOWER(TRIM(p_email))
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Locked out (anti-brute-force)
  IF v_reg.failed_login_until IS NOT NULL AND v_reg.failed_login_until > v_now THEN
    RETURN NULL;
  END IF;

  -- Cancelled registration: behave like not-found
  IF v_reg.payment_status = 'cancelled' THEN
    RETURN NULL;
  END IF;

  -- Lockout has expired: reset counter so a single wrong CPF doesn't immediately re-lock
  IF v_reg.failed_login_until IS NOT NULL AND v_reg.failed_login_until <= v_now THEN
    UPDATE registrations
    SET failed_login_count = 0, failed_login_until = NULL
    WHERE id = v_reg.id;
  END IF;

  -- Verify CPF
  IF NOT EXISTS (
    SELECT 1 FROM registrations
    WHERE id = v_reg.id
      AND REGEXP_REPLACE(cpf, '\D', '', 'g') = v_clean_cpf
  ) THEN
    UPDATE registrations
    SET failed_login_count = failed_login_count + 1,
        failed_login_until = CASE
          WHEN failed_login_count + 1 >= v_max_attempts THEN v_now + v_lockout_duration
          ELSE failed_login_until
        END
    WHERE id = v_reg.id;
    RETURN NULL;
  END IF;

  -- Success
  UPDATE registrations
  SET failed_login_count = 0, failed_login_until = NULL
  WHERE id = v_reg.id;

  INSERT INTO participant_sessions (registration_id)
  VALUES (v_reg.id)
  RETURNING token INTO v_token;

  RETURN json_build_object(
    'token', v_token,
    'expires_at', v_now + interval '7 days',
    'full_name', v_reg.full_name,
    'email', v_reg.email,
    'registration_id', v_reg.id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION participant_login(TEXT, TEXT) TO anon;
