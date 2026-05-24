-- ============================================================
-- MIGRATION: Rate-limiting anti-spam for anonymous Wall RPCs
-- ============================================================
-- Idempotente (CREATE OR REPLACE). Depende de add_pain_wall.sql e
-- add_evaluation_security_hardening.sql.
--
-- CONSTANTS (ajuste aqui se necessário):
--   SUBMIT — limite de dores por device: 5 (status != 'hidden')
--   SUBMIT — throttle anti-duplo-clique: 5 segundos entre submissões
--   VOTE   — throttle anti-flood: 2 segundos entre votos
--
-- Ambas as funções mantêm SET search_path = public (segurança DEFINER),
-- GRANT EXECUTE TO anon reexplícito, e toda a lógica original preservada.
-- Os novos checks são inseridos APÓS a validação de phase para que o
-- contrato de erros existente seja mantido (wall_not_open tem prioridade).
-- ============================================================

-- ============================================================
-- wall_submit_pain — adiciona rate-limit + throttle
-- ============================================================
CREATE OR REPLACE FUNCTION wall_submit_pain(
  p_device TEXT,
  p_name TEXT,
  p_title TEXT,
  p_description TEXT,
  p_axis TEXT
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Rate-limit constants
  c_max_pains_per_device CONSTANT INTEGER  := 5;           -- max dores ativas por device
  c_throttle_interval    CONSTANT INTERVAL := '5 seconds'; -- janela anti-duplo-clique

  v_phase TEXT;
  v_title TEXT;
  v_pain pains;
BEGIN
  -- 1. Valida device (preservado)
  IF COALESCE(TRIM(p_device), '') = '' THEN
    RAISE EXCEPTION 'device_required';
  END IF;

  -- 2. Valida phase (preservado — tem prioridade sobre rate-limit)
  SELECT phase INTO v_phase FROM wall_state WHERE id = true;
  IF v_phase <> 'wall_open' THEN
    RAISE EXCEPTION 'wall_not_open';
  END IF;

  -- 3. Rate-limit: limite de dores ativas por device
  IF (
    SELECT COUNT(*) FROM pains
    WHERE device_token = TRIM(p_device)
      AND status <> 'hidden'
  ) >= c_max_pains_per_device THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  -- 4. Throttle: anti-duplo-clique (última submissão < 5s atrás)
  IF EXISTS (
    SELECT 1 FROM pains
    WHERE device_token = TRIM(p_device)
      AND created_at > now() - c_throttle_interval
  ) THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  -- 5. Valida e normaliza título (preservado)
  v_title := TRIM(COALESCE(p_title, ''));
  IF v_title = '' THEN
    RAISE EXCEPTION 'title_required';
  END IF;
  IF length(v_title) > 140 THEN
    v_title := left(v_title, 140);
  END IF;

  -- 6. Insere dor (preservado)
  INSERT INTO pains (title, description, author_name, device_token, axis)
  VALUES (
    v_title,
    NULLIF(TRIM(COALESCE(p_description, '')), ''),
    NULLIF(TRIM(COALESCE(p_name, '')), ''),
    TRIM(p_device),
    NULLIF(TRIM(COALESCE(p_axis, '')), '')
  )
  RETURNING * INTO v_pain;

  -- 7. Retorno (preservado)
  RETURN json_build_object(
    'id',          v_pain.id,
    'title',       v_pain.title,
    'description', v_pain.description,
    'author_name', v_pain.author_name,
    'axis',        v_pain.axis,
    'created_at',  v_pain.created_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION wall_submit_pain(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon;

-- ============================================================
-- wall_vote — adiciona throttle anti-flood leve
-- ============================================================
CREATE OR REPLACE FUNCTION wall_vote(p_device TEXT, p_pain_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Rate-limit constants
  c_throttle_interval CONSTANT INTERVAL := '2 seconds'; -- janela anti-flood de votos

  v_phase    TEXT;
  v_device   TEXT := TRIM(COALESCE(p_device, ''));
  v_inserted INTEGER;
  v_remaining INTEGER;
BEGIN
  -- 1. Valida device (preservado)
  IF v_device = '' THEN
    RAISE EXCEPTION 'device_required';
  END IF;

  -- 2. Valida phase (preservado — tem prioridade sobre rate-limit)
  SELECT phase INTO v_phase FROM wall_state WHERE id = true;
  IF v_phase <> 'voting_open' THEN
    RAISE EXCEPTION 'voting_not_open';
  END IF;

  -- 3. Throttle: anti-flood (último voto < 2s atrás)
  IF EXISTS (
    SELECT 1 FROM pain_votes
    WHERE device_token = v_device
      AND created_at > now() - c_throttle_interval
  ) THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  -- 4. Valida que a dor existe e está visível (preservado)
  IF NOT EXISTS (SELECT 1 FROM pains WHERE id = p_pain_id AND status = 'visible') THEN
    RAISE EXCEPTION 'pain_not_found';
  END IF;

  -- 5. Insert atômico com limite de 3 votos + proteção contra duplicata (preservado)
  INSERT INTO pain_votes (pain_id, device_token)
  SELECT p_pain_id, v_device
  WHERE (SELECT COUNT(*) FROM pain_votes WHERE device_token = v_device) < 3
  ON CONFLICT (pain_id, device_token) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- 6. Diferencia limite atingido de voto duplicado (preservado)
  IF v_inserted = 0 THEN
    IF EXISTS (SELECT 1 FROM pain_votes WHERE pain_id = p_pain_id AND device_token = v_device) THEN
      RAISE EXCEPTION 'already_voted';
    ELSE
      RAISE EXCEPTION 'vote_limit_reached';
    END IF;
  END IF;

  -- 7. Calcula votos restantes e retorna (preservado)
  SELECT 3 - COUNT(*) INTO v_remaining FROM pain_votes WHERE device_token = v_device;

  RETURN json_build_object('ok', true, 'votos_restantes', GREATEST(v_remaining, 0));
END;
$$;

GRANT EXECUTE ON FUNCTION wall_vote(TEXT, UUID) TO anon;
