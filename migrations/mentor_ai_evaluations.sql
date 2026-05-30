-- ============================================================
-- MIGRACAO: Avaliacao completa da IA no painel do mentor
-- ============================================================
-- O mentor passa a ver, no proprio painel, a avaliacao completa do IA Evaluator
-- das equipes que mentora (nota + justificativa por criterio + eixos + parecer).
-- SEM switch: o mentor e parte da organizacao. O lado da EQUIPE nao muda (continua
-- so a nota agregada, atras de team_scores_visible).
--
-- Mudanca minima e aditiva: re-define mentor_serialize_me (definido por ultimo em
-- mentor_teams_nn.sql) adicionando a chave `evaluations` ao JSON, espelhando o
-- padrao de `notes` (array de TODAS as equipes do mentor, cada item com team_id
-- para o frontend filtrar). Os RPCs mentor_get_me / mentor_get_me_by_token NAO
-- mudam: ja delegam a este serializer. Sem novos GRANT. Idempotente.

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
    ), '[]'::json),
    -- NOVO: avaliacoes completas do IA Evaluator (so equipes pareadas ao mentor).
    -- Cada item carrega team_id (frontend filtra pela equipe ativa, como em notes).
    -- So avaliacoes da IA ja concluidas (evaluator_type='ai', status='done', com
    -- entregavel). A nota oficial dos jurados (evaluator_type='human') NAO entra.
    'evaluations', COALESCE((
      SELECT json_agg(json_build_object(
        'team_id', e.team_id, 'deliverable', e.deliverable,
        'total_score', e.total_score, 'eliminated', e.eliminated,
        'scores', e.scores, 'axes', e.axes, 'summary', e.summary,
        'model', e.model, 'updated_at', e.updated_at
      ) ORDER BY e.deliverable)
      FROM team_evaluations e
      WHERE e.evaluator_type = 'ai'
        AND e.status = 'done'
        AND e.deliverable IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM mentor_teams mt
          WHERE mt.mentor_id = p_mentor_id AND mt.team_id = e.team_id
        )
    ), '[]'::json)
  );
END; $$;

-- Sem GRANT novo: mentor_get_me / mentor_get_me_by_token (que delegam a este
-- serializer) ja tem EXECUTE para anon e continuam validando a sessao/token.
