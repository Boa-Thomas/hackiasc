-- SP2 / Auth Phase 3: fix the broken unified mentor link.
-- mentor_get_me_by_token (the link-mode bootstrap) was uuid-cast-only on
-- mentors.access_token and returned NULL for 64-hex unified grant tokens, so
-- #acesso?t=<grant> never resolved a mentor (the bug). Delegate resolution to
-- mentor_prepitch_resolve, which already has the full uuid + grant_resolve_internal
-- fallback and swallows grant errors (returns NULL). Legacy uuid links unaffected;
-- NULL input still returns NULL. Idempotent CREATE OR REPLACE; signature unchanged
-- (text) so no DROP and no GRANT change needed.
CREATE OR REPLACE FUNCTION public.mentor_get_me_by_token(p_access_token text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_mentor_id UUID;
BEGIN
  v_mentor_id := mentor_prepitch_resolve(p_access_token);
  IF v_mentor_id IS NULL THEN RETURN NULL; END IF;
  RETURN mentor_serialize_me(v_mentor_id);
END; $function$;
