-- ============================================================
-- MIGRACAO: Muro de Dores + Votacao digital (Fase 1 — sexta abertura)
-- ============================================================
-- Aplique no Supabase SQL Editor (NAO e auto-aplicada).
-- Idempotente (IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT / DROP IF EXISTS).
-- Depende de is_admin() (definida em supabase-setup.sql).
--
-- Metodologia HackIA, Fase 1: participantes registram DORES/problemas reais
-- (nao solucoes), projetadas no telao; votacao com ate 3 votos por participante.
--
-- DECISAO DE ARQUITETURA (definida pelo orquestrador):
-- Acesso dos participantes SEM login Supabase, para nao criar friccao na
-- abertura presencial. Identidade leve por "device token" (UUID gerado no
-- cliente, localStorage chave `hackiasc_wall_device`) + nome digitado.
-- Limite de 3 votos por device_token. Fraude (limpar localStorage / outro
-- device) NAO e risco critico num evento presencial de ~100 pessoas — o ganho
-- de zero friccao na abertura supera o risco. Tudo validado server-side via
-- RPC SECURITY DEFINER; o cliente nunca decide phase nem limite de votos.
--
-- LEITURA/ESCRITA: RLS deny-all (sem policies anon). Acesso so via RPCs
-- SECURITY DEFINER (mesmo padrao de participant_*). Realtime NAO e usado
-- (exigiria SELECT publico via RLS, quebrando o padrao) — o frontend faz
-- polling de wall_list (~3s participante / ~2s telao).

-- ============================================================
-- 1. Tabelas
-- ============================================================

CREATE TABLE IF NOT EXISTS pains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  title TEXT NOT NULL,                 -- dor curta (titulo)
  description TEXT,                     -- detalhe opcional
  author_name TEXT,                    -- nome digitado (display)
  device_token TEXT NOT NULL,          -- identidade leve do cliente
  axis TEXT,                           -- eixo economico opcional
  status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','hidden'))
);

CREATE INDEX IF NOT EXISTS idx_pains_status ON pains(status);
CREATE INDEX IF NOT EXISTS idx_pains_device ON pains(device_token);

CREATE TABLE IF NOT EXISTS pain_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  pain_id UUID NOT NULL REFERENCES pains(id) ON DELETE CASCADE,
  device_token TEXT NOT NULL,
  UNIQUE (pain_id, device_token)       -- nao vota 2x na mesma dor
);

CREATE INDEX IF NOT EXISTS idx_pain_votes_pain ON pain_votes(pain_id);
CREATE INDEX IF NOT EXISTS idx_pain_votes_device ON pain_votes(device_token);

