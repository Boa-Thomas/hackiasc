-- ============================================================
-- MIGRACAO: Contexto enriquecido para o jurado julgar
-- ============================================================
-- Idempotente (CREATE OR REPLACE). Depende de: add_jurors_scorecard.sql,
--   add_juror_consent.sql (versao atual de juror_get_context com consent_at),
--   teams (idea_description, final_deliverables, pitch_transcript),
--   registrations (economic_axes, occupation_type).
--
-- O jurado hoje recebe apenas id+name por equipe e avalia praticamente no
-- escuro. Esta migracao enriquece o payload de cada equipe com o contexto
-- ENXUTO necessario para julgar o pitch: ideia, membros, eixos economicos,
-- entregas finais (Fase 3, com links) e a transcricao do pitch.
--
-- DECISAO DE PRODUTO: a avaliacao da IA NAO e exposta ao jurado (julgamento
-- independente, sem ancorar o jurado na nota da IA). Os canvases das Fases 1/2
-- e o diario tambem ficam de fora (escopo enxuto).
--
-- Mantem tudo o que add_juror_consent.sql ja entregava (juror.consent_at,
-- my_scores, GRANT anon) e o SET search_path = public do hardening.

CREATE OR REPLACE FUNCTION juror_get_context(p_token UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_juror_id UUID;
  v_juror    RECORD;
BEGIN
  v_juror_id := juror_token_owner(p_token);
  SELECT id, name, consent_at INTO v_juror FROM jurors WHERE id = v_juror_id;

  RETURN json_build_object(
    'juror', json_build_object(
      'id',         v_juror.id,
      'name',       v_juror.name,
      'consent_at', v_juror.consent_at
    ),
    'teams', COALESCE((
      SELECT json_agg(json_build_object(
        'id',                 t.id,
        'name',               t.name,
        'idea_description',    t.idea_description,
        'final_deliverables',  t.final_deliverables,
        'pitch_transcript',    t.pitch_transcript,
        'members', COALESCE((
          SELECT json_agg(json_build_object(
            'full_name',       r.full_name,
            'is_team_leader',  r.is_team_leader,
            'occupation_type', r.occupation_type
          ) ORDER BY r.is_team_leader DESC, r.created_at)
          FROM registrations r
          WHERE r.team_id = t.id AND r.payment_status <> 'cancelled'
        ), '[]'::json),
        'economic_axes', COALESCE((
          SELECT json_agg(DISTINCT ax ORDER BY ax)
          FROM registrations r2, unnest(r2.economic_axes) AS ax
          WHERE r2.team_id = t.id AND r2.payment_status = 'confirmed'
        ), '[]'::json)
      ) ORDER BY t.name)
      FROM teams t
    ), '[]'::json),
    'my_scores', COALESCE((
      SELECT json_agg(json_build_object(
        'team_id',     te.team_id,
        'scores',      te.scores,
        'summary',     te.summary,
        'total_score', te.total_score,
        'eliminated',  te.eliminated
      ))
      FROM team_evaluations te
      WHERE te.juror_id = v_juror_id
    ), '[]'::json)
  );
END; $$;

GRANT EXECUTE ON FUNCTION juror_get_context(UUID) TO anon;
