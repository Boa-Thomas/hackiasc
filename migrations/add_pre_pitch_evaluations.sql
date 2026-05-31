-- ============================================================
-- MIGRACAO: Avaliacao de PRE-PITCH (mentores) — 2 rodadas, 4 criterios
-- ============================================================
-- Feature ADITIVA (nova tabela + novas RPCs). Nao altera nada existente.
-- EVENTO AO VIVO (2026-05-31): idempotente (IF NOT EXISTS / CREATE OR REPLACE /
-- ON CONFLICT / DROP POLICY IF EXISTS).
--
-- Regras de negocio:
--   - SO MENTORES avaliam, e qualquer equipe (nao precisa estar pareada).
--   - 2 RODADAS: 1 e 2. Uma avaliacao por (mentor, equipe, rodada).
--   - 4 criterios do edital, pesos fixos (somam 100):
--       tecnica_ia          = 30
--       validacao_problema  = 25
--       escala_negocio      = 25
--       pitch_equipe        = 20
--     Cada criterio: nota 0-100 + comentario. Mais um parecer (summary) por avaliacao.
--   - total_score calculado SERVER-SIDE = round(SUM(score * peso / 100), 2)  → escala 0-100.
--   - Participante (logado pela equipe) le SO o feedback da PROPRIA equipe,
--     com o nome do mentor que avaliou.
--
-- Seguranca: tabela com RLS; SELECT direto so para admin/viewer. Escrita SO via
-- RPC SECURITY DEFINER (sem policy de INSERT/UPDATE/DELETE para anon/authenticated).
-- Resolucao de identidade sempre derivada do token (sem IDOR).

-- ------------------------------------------------------------
-- 1. Tabela
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pre_pitch_evaluations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES teams(id)   ON DELETE CASCADE,
  mentor_id   UUID NOT NULL REFERENCES mentors(id) ON DELETE CASCADE,
  round       SMALLINT NOT NULL CHECK (round IN (1, 2)),
  scores      JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  summary     TEXT DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_prepitch_mentor_team_round UNIQUE (mentor_id, team_id, round)
);

CREATE INDEX IF NOT EXISTS idx_prepitch_team   ON pre_pitch_evaluations(team_id);
CREATE INDEX IF NOT EXISTS idx_prepitch_mentor ON pre_pitch_evaluations(mentor_id);

ALTER TABLE pre_pitch_evaluations ENABLE ROW LEVEL SECURITY;

-- Leitura direta: so admin/viewer (painel admin). Escrita: so via RPC definer.
DROP POLICY IF EXISTS "Admin can read prepitch" ON pre_pitch_evaluations;
CREATE POLICY "Admin can read prepitch" ON pre_pitch_evaluations
  FOR SELECT TO authenticated USING (is_admin_or_viewer());

