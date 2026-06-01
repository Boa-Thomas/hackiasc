-- MEDIUM (security sweep "E"): a viewer could read mentors.access_token directly
-- (mentors SELECT RLS is is_admin_or_viewer + a table-level SELECT grant covered
-- ALL columns). access_token is a login credential (#mentor?t= / grant link).
-- Fix: revoke the table-wide SELECT and re-grant only the non-credential columns
-- that admin UIs (Teams/PrePitch mentor badges) actually read; admins read the
-- token via an admin-only SECURITY DEFINER RPC. Frontend AdminMentors switches
-- from select('...access_token') to admin_list_mentors().

REVOKE SELECT ON public.mentors FROM authenticated, anon;
GRANT SELECT (id, email, name, created_at) ON public.mentors TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_mentors()
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  RETURN COALESCE((
    SELECT json_agg(json_build_object(
      'id', m.id, 'email', m.email, 'name', m.name,
      'access_token', m.access_token, 'created_at', m.created_at
    ) ORDER BY m.created_at)
    FROM mentors m
  ), '[]'::json);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_mentors() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_mentors() TO authenticated;
