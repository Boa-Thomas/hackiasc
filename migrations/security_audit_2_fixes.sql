-- ============================================================
-- Security Audit Follow-up Migration (2026-04-08)
-- Run in Supabase SQL Editor after security_fixes.sql
-- ============================================================

-- 1. Rate limiting table
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  attempts INTEGER DEFAULT 1,
  first_attempt_at TIMESTAMPTZ DEFAULT now(),
  last_attempt_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- No direct access — only via SECURITY DEFINER functions
CREATE POLICY "No direct access to rate_limits"
  ON rate_limits FOR ALL TO anon, authenticated
  USING (false);

-- 2. Rate limit check function
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key TEXT,
  p_max_attempts INTEGER DEFAULT 5,
  p_window_minutes INTEGER DEFAULT 5
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_record RECORD;
BEGIN
  -- Upsert to avoid race condition on concurrent INSERT
  INSERT INTO rate_limits (key)
  VALUES (p_key)
  ON CONFLICT (key) DO NOTHING;

  SELECT * INTO v_record FROM rate_limits WHERE key = p_key;

  -- Reset if outside window
  IF v_record.first_attempt_at < now() - (p_window_minutes || ' minutes')::INTERVAL THEN
    UPDATE rate_limits
    SET attempts = 1, first_attempt_at = now(), last_attempt_at = now()
    WHERE key = p_key;
    RETURN TRUE;
  END IF;

  -- Check limit
  IF v_record.attempts >= p_max_attempts THEN
    RETURN FALSE;
  END IF;

  -- Increment
  UPDATE rate_limits
  SET attempts = attempts + 1, last_attempt_at = now()
  WHERE key = p_key;
  RETURN TRUE;
END;
$$;

-- 3. Updated recover_pending_registration with rate limiting
-- (replaces the version from security_fixes.sql)
CREATE OR REPLACE FUNCTION recover_pending_registration(p_email TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reg RECORD;
  v_member_count INTEGER;
  v_leader_id UUID;
BEGIN
  -- Rate limit: 5 attempts per 5 minutes per email
  IF NOT check_rate_limit('recover:' || LOWER(p_email), 5, 5) THEN
    PERFORM pg_sleep(0.1 + random() * 0.2);
    RETURN NULL;
  END IF;

  SELECT id, email, full_name, payment_method, ticket_price, ticket_tier,
         team_name, inscription_modality, is_team_leader, price_expires_at
  INTO v_reg
  FROM registrations
  WHERE LOWER(email) = LOWER(p_email)
    AND payment_status = 'pending'
  LIMIT 1;

  IF NOT FOUND THEN
    PERFORM pg_sleep(0.05 + random() * 0.1);
    RETURN NULL;
  END IF;

  IF v_reg.inscription_modality = 'team' AND v_reg.team_name IS NOT NULL THEN
    SELECT COUNT(*)::INTEGER INTO v_member_count
    FROM registrations
    WHERE team_name = v_reg.team_name;
  ELSE
    v_member_count := 1;
  END IF;

  v_leader_id := v_reg.id;
  IF v_reg.inscription_modality = 'team' AND NOT v_reg.is_team_leader THEN
    SELECT id INTO v_leader_id
    FROM registrations
    WHERE team_name = v_reg.team_name
      AND is_team_leader = true
    LIMIT 1;
  END IF;

  RETURN json_build_object(
    'status', 'pending',
    'id', v_leader_id,
    'full_name', v_reg.full_name,
    'email', v_reg.email,
    'payment_method', v_reg.payment_method,
    'ticket_price', v_reg.ticket_price,
    'ticket_tier', v_reg.ticket_tier,
    'inscription_modality', v_reg.inscription_modality,
    'member_count', v_member_count,
    'price_expires_at', v_reg.price_expires_at
  );
END;
$$;

-- 4. Periodic cleanup (run via pg_cron or manually)
-- DELETE FROM rate_limits WHERE last_attempt_at < now() - INTERVAL '1 hour';
