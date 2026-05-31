-- Visibilidade da IDEIA/ENTREGAS para os JURADOS (switch global) + force-reload.
--
-- Por padrao DESLIGADO: o painel do jurado mostra SO o nome da equipe. Ideia,
-- membros, eixos economicos, entregas finais / link do SLC e transcricao do
-- pitch ficam ocultos. Isso permite julgamento "as cegas" do pitch ao vivo, sem
-- viesar pelo material pre-carregado. Ligar o switch (aba Jurados) revela tudo.
--
-- O gate e no SERVIDOR: com o flag desligado, juror_get_context nem envia os
-- campos (so id + name). Espelha o padrao de team_scores_visible.
--
-- Inclui um sinal de "forcar recarga" (juror_reload_at): o painel do jurado faz
-- polling leve e, quando o admin bumpa esse valor, recarrega as abas abertas.

-- 0. Tabela de settings (idempotente; criada originalmente na migration do DATI).
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1. Flag: ideia visivel aos jurados (default desligado => so o nome).
INSERT INTO app_settings (key, value)
VALUES ('juror_idea_visible', 'false')
ON CONFLICT (key) DO NOTHING;

-- 2. Sinal de recarga (epoch ms como texto). Bump => paineis abertos recarregam.
INSERT INTO app_settings (key, value)
VALUES ('juror_reload_at', '0')
ON CONFLICT (key) DO NOTHING;

-- 3. Leitura do flag para o painel admin (admin E viewer).
CREATE OR REPLACE FUNCTION get_juror_idea_visible()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (SELECT value = 'true' FROM app_settings WHERE key = 'juror_idea_visible'),
    false
  );
$$;
REVOKE EXECUTE ON FUNCTION get_juror_idea_visible() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_juror_idea_visible() FROM anon;
GRANT EXECUTE ON FUNCTION get_juror_idea_visible() TO authenticated;

-- 4. Liga/desliga o flag (SOMENTE admin).
CREATE OR REPLACE FUNCTION set_juror_idea_visible(p_visible BOOLEAN)
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
  VALUES ('juror_idea_visible', CASE WHEN p_visible THEN 'true' ELSE 'false' END, now())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now();
  RETURN p_visible;
END;
$$;
REVOKE EXECUTE ON FUNCTION set_juror_idea_visible(BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION set_juror_idea_visible(BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION set_juror_idea_visible(BOOLEAN) TO authenticated;

-- 5. Forca recarga dos paineis dos jurados (SOMENTE admin): bump do timestamp.
CREATE OR REPLACE FUNCTION juror_force_reload()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TEXT;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  v_now := (extract(epoch from now()) * 1000)::bigint::text;
  INSERT INTO app_settings (key, value, updated_at)
  VALUES ('juror_reload_at', v_now, now())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now();
  RETURN v_now;
END;
$$;
REVOKE EXECUTE ON FUNCTION juror_force_reload() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION juror_force_reload() FROM anon;
GRANT EXECUTE ON FUNCTION juror_force_reload() TO authenticated;

-- 6. juror_get_context com gate da ideia + sinal de recarga. Mantem o corpo
--    enriquecido vigente; quando v_show=false, devolve so id+name por equipe.
CREATE OR REPLACE FUNCTION juror_get_context(p_token uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_juror_id UUID;
  v_juror    RECORD;
  v_show     BOOLEAN;
  v_reload   TEXT;
BEGIN
  v_juror_id := juror_token_owner(p_token);
  SELECT id, name, consent_at INTO v_juror FROM jurors WHERE id = v_juror_id;

  v_show := COALESCE(
    (SELECT value = 'true' FROM app_settings WHERE key = 'juror_idea_visible'),
    false
  );
  v_reload := COALESCE(
    (SELECT value FROM app_settings WHERE key = 'juror_reload_at'),
    '0'
  );

  RETURN json_build_object(
    'juror', json_build_object(
      'id',         v_juror.id,
      'name',       v_juror.name,
      'consent_at', v_juror.consent_at
    ),
    'idea_visible', v_show,
    'reload_at',    v_reload,
    'teams', COALESCE((
      SELECT json_agg(json_build_object(
        'id',                 t.id,
        'name',               t.name,
        'idea_description',    CASE WHEN v_show THEN t.idea_description    ELSE NULL END,
        'final_deliverables',  CASE WHEN v_show THEN t.final_deliverables  ELSE NULL END,
        'pitch_transcript',    CASE WHEN v_show THEN t.pitch_transcript    ELSE NULL END,
        'members', CASE WHEN v_show THEN COALESCE((
          SELECT json_agg(json_build_object(
            'full_name',       r.full_name,
            'is_team_leader',  r.is_team_leader,
            'occupation_type', r.occupation_type
          ) ORDER BY r.is_team_leader DESC, r.created_at)
          FROM registrations r
          WHERE r.team_id = t.id AND r.payment_status <> 'cancelled'
        ), '[]'::json) ELSE '[]'::json END,
        'economic_axes', CASE WHEN v_show THEN COALESCE((
          SELECT json_agg(DISTINCT ax ORDER BY ax)
          FROM registrations r2, unnest(r2.economic_axes) AS ax
          WHERE r2.team_id = t.id AND r2.payment_status = 'confirmed'
        ), '[]'::json) ELSE '[]'::json END
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

-- ============================================================
-- Apos aplicar: switch comeca DESLIGADO (jurado ve so o nome).
-- Ligar:   SELECT set_juror_idea_visible(true);
-- Recargar paineis abertos:  SELECT juror_force_reload();
-- ============================================================
