-- ============================================================
-- MIGRACAO: Consentimento do jurado (gravação + análise IA)
-- ============================================================
-- Idempotente. Depende de: add_jurors_scorecard.sql,
--                          add_evaluation_security_hardening.sql.
-- Cláusula 5.3 do edital HackIA SC 2026.

-- ============================================================
-- 1. Coluna de consentimento na tabela jurors
-- ============================================================
ALTER TABLE jurors ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ;

-- ============================================================
-- 2. RPC: jurado aceita o termo (idempotente — não sobrescreve)
-- ============================================================
CREATE OR REPLACE FUNCTION juror_accept_consent(p_token UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_juror_id  UUID;
  v_consent   TIMESTAMPTZ;
BEGIN
  v_juror_id := juror_token_owner(p_token);

  -- Só grava se ainda não consentiu (preserva timestamp original)
  UPDATE jurors
    SET consent_at = now()
  WHERE id = v_juror_id
    AND consent_at IS NULL;

  -- Retorna o valor atual (pode ser o recém-gravado ou o original)
  SELECT consent_at INTO v_consent FROM jurors WHERE id = v_juror_id;

  RETURN json_build_object('consent_at', v_consent);
END; $$;

GRANT EXECUTE ON FUNCTION juror_accept_consent(UUID) TO anon;

-- ============================================================
-- 3. Recriação de juror_get_context adicionando consent_at
-- ============================================================
-- IMPORTANTE: SET search_path = public inline (CREATE OR REPLACE
-- reseta proconfig, não herda do ALTER FUNCTION do hardening).
-- Todo o restante (teams, my_scores, GRANT anon) é preservado.
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
      SELECT json_agg(json_build_object('id', t.id, 'name', t.name) ORDER BY t.name)
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
