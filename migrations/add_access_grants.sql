CREATE TABLE IF NOT EXISTS access_grants (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label            text NOT NULL,
  role             text NOT NULL CHECK (role IN ('admin','viewer','checkin','staff','facilitator','mentor','juror')),
  auth_kind        text NOT NULL CHECK (auth_kind IN ('jwt_exchange','rpc_token')),
  scope            jsonb NOT NULL DEFAULT '{}'::jsonb,
  token_hash       text UNIQUE NOT NULL,
  supabase_user_id uuid,
  ref_id           uuid,
  email            text,
  expires_at       timestamptz,
  revoked_at       timestamptz,
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_used_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_access_grants_token_hash ON access_grants (token_hash);
CREATE INDEX IF NOT EXISTS idx_access_grants_role ON access_grants (role);

ALTER TABLE access_grants ENABLE ROW LEVEL SECURITY;

-- Admin-only direct access. Resolution for non-admins happens through
-- grant_resolve()/edge (SECURITY DEFINER), never via direct table reads.
DROP POLICY IF EXISTS "Admin manages access_grants" ON access_grants;
CREATE POLICY "Admin manages access_grants" ON access_grants
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
