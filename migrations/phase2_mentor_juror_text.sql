-- Phase 2: widen mentor/juror auth token params uuid -> text + grant_resolve
-- fallback, so unified #acesso grant tokens work. Legacy uuid tokens still resolve
-- (cast guarded). Additive/coexistent. Resolvers are (re)created BEFORE their
-- callers so check_function_bodies passes. mentor_delete_note/mentor_logout also
-- gain SET search_path (were missing it).

-- ============ JUROR ============
DROP FUNCTION IF EXISTS juror_token_owner(uuid);
CREATE OR REPLACE FUNCTION public.juror_token_owner(p_token text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id UUID; v jsonb;
BEGIN
  IF p_token IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  BEGIN
    SELECT id INTO v_id FROM jurors WHERE access_token = p_token::uuid AND active = true LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  EXCEPTION WHEN invalid_text_representation THEN v_id := NULL; END;
  v := grant_resolve_internal(p_token);
  IF v->>'role' = 'juror' AND v->>'ref_id' IS NOT NULL THEN RETURN (v->>'ref_id')::uuid; END IF;
  RAISE EXCEPTION 'invalid_token';
END; $function$;

DROP FUNCTION IF EXISTS juror_accept_consent(uuid);
CREATE OR REPLACE FUNCTION public.juror_accept_consent(p_token text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_juror_id UUID; v_consent TIMESTAMPTZ;
BEGIN
  v_juror_id := juror_token_owner(p_token);
  UPDATE jurors SET consent_at = now() WHERE id = v_juror_id AND consent_at IS NULL;
  SELECT consent_at INTO v_consent FROM jurors WHERE id = v_juror_id;
  RETURN json_build_object('consent_at', v_consent);
END; $function$;

DROP FUNCTION IF EXISTS juror_get_context(uuid);
CREATE OR REPLACE FUNCTION public.juror_get_context(p_token text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_juror_id UUID; v_juror RECORD; v_show BOOLEAN; v_reload TEXT;
BEGIN
  v_juror_id := juror_token_owner(p_token);
  SELECT id, name, consent_at INTO v_juror FROM jurors WHERE id = v_juror_id;
  v_show := COALESCE((SELECT value = 'true' FROM app_settings WHERE key = 'juror_idea_visible'), false);
  v_reload := COALESCE((SELECT value FROM app_settings WHERE key = 'juror_reload_at'), '0');
  RETURN json_build_object(
    'juror', json_build_object('id', v_juror.id, 'name', v_juror.name, 'consent_at', v_juror.consent_at),
    'idea_visible', v_show,
    'reload_at', v_reload,
    'teams', COALESCE((
      SELECT json_agg(json_build_object(
        'id', t.id, 'name', t.name,
        'idea_description',   CASE WHEN v_show THEN t.idea_description   ELSE NULL END,
        'final_deliverables', CASE WHEN v_show THEN t.final_deliverables ELSE NULL END,
        'pitch_transcript',   CASE WHEN v_show THEN t.pitch_transcript   ELSE NULL END,
        'members', CASE WHEN v_show THEN COALESCE((
          SELECT json_agg(json_build_object(
            'full_name', r.full_name, 'is_team_leader', r.is_team_leader, 'occupation_type', r.occupation_type
          ) ORDER BY r.is_team_leader DESC, r.created_at)
          FROM registrations r WHERE r.team_id = t.id AND r.payment_status <> 'cancelled'
        ), '[]'::json) ELSE '[]'::json END,
        'economic_axes', CASE WHEN v_show THEN COALESCE((
          SELECT json_agg(DISTINCT ax ORDER BY ax)
          FROM registrations r2, unnest(r2.economic_axes) AS ax
          WHERE r2.team_id = t.id AND r2.payment_status = 'confirmed'
        ), '[]'::json) ELSE '[]'::json END
      ) ORDER BY t.name) FROM teams t
    ), '[]'::json),
    'my_scores', COALESCE((
      SELECT json_agg(json_build_object(
        'team_id', te.team_id, 'scores', te.scores, 'summary', te.summary,
        'total_score', te.total_score, 'eliminated', te.eliminated
      )) FROM team_evaluations te WHERE te.juror_id = v_juror_id
    ), '[]'::json)
  );
END; $function$;

DROP FUNCTION IF EXISTS juror_submit_score(uuid, uuid, jsonb, text, boolean);
CREATE OR REPLACE FUNCTION public.juror_submit_score(p_token text, p_team_id uuid, p_scores jsonb, p_summary text, p_eliminated boolean)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_juror_id UUID;
  v_weights JSONB := '{"tecnica_ia":30,"validacao_problema":25,"escala_negocio":25,"pitch_equipe":20}'::jsonb;
  v_labels JSONB := '{"tecnica_ia":"Execução Técnica e IA","validacao_problema":"Validação do Problema","escala_negocio":"Escalabilidade e Negócio","pitch_equipe":"Pitch e Equipe"}'::jsonb;
  v_key TEXT; v_in JSONB; v_score NUMERIC; v_just TEXT; v_total NUMERIC := 0;
  v_norm JSONB := '[]'::jsonb; v_summary TEXT; v_eval_id UUID;
BEGIN
  v_juror_id := juror_token_owner(p_token);
  IF p_team_id IS NULL OR NOT EXISTS (SELECT 1 FROM teams WHERE id = p_team_id) THEN RAISE EXCEPTION 'invalid_team'; END IF;
  IF p_scores IS NULL OR jsonb_typeof(p_scores) <> 'array' THEN RAISE EXCEPTION 'invalid_scores'; END IF;
  FOREACH v_key IN ARRAY ARRAY['tecnica_ia','validacao_problema','escala_negocio','pitch_equipe'] LOOP
    v_in := NULL;
    SELECT elem INTO v_in FROM jsonb_array_elements(p_scores) AS elem WHERE elem->>'criterion_key' = v_key LIMIT 1;
    IF v_in IS NULL THEN RAISE EXCEPTION 'missing_criterion: %', v_key; END IF;
    BEGIN v_score := (v_in->>'score')::numeric; EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid_score: %', v_key; END;
    IF v_score IS NULL OR v_score < 0 OR v_score > 100 THEN RAISE EXCEPTION 'score_out_of_range: %', v_key; END IF;
    v_just := COALESCE(v_in->>'justification', '');
    IF length(v_just) > 5000 THEN RAISE EXCEPTION 'justification_too_long: %', v_key; END IF;
    v_total := v_total + (v_score * (v_weights->>v_key)::numeric) / 100;
    v_norm := v_norm || jsonb_build_object('criterion_key', v_key, 'label', v_labels->>v_key,
      'weight', (v_weights->>v_key)::numeric, 'score', v_score, 'justification', v_just);
  END LOOP;
  v_total := round(v_total * 10) / 10;
  v_summary := COALESCE(p_summary, '');
  IF length(v_summary) > 5000 THEN RAISE EXCEPTION 'summary_too_long'; END IF;
  SELECT id INTO v_eval_id FROM team_evaluations WHERE juror_id = v_juror_id AND team_id = p_team_id LIMIT 1;
  IF v_eval_id IS NULL THEN
    INSERT INTO team_evaluations (team_id, evaluator_type, rubric_version, scores, total_score,
      eliminated, summary, status, juror_id, created_by, updated_at)
    VALUES (p_team_id, 'human', 'edital_v1', v_norm, v_total,
      COALESCE(p_eliminated, false), NULLIF(v_summary, ''), 'done', v_juror_id, v_juror_id, now())
    RETURNING id INTO v_eval_id;
  ELSE
    UPDATE team_evaluations SET scores = v_norm, total_score = v_total,
      eliminated = COALESCE(p_eliminated, false), summary = NULLIF(v_summary, ''),
      rubric_version = 'edital_v1', status = 'done', updated_at = now()
    WHERE id = v_eval_id;
  END IF;
  RETURN json_build_object('id', v_eval_id, 'total_score', v_total, 'eliminated', COALESCE(p_eliminated, false));
END; $function$;

-- ============ MENTOR (resolvers first) ============
DROP FUNCTION IF EXISTS mentor_session_owner(uuid);
CREATE OR REPLACE FUNCTION public.mentor_session_owner(p_token text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id UUID; v jsonb;
BEGIN
  BEGIN
    SELECT mentor_id INTO v_id FROM mentor_sessions WHERE token = p_token::uuid AND expires_at > now() LIMIT 1;
    IF v_id IS NOT NULL THEN
      UPDATE mentor_sessions SET last_used_at = now() WHERE token = p_token::uuid;
      RETURN v_id;
    END IF;
    SELECT id INTO v_id FROM mentors WHERE access_token = p_token::uuid LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  EXCEPTION WHEN invalid_text_representation THEN v_id := NULL; END;
  v := grant_resolve_internal(p_token);
  IF v->>'role' = 'mentor' AND v->>'ref_id' IS NOT NULL THEN RETURN (v->>'ref_id')::uuid; END IF;
  RAISE EXCEPTION 'invalid_or_expired_session';
END; $function$;

DROP FUNCTION IF EXISTS mentor_prepitch_resolve(uuid);
CREATE OR REPLACE FUNCTION public.mentor_prepitch_resolve(p_token text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id UUID; v jsonb;
BEGIN
  IF p_token IS NULL THEN RETURN NULL; END IF;
  BEGIN
    SELECT mentor_id INTO v_id FROM mentor_sessions WHERE token = p_token::uuid AND expires_at > now() LIMIT 1;
    IF v_id IS NOT NULL THEN
      UPDATE mentor_sessions SET last_used_at = now() WHERE token = p_token::uuid;
      RETURN v_id;
    END IF;
    SELECT id INTO v_id FROM mentors WHERE access_token = p_token::uuid LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  EXCEPTION WHEN invalid_text_representation THEN v_id := NULL; END;
  BEGIN
    v := grant_resolve_internal(p_token);
    IF v->>'role' = 'mentor' AND v->>'ref_id' IS NOT NULL THEN RETURN (v->>'ref_id')::uuid; END IF;
  EXCEPTION WHEN others THEN RETURN NULL; END;
  RETURN NULL;
END; $function$;

DROP FUNCTION IF EXISTS mentor_get_me(uuid);
CREATE OR REPLACE FUNCTION public.mentor_get_me(p_token text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_mentor_id UUID;
BEGIN
  v_mentor_id := mentor_session_owner(p_token);
  RETURN mentor_serialize_me(v_mentor_id);
END; $function$;

DROP FUNCTION IF EXISTS mentor_save_note(uuid, text, text, boolean, uuid, uuid);
CREATE OR REPLACE FUNCTION public.mentor_save_note(p_token text, p_phase text, p_body text, p_is_public boolean, p_note_id uuid DEFAULT NULL::uuid, p_team_id uuid DEFAULT NULL::uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_mentor_id UUID; v_note_id UUID;
BEGIN
  v_mentor_id := mentor_session_owner(p_token);
  IF p_phase NOT IN ('ignicao','construcao','apresentacao') THEN RAISE EXCEPTION 'invalid_phase'; END IF;
  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN RAISE EXCEPTION 'empty_body'; END IF;
  IF length(p_body) > 5000 THEN RAISE EXCEPTION 'body_too_long'; END IF;
  IF p_team_id IS NULL THEN RAISE EXCEPTION 'team_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM mentor_teams WHERE mentor_id = v_mentor_id AND team_id = p_team_id) THEN RAISE EXCEPTION 'not_paired'; END IF;
  IF p_note_id IS NULL THEN
    INSERT INTO mentor_notes (team_id, mentor_id, phase, body, is_public)
    VALUES (p_team_id, v_mentor_id, p_phase, p_body, COALESCE(p_is_public, false))
    RETURNING id INTO v_note_id;
  ELSE
    UPDATE mentor_notes SET phase = p_phase, body = p_body, is_public = COALESCE(p_is_public, false), updated_at = now()
    WHERE id = p_note_id AND mentor_id = v_mentor_id RETURNING id INTO v_note_id;
    IF v_note_id IS NULL THEN RAISE EXCEPTION 'note_not_found'; END IF;
  END IF;
  RETURN v_note_id;
END; $function$;

DROP FUNCTION IF EXISTS mentor_delete_note(uuid, uuid);
CREATE OR REPLACE FUNCTION public.mentor_delete_note(p_token text, p_note_id uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_mentor_id UUID; v_deleted INTEGER;
BEGIN
  v_mentor_id := mentor_session_owner(p_token);
  DELETE FROM mentor_notes WHERE id = p_note_id AND mentor_id = v_mentor_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN RAISE EXCEPTION 'note_not_found'; END IF;
  RETURN true;
END; $function$;

DROP FUNCTION IF EXISTS mentor_prepitch_list(uuid);
CREATE OR REPLACE FUNCTION public.mentor_prepitch_list(p_token text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_mentor_id UUID; v_mentor RECORD; v_teams JSON; v_evals JSON;
BEGIN
  v_mentor_id := mentor_prepitch_resolve(p_token);
  IF v_mentor_id IS NULL THEN RETURN NULL; END IF;
  SELECT id, name, email INTO v_mentor FROM mentors WHERE id = v_mentor_id;
  SELECT COALESCE(json_agg(t_obj ORDER BY t_name), '[]'::json) INTO v_teams
  FROM (
    SELECT t.name AS t_name, json_build_object(
      'id', t.id, 'name', t.name, 'idea_description', COALESCE(t.idea_description, ''),
      'members', COALESCE((
        SELECT json_agg(json_build_object('full_name', r.full_name, 'is_team_leader', r.is_team_leader)
          ORDER BY r.is_team_leader DESC, r.created_at)
        FROM registrations r WHERE r.team_id = t.id AND r.payment_status = 'confirmed'
      ), '[]'::json)
    ) AS t_obj FROM teams t
  ) sub;
  SELECT COALESCE(json_agg(json_build_object(
    'team_id', e.team_id, 'round', e.round, 'scores', e.scores, 'total_score', e.total_score,
    'summary', COALESCE(e.summary, ''), 'updated_at', e.updated_at
  ) ORDER BY e.team_id, e.round), '[]'::json) INTO v_evals
  FROM pre_pitch_evaluations e WHERE e.mentor_id = v_mentor_id;
  RETURN json_build_object(
    'mentor', json_build_object('id', v_mentor.id, 'name', v_mentor.name, 'email', v_mentor.email),
    'teams', v_teams, 'my_evaluations', v_evals);
END; $function$;

DROP FUNCTION IF EXISTS mentor_prepitch_submit(uuid, uuid, integer, jsonb, text);
CREATE OR REPLACE FUNCTION public.mentor_prepitch_submit(p_token text, p_team_id uuid, p_round integer, p_scores jsonb, p_summary text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_mentor_id UUID; v_total NUMERIC(5,2); v_total_sum NUMERIC(5,2); v_keys TEXT[];
  v_num_count INTEGER; v_valid_count INTEGER; v_summary TEXT; v_row RECORD;
  v_weights JSONB := '{"tecnica_ia":30,"validacao_problema":25,"escala_negocio":25,"pitch_equipe":20}'::jsonb;
BEGIN
  v_mentor_id := mentor_prepitch_resolve(p_token);
  IF v_mentor_id IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  IF p_round IS NULL OR p_round NOT IN (1, 2) THEN RAISE EXCEPTION 'invalid_round'; END IF;
  IF p_team_id IS NULL OR NOT EXISTS (SELECT 1 FROM teams WHERE id = p_team_id) THEN RAISE EXCEPTION 'team_not_found'; END IF;
  IF p_scores IS NULL OR jsonb_typeof(p_scores) <> 'array' THEN RAISE EXCEPTION 'invalid_scores'; END IF;
  IF jsonb_array_length(p_scores) <> 4 THEN RAISE EXCEPTION 'invalid_scores'; END IF;
  SELECT
    array_agg(elem->>'key'),
    COUNT(*) FILTER (WHERE jsonb_typeof(elem->'score') = 'number'),
    COUNT(*) FILTER (WHERE jsonb_typeof(elem->'score') = 'number' AND (elem->>'score')::numeric >= 0 AND (elem->>'score')::numeric <= 100),
    ROUND(SUM(CASE WHEN jsonb_typeof(elem->'score') = 'number'
      THEN ((elem->>'score')::numeric) * ((v_weights->>(elem->>'key'))::numeric) / 100.0 ELSE 0 END), 2)
  INTO v_keys, v_num_count, v_valid_count, v_total_sum
  FROM jsonb_array_elements(p_scores) AS elem
  WHERE elem ? 'key' AND (elem->>'key') IN ('tecnica_ia','validacao_problema','escala_negocio','pitch_equipe');
  IF v_keys IS NULL OR array_length(v_keys, 1) <> 4 OR (SELECT COUNT(DISTINCT k) FROM unnest(v_keys) AS k) <> 4 THEN RAISE EXCEPTION 'invalid_scores'; END IF;
  IF v_valid_count <> v_num_count THEN RAISE EXCEPTION 'invalid_scores'; END IF;
  IF v_num_count = 4 THEN v_total := v_total_sum; ELSE v_total := NULL; END IF;
  v_summary := LEFT(COALESCE(p_summary, ''), 5000);
  INSERT INTO pre_pitch_evaluations (team_id, mentor_id, round, scores, total_score, summary, updated_at)
  VALUES (p_team_id, v_mentor_id, p_round::smallint, p_scores, v_total, v_summary, now())
  ON CONFLICT (mentor_id, team_id, round)
  DO UPDATE SET scores = EXCLUDED.scores, total_score = EXCLUDED.total_score, summary = EXCLUDED.summary, updated_at = now()
  RETURNING id, team_id, mentor_id, round, scores, total_score, summary, created_at, updated_at INTO v_row;
  RETURN json_build_object('id', v_row.id, 'team_id', v_row.team_id, 'mentor_id', v_row.mentor_id,
    'round', v_row.round, 'scores', v_row.scores, 'total_score', v_row.total_score,
    'summary', COALESCE(v_row.summary, ''), 'created_at', v_row.created_at, 'updated_at', v_row.updated_at);
END; $function$;

DROP FUNCTION IF EXISTS mentor_get_me_by_token(uuid);
CREATE OR REPLACE FUNCTION public.mentor_get_me_by_token(p_access_token text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_mentor_id UUID;
BEGIN
  IF p_access_token IS NULL THEN RETURN NULL; END IF;
  BEGIN
    SELECT id INTO v_mentor_id FROM mentors WHERE access_token = p_access_token::uuid LIMIT 1;
  EXCEPTION WHEN invalid_text_representation THEN RETURN NULL; END;
  IF v_mentor_id IS NULL THEN RETURN NULL; END IF;
  RETURN mentor_serialize_me(v_mentor_id);
END; $function$;

DROP FUNCTION IF EXISTS mentor_logout(uuid);
CREATE OR REPLACE FUNCTION public.mentor_logout(p_token text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    DELETE FROM mentor_sessions WHERE token = p_token::uuid;
  EXCEPTION WHEN invalid_text_representation THEN NULL; END;
  RETURN true;
END; $function$;

-- ============ SUGAR (mentor-token paths -> text; participant path stays uuid) ============
DROP FUNCTION IF EXISTS sugar_my_received_mentor(uuid);
CREATE OR REPLACE FUNCTION public.sugar_my_received_mentor(p_token text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_mentor UUID; v_released BOOLEAN; v_list JSON;
BEGIN
  v_mentor := mentor_session_owner(p_token);
  SELECT COALESCE((SELECT value = 'true' FROM app_settings WHERE key = 'sugar_released'), false) INTO v_released;
  IF NOT v_released THEN RETURN '[]'::JSON; END IF;
  SELECT json_agg(json_build_object('message', message, 'created_at', created_at) ORDER BY created_at DESC)
    INTO v_list FROM sugar_cubes
    WHERE recipient_type = 'mentor' AND recipient_ref = v_mentor AND status = 'approved';
  RETURN COALESCE(v_list, '[]'::JSON);
END; $function$;

DROP FUNCTION IF EXISTS sugar_send_mentor(uuid, text, uuid, text);
CREATE OR REPLACE FUNCTION public.sugar_send_mentor(p_token text, p_recipient_type text, p_recipient_ref uuid, p_message text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_mentor UUID; v_name TEXT;
BEGIN
  v_mentor := mentor_session_owner(p_token);
  SELECT name INTO v_name FROM mentors WHERE id = v_mentor;
  RETURN sugar_insert('mentor', v_mentor, v_name, p_recipient_type, p_recipient_ref, p_message);
END; $function$;

DROP FUNCTION IF EXISTS sugar_roster(uuid, uuid);
CREATE OR REPLACE FUNCTION public.sugar_roster(p_participant_token uuid DEFAULT NULL::uuid, p_mentor_token text DEFAULT NULL::text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_ok BOOLEAN := false; v_participants JSON; v_mentors JSON;
BEGIN
  IF p_participant_token IS NOT NULL THEN
    BEGIN PERFORM participant_session_owner_confirmed(p_participant_token); v_ok := true;
    EXCEPTION WHEN raise_exception THEN NULL; END;
  END IF;
  IF NOT v_ok AND p_mentor_token IS NOT NULL THEN
    BEGIN PERFORM mentor_session_owner(p_mentor_token); v_ok := true;
    EXCEPTION WHEN raise_exception THEN NULL; END;
  END IF;
  IF NOT v_ok THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT json_agg(json_build_object('ref', id, 'name', full_name) ORDER BY full_name)
    INTO v_participants FROM registrations WHERE payment_status = 'confirmed' AND checked_in_at IS NOT NULL;
  SELECT json_agg(json_build_object('ref', id, 'name', name) ORDER BY name) INTO v_mentors FROM mentors;
  RETURN json_build_object('participants', COALESCE(v_participants, '[]'::JSON),
    'mentors', COALESCE(v_mentors, '[]'::JSON), 'organization', true);
END; $function$;

-- ============ GRANTS (these are anon-callable token RPCs) ============
GRANT EXECUTE ON FUNCTION juror_token_owner(text), juror_accept_consent(text), juror_get_context(text),
  juror_submit_score(text, uuid, jsonb, text, boolean),
  mentor_session_owner(text), mentor_prepitch_resolve(text), mentor_get_me(text),
  mentor_save_note(text, text, text, boolean, uuid, uuid), mentor_delete_note(text, uuid),
  mentor_prepitch_list(text), mentor_prepitch_submit(text, uuid, integer, jsonb, text),
  mentor_get_me_by_token(text), mentor_logout(text),
  sugar_my_received_mentor(text), sugar_send_mentor(text, text, uuid, text),
  sugar_roster(uuid, text)
  TO anon, authenticated;
