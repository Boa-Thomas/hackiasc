-- MEDIUM (sweep "C") — Option A: the Muro write RPCs trusted a client-supplied
-- p_registration_id as identity (no ownership proof; registration_id is public via
-- the check-in QR and sugar_roster). Fix: derive the actor server-side from a
-- participant session token the caller proves they own. wall write RPCs take
-- p_token (participant session token) instead of p_registration_id.
-- Param NAME changes (uuid->uuid but name differs) => DROP + CREATE required.
-- No RLS policy depends on these (checked) -> no CASCADE needed.
-- Option A drops the CPF+birthdate standalone wall login: the wall now requires a
-- participant session (frontend uses participantAuth.token).

-- Internal resolver: participant session token -> confirmed registration_id.
CREATE OR REPLACE FUNCTION public.wall_resolve_token(p_token uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_id UUID;
BEGIN
  v_id := participant_session_owner_confirmed(p_token); -- raises on invalid/unconfirmed
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.wall_resolve_token(uuid) FROM PUBLIC;

DROP FUNCTION IF EXISTS public.wall_submit_pain(uuid, text, text, text);
CREATE OR REPLACE FUNCTION public.wall_submit_pain(p_token uuid, p_title text, p_description text, p_axis text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  c_max_pains_per_user CONSTANT INTEGER := 5;
  c_throttle_interval  CONSTANT INTERVAL := '5 seconds';
  v_phase TEXT; v_reg_id UUID; v_name TEXT; v_title TEXT; v_pain pains;
BEGIN
  v_reg_id := wall_resolve_token(p_token);
  SELECT full_name INTO v_name FROM registrations WHERE id = v_reg_id;
  SELECT phase INTO v_phase FROM wall_state WHERE id = true;
  IF v_phase <> 'wall_open' THEN RAISE EXCEPTION 'wall_not_open'; END IF;
  IF (SELECT COUNT(*) FROM pains WHERE registration_id = v_reg_id AND status <> 'hidden') >= c_max_pains_per_user THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;
  IF EXISTS (SELECT 1 FROM pains WHERE registration_id = v_reg_id AND created_at > now() - c_throttle_interval) THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;
  v_title := TRIM(COALESCE(p_title, ''));
  IF v_title = '' THEN RAISE EXCEPTION 'title_required'; END IF;
  IF length(v_title) > 140 THEN v_title := left(v_title, 140); END IF;
  INSERT INTO pains (title, description, author_name, registration_id, axis)
  VALUES (v_title, NULLIF(TRIM(COALESCE(p_description, '')), ''), v_name, v_reg_id, NULLIF(TRIM(COALESCE(p_axis, '')), ''))
  RETURNING * INTO v_pain;
  RETURN json_build_object('id', v_pain.id, 'title', v_pain.title, 'description', v_pain.description,
    'author_name', v_pain.author_name, 'axis', v_pain.axis, 'created_at', v_pain.created_at);
END; $$;

DROP FUNCTION IF EXISTS public.wall_vote(uuid, uuid);
CREATE OR REPLACE FUNCTION public.wall_vote(p_token uuid, p_pain_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  c_throttle_interval CONSTANT INTERVAL := '2 seconds';
  v_phase TEXT; v_reg_id UUID; v_inserted INTEGER; v_remaining INTEGER;
BEGIN
  v_reg_id := wall_resolve_token(p_token);
  SELECT phase INTO v_phase FROM wall_state WHERE id = true;
  IF v_phase <> 'voting_open' THEN RAISE EXCEPTION 'voting_not_open'; END IF;
  IF EXISTS (SELECT 1 FROM pain_votes WHERE registration_id = v_reg_id AND created_at > now() - c_throttle_interval) THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pains WHERE id = p_pain_id AND status = 'visible') THEN
    RAISE EXCEPTION 'pain_not_found';
  END IF;
  INSERT INTO pain_votes (pain_id, registration_id)
  SELECT p_pain_id, v_reg_id
  WHERE (SELECT COUNT(*) FROM pain_votes WHERE registration_id = v_reg_id) < 3
  ON CONFLICT (pain_id, registration_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    IF EXISTS (SELECT 1 FROM pain_votes WHERE pain_id = p_pain_id AND registration_id = v_reg_id) THEN
      RAISE EXCEPTION 'already_voted';
    ELSE RAISE EXCEPTION 'vote_limit_reached'; END IF;
  END IF;
  SELECT 3 - COUNT(*) INTO v_remaining FROM pain_votes WHERE registration_id = v_reg_id;
  RETURN json_build_object('ok', true, 'votos_restantes', GREATEST(v_remaining, 0));
END; $$;

DROP FUNCTION IF EXISTS public.wall_unvote(uuid, uuid);
CREATE OR REPLACE FUNCTION public.wall_unvote(p_token uuid, p_pain_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_phase TEXT; v_reg_id UUID; v_deleted INTEGER; v_remaining INTEGER;
BEGIN
  v_reg_id := wall_resolve_token(p_token);
  SELECT phase INTO v_phase FROM wall_state WHERE id = true;
  IF v_phase <> 'voting_open' THEN RAISE EXCEPTION 'voting_not_open'; END IF;
  DELETE FROM pain_votes WHERE pain_id = p_pain_id AND registration_id = v_reg_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN RAISE EXCEPTION 'vote_not_found'; END IF;
  SELECT 3 - COUNT(*) INTO v_remaining FROM pain_votes WHERE registration_id = v_reg_id;
  RETURN json_build_object('ok', true, 'votos_restantes', GREATEST(v_remaining, 0));
END; $$;

DROP FUNCTION IF EXISTS public.wall_list(uuid);
CREATE OR REPLACE FUNCTION public.wall_list(p_token uuid DEFAULT NULL)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_phase TEXT; v_reg_id UUID; v_pains JSON; v_my_votes JSON; v_votes_used INTEGER := 0;
BEGIN
  IF p_token IS NOT NULL THEN
    BEGIN v_reg_id := participant_session_owner_confirmed(p_token);
    EXCEPTION WHEN raise_exception THEN v_reg_id := NULL; END;
  END IF;
  SELECT phase INTO v_phase FROM wall_state WHERE id = true;
  SELECT json_agg(p ORDER BY p.vote_count DESC, p.created_at) INTO v_pains
  FROM (
    SELECT pn.id, pn.title, pn.description, pn.author_name, pn.axis, pn.created_at,
      COUNT(pv.id)::INTEGER AS vote_count,
      CASE WHEN v_reg_id IS NULL THEN (
        SELECT COALESCE(json_agg(json_build_object('display', wall_display_name(r.full_name)) ORDER BY r.full_name), '[]'::json)
        FROM pain_votes pv2 JOIN registrations r ON r.id = pv2.registration_id WHERE pv2.pain_id = pn.id
      ) ELSE '[]'::json END AS voters
    FROM pains pn LEFT JOIN pain_votes pv ON pv.pain_id = pn.id
    WHERE pn.status = 'visible' GROUP BY pn.id
  ) p;
  IF v_reg_id IS NOT NULL THEN
    SELECT json_agg(pain_id), COUNT(*)::INTEGER INTO v_my_votes, v_votes_used FROM pain_votes WHERE registration_id = v_reg_id;
  END IF;
  RETURN json_build_object('phase', v_phase, 'pains', COALESCE(v_pains, '[]'::JSON),
    'my_votes', COALESCE(v_my_votes, '[]'::JSON), 'votos_restantes', GREATEST(3 - v_votes_used, 0));
END; $$;

GRANT EXECUTE ON FUNCTION public.wall_submit_pain(uuid, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wall_vote(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wall_unvote(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wall_list(uuid) TO anon, authenticated;

-- wall_require_confirmed is now an internal helper (used by wall_admin_add_pain).
-- Revoke direct anon access (it was a confirmed-participant name oracle).
REVOKE EXECUTE ON FUNCTION public.wall_require_confirmed(uuid) FROM anon;
