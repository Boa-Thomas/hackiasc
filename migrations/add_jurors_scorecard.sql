-- ============================================================
-- MIGRACAO: Scorecard digital dos jurados
-- ============================================================
-- Aplique no Supabase SQL Editor de um banco JA POPULADO.
-- Idempotente (IF NOT EXISTS / CREATE OR REPLACE / DROP IF EXISTS).
-- Depende de: teams, team_evaluations (add_deliverable_status_and_evaluations.sql),
--             is_admin() (supabase-setup.sql), extensão pgcrypto.
--
-- Jurados acessam por LINK SECRETO (token UUID na URL), SEM Supabase Auth.
-- O admin cria o jurado e gera o link. Cada jurado dá notas pela rubrica do
-- edital (4 critérios 0-100 + justificativa) reutilizando `team_evaluations`
-- (evaluator_type='human', juror_id setado). O total ponderado é SEMPRE
-- calculado server-side (pesos 30/25/25/20); o cliente nunca informa o total.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1. Tabela de jurados
-- ============================================================
CREATE TABLE IF NOT EXISTS jurors (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  email        TEXT,
  access_token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE jurors ENABLE ROW LEVEL SECURITY;

-- Admin gerencia jurados (CRUD completo) pelo painel admin (cliente authenticated).
DROP POLICY IF EXISTS "Admin can manage jurors" ON jurors;
CREATE POLICY "Admin can manage jurors" ON jurors
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- ============================================================
-- 2. Vincular team_evaluations a um jurado
-- ============================================================
-- juror_id nulo = avaliação IA/admin (mantém o fluxo existente intacto).
ALTER TABLE team_evaluations
  ADD COLUMN IF NOT EXISTS juror_id UUID REFERENCES jurors(id) ON DELETE CASCADE;

-- 1 scorecard por (jurado, equipe). Parcial: rows IA/admin (juror_id NULL) ficam livres.
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_evaluations_juror_team
  ON team_evaluations (juror_id, team_id)
  WHERE juror_id IS NOT NULL;

-- ============================================================
-- 3. Helper: valida token de jurado ATIVO, retorna juror_id
-- ============================================================
CREATE OR REPLACE FUNCTION juror_token_owner(p_token UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id UUID;
BEGIN
  IF p_token IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  SELECT id INTO v_id FROM jurors WHERE access_token = p_token AND active = true LIMIT 1;
  IF v_id IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  RETURN v_id;
END; $$;

-- ============================================================
-- 4. RPC: contexto do jurado (perfil + equipes + meus scorecards)
-- ============================================================
CREATE OR REPLACE FUNCTION juror_get_context(p_token UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_juror_id UUID;
  v_juror RECORD;
BEGIN
  v_juror_id := juror_token_owner(p_token);
  SELECT id, name INTO v_juror FROM jurors WHERE id = v_juror_id;

  RETURN json_build_object(
    'juror', json_build_object('id', v_juror.id, 'name', v_juror.name),
    'teams', COALESCE((
      SELECT json_agg(json_build_object('id', t.id, 'name', t.name) ORDER BY t.name)
      FROM teams t
    ), '[]'::json),
    'my_scores', COALESCE((
      SELECT json_agg(json_build_object(
        'team_id', te.team_id,
        'scores', te.scores,
        'summary', te.summary,
        'total_score', te.total_score,
        'eliminated', te.eliminated
      ))
      FROM team_evaluations te
      WHERE te.juror_id = v_juror_id
    ), '[]'::json)
  );
END; $$;

GRANT EXECUTE ON FUNCTION juror_get_context(UUID) TO anon;

-- ============================================================
-- 5. RPC: gravar/atualizar um scorecard (UPSERT por jurado+equipe)
-- ============================================================
-- p_scores: jsonb array [{ "criterion_key": "...", "score": 0-100, "justification": "..." }]
-- Valida token ativo, os 4 critérios do edital, faixa 0-100, e calcula o total
-- ponderado SERVER-SIDE (pesos fixos abaixo). Nunca confia no total do cliente.
CREATE OR REPLACE FUNCTION juror_submit_score(
  p_token      UUID,
  p_team_id    UUID,
  p_scores     JSONB,
  p_summary    TEXT,
  p_eliminated BOOLEAN
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_juror_id   UUID;
  v_weights    JSONB := '{"tecnica_ia":30,"validacao_problema":25,"escala_negocio":25,"pitch_equipe":20}'::jsonb;
  v_labels     JSONB := '{"tecnica_ia":"Execução Técnica e IA","validacao_problema":"Validação do Problema","escala_negocio":"Escalabilidade e Negócio","pitch_equipe":"Pitch e Equipe"}'::jsonb;
  v_key        TEXT;
  v_in         JSONB;
  v_score      NUMERIC;
  v_just       TEXT;
  v_total      NUMERIC := 0;
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

  -- Constrói o array normalizado a partir dos pesos canônicos (4 critérios, na ordem do edital),
  -- buscando cada nota no payload do cliente. Garante exatamente os 4 critérios.
  FOREACH v_key IN ARRAY ARRAY['tecnica_ia','validacao_problema','escala_negocio','pitch_equipe'] LOOP
    -- SELECT INTO não limpa o alvo quando não há linha: reset explícito por iteração.
    v_in := NULL;
    SELECT elem INTO v_in
    FROM jsonb_array_elements(p_scores) AS elem
    WHERE elem->>'criterion_key' = v_key
    LIMIT 1;

    IF v_in IS NULL THEN
      RAISE EXCEPTION 'missing_criterion: %', v_key;
    END IF;

    BEGIN
      v_score := (v_in->>'score')::numeric;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid_score: %', v_key;
    END;

    IF v_score IS NULL OR v_score < 0 OR v_score > 100 THEN
      RAISE EXCEPTION 'score_out_of_range: %', v_key;
    END IF;

    v_just := COALESCE(v_in->>'justification', '');
    IF length(v_just) > 5000 THEN
      RAISE EXCEPTION 'justification_too_long: %', v_key;
    END IF;

    v_total := v_total + (v_score * (v_weights->>v_key)::numeric) / 100;

    v_norm := v_norm || jsonb_build_object(
      'criterion_key', v_key,
      'label',         v_labels->>v_key,
      'weight',        (v_weights->>v_key)::numeric,
      'score',         v_score,
      'justification', v_just
    );
  END LOOP;

  v_total := round(v_total * 10) / 10;  -- 1 casa decimal

  v_summary := COALESCE(p_summary, '');
  IF length(v_summary) > 5000 THEN RAISE EXCEPTION 'summary_too_long'; END IF;

  -- UPSERT explícito (SELECT-then-UPDATE/INSERT): evita depender de índice parcial
  -- como conflict target. Concorrência por jurado/equipe é desprezível.
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

GRANT EXECUTE ON FUNCTION juror_submit_score(UUID, UUID, JSONB, TEXT, BOOLEAN) TO anon;

-- ============================================================
-- 6. ADMIN: listar jurados com nº de equipes avaliadas
-- ============================================================
-- O admin lê `jurors` direto via RLS (select abaixo coberto pela policy ALL).
-- Esta RPC entrega a contagem agregada num lugar só (evita N queries no front).
CREATE OR REPLACE FUNCTION admin_list_jurors()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  RETURN COALESCE((
    SELECT json_agg(json_build_object(
      'id', j.id,
      'name', j.name,
      'email', j.email,
      'access_token', j.access_token,
      'active', j.active,
      'created_at', j.created_at,
      'evaluated_count', (
        SELECT count(*) FROM team_evaluations te WHERE te.juror_id = j.id
      )
    ) ORDER BY j.created_at)
    FROM jurors j
  ), '[]'::json);
END; $$;

GRANT EXECUTE ON FUNCTION admin_list_jurors() TO authenticated;
