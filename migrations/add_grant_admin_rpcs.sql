-- Admin grant-management RPCs. All is_admin()-gated and search_path-pinned.
-- pgcrypto (gen_random_bytes/digest) is in the `extensions` schema → fully-qualified.

CREATE OR REPLACE FUNCTION grant_auth_kind(p_role text)
RETURNS text LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, public
AS $$ SELECT CASE WHEN p_role IN ('mentor','juror') THEN 'rpc_token' ELSE 'jwt_exchange' END $$;

CREATE OR REPLACE FUNCTION admin_create_grant(
  p_label text, p_role text, p_scope jsonb DEFAULT '{}'::jsonb,
  p_expires_at timestamptz DEFAULT NULL, p_email text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_raw text := encode(extensions.gen_random_bytes(32),'hex'); v_id uuid;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF p_role NOT IN ('admin','viewer','checkin','staff','facilitator','mentor','juror') THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;
  INSERT INTO access_grants(label, role, auth_kind, scope, token_hash, email, expires_at, created_by)
  VALUES (p_label, p_role, grant_auth_kind(p_role), COALESCE(p_scope,'{}'::jsonb),
          encode(extensions.digest(v_raw,'sha256'),'hex'), p_email, p_expires_at, auth.uid())
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('grant_id', v_id, 'token', v_raw);
END; $$;

CREATE OR REPLACE FUNCTION admin_list_grants()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT COALESCE(jsonb_agg(g ORDER BY g.created_at DESC), '[]'::jsonb) INTO v
  FROM (
    SELECT id, label, role, auth_kind, scope, email, expires_at, revoked_at,
           created_at, last_used_at,
           (revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())) AS active
    FROM access_grants
  ) g;
  RETURN v;
END; $$;

CREATE OR REPLACE FUNCTION admin_revoke_grant(p_grant_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE access_grants SET revoked_at = now() WHERE id = p_grant_id AND revoked_at IS NULL;
END; $$;

CREATE OR REPLACE FUNCTION admin_regenerate_grant_token(p_grant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_raw text := encode(extensions.gen_random_bytes(32),'hex');
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE access_grants
     SET token_hash = encode(extensions.digest(v_raw,'sha256'),'hex'), revoked_at = NULL
   WHERE id = p_grant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  RETURN jsonb_build_object('token', v_raw);
END; $$;

CREATE OR REPLACE FUNCTION admin_set_grant_expiry(p_grant_id uuid, p_expires_at timestamptz)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE access_grants SET expires_at = p_expires_at WHERE id = p_grant_id;
END; $$;

REVOKE ALL ON FUNCTION admin_create_grant(text,text,jsonb,timestamptz,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_list_grants() FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_revoke_grant(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_regenerate_grant_token(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_set_grant_expiry(uuid,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_create_grant(text,text,jsonb,timestamptz,text) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_list_grants() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_revoke_grant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_regenerate_grant_token(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_set_grant_expiry(uuid,timestamptz) TO authenticated;
