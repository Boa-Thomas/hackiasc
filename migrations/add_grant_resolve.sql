-- Resolve a raw grant token to its role/scope. Anon-callable (the token IS the
-- credential). Enforces expiry/revocation and self-rate-limits per token-hash.
-- pgcrypto lives in the `extensions` schema on Supabase, so digest() is
-- fully-qualified (search_path stays pinned to pg_catalog, public).
CREATE OR REPLACE FUNCTION grant_resolve(p_token text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_hash text;
  v_rl_key text;
  v_attempts int;
  v_grant access_grants%ROWTYPE;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN
    RAISE EXCEPTION 'invalid_grant';
  END IF;
  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  v_rl_key := 'grant_resolve:' || v_hash;

  -- Self-contained sliding-window rate limit: 5 attempts / minute per token hash.
  INSERT INTO rate_limits(key, attempts, first_attempt_at, last_attempt_at)
  VALUES (v_rl_key, 1, now(), now())
  ON CONFLICT (key) DO UPDATE SET
    attempts = CASE WHEN rate_limits.first_attempt_at > now() - interval '1 minute'
                    THEN rate_limits.attempts + 1 ELSE 1 END,
    first_attempt_at = CASE WHEN rate_limits.first_attempt_at > now() - interval '1 minute'
                    THEN rate_limits.first_attempt_at ELSE now() END,
    last_attempt_at = now()
  RETURNING attempts INTO v_attempts;
  IF v_attempts > 5 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  SELECT * INTO v_grant FROM access_grants WHERE token_hash = v_hash;
  IF NOT FOUND
     OR v_grant.revoked_at IS NOT NULL
     OR (v_grant.expires_at IS NOT NULL AND v_grant.expires_at <= now()) THEN
    RAISE EXCEPTION 'invalid_grant';
  END IF;

  UPDATE access_grants SET last_used_at = now() WHERE id = v_grant.id;

  RETURN jsonb_build_object(
    'auth_kind', v_grant.auth_kind,
    'role',      v_grant.role,
    'scope',     v_grant.scope,
    'ref_id',    v_grant.ref_id,
    'grant_id',  v_grant.id,
    'label',     v_grant.label
  );
END;
$$;

REVOKE ALL ON FUNCTION grant_resolve(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION grant_resolve(text) TO anon, authenticated;
