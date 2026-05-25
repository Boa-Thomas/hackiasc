-- ============================================================
-- MIGRACAO: Metadados POR SECAO dos entregaveis da equipe
-- ============================================================
-- Aplique no Supabase SQL Editor de um banco JA POPULADO.
-- Idempotente (IF NOT EXISTS / CREATE OR REPLACE).
--
-- Objetivo: alem do "ultima edicao" GERAL por equipe (teams.updated_by /
-- teams.updated_at), registrar quem editou e quando CADA entregavel
-- (hypotheses_canvas, slc_ia_canvas, learning_diary, final_deliverables).
--
-- Estrategia: uma tabela team_deliverable_meta (team_id, field) -> autor + data.
-- O RPC participant_save_team_deliverable passa a fazer UPSERT nessa tabela ao
-- fim, sem alterar nada do comportamento atual. A meta e exposta aos 3 perfis:
--   - Participante: participant_get_me.team.deliverable_meta
--   - Mentor:       mentor_serialize_me.team.deliverable_meta
--   - Admin:        SELECT direto em team_deliverable_meta (RLS de admin/viewer)

-- 1) Tabela de meta por secao -------------------------------------------------
CREATE TABLE IF NOT EXISTS team_deliverable_meta (
  team_id         UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  field           TEXT NOT NULL,
  updated_by_name TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, field)
);

ALTER TABLE team_deliverable_meta ENABLE ROW LEVEL SECURITY;

-- Leitura apenas para admin/viewer (o admin le direto via supabase-js).
-- Sem policy de escrita: a tabela so e alimentada via RPC SECURITY DEFINER.
DROP POLICY IF EXISTS "deliverable_meta_select_admin" ON team_deliverable_meta;
CREATE POLICY "deliverable_meta_select_admin" ON team_deliverable_meta
  FOR SELECT USING (is_admin_or_viewer());

-- 2) participant_save_team_deliverable ----------------------------------------
-- Copia EXATA da definicao atual (RETURNS boolean, SECURITY DEFINER, mesmas
-- validacoes e UPDATE em teams), apenas ADICIONANDO ao fim o UPSERT na meta
-- por secao (autor = full_name do registration do token).
CREATE OR REPLACE FUNCTION participant_save_team_deliverable(p_token uuid, p_field text, p_data jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_reg_id UUID;
  v_team_id UUID;
  v_full_name TEXT;
BEGIN
  v_reg_id := participant_session_owner_confirmed(p_token);

  IF p_field NOT IN ('hypotheses_canvas','slc_ia_canvas','learning_diary','final_deliverables') THEN
    RAISE EXCEPTION 'invalid_field';
  END IF;

  IF p_data IS NULL OR length(p_data::text) > 65536 THEN
    RAISE EXCEPTION 'invalid_payload';
  END IF;

  SELECT team_id, full_name INTO v_team_id, v_full_name FROM registrations WHERE id = v_reg_id;
  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'not_in_team';
  END IF;

  UPDATE teams SET
    hypotheses_canvas  = CASE WHEN p_field = 'hypotheses_canvas'  THEN p_data ELSE hypotheses_canvas  END,
    slc_ia_canvas      = CASE WHEN p_field = 'slc_ia_canvas'      THEN p_data ELSE slc_ia_canvas      END,
    learning_diary     = CASE WHEN p_field = 'learning_diary'     THEN p_data ELSE learning_diary     END,
    final_deliverables = CASE WHEN p_field = 'final_deliverables' THEN p_data ELSE final_deliverables END,
    updated_at = now(),
    updated_by = v_reg_id
  WHERE id = v_team_id;

  -- NOVO: registro por secao (quem editou ESTE entregavel e quando).
  INSERT INTO team_deliverable_meta (team_id, field, updated_by_name, updated_at)
  VALUES (v_team_id, p_field, v_full_name, now())
  ON CONFLICT (team_id, field)
  DO UPDATE SET updated_by_name = EXCLUDED.updated_by_name, updated_at = EXCLUDED.updated_at;

  RETURN true;
END;
$function$;

-- 3) participant_get_me -------------------------------------------------------
-- Copia EXATA da definicao atual, apenas ADICIONANDO 'deliverable_meta' ao JSON
-- do team: um objeto { <field>: { updated_by_name, updated_at } }.
CREATE OR REPLACE FUNCTION participant_get_me(p_token uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
$function$;

-- 4) mentor_serialize_me ------------------------------------------------------
-- Copia EXATA da definicao em add_mentor_access_token.sql, apenas ADICIONANDO
-- 'deliverable_meta' ao JSON do team (mesmo formato do participante).
CREATE OR REPLACE FUNCTION mentor_serialize_me(p_mentor_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_mentor RECORD;
  v_team JSON;
BEGIN
  SELECT id, name, email, team_id INTO v_mentor FROM mentors WHERE id = p_mentor_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_mentor.team_id IS NOT NULL THEN
    SELECT json_build_object(
      'id', t.id, 'name', t.name,
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
    ) INTO v_team
    FROM teams t WHERE t.id = v_mentor.team_id;
  ELSE
    v_team := NULL;
  END IF;

  RETURN json_build_object(
    'mentor', json_build_object(
      'id', v_mentor.id, 'name', v_mentor.name,
      'email', v_mentor.email, 'team_id', v_mentor.team_id
    ),
    'team', v_team,
    'notes', COALESCE((
      SELECT json_agg(json_build_object(
        'id', n.id, 'phase', n.phase, 'body', n.body,
        'is_public', n.is_public, 'updated_at', n.updated_at
      ) ORDER BY n.created_at)
      FROM mentor_notes n WHERE n.team_id = v_mentor.team_id AND n.mentor_id = p_mentor_id
    ), '[]'::json)
  );
END; $$;
