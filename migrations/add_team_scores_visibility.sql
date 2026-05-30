-- Visibilidade das notas da IA para os times (switch global).
-- Um flag em app_settings ('team_scores_visible') controla se cada equipe ve,
-- no painel do participante, a NOTA agregada (0-100) por fase das avaliacoes
-- automaticas (IA Evaluator). Desligado (default): notas so no admin/ranking.
-- O gate e no servidor: com o flag desligado a RPC nao devolve nenhuma nota.
-- Espelha o padrao admin-controla / participante-le ja usado por wall_state e
-- slides_config, mas reaproveita a tabela app_settings (key-value) existente.

-- 0. Garante a tabela de settings (criada originalmente na migration do DATI).
--    Idempotente: se ja existe, nada muda; a RLS dela vem daquela migration.
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1. Semeia o flag desligado (idempotente - nao sobrescreve valor ja definido).
INSERT INTO app_settings (key, value)
VALUES ('team_scores_visible', 'false')
ON CONFLICT (key) DO NOTHING;

-- 2. Leitura do flag para o painel admin (admin E viewer). SECURITY DEFINER
--    porque app_settings e restrito a admin via RLS; aqui so expoe o booleano.
CREATE OR REPLACE FUNCTION get_team_scores_visible()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (SELECT value = 'true' FROM app_settings WHERE key = 'team_scores_visible'),
    false
  );
$$;

REVOKE EXECUTE ON FUNCTION get_team_scores_visible() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_team_scores_visible() FROM anon;
GRANT EXECUTE ON FUNCTION get_team_scores_visible() TO authenticated;

-- 3. Liga/desliga o flag (SOMENTE admin). Espelha set_slides_deadline.
CREATE OR REPLACE FUNCTION set_team_scores_visible(p_visible BOOLEAN)
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
  VALUES ('team_scores_visible', CASE WHEN p_visible THEN 'true' ELSE 'false' END, now())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now();
  RETURN p_visible;
END;
$$;

REVOKE EXECUTE ON FUNCTION set_team_scores_visible(BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION set_team_scores_visible(BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION set_team_scores_visible(BOOLEAN) TO authenticated;

-- 4. RPC do participante: visibilidade + nota por fase da PROPRIA equipe.
--    Espelha participant_get_me: resolve a sessao pelo token, exige pagamento
--    confirmado e equipe; team_id deriva da sessao (sem IDOR). So avaliacoes
--    da IA ja concluidas (evaluator_type='ai', status='done', nota nao nula).
--    Flag desligado => visible=false e lista vazia (gate no servidor).
CREATE OR REPLACE FUNCTION participant_get_team_scores(p_token UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg_id UUID;
  v_team_id UUID;
  v_status TEXT;
  v_visible BOOLEAN;
  v_scores JSON;
BEGIN
  v_reg_id := participant_session_owner(p_token);

  SELECT team_id, payment_status INTO v_team_id, v_status
  FROM registrations WHERE id = v_reg_id;

  IF v_status IS DISTINCT FROM 'confirmed' OR v_team_id IS NULL THEN
    RETURN json_build_object('visible', false, 'scores', '[]'::json);
  END IF;

  v_visible := COALESCE(
    (SELECT value = 'true' FROM app_settings WHERE key = 'team_scores_visible'),
    false
  );

  IF NOT v_visible THEN
    RETURN json_build_object('visible', false, 'scores', '[]'::json);
  END IF;

  SELECT COALESCE(json_agg(
    json_build_object('deliverable', deliverable, 'total_score', total_score)
    ORDER BY deliverable
  ), '[]'::json)
  INTO v_scores
  FROM team_evaluations
  WHERE team_id = v_team_id
    AND evaluator_type = 'ai'
    AND deliverable IS NOT NULL
    AND status = 'done'
    AND total_score IS NOT NULL;

  RETURN json_build_object('visible', true, 'scores', v_scores);
END;
$$;

GRANT EXECUTE ON FUNCTION participant_get_team_scores(UUID) TO anon;

-- ============================================================
-- Apos aplicar: o switch comeca DESLIGADO. Ligue pelo painel admin
-- (aba Entregas) ou manualmente:  SELECT set_team_scores_visible(true);
-- ============================================================
