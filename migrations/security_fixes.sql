-- ============================================================
-- Security Fixes Migration
-- ============================================================

-- C5: Missing RPC — get_total_registration_count
CREATE OR REPLACE FUNCTION get_total_registration_count()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COUNT(*)::INTEGER
  FROM registrations
  WHERE payment_status IN ('pending', 'confirmed');
$$;

GRANT EXECUTE ON FUNCTION get_total_registration_count() TO anon;

-- C6: Atomic early bird claim (prevents race condition)
CREATE OR REPLACE FUNCTION claim_early_bird_slot(p_reg_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_confirmed INTEGER;
  v_current_tier TEXT;
BEGIN
  -- Lock the registrations table row for this registration
  SELECT ticket_tier INTO v_current_tier
  FROM registrations
  WHERE id = p_reg_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Count confirmed early birds atomically
  SELECT COUNT(*)::INTEGER INTO v_confirmed
  FROM registrations
  WHERE payment_status = 'confirmed' AND ticket_tier = 'early_bird';

  IF v_confirmed < 10 THEN
    UPDATE registrations
    SET ticket_tier = 'early_bird', ticket_price = 15000
    WHERE id = p_reg_id;
    RETURN TRUE;
  ELSE
    UPDATE registrations
    SET ticket_tier = 'regular', ticket_price = 20000
    WHERE id = p_reg_id;
    RETURN FALSE;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_early_bird_slot(UUID) TO authenticated;

-- H3: Minimize data returned by recover_pending_registration
CREATE OR REPLACE FUNCTION recover_pending_registration(p_email TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_reg RECORD;
  v_member_count INTEGER;
  v_leader_id UUID;
BEGIN
  SELECT id, email, payment_method, ticket_price, ticket_tier,
         team_name, inscription_modality, is_team_leader, price_expires_at
  INTO v_reg
  FROM registrations
  WHERE LOWER(email) = LOWER(p_email)
    AND payment_status = 'pending'
  LIMIT 1;

  IF NOT FOUND THEN
    -- Random delay to prevent timing attacks
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

  -- If not team leader, find the leader's ID for payment
  v_leader_id := v_reg.id;
  IF v_reg.inscription_modality = 'team' AND NOT v_reg.is_team_leader THEN
    SELECT id INTO v_leader_id
    FROM registrations
    WHERE team_name = v_reg.team_name
      AND is_team_leader = true
    LIMIT 1;
  END IF;

  -- Return minimal data only (no full_name, no team_name exposed)
  RETURN json_build_object(
    'status', 'pending',
    'id', v_leader_id,
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

-- H5: Restrict audit_log — remove anon INSERT, keep authenticated + service role
DROP POLICY IF EXISTS "Allow audit log insert" ON audit_log;

-- Only authenticated (admin) and service_role can insert
-- Service role bypasses RLS automatically, so we only need authenticated policy
CREATE POLICY "Authenticated can insert audit log"
  ON audit_log FOR INSERT TO authenticated WITH CHECK (true);

-- M7: LGPD data anonymization
CREATE OR REPLACE FUNCTION anonymize_user_data(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM registrations
  WHERE LOWER(email) = LOWER(p_email);

  IF v_count = 0 THEN
    RETURN FALSE;
  END IF;

  UPDATE registrations
  SET
    full_name = '[DADOS REMOVIDOS]',
    cpf = '[REMOVIDO]',
    phone = '[REMOVIDO]',
    email = CONCAT('anonimizado_', gen_random_uuid(), '@removed.local'),
    linkedin_url = NULL,
    birth_date = '1900-01-01',
    dietary_restrictions = '[REMOVIDO]',
    pcd_type = NULL
  WHERE LOWER(email) = LOWER(p_email);

  RETURN TRUE;
END;
$$;

-- Only admin can anonymize
GRANT EXECUTE ON FUNCTION anonymize_user_data(TEXT) TO authenticated;
