-- ============================================================
-- MIGRACAO: Muro de Dores — identidade por CPF + DATA DE NASCIMENTO
-- ============================================================
-- Aplique no Supabase SQL Editor (NAO e auto-aplicada).
-- Idempotente (DROP IF EXISTS / CREATE OR REPLACE / ON CONFLICT).
-- Depende de add_pain_wall.sql, add_wall_rate_limit.sql,
-- supabase-setup.sql (registrations, is_admin, is_admin_or_viewer).
--
-- MUDANCA DE ARQUITETURA (substitui o device_token de add_pain_wall.sql):
-- A identidade leve por "device token" (UUID em localStorage) era forjavel —
-- limpar o localStorage ou trocar de aba dava nova identidade e burlava o
-- limite de 3 votos / 5 dores. Trocamos por identidade FORTE: o participante
-- se identifica com CPF + DATA DE NASCIMENTO e SO entra se estiver inscrito e
-- com pagamento CONFIRMADO. Cada dor/voto e amarrado ao registration_id (UUID
-- da inscricao em `registrations`). O cliente nunca decide quem ele e: o RPC
-- wall_identify resolve o registration_id no servidor a partir do CPF+data.
--
-- CPF: normalizado para SO DIGITOS com REGEXP_REPLACE(valor,'\D','','g') nos
-- DOIS lados da comparacao (input do cliente e coluna `cpf` armazenada, que
-- pode estar com mascara). Mesmo padrao de participant_login (supabase-setup).
--
-- author_name: vem SEMPRE do full_name da registration (server-side), NUNCA do
-- cliente — o participante nao pode forjar o nome exibido no telao.
--
-- As tabelas pains/pain_votes estao VAZIAS (nenhum dado real ainda), entao
-- dropamos e recriamos com a nova coluna registration_id (mais limpo que ALTER
-- por causa do CASCADE da FK e do UNIQUE antigo nomeado automaticamente).
-- wall_state e preservado.

-- ============================================================
-- 1. Tabelas — troca device_token TEXT por registration_id UUID (FK)
-- ============================================================
-- Vazias: drop + recriar. CASCADE remove policies/indices/FKs dependentes.
DROP TABLE IF EXISTS pain_votes CASCADE;
DROP TABLE IF EXISTS pains CASCADE;

CREATE TABLE pains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  title TEXT NOT NULL,                 -- dor curta (titulo)
  description TEXT,                     -- detalhe opcional
  author_name TEXT,                    -- display: copiado do full_name (server-side)
  registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  axis TEXT,                           -- eixo economico opcional
  status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','hidden'))
);

CREATE INDEX IF NOT EXISTS idx_pains_status ON pains(status);
CREATE INDEX IF NOT EXISTS idx_pains_registration ON pains(registration_id);

CREATE TABLE pain_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  pain_id UUID NOT NULL REFERENCES pains(id) ON DELETE CASCADE,
  registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  UNIQUE (pain_id, registration_id)    -- nao vota 2x na mesma dor
);

CREATE INDEX IF NOT EXISTS idx_pain_votes_pain ON pain_votes(pain_id);
CREATE INDEX IF NOT EXISTS idx_pain_votes_registration ON pain_votes(registration_id);

-- ============================================================
-- 2. RLS deny-all — acesso so via RPCs SECURITY DEFINER
-- ============================================================
ALTER TABLE pains ENABLE ROW LEVEL SECURITY;
ALTER TABLE pain_votes ENABLE ROW LEVEL SECURITY;

-- Admin/viewer pode ler direto (recriadas porque o CASCADE acima as removeu).
DROP POLICY IF EXISTS "Admin can read pains" ON pains;
CREATE POLICY "Admin can read pains" ON pains
  FOR SELECT TO authenticated USING (is_admin_or_viewer());

DROP POLICY IF EXISTS "Admin can read pain_votes" ON pain_votes;
CREATE POLICY "Admin can read pain_votes" ON pain_votes
  FOR SELECT TO authenticated USING (is_admin_or_viewer());

