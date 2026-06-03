-- SP2/B1: session-identity helpers. current_grant_ref() resolves the CALLER's
-- grant from their Supabase session (supabase_user_id = auth.uid()), gating
-- revoked/expired in the same read (instant revocation on the RPC data path).
-- STABLE so the planner never re-runs it per-row; SECURITY DEFINER so it reads
-- access_grants regardless of the caller's RLS. Returns no row when there is no
-- session / no grant / revoked / expired. auth.uid() reads the REQUEST jwt even
-- inside SECURITY DEFINER. Role helpers return NULL (not RAISE) when absent so
-- the dual-mode guard in the re-keyed RPCs works.
CREATE OR REPLACE FUNCTION public.current_grant_ref()
RETURNS TABLE(grant_id uuid, role text, ref_id uuid, scope jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT g.id, g.role, g.ref_id, g.scope
  FROM access_grants g
  WHERE g.supabase_user_id = auth.uid()
    AND g.revoked_at IS NULL
    AND (g.expires_at IS NULL OR g.expires_at > now())
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_mentor_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$ SELECT ref_id FROM current_grant_ref() WHERE role = 'mentor' $$;

CREATE OR REPLACE FUNCTION public.current_juror_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$ SELECT ref_id FROM current_grant_ref() WHERE role = 'juror' $$;

REVOKE ALL ON FUNCTION public.current_grant_ref() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_mentor_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_juror_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_grant_ref() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_mentor_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_juror_id() TO authenticated;
