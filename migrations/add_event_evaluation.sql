-- Avaliação do evento (pós-evento) por participantes e mentores.
-- Cada pessoa responde UMA vez (travado pelo UNIQUE). Notas 0–10 (step 0,5)
-- por dimensão em JSONB + um comentário livre. Switch global em app_settings
-- ('evaluation_open') controla se o formulário aceita respostas — mesmo padrão
-- de team_scores_visible. Todo acesso é via RPC SECURITY DEFINER: a tabela é
-- deny-all para anon/authenticated (RLS sem policies), como o resto do app.

-- 0. Tabela
CREATE TABLE IF NOT EXISTS event_evaluations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  respondent_type TEXT NOT NULL CHECK (respondent_type IN ('participant','mentor')),
  respondent_id   UUID NOT NULL,
  scores          JSONB NOT NULL DEFAULT '{}'::jsonb,
  comment         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (respondent_type, respondent_id)
);

ALTER TABLE event_evaluations ENABLE ROW LEVEL SECURITY;
-- Sem policies => deny-all para anon/authenticated. Acesso só pelas RPCs abaixo.

-- 1. Garante app_settings e semeia o switch DESLIGADO (idempotente).
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO app_settings (key, value)
VALUES ('evaluation_open', 'false')
ON CONFLICT (key) DO NOTHING;

-- 2. Resolve o respondente a partir do token. Helper interno (chamado só pelas
--    RPCs SECURITY DEFINER abaixo, que rodam como o dono) — não é concedido a anon.
--    Participante: participant_session_owner + pagamento confirmado (espelha o
--    gate da aba no painel). Mentor: token de sessão (mentor_sessions) OU
--    access_token (link). Retorna NULL se inválido.
CREATE OR REPLACE FUNCTION event_eval_resolve(p_token UUID, p_type TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_type = 'participant' THEN
    v_id := participant_session_owner(p_token);
    IF v_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM registrations WHERE id = v_id AND payment_status = 'confirmed'
    ) THEN
      RETURN NULL;
    END IF;
    RETURN v_id;
  ELSIF p_type = 'mentor' THEN
    SELECT mentor_id INTO v_id FROM mentor_sessions
      WHERE token = p_token AND expires_at > now();
    IF v_id IS NULL THEN
      SELECT id INTO v_id FROM mentors WHERE access_token = p_token;
    END IF;
    RETURN v_id;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION event_eval_resolve(UUID, TEXT) FROM PUBLIC;

-- 3. Envio da avaliação (participante/mentor). Exige switch aberto e token
--    válido; recusa segundo envio (UNIQUE). Valida que cada nota é número 0–10.
CREATE OR REPLACE FUNCTION submit_event_evaluation(
  p_token UUID, p_type TEXT, p_scores JSONB, p_comment TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_open BOOLEAN;
  v_inserted INT;
BEGIN
  v_id := event_eval_resolve(p_token, p_type);
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  v_open := COALESCE(
    (SELECT value = 'true' FROM app_settings WHERE key = 'evaluation_open'),
    false
  );
  IF NOT v_open THEN
    RAISE EXCEPTION 'evaluation_closed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_each(COALESCE(p_scores, '{}'::jsonb)) e
    WHERE jsonb_typeof(e.value) <> 'number'
       OR (e.value)::numeric < 0
       OR (e.value)::numeric > 10
  ) THEN
    RAISE EXCEPTION 'invalid_scores';
  END IF;

  INSERT INTO event_evaluations (respondent_type, respondent_id, scores, comment)
  VALUES (
    p_type, v_id,
    COALESCE(p_scores, '{}'::jsonb),
    NULLIF(btrim(COALESCE(p_comment, '')), '')
  )
  ON CONFLICT (respondent_type, respondent_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    RAISE EXCEPTION 'already_submitted';
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION submit_event_evaluation(UUID, TEXT, JSONB, TEXT) TO anon;

-- 4. Estado do formulário para o respondente: autorizado? aberto? já enviou?
--    Devolve também o que foi enviado, para a tela read-only de "obrigado".
CREATE OR REPLACE FUNCTION get_my_event_evaluation(p_token UUID, p_type TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_open BOOLEAN;
  v_row event_evaluations%ROWTYPE;
BEGIN
  v_id := event_eval_resolve(p_token, p_type);
  IF v_id IS NULL THEN
    RETURN json_build_object('authorized', false);
  END IF;

  v_open := COALESCE(
    (SELECT value = 'true' FROM app_settings WHERE key = 'evaluation_open'),
    false
  );

  SELECT * INTO v_row FROM event_evaluations
    WHERE respondent_type = p_type AND respondent_id = v_id;

  RETURN json_build_object(
    'authorized', true,
    'open', v_open,
    'submitted', v_row.id IS NOT NULL,
    'scores', COALESCE(v_row.scores, '{}'::jsonb),
    'comment', v_row.comment,
    'created_at', v_row.created_at
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_my_event_evaluation(UUID, TEXT) TO anon;

-- 5. Resultados para o admin/viewer: linhas cruas (agregadas no front pela
--    função testada aggregateResults) + comentários + estado do switch.
CREATE OR REPLACE FUNCTION get_event_evaluation_results()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows JSON;
  v_comments JSON;
  v_open BOOLEAN;
BEGIN
  IF NOT is_admin_or_viewer() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COALESCE(json_agg(json_build_object(
    'respondent_type', respondent_type,
    'scores', scores
  )), '[]'::json) INTO v_rows FROM event_evaluations;

  SELECT COALESCE(json_agg(json_build_object(
    'respondent_type', respondent_type,
    'comment', comment,
    'created_at', created_at
  ) ORDER BY created_at DESC), '[]'::json) INTO v_comments
  FROM event_evaluations WHERE comment IS NOT NULL;

  v_open := COALESCE(
    (SELECT value = 'true' FROM app_settings WHERE key = 'evaluation_open'),
    false
  );

  RETURN json_build_object('open', v_open, 'rows', v_rows, 'comments', v_comments);
END;
$$;
REVOKE EXECUTE ON FUNCTION get_event_evaluation_results() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_event_evaluation_results() FROM anon;
GRANT EXECUTE ON FUNCTION get_event_evaluation_results() TO authenticated;

-- 6. Liga/desliga o switch (SOMENTE admin). Espelha set_team_scores_visible.
CREATE OR REPLACE FUNCTION set_evaluation_open(p_open BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  INSERT INTO app_settings (key, value, updated_at)
  VALUES ('evaluation_open', CASE WHEN p_open THEN 'true' ELSE 'false' END, now())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now();
  RETURN p_open;
END;
$$;
REVOKE EXECUTE ON FUNCTION set_evaluation_open(BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION set_evaluation_open(BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION set_evaluation_open(BOOLEAN) TO authenticated;

-- ============================================================
-- Após aplicar: o switch começa DESLIGADO. Ligue pelo painel admin
-- (aba Avaliação) ou manualmente:  SELECT set_evaluation_open(true);
-- ============================================================