-- ============================================================
-- 3. wall_identify — resolve registration_id a partir de CPF + nascimento
-- ============================================================
-- SO retorna participante com pagamento CONFIRMADO. CPF normalizado (so
-- digitos) nos dois lados. Erro 'not_found_or_not_confirmed' se nao bater.
CREATE OR REPLACE FUNCTION wall_identify(p_cpf TEXT, p_birth_date DATE)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_cpf TEXT;
  v_reg RECORD;
BEGIN
  v_clean_cpf := REGEXP_REPLACE(COALESCE(p_cpf, ''), '\D', '', 'g');

  IF length(v_clean_cpf) <> 11 OR p_birth_date IS NULL THEN
    RAISE EXCEPTION 'not_found_or_not_confirmed';
  END IF;

  SELECT id, full_name
  INTO v_reg
  FROM registrations
  WHERE REGEXP_REPLACE(cpf, '\D', '', 'g') = v_clean_cpf
    AND birth_date = p_birth_date
    AND payment_status = 'confirmed'
  LIMIT 1;

  IF v_reg.id IS NULL THEN
    RAISE EXCEPTION 'not_found_or_not_confirmed';
  END IF;

  RETURN json_build_object(
    'registration_id', v_reg.id,
    'full_name', v_reg.full_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION wall_identify(TEXT, DATE) TO anon;

-- ============================================================
-- 4. RPCs publicos (anon) — agora recebem registration_id UUID
-- ============================================================
-- As assinaturas mudaram (TEXT device -> UUID registration_id, e
-- wall_submit_pain perdeu o p_name), entao DROP antes de recriar.
DROP FUNCTION IF EXISTS wall_submit_pain(TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS wall_vote(TEXT, UUID);
DROP FUNCTION IF EXISTS wall_unvote(TEXT, UUID);
DROP FUNCTION IF EXISTS wall_list(TEXT);

-- Helper interno: valida que o registration_id e uma inscricao confirmada e
-- devolve o full_name (usado como author_name). RAISE 'not_confirmed' senao.
CREATE OR REPLACE FUNCTION wall_require_confirmed(p_registration_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT;
BEGIN
  IF p_registration_id IS NULL THEN
    RAISE EXCEPTION 'not_confirmed';
  END IF;

  SELECT full_name INTO v_name
  FROM registrations
  WHERE id = p_registration_id
    AND payment_status = 'confirmed';

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'not_confirmed';
  END IF;

  RETURN v_name;
END;
$$;
-- Nao recebe GRANT direto: chamado so de dentro de outros DEFINER. REVOKE do
-- PUBLIC default impede anon de usar como oraculo (vaza full_name de um UUID).
REVOKE ALL ON FUNCTION wall_require_confirmed(UUID) FROM PUBLIC;

-- 4a. Registrar dor — so quando phase = 'wall_open'. author_name = full_name
-- (server-side). Rate-limit: <= 5 dores ativas/registration + throttle 5s.
CREATE OR REPLACE FUNCTION wall_submit_pain(
  p_registration_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_axis TEXT
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_max_pains_per_user CONSTANT INTEGER  := 5;           -- max dores ativas
  c_throttle_interval  CONSTANT INTERVAL := '5 seconds'; -- anti-duplo-clique

  v_phase TEXT;
  v_name  TEXT;
  v_title TEXT;
  v_pain  pains;
BEGIN
  -- 1. Valida identidade forte (inscricao confirmada) e obtem full_name
  v_name := wall_require_confirmed(p_registration_id);

  -- 2. Valida phase (prioridade sobre rate-limit)
  SELECT phase INTO v_phase FROM wall_state WHERE id = true;
  IF v_phase <> 'wall_open' THEN
    RAISE EXCEPTION 'wall_not_open';
  END IF;

  -- 3. Rate-limit: limite de dores ativas por participante
  IF (
    SELECT COUNT(*) FROM pains
    WHERE registration_id = p_registration_id
      AND status <> 'hidden'
  ) >= c_max_pains_per_user THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  -- 4. Throttle: anti-duplo-clique (ultima submissao < 5s atras)
  IF EXISTS (
    SELECT 1 FROM pains
    WHERE registration_id = p_registration_id
      AND created_at > now() - c_throttle_interval
  ) THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  -- 5. Valida e normaliza titulo
  v_title := TRIM(COALESCE(p_title, ''));
  IF v_title = '' THEN
    RAISE EXCEPTION 'title_required';
  END IF;
  IF length(v_title) > 140 THEN
    v_title := left(v_title, 140);
  END IF;

  -- 6. Insere dor. author_name vem de v_name (servidor), NAO do cliente.
  INSERT INTO pains (title, description, author_name, registration_id, axis)
  VALUES (
    v_title,
    NULLIF(TRIM(COALESCE(p_description, '')), ''),
    v_name,
    p_registration_id,
    NULLIF(TRIM(COALESCE(p_axis, '')), '')
  )
  RETURNING * INTO v_pain;

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

GRANT EXECUTE ON FUNCTION wall_submit_pain(UUID, TEXT, TEXT, TEXT) TO anon;

-- 4b. Votar — so quando phase = 'voting_open'. Limite 3 votos/registration,
-- throttle 2s, UNIQUE(pain_id, registration_id).
CREATE OR REPLACE FUNCTION wall_vote(p_registration_id UUID, p_pain_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_throttle_interval CONSTANT INTERVAL := '2 seconds'; -- anti-flood

  v_phase     TEXT;
  v_inserted  INTEGER;
  v_remaining INTEGER;
BEGIN
  -- 1. Valida identidade forte (inscricao confirmada)
  PERFORM wall_require_confirmed(p_registration_id);

  -- 2. Valida phase (prioridade sobre rate-limit)
  SELECT phase INTO v_phase FROM wall_state WHERE id = true;
  IF v_phase <> 'voting_open' THEN
    RAISE EXCEPTION 'voting_not_open';
  END IF;

  -- 3. Throttle: anti-flood (ultimo voto < 2s atras)
  IF EXISTS (
    SELECT 1 FROM pain_votes
    WHERE registration_id = p_registration_id
      AND created_at > now() - c_throttle_interval
  ) THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  -- 4. Valida que a dor existe e esta visivel
  IF NOT EXISTS (SELECT 1 FROM pains WHERE id = p_pain_id AND status = 'visible') THEN
    RAISE EXCEPTION 'pain_not_found';
  END IF;

  -- 5. Insert atomico com limite de 3 votos + protecao contra duplicata
  INSERT INTO pain_votes (pain_id, registration_id)
  SELECT p_pain_id, p_registration_id
  WHERE (SELECT COUNT(*) FROM pain_votes WHERE registration_id = p_registration_id) < 3
  ON CONFLICT (pain_id, registration_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- 6. Diferencia limite atingido de voto duplicado
  IF v_inserted = 0 THEN
    IF EXISTS (SELECT 1 FROM pain_votes WHERE pain_id = p_pain_id AND registration_id = p_registration_id) THEN
      RAISE EXCEPTION 'already_voted';
    ELSE
      RAISE EXCEPTION 'vote_limit_reached';
    END IF;
  END IF;

  -- 7. Calcula votos restantes e retorna
  SELECT 3 - COUNT(*) INTO v_remaining FROM pain_votes WHERE registration_id = p_registration_id;

  RETURN json_build_object('ok', true, 'votos_restantes', GREATEST(v_remaining, 0));
END;
$$;

GRANT EXECUTE ON FUNCTION wall_vote(UUID, UUID) TO anon;

-- 4c. Desfazer voto.
CREATE OR REPLACE FUNCTION wall_unvote(p_registration_id UUID, p_pain_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phase     TEXT;
  v_deleted   INTEGER;
  v_remaining INTEGER;
BEGIN
  PERFORM wall_require_confirmed(p_registration_id);

  SELECT phase INTO v_phase FROM wall_state WHERE id = true;
  IF v_phase <> 'voting_open' THEN
    RAISE EXCEPTION 'voting_not_open';
  END IF;

  DELETE FROM pain_votes WHERE pain_id = p_pain_id AND registration_id = p_registration_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 0 THEN
    RAISE EXCEPTION 'vote_not_found';
  END IF;

  SELECT 3 - COUNT(*) INTO v_remaining FROM pain_votes WHERE registration_id = p_registration_id;

  RETURN json_build_object('ok', true, 'votos_restantes', GREATEST(v_remaining, 0));
END;
$$;

GRANT EXECUTE ON FUNCTION wall_unvote(UUID, UUID) TO anon;

-- 4d. Listar dores visiveis + contagem + phase. p_registration_id NULL =>
-- telao (read-only, my_votes vazio). Com id => inclui my_votes e votos
-- restantes daquele participante. Nao revalida confirmado no list (read-only;
-- escrita ja e barrada em submit/vote) — id invalido apenas devolve 0 votos.
CREATE OR REPLACE FUNCTION wall_list(p_registration_id UUID DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_phase      TEXT;
  v_pains      JSON;
  v_my_votes   JSON;
  v_votes_used INTEGER := 0;
BEGIN
  SELECT phase INTO v_phase FROM wall_state WHERE id = true;

  SELECT json_agg(p ORDER BY p.vote_count DESC, p.created_at)
  INTO v_pains
  FROM (
    SELECT
      pn.id,
      pn.title,
      pn.description,
      pn.author_name,
      pn.axis,
      pn.created_at,
      COUNT(pv.id)::INTEGER AS vote_count
    FROM pains pn
    LEFT JOIN pain_votes pv ON pv.pain_id = pn.id
    WHERE pn.status = 'visible'
    GROUP BY pn.id
  ) p;

  IF p_registration_id IS NOT NULL THEN
    SELECT json_agg(pain_id), COUNT(*)::INTEGER
    INTO v_my_votes, v_votes_used
    FROM pain_votes WHERE registration_id = p_registration_id;
  END IF;

  RETURN json_build_object(
    'phase', v_phase,
    'pains', COALESCE(v_pains, '[]'::JSON),
    'my_votes', COALESCE(v_my_votes, '[]'::JSON),
    'votos_restantes', GREATEST(3 - v_votes_used, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION wall_list(UUID) TO anon;

-- ============================================================
-- 5. RPCs admin — wall_set_phase / wall_hide_pain / wall_unhide_pain /
--    wall_admin_list. Nao referenciam device_token, mas recriamos
--    wall_admin_list por causa do DROP TABLE CASCADE (mesma definicao).
-- ============================================================
CREATE OR REPLACE FUNCTION wall_set_phase(p_phase TEXT)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF p_phase NOT IN ('closed','wall_open','voting_open') THEN
    RAISE EXCEPTION 'invalid_phase';
  END IF;

  UPDATE wall_state SET phase = p_phase, updated_at = now() WHERE id = true;

  RETURN json_build_object('ok', true, 'phase', p_phase);
END;
$$;

REVOKE ALL ON FUNCTION wall_set_phase(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wall_set_phase(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION wall_hide_pain(p_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_updated INTEGER;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  UPDATE pains SET status = 'hidden' WHERE id = p_id AND status = 'visible';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'pain_not_found';
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION wall_hide_pain(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wall_hide_pain(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION wall_unhide_pain(p_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_updated INTEGER;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  UPDATE pains SET status = 'visible' WHERE id = p_id AND status = 'hidden';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'pain_not_found';
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION wall_unhide_pain(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wall_unhide_pain(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION wall_admin_list()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_phase TEXT;
  v_pains JSON;
BEGIN
  IF NOT is_admin_or_viewer() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT phase INTO v_phase FROM wall_state WHERE id = true;

  SELECT json_agg(p ORDER BY p.vote_count DESC, p.created_at)
  INTO v_pains
  FROM (
    SELECT
      pn.id, pn.title, pn.description, pn.author_name, pn.axis,
      pn.status, pn.created_at,
      COUNT(pv.id)::INTEGER AS vote_count
    FROM pains pn
    LEFT JOIN pain_votes pv ON pv.pain_id = pn.id
    GROUP BY pn.id
  ) p;

  RETURN json_build_object(
    'phase', v_phase,
    'pains', COALESCE(v_pains, '[]'::JSON)
  );
END;
$$;

REVOKE ALL ON FUNCTION wall_admin_list() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wall_admin_list() TO authenticated;
