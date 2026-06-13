-- ============================================================
-- MIGRACAO: jurado — permitir avaliacao PARCIAL / so parecer
-- ============================================================
-- Espelha relax_prepitch_partial_save.sql para o fluxo do JURADO. O scorecard do
-- jurado e codigo proprio (juror_submit_score / JurorTeamCard) e nunca recebeu as
-- correcoes do pre-pitch. Antes, o submit exigia os 4 criterios com nota
-- (RAISE missing_criterion / score_out_of_range em null), travando quem queria
-- so comentar ou ainda nao tinha todas as notas. Agora:
--   - notas OPCIONAIS; uma nota PRESENTE ainda precisa ser numerica e 0-100.
--   - total_score so e calculado quando os 4 criterios tem nota; do contrario
--     fica NULL (parcial) — NUNCA 0, pra nao mostrar "0/100" enganoso.
-- Idempotente (CREATE OR REPLACE + ALTER ... DROP NOT NULL no-op se ja nullable).

-- total_score ja e nullable em team_evaluations; reforco defensivo/idempotente.
ALTER TABLE team_evaluations ALTER COLUMN total_score DROP NOT NULL;

CREATE OR REPLACE FUNCTION juror_submit_score(
  p_token uuid,
  p_team_id uuid,
  p_scores jsonb,
  p_summary text,
  p_eliminated boolean
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_juror_id   UUID;
  v_weights    JSONB := '{"tecnica_ia":30,"validacao_problema":25,"escala_negocio":25,"pitch_equipe":20}'::jsonb;
  v_labels     JSONB := '{"tecnica_ia":"Execução Técnica e IA","validacao_problema":"Validação do Problema","escala_negocio":"Escalabilidade e Negócio","pitch_equipe":"Pitch e Equipe"}'::jsonb;
  v_key        TEXT;
  v_in         JSONB;
  v_score      NUMERIC;
  v_just       TEXT;
  v_total      NUMERIC := 0;
  v_num_count  INTEGER := 0;  -- criterios com nota numerica preenchida
  v_norm       JSONB := '[]'::jsonb;
  v_summary    TEXT;
  v_eval_id    UUID;
BEGIN
  v_juror_id := juror_token_owner(p_token);

  IF p_team_id IS NULL OR NOT EXISTS (SELECT 1 FROM teams WHERE id = p_team_id) THEN
    RAISE EXCEPTION 'invalid_team';
  END IF;

  IF p_scores IS NULL OR jsonb_typeof(p_scores) <> 'array' THEN
    RAISE EXCEPTION 'invalid_scores';
  END IF;

  FOREACH v_key IN ARRAY ARRAY['tecnica_ia','validacao_problema','escala_negocio','pitch_equipe'] LOOP
    v_in := NULL;
    SELECT elem INTO v_in
    FROM jsonb_array_elements(p_scores) AS elem
    WHERE elem->>'criterion_key' = v_key
    LIMIT 1;

    -- Nota OPCIONAL: conta apenas quando o item tem `score` NUMERICO. null/ausente
    -- => criterio sem nota (parcial / so justificativa). String/outros tipos no
    -- campo score (e nao-null) => erro explicito.
    IF v_in IS NOT NULL AND jsonb_typeof(v_in->'score') = 'number' THEN
      v_score := (v_in->>'score')::numeric;
      IF v_score < 0 OR v_score > 100 THEN
        RAISE EXCEPTION 'score_out_of_range: %', v_key;
      END IF;
      v_total := v_total + (v_score * (v_weights->>v_key)::numeric) / 100;
      v_num_count := v_num_count + 1;
    ELSIF v_in IS NOT NULL AND (v_in ? 'score')
          AND jsonb_typeof(v_in->'score') NOT IN ('number', 'null') THEN
      RAISE EXCEPTION 'invalid_score: %', v_key;
    ELSE
      v_score := NULL;
    END IF;

    v_just := COALESCE(v_in->>'justification', '');
    IF length(v_just) > 5000 THEN
      RAISE EXCEPTION 'justification_too_long: %', v_key;
    END IF;

    v_norm := v_norm || jsonb_build_object(
      'criterion_key', v_key,
      'label',         v_labels->>v_key,
      'weight',        (v_weights->>v_key)::numeric,
      'score',         v_score,
      'justification', v_just
    );
  END LOOP;

  -- total ponderado SO quando os 4 criterios tem nota; parcial => NULL.
  IF v_num_count = 4 THEN
    v_total := round(v_total * 10) / 10;
  ELSE
    v_total := NULL;
  END IF;

  v_summary := COALESCE(p_summary, '');
  IF length(v_summary) > 5000 THEN RAISE EXCEPTION 'summary_too_long'; END IF;

  SELECT id INTO v_eval_id FROM team_evaluations
  WHERE juror_id = v_juror_id AND team_id = p_team_id LIMIT 1;

  IF v_eval_id IS NULL THEN
    INSERT INTO team_evaluations (
      team_id, evaluator_type, rubric_version, scores, total_score,
      eliminated, summary, status, juror_id, created_by, updated_at
    ) VALUES (
      p_team_id, 'human', 'edital_v1', v_norm, v_total,
      COALESCE(p_eliminated, false), NULLIF(v_summary, ''), 'done', v_juror_id, v_juror_id, now()
    )
    RETURNING id INTO v_eval_id;
  ELSE
    UPDATE team_evaluations SET
      scores         = v_norm,
      total_score    = v_total,
      eliminated     = COALESCE(p_eliminated, false),
      summary        = NULLIF(v_summary, ''),
      rubric_version = 'edital_v1',
      status         = 'done',
      updated_at     = now()
    WHERE id = v_eval_id;
  END IF;

  RETURN json_build_object('id', v_eval_id, 'total_score', v_total, 'eliminated', COALESCE(p_eliminated, false));
END; $$;

GRANT EXECUTE ON FUNCTION juror_submit_score(uuid, uuid, jsonb, text, boolean) TO anon;
