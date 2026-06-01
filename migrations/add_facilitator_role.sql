-- Facilitator is a first-class, non-admin role (closes "facilitator == admin").
-- Helper mirrors is_admin()/is_admin_or_viewer() and is search_path-pinned.
CREATE OR REPLACE FUNCTION is_facilitator()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'role') = 'facilitator', false);
$$;

REVOKE ALL ON FUNCTION is_facilitator() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_facilitator() TO authenticated, anon;
