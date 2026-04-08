-- ============================================================
-- Security Fix: Role-Based RLS Policies
--
-- CRITICAL: This migration fixes an authorization bypass where
-- ANY authenticated user (not just admins) could read/update
-- all registrations via the admin panel.
--
-- MANUAL ACTION REQUIRED: In Supabase Dashboard, go to
-- Authentication > Settings and DISABLE "Enable email signups"
-- to prevent unauthorized account creation. Only pre-created
-- admin accounts should exist.
-- ============================================================

-- 1. Helper functions for role checks in RLS policies
-- These read the 'role' field from the JWT user_metadata claim,
-- which is set via raw_user_meta_data in auth.users.

CREATE OR REPLACE FUNCTION is_admin_or_viewer()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('admin', 'viewer'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin',
    false
  );
$$;

-- 2. Fix registrations table RLS policies
-- Drop the overly-permissive policies that allowed ANY authenticated user access

DROP POLICY IF EXISTS "Admin can read all registrations" ON registrations;
DROP POLICY IF EXISTS "Admin can update registrations" ON registrations;

-- Recreate with role checks
CREATE POLICY "Admin can read all registrations"
  ON registrations
  FOR SELECT
  TO authenticated
  USING (is_admin_or_viewer());

CREATE POLICY "Admin can update registrations"
  ON registrations
  FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- NOTE: The "Allow public registration insert" policy (FOR INSERT TO anon)
-- is intentionally left unchanged — public registration must continue working.

-- 3. Fix audit_log table RLS policies

DROP POLICY IF EXISTS "Admin can read audit log" ON audit_log;
DROP POLICY IF EXISTS "Authenticated can insert audit log" ON audit_log;
DROP POLICY IF EXISTS "Allow audit log insert" ON audit_log;
DROP POLICY IF EXISTS "Allow auth audit log insert" ON audit_log;

CREATE POLICY "Admin can read audit log"
  ON audit_log
  FOR SELECT
  TO authenticated
  USING (is_admin_or_viewer());

CREATE POLICY "Admin can insert audit log"
  ON audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

-- 4. Secure sensitive RPC functions

-- claim_early_bird_slot: only called from edge function via service_role key
-- (service_role bypasses RLS/grants entirely), so revoke from authenticated
REVOKE EXECUTE ON FUNCTION claim_early_bird_slot(UUID) FROM authenticated;

-- anonymize_user_data: add admin check inside the function body
CREATE OR REPLACE FUNCTION anonymize_user_data(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
  v_caller_role TEXT;
BEGIN
  -- Only allow admins to anonymize data
  v_caller_role := (auth.jwt() -> 'user_metadata' ->> 'role');
  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

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