-- Singleton de estado das fases. CHECK (id = true) impede uma 2a linha.
CREATE TABLE IF NOT EXISTS wall_state (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id = true),
  phase TEXT NOT NULL DEFAULT 'closed' CHECK (phase IN ('closed','wall_open','voting_open')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Garante a unica linha do singleton.
INSERT INTO wall_state (id, phase) VALUES (true, 'closed')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. RLS deny-all — acesso so via RPCs SECURITY DEFINER
-- ============================================================
ALTER TABLE pains ENABLE ROW LEVEL SECURITY;
ALTER TABLE pain_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE wall_state ENABLE ROW LEVEL SECURITY;

-- Admin/viewer pode ler direto (AdminWall usa supabase.from('pains')... opcional).
DROP POLICY IF EXISTS "Admin can read pains" ON pains;
CREATE POLICY "Admin can read pains" ON pains
  FOR SELECT TO authenticated USING (is_admin_or_viewer());

DROP POLICY IF EXISTS "Admin can read pain_votes" ON pain_votes;
CREATE POLICY "Admin can read pain_votes" ON pain_votes
  FOR SELECT TO authenticated USING (is_admin_or_viewer());

DROP POLICY IF EXISTS "Admin can read wall_state" ON wall_state;
CREATE POLICY "Admin can read wall_state" ON wall_state
  FOR SELECT TO authenticated USING (is_admin_or_viewer());

-- ============================================================
-- 3. RPCs publicos (anon) — SECURITY DEFINER, validacao server-side
-- ============================================================

-- 3a. Registrar dor — so quando phase = 'wall_open'.
CREATE OR REPLACE FUNCTION wall_submit_pain(
  p_device TEXT,
  p_name TEXT,
  p_title TEXT,
  p_description TEXT,
  p_axis TEXT
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_phase TEXT;
  v_title TEXT;
  v_pain pains;
BEGIN
  IF COALESCE(TRIM(p_device), '') = '' THEN
    RAISE EXCEPTION 'device_required';
  END IF;

  SELECT phase INTO v_phase FROM wall_state WHERE id = true;
  IF v_phase <> 'wall_open' THEN
    RAISE EXCEPTION 'wall_not_open';
  END IF;

  v_title := TRIM(COALESCE(p_title, ''));
  IF v_title = '' THEN
    RAISE EXCEPTION 'title_required';
  END IF;
  IF length(v_title) > 140 THEN
    v_title := left(v_title, 140);
  END IF;

  INSERT INTO pains (title, description, author_name, device_token, axis)
  VALUES (
    v_title,
    NULLIF(TRIM(COALESCE(p_description, '')), ''),
    NULLIF(TRIM(COALESCE(p_name, '')), ''),
    TRIM(p_device),
    NULLIF(TRIM(COALESCE(p_axis, '')), '')
  )
  RETURNING * INTO v_pain;

  RETURN json_build_object(
    'id', v_pain.id,
    'title', v_pain.title,
    'description', v_pain.description,
    'author_name', v_pain.author_name,
    'axis', v_pain.axis,
    'created_at', v_pain.created_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION wall_submit_pain(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon;

-- 3b. Votar — so quando phase = 'voting_open'. Limite de 3 votos/device,
-- rejeita voto duplicado na mesma dor. Insert atomico fecha a janela de race
-- do limite de 3 (race benigna, mas custo zero pra fechar).
CREATE OR REPLACE FUNCTION wall_vote(p_device TEXT, p_pain_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_phase TEXT;
  v_device TEXT := TRIM(COALESCE(p_device, ''));
  v_inserted INTEGER;
  v_remaining INTEGER;
BEGIN
  IF v_device = '' THEN
    RAISE EXCEPTION 'device_required';
  END IF;

  SELECT phase INTO v_phase FROM wall_state WHERE id = true;
  IF v_phase <> 'voting_open' THEN
    RAISE EXCEPTION 'voting_not_open';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pains WHERE id = p_pain_id AND status = 'visible') THEN
    RAISE EXCEPTION 'pain_not_found';
  END IF;

  -- Insert so se device ainda tem < 3 votos. ON CONFLICT trata voto duplicado.
  INSERT INTO pain_votes (pain_id, device_token)
  SELECT p_pain_id, v_device
  WHERE (SELECT COUNT(*) FROM pain_votes WHERE device_token = v_device) < 3
  ON CONFLICT (pain_id, device_token) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    -- Ou ja votou nessa dor, ou ja atingiu 3 votos. Diferencia para o cliente.
    IF EXISTS (SELECT 1 FROM pain_votes WHERE pain_id = p_pain_id AND device_token = v_device) THEN
      RAISE EXCEPTION 'already_voted';
    ELSE
      RAISE EXCEPTION 'vote_limit_reached';
    END IF;
  END IF;

  SELECT 3 - COUNT(*) INTO v_remaining FROM pain_votes WHERE device_token = v_device;

  RETURN json_build_object('ok', true, 'votos_restantes', GREATEST(v_remaining, 0));
END;
$$;

GRANT EXECUTE ON FUNCTION wall_vote(TEXT, UUID) TO anon;

-- 3c. Desfazer voto.
CREATE OR REPLACE FUNCTION wall_unvote(p_device TEXT, p_pain_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_phase TEXT;
  v_device TEXT := TRIM(COALESCE(p_device, ''));
  v_deleted INTEGER;
  v_remaining INTEGER;
BEGIN
  IF v_device = '' THEN
    RAISE EXCEPTION 'device_required';
  END IF;

  SELECT phase INTO v_phase FROM wall_state WHERE id = true;
  IF v_phase <> 'voting_open' THEN
    RAISE EXCEPTION 'voting_not_open';
  END IF;

  DELETE FROM pain_votes WHERE pain_id = p_pain_id AND device_token = v_device;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 0 THEN
    RAISE EXCEPTION 'vote_not_found';
  END IF;

  SELECT 3 - COUNT(*) INTO v_remaining FROM pain_votes WHERE device_token = v_device;

  RETURN json_build_object('ok', true, 'votos_restantes', GREATEST(v_remaining, 0));
END;
$$;

GRANT EXECUTE ON FUNCTION wall_unvote(TEXT, UUID) TO anon;

-- 3d. Listar dores visiveis + contagem de votos (desc) + votos do proprio
-- device + phase atual. p_device NULL => telao (read-only, my_votes vazio).
CREATE OR REPLACE FUNCTION wall_list(p_device TEXT DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_device TEXT := NULLIF(TRIM(COALESCE(p_device, '')), '');
  v_phase TEXT;
  v_pains JSON;
  v_my_votes JSON;
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

  IF v_device IS NOT NULL THEN
    SELECT json_agg(pain_id), COUNT(*)::INTEGER
    INTO v_my_votes, v_votes_used
    FROM pain_votes WHERE device_token = v_device;
  END IF;

  RETURN json_build_object(
    'phase', v_phase,
    'pains', COALESCE(v_pains, '[]'::JSON),
    'my_votes', COALESCE(v_my_votes, '[]'::JSON),
    'votos_restantes', GREATEST(3 - v_votes_used, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION wall_list(TEXT) TO anon;

-- ============================================================
-- 4. RPCs admin (authenticated, is_admin gate) — moderacao/fases
-- ============================================================

CREATE OR REPLACE FUNCTION wall_set_phase(p_phase TEXT)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
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

GRANT EXECUTE ON FUNCTION wall_set_phase(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION wall_hide_pain(p_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
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

GRANT EXECUTE ON FUNCTION wall_hide_pain(UUID) TO authenticated;

-- Reexibe uma dor ocultada (corrige moderacao acidental).
CREATE OR REPLACE FUNCTION wall_unhide_pain(p_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
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

GRANT EXECUTE ON FUNCTION wall_unhide_pain(UUID) TO authenticated;

-- 4b. Lista admin: todas as dores (inclui ocultas) + contagem + phase.
CREATE OR REPLACE FUNCTION wall_admin_list()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
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

GRANT EXECUTE ON FUNCTION wall_admin_list() TO authenticated;
