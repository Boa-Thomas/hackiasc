-- ============================================================
-- MIGRACAO: pre-pitch — permitir avaliacao PARCIAL / so comentario
-- ============================================================
-- Contexto (evento ao vivo 2026-05-31): mentores relataram ficar "presos" — o
-- submit exigia os 4 criterios com nota, entao quem queria so comentar (ou ainda
-- nao tinha todas as notas) nao conseguia salvar. Esta migracao relaxa a regra:
--   - notas viram OPCIONAIS; uma nota PRESENTE ainda precisa ser 0-100.
--   - total_score so e calculado quando os 4 criterios tem nota; do contrario
--     fica NULL (parcial) — NUNCA 0, pra nao mostrar "0/100" enganoso a equipe.
-- Idempotente (ALTER ... DROP NOT NULL e CREATE OR REPLACE).

-- 1) total_score passa a aceitar NULL (parcial / so comentario)
ALTER TABLE pre_pitch_evaluations ALTER COLUMN total_score DROP NOT NULL;

-- 2) submit: notas opcionais; valida so as preenchidas; total so se completo
CREATE OR REPLACE FUNCTION mentor_prepitch_submit(
  p_token   UUID,
  p_team_id UUID,
  p_round   INTEGER,
  p_scores  JSONB,
  p_summary TEXT
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mentor_id   UUID;
  v_total       NUMERIC(5,2);
  v_total_sum   NUMERIC(5,2);
  v_keys        TEXT[];
  v_num_count   INTEGER;  -- itens com score numerico (nota preenchida)
  v_valid_count INTEGER;  -- itens com score numerico DENTRO de 0-100
  v_summary     TEXT;
  v_row         RECORD;
  v_weights     JSONB := '{"tecnica_ia":30,"validacao_problema":25,"escala_negocio":25,"pitch_equipe":20}'::jsonb;
BEGIN
  v_mentor_id := mentor_prepitch_resolve(p_token);
  IF v_mentor_id IS NULL THEN
    RAISE EXCEPTION 'invalid_token';
  END IF;

  IF p_round IS NULL OR p_round NOT IN (1, 2) THEN
    RAISE EXCEPTION 'invalid_round';
  END IF;

  IF p_team_id IS NULL OR NOT EXISTS (SELECT 1 FROM teams WHERE id = p_team_id) THEN
    RAISE EXCEPTION 'team_not_found';
  END IF;

  -- p_scores: array com os 4 criterios (chaves fixas e distintas). O `score` de
  -- cada item pode ser numero (nota) OU null/ausente (criterio sem nota).
  IF p_scores IS NULL OR jsonb_typeof(p_scores) <> 'array' THEN
    RAISE EXCEPTION 'invalid_scores';
  END IF;
  IF jsonb_array_length(p_scores) <> 4 THEN
    RAISE EXCEPTION 'invalid_scores';
  END IF;

  -- Numa passada: chaves validas, quantas notas numericas existem, quantas estao
  -- no range 0-100, e a soma ponderada das presentes.
  SELECT
    array_agg(elem->>'key'),
    COUNT(*) FILTER (WHERE jsonb_typeof(elem->'score') = 'number'),
    COUNT(*) FILTER (
      WHERE jsonb_typeof(elem->'score') = 'number'
        AND (elem->>'score')::numeric >= 0
        AND (elem->>'score')::numeric <= 100
    ),
    ROUND(SUM(
      CASE WHEN jsonb_typeof(elem->'score') = 'number'
        THEN ((elem->>'score')::numeric) * ((v_weights->>(elem->>'key'))::numeric) / 100.0
        ELSE 0 END
    ), 2)
  INTO v_keys, v_num_count, v_valid_count, v_total_sum
  FROM jsonb_array_elements(p_scores) AS elem
  WHERE elem ? 'key'
    AND (elem->>'key') IN ('tecnica_ia','validacao_problema','escala_negocio','pitch_equipe');

  -- As 4 chaves esperadas, distintas (estrutura do formulario)
  IF v_keys IS NULL OR array_length(v_keys, 1) <> 4
     OR (SELECT COUNT(DISTINCT k) FROM unnest(v_keys) AS k) <> 4 THEN
    RAISE EXCEPTION 'invalid_scores';
  END IF;

  -- Toda nota PRESENTE precisa estar em 0-100 (numericas fora do range => erro)
  IF v_valid_count <> v_num_count THEN
    RAISE EXCEPTION 'invalid_scores';
  END IF;

  -- total ponderado SO quando os 4 criterios tem nota; parcial => NULL
  IF v_num_count = 4 THEN
    v_total := v_total_sum;
  ELSE
    v_total := NULL;
  END IF;

  v_summary := LEFT(COALESCE(p_summary, ''), 5000);

  INSERT INTO pre_pitch_evaluations (team_id, mentor_id, round, scores, total_score, summary, updated_at)
  VALUES (p_team_id, v_mentor_id, p_round::smallint, p_scores, v_total, v_summary, now())
  ON CONFLICT (mentor_id, team_id, round)
  DO UPDATE SET
    scores      = EXCLUDED.scores,
    total_score = EXCLUDED.total_score,
    summary     = EXCLUDED.summary,
    updated_at  = now()
  RETURNING id, team_id, mentor_id, round, scores, total_score, summary, created_at, updated_at
  INTO v_row;

  RETURN json_build_object(
    'id', v_row.id,
    'team_id', v_row.team_id,
    'mentor_id', v_row.mentor_id,
    'round', v_row.round,
    'scores', v_row.scores,
    'total_score', v_row.total_score,
    'summary', COALESCE(v_row.summary, ''),
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION mentor_prepitch_submit(UUID, UUID, INTEGER, JSONB, TEXT) TO anon, authenticated;