-- ------------------------------------------------------------
-- 2. Helper: resolve mentor_id a partir do token (NULL em vez de raise)
-- ------------------------------------------------------------
-- Tenta a sessao (mentor_sessions: token valido e nao expirado); se nao achar,
-- aceita o access_token "permanente" do link (mentors.access_token). Pode
-- retornar NULL — quem chama decide (lista/feedback => NULL; submit => raise).
CREATE OR REPLACE FUNCTION mentor_prepitch_resolve(p_token UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  IF p_token IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT mentor_id INTO v_id
  FROM mentor_sessions
  WHERE token = p_token AND expires_at > now()
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE mentor_sessions SET last_used_at = now() WHERE token = p_token;
    RETURN v_id;
  END IF;

  SELECT id INTO v_id FROM mentors WHERE access_token = p_token LIMIT 1;
  RETURN v_id;  -- pode ser NULL
END;
$$;

-- ------------------------------------------------------------
-- 3. mentor_prepitch_list: contexto p/ a tela do mentor
-- ------------------------------------------------------------
-- Retorna TODAS as equipes (qualquer mentor avalia qualquer equipe) + as
-- avaliacoes ja feitas POR ESTE mentor. NULL se o token nao resolve.
CREATE OR REPLACE FUNCTION mentor_prepitch_list(p_token UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mentor_id UUID;
  v_mentor RECORD;
  v_teams JSON;
  v_evals JSON;
BEGIN
  v_mentor_id := mentor_prepitch_resolve(p_token);
  IF v_mentor_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id, name, email INTO v_mentor FROM mentors WHERE id = v_mentor_id;

  SELECT COALESCE(json_agg(t_obj ORDER BY t_name), '[]'::json) INTO v_teams
  FROM (
    SELECT t.name AS t_name, json_build_object(
      'id', t.id,
      'name', t.name,
      'idea_description', COALESCE(t.idea_description, ''),
      'members', COALESCE((
        SELECT json_agg(json_build_object(
          'full_name', r.full_name,
          'is_team_leader', r.is_team_leader
        ) ORDER BY r.is_team_leader DESC, r.created_at)
        FROM registrations r
        WHERE r.team_id = t.id AND r.payment_status = 'confirmed'
      ), '[]'::json)
    ) AS t_obj
    FROM teams t
  ) sub;

  SELECT COALESCE(json_agg(json_build_object(
    'team_id', e.team_id,
    'round', e.round,
    'scores', e.scores,
    'total_score', e.total_score,
    'summary', COALESCE(e.summary, ''),
    'updated_at', e.updated_at
  ) ORDER BY e.team_id, e.round), '[]'::json) INTO v_evals
  FROM pre_pitch_evaluations e
  WHERE e.mentor_id = v_mentor_id;

  RETURN json_build_object(
    'mentor', json_build_object(
      'id', v_mentor.id, 'name', v_mentor.name, 'email', v_mentor.email
    ),
    'teams', v_teams,
    'my_evaluations', v_evals
  );
END;
$$;

-- ------------------------------------------------------------
-- 4. mentor_prepitch_submit: grava/atualiza uma avaliacao
-- ------------------------------------------------------------
-- Valida tudo server-side: rodada, formato dos 4 criterios, chaves, notas 0-100;
-- calcula total ponderado; upsert por (mentor, equipe, rodada). Retorna a linha.
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
  v_mentor_id UUID;
  v_total     NUMERIC(5,2);
  v_count     INTEGER;
  v_keys      TEXT[];
  v_summary   TEXT;
  v_row       RECORD;
  -- pesos fixos dos criterios (somam 100)
  v_weights   JSONB := '{"tecnica_ia":30,"validacao_problema":25,"escala_negocio":25,"pitch_equipe":20}'::jsonb;
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

  -- p_scores deve ser um array com EXATAMENTE 4 itens
  IF p_scores IS NULL OR jsonb_typeof(p_scores) <> 'array' THEN
    RAISE EXCEPTION 'invalid_scores';
  END IF;
  IF jsonb_array_length(p_scores) <> 4 THEN
    RAISE EXCEPTION 'invalid_scores';
  END IF;

  -- Cada item: {key, score, comment}; key ∈ pesos; score 0-100 numerico.
  -- Validacao + soma ponderada em uma passada. Tambem garante chaves distintas
  -- (cobre as 4 exatas), via array agregado verificado no fim.
  SELECT
    COUNT(*),
    array_agg(elem->>'key'),
    ROUND(SUM(
      ((elem->>'score')::numeric) * ((v_weights->>(elem->>'key'))::numeric) / 100.0
    ), 2)
  INTO v_count, v_keys, v_total
  FROM jsonb_array_elements(p_scores) AS elem
  WHERE elem ? 'key'
    AND elem ? 'score'
    AND (elem->>'key') IN ('tecnica_ia','validacao_problema','escala_negocio','pitch_equipe')
    AND jsonb_typeof(elem->'score') = 'number'
    AND (elem->>'score')::numeric >= 0
    AND (elem->>'score')::numeric <= 100;

  -- Todos os 4 itens validos?
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'invalid_scores';
  END IF;
  -- As 4 chaves devem ser distintas (sem duplicata cobrindo uma faltante)
  IF (SELECT COUNT(DISTINCT k) FROM unnest(v_keys) AS k) <> 4 THEN
    RAISE EXCEPTION 'invalid_scores';
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

-- ------------------------------------------------------------
-- 5. participant_prepitch_feedback: feedback da PROPRIA equipe
-- ------------------------------------------------------------
-- Resolve a registration via token; team_id derivado da sessao (sem IDOR).
-- Agrupa por rodada. NULL se token invalido ou sem equipe.
CREATE OR REPLACE FUNCTION participant_prepitch_feedback(p_token UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg_id  UUID;
  v_team_id UUID;
  v_team    RECORD;
  v_rounds  JSON;
BEGIN
  IF p_token IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_reg_id := participant_session_owner(p_token);
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  SELECT team_id INTO v_team_id FROM registrations WHERE id = v_reg_id;
  IF v_team_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id, name INTO v_team FROM teams WHERE id = v_team_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(json_agg(r_obj ORDER BY r_round), '[]'::json) INTO v_rounds
  FROM (
    SELECT e.round AS r_round, json_build_object(
      'round', e.round,
      'evaluations', json_agg(json_build_object(
        'mentor_name', COALESCE(m.name, m.email, 'Mentor'),
        'scores', e.scores,
        'total_score', e.total_score,
        'summary', COALESCE(e.summary, ''),
        'updated_at', e.updated_at
      ) ORDER BY e.updated_at)
    ) AS r_obj
    FROM pre_pitch_evaluations e
    JOIN mentors m ON m.id = e.mentor_id
    WHERE e.team_id = v_team_id
    GROUP BY e.round
  ) sub;

  RETURN json_build_object(
    'team', json_build_object('id', v_team.id, 'name', v_team.name),
    'rounds', v_rounds
  );
END;
$$;

-- ------------------------------------------------------------
-- 6. GRANTS
-- ------------------------------------------------------------
GRANT EXECUTE ON FUNCTION mentor_prepitch_resolve(UUID)                        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION mentor_prepitch_list(UUID)                           TO anon, authenticated;
GRANT EXECUTE ON FUNCTION mentor_prepitch_submit(UUID, UUID, INTEGER, JSONB, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION participant_prepitch_feedback(UUID)                  TO anon, authenticated;
