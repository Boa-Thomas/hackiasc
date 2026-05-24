-- ============================================================
-- Check-in operator role
-- ============================================================
-- Adds a least-privilege "checkin" role for door/reception staff.
-- A checkin operator can ONLY:
--   * read CONFIRMED registrations (to find the participant + verify CPF/birth date)
--   * toggle a participant's presence via the set_checkin() RPC
-- They CANNOT touch payments, teams, refunds, or any other column/table.
--
-- All changes here are ADDITIVE — existing admin/viewer/anon policies are
-- untouched, so deploying this does not change current behavior.
--
-- HOW TO CREATE A CHECK-IN OPERATOR ACCOUNT (each operator gets their own,
-- so the audit log can attribute every check-in):
--   1. Supabase Dashboard > Authentication > Users > Add User
--      - set email + a strong password, enable "Auto Confirm User"
--   2. SQL Editor:
--        UPDATE auth.users
--        SET raw_app_meta_data = '{"role": "checkin"}'::jsonb
--        WHERE email = 'operador1@hackiasc.com';
--   3. The operator logs in at the admin route and sees ONLY the Check-in tab.

-- 1. Role helper — admin always retains checkin abilities.
CREATE OR REPLACE FUNCTION is_checkin_staff()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'checkin'),
    false
  );
$$;

-- 2. SELECT policy: checkin operators read only confirmed registrations.
--    Permissive policy — OR-combined with the existing admin/viewer SELECT
--    policy, so admins/viewers are unaffected. Realtime respects RLS, so the
--    live check-in sync keeps working for checkin operators on confirmed rows.
DROP POLICY IF EXISTS "Checkin can read confirmed registrations" ON registrations;
CREATE POLICY "Checkin can read confirmed registrations"
  ON registrations
  FOR SELECT
  TO authenticated
  USING (
    COALESCE((auth.jwt() -> 'app_metadata' ->> 'role') = 'checkin', false)
    AND payment_status = 'confirmed'
  );

-- 3. RPC: the ONLY write path for presence. SECURITY DEFINER so the checkin
--    role needs no direct UPDATE on registrations nor INSERT on audit_log.
--    Actor email is taken from the JWT (server-authoritative, not spoofable).
CREATE OR REPLACE FUNCTION set_checkin(p_id UUID, p_present BOOLEAN)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now   TIMESTAMPTZ := now();
  v_actor TEXT;
  v_reg   RECORD;
  v_ts    TIMESTAMPTZ;
BEGIN
  IF NOT is_checkin_staff() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  v_actor := auth.jwt() ->> 'email';

  SELECT email, full_name, payment_status, checked_in_at
    INTO v_reg
    FROM registrations
   WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'registration not found';
  END IF;

  -- Guard: only confirmed participants can be checked in.
  IF p_present AND v_reg.payment_status <> 'confirmed' THEN
    RAISE EXCEPTION 'registration is not confirmed';
  END IF;

  v_ts := CASE WHEN p_present THEN v_now ELSE NULL END;

  UPDATE registrations SET checked_in_at = v_ts WHERE id = p_id;

  INSERT INTO audit_log (
    action, actor_type, actor_email, target_table, target_id, target_email,
    old_data, new_data, metadata
  )
  VALUES (
    CASE WHEN p_present THEN 'checkin.in' ELSE 'checkin.undo' END,
    'admin',
    v_actor,
    'registrations',
    p_id,
    v_reg.email,
    CASE WHEN p_present THEN NULL ELSE jsonb_build_object('checked_in_at', v_reg.checked_in_at) END,
    CASE WHEN p_present THEN jsonb_build_object('checked_in_at', v_now) ELSE NULL END,
    CASE
      WHEN p_present THEN jsonb_build_object('full_name', v_reg.full_name, 'identity_verified', true)
      ELSE jsonb_build_object('full_name', v_reg.full_name)
    END
  );

  RETURN v_ts;
END;
$$;

-- Only logged-in staff may call these; the function body enforces the role.
-- Postgres grants EXECUTE to PUBLIC by default, so revoke from PUBLIC (not just
-- anon) before granting to authenticated.
REVOKE EXECUTE ON FUNCTION set_checkin(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_checkin(UUID, BOOLEAN) TO authenticated;
REVOKE EXECUTE ON FUNCTION is_checkin_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_checkin_staff() TO authenticated;

SELECT id, email, raw_app_meta_data->>'role' AS role FROM auth.users ORDER BY created_at;
