-- Edição participante de nome de equipe + descrição da ideia + vitrine pública.
-- Qualquer membro confirmado pode renomear a equipe e descrever a ideia (≤500).
-- Renomear reusa o trigger cascade_team_rename (espelha em registrations + pedidos).

-- 1. Coluna nova ------------------------------------------------------------
ALTER TABLE teams ADD COLUMN IF NOT EXISTS idea_description TEXT;

-- 2. RPC: qualquer membro confirmado edita nome + descrição da própria equipe
CREATE OR REPLACE FUNCTION participant_update_team(p_token UUID, p_team_name TEXT, p_idea_description TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg_id UUID;
  v_team_id UUID;
  v_clean_name TEXT;
  v_clean_idea TEXT;
BEGIN
  v_reg_id := participant_session_owner_confirmed(p_token);

  -- team_id derivado da sessão — nunca recebido do cliente (sem IDOR)
  SELECT team_id INTO v_team_id FROM registrations WHERE id = v_reg_id;
  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'not_in_team';
  END IF;

  v_clean_name := TRIM(COALESCE(p_team_name, ''));
  IF v_clean_name = '' OR length(v_clean_name) > 120 THEN
    RAISE EXCEPTION 'team_name_required';
  END IF;

  v_clean_idea := NULLIF(TRIM(COALESCE(p_idea_description, '')), '');
  IF v_clean_idea IS NOT NULL AND length(v_clean_idea) > 500 THEN
    RAISE EXCEPTION 'idea_too_long';
  END IF;

  UPDATE teams
  SET name = v_clean_name,
      idea_description = v_clean_idea,
      updated_at = now(),
      updated_by = v_reg_id
  WHERE id = v_team_id;

  RETURN true;
EXCEPTION
  WHEN unique_violation THEN RAISE EXCEPTION 'team_name_taken';
END;
$$;

GRANT EXECUTE ON FUNCTION participant_update_team(UUID, TEXT, TEXT) TO anon;

-- 3. RPC anon: vitrine pública (sem dados pessoais) -------------------------
CREATE OR REPLACE FUNCTION public_list_teams()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_result JSON;
BEGIN
  SELECT COALESCE(json_agg(obj ORDER BY obj_name), '[]'::json)
  INTO v_result
  FROM (
    SELECT t.name AS obj_name, json_build_object(
      'name', t.name,
      'idea_description', t.idea_description,
      'member_count', (
        SELECT COUNT(*)::INTEGER FROM registrations r
        WHERE r.team_id = t.id AND r.payment_status = 'confirmed'
      ),
      'economic_axes', COALESCE((
        SELECT json_agg(DISTINCT ax)
        FROM registrations r2, unnest(r2.economic_axes) AS ax
        WHERE r2.team_id = t.id AND r2.payment_status = 'confirmed'
      ), '[]'::json)
    ) AS obj
    FROM teams t
    WHERE EXISTS (
      SELECT 1 FROM registrations r
      WHERE r.team_id = t.id AND r.payment_status = 'confirmed'
    )
  ) sub;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public_list_teams() TO anon;

-- 4. participant_get_me — passa a devolver team.idea_description -------------
CREATE OR REPLACE FUNCTION participant_get_me(p_token UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_reg_id UUID;
  v_reg RECORD;
  v_members JSON;
  v_pending_requests JSON;
  v_my_requests JSON;
  v_team JSON;
BEGIN
  v_reg_id := participant_session_owner(p_token);

  SELECT id, full_name, email, phone, birth_date, linkedin_url,
         occupation_type, ai_experience_level, dietary_restrictions,
         is_pcd, pcd_type, has_project, project_name, economic_axes,
         inscription_modality, team_name, team_id, is_team_leader, is_remote,
         payment_status, payment_method, ticket_tier, ticket_price,
         created_at, checked_in_at
  INTO v_reg
  FROM registrations WHERE id = v_reg_id;

  -- Quem ainda não confirmou pagamento não acessa dados de equipe.
  IF v_reg.payment_status <> 'confirmed' THEN
    RETURN json_build_object(
      'profile', row_to_json(v_reg),
      'team_members', '[]'::JSON,
      'pending_requests', '[]'::JSON,
      'my_requests', '[]'::JSON,
      'team', NULL
    );
  END IF;

  IF v_reg.team_name IS NOT NULL THEN
    SELECT json_agg(m ORDER BY m.is_team_leader DESC, m.created_at)
    INTO v_members
    FROM (
      SELECT id, full_name, email, is_team_leader, occupation_type,
             ai_experience_level, is_remote, created_at
      FROM registrations
      WHERE team_name = v_reg.team_name
    ) m;
  ELSE
    v_members := '[]'::JSON;
  END IF;

  IF v_reg.is_team_leader AND v_reg.team_name IS NOT NULL THEN
    SELECT json_agg(p ORDER BY p.created_at)
    INTO v_pending_requests
    FROM (
      SELECT tjr.id, tjr.created_at, tjr.message,
             json_build_object(
               'id', r.id,
               'full_name', r.full_name,
               'email', r.email,
               'occupation_type', r.occupation_type,
               'ai_experience_level', r.ai_experience_level
             ) AS requester
      FROM team_join_requests tjr
      JOIN registrations r ON r.id = tjr.requester_id
      WHERE tjr.team_name = v_reg.team_name AND tjr.status = 'pending'
    ) p;
  ELSE
    v_pending_requests := '[]'::JSON;
  END IF;

  SELECT json_agg(q ORDER BY q.created_at DESC)
  INTO v_my_requests
  FROM (
    SELECT id, team_name, status, created_at, decided_at
    FROM team_join_requests
    WHERE requester_id = v_reg_id
      AND status IN ('pending', 'rejected')
      AND created_at > now() - interval '30 days'
  ) q;

  IF v_reg.team_id IS NOT NULL THEN
    SELECT json_build_object(
      'id', t.id,
      'name', t.name,
      'idea_description', t.idea_description,
      'hypotheses_canvas', t.hypotheses_canvas,
      'slc_ia_canvas', t.slc_ia_canvas,
      'learning_diary', t.learning_diary,
      'final_deliverables', t.final_deliverables,
      'updated_at', t.updated_at,
      'updated_by_name', (SELECT full_name FROM registrations WHERE id = t.updated_by),
      'public_notes', COALESCE((
        SELECT json_agg(json_build_object(
          'id', n.id, 'phase', n.phase, 'body', n.body, 'updated_at', n.updated_at
        ) ORDER BY n.created_at)
        FROM mentor_notes n WHERE n.team_id = t.id AND n.is_public = true
      ), '[]'::json)
    ) INTO v_team
    FROM teams t WHERE t.id = v_reg.team_id;
  ELSE
    v_team := NULL;
  END IF;

  RETURN json_build_object(
    'profile', row_to_json(v_reg),
    'team_members', COALESCE(v_members, '[]'::JSON),
    'pending_requests', COALESCE(v_pending_requests, '[]'::JSON),
    'my_requests', COALESCE(v_my_requests, '[]'::JSON),
    'team', v_team
  );
END;
$$;

GRANT EXECUTE ON FUNCTION participant_get_me(UUID) TO anon;

-- 5. participant_list_teams — passa a devolver idea_description --------------
CREATE OR REPLACE FUNCTION participant_list_teams(p_token UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_reg_id UUID;
  v_result JSON;
BEGIN
  v_reg_id := participant_session_owner_confirmed(p_token);

  SELECT json_agg(t ORDER BY t.team_name)
  INTO v_result
  FROM (
    SELECT
      r.team_name,
      COUNT(*)::INTEGER AS member_count,
      (SELECT full_name FROM registrations
       WHERE team_name = r.team_name AND is_team_leader = true LIMIT 1) AS leader_name,
      (SELECT idea_description FROM teams WHERE name = r.team_name) AS idea_description
    FROM registrations r
    WHERE r.team_name IS NOT NULL
      AND r.payment_status <> 'cancelled'
    GROUP BY r.team_name
    HAVING COUNT(*) < 6
  ) t;

  RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

GRANT EXECUTE ON FUNCTION participant_list_teams(UUID) TO anon;

-- 6. mentor_serialize_me — passa a devolver team.idea_description ------------
--    (helper interno; sem GRANT a anon)
CREATE OR REPLACE FUNCTION mentor_serialize_me(p_mentor_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_mentor RECORD;
  v_teams JSON;
BEGIN
  SELECT id, name, email INTO v_mentor FROM mentors WHERE id = p_mentor_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(json_agg(t_obj ORDER BY t_name), '[]'::json) INTO v_teams
  FROM (
    SELECT t.name AS t_name, json_build_object(
      'id', t.id, 'name', t.name,
      'idea_description', t.idea_description,
      'hypotheses_canvas', t.hypotheses_canvas,
      'slc_ia_canvas', t.slc_ia_canvas,
      'learning_diary', t.learning_diary,
      'final_deliverables', t.final_deliverables,
      'updated_at', t.updated_at,
      'updated_by_name', (SELECT full_name FROM registrations WHERE id = t.updated_by),
      'deliverable_meta', COALESCE((
        SELECT json_object_agg(dm.field, json_build_object(
          'updated_by_name', dm.updated_by_name, 'updated_at', dm.updated_at
        ))
        FROM team_deliverable_meta dm WHERE dm.team_id = t.id
      ), '{}'::json),
      'members', COALESCE((
        SELECT json_agg(json_build_object(
          'full_name', r.full_name, 'email', r.email,
          'is_team_leader', r.is_team_leader, 'occupation_type', r.occupation_type,
          'is_remote', r.is_remote
        ) ORDER BY r.is_team_leader DESC, r.created_at)
        FROM registrations r
        WHERE r.team_id = t.id AND r.payment_status <> 'cancelled'
      ), '[]'::json)
    ) AS t_obj
    FROM mentor_teams mt JOIN teams t ON t.id = mt.team_id
    WHERE mt.mentor_id = p_mentor_id
  ) sub;

  RETURN json_build_object(
    'mentor', json_build_object(
      'id', v_mentor.id, 'name', v_mentor.name, 'email', v_mentor.email
    ),
    'teams', v_teams,
    'notes', COALESCE((
      SELECT json_agg(json_build_object(
        'id', n.id, 'team_id', n.team_id, 'phase', n.phase, 'body', n.body,
        'is_public', n.is_public, 'updated_at', n.updated_at
      ) ORDER BY n.created_at)
      FROM mentor_notes n
      WHERE n.mentor_id = p_mentor_id
        AND EXISTS (
          SELECT 1 FROM mentor_teams mt
          WHERE mt.mentor_id = p_mentor_id AND mt.team_id = n.team_id
        )
    ), '[]'::json)
  );
END; $$;
