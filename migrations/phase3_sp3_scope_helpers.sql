-- SP3 Phase 1: scope-enforcement helpers. Read scope LIVE via current_grant_ref()
-- (SP2/B1; reads access_grants.scope for supabase_user_id=auth.uid(), gates
-- revoked/expired inline). INVARIANT: {} / null scope / NO grant row (legacy
-- hand-made admin) all == UNRESTRICTED — every helper defaults to allow via
-- COALESCE so the guards are NO-OPS for existing accounts. Consumed by Phase 2
-- (write-RPC body guards) + Phase 3 (RLS WITH CHECK) + Phase 4 (frontend my_scope).
-- Additive: nothing reads these yet.

-- read_only flag; false for {}/null/no-grant (unrestricted).
CREATE OR REPLACE FUNCTION public.scope_read_only() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$ SELECT COALESCE((SELECT (scope->>'read_only')::boolean FROM current_grant_ref()), false) $$;

-- write allowed = admin role AND not read_only-scoped.
CREATE OR REPLACE FUNCTION public.can_write() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$ SELECT is_admin() AND NOT scope_read_only() $$;

-- tab allowed = no allowed_tabs restriction (empty/absent) OR p_tab in the live set;
-- true when there is no grant row (unrestricted).
CREATE OR REPLACE FUNCTION public.scope_tab_allowed(p_tab text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    (SELECT CASE
       WHEN scope->'allowed_tabs' IS NULL OR jsonb_array_length(scope->'allowed_tabs') = 0 THEN true
       ELSE scope->'allowed_tabs' ? p_tab
     END FROM current_grant_ref()),
    true)
$$;

-- RAISE variant for write-RPC bodies; passes if the grant is allowed ANY of the
-- RPC's owning tabs (multi-tab shared RPCs), or has no allowed_tabs restriction.
CREATE OR REPLACE FUNCTION public.assert_tab(VARIADIC p_tabs text[]) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM unnest(p_tabs) t WHERE scope_tab_allowed(t)) THEN
    RAISE EXCEPTION 'tab_not_allowed';
  END IF;
END $$;

-- Frontend (Phase 4): the caller's live scope ({} when no grant — e.g. legacy/password
-- accounts that don't bake scope in app_metadata).
CREATE OR REPLACE FUNCTION public.my_scope() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$ SELECT COALESCE((SELECT scope FROM current_grant_ref()), '{}'::jsonb) $$;

REVOKE ALL ON FUNCTION public.scope_read_only() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.scope_tab_allowed(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_tab(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_scope() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.scope_read_only() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write() TO authenticated;
GRANT EXECUTE ON FUNCTION public.scope_tab_allowed(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_tab(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_scope() TO authenticated;
