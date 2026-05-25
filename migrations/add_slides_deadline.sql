-- ============================================================
-- MIGRACAO: Data de corte para envio dos slides (entrega final)
-- ============================================================
-- Aplique no Supabase SQL Editor (NAO e auto-aplicada). Idempotente.
-- Depende de supabase-setup.sql (is_admin).
--
-- O upload do PDF dos slides (edge function `team-slides`, action 'upload-url')
-- passa a respeitar um PRAZO configuravel pelo admin. Espelha o padrao singleton
-- de wall_state: uma unica linha em slides_config guarda o submit_deadline.
--
-- Fonte unica de verdade no banco:
--   * slides_upload_allowed()  -> BOOLEAN (deadline NULL = sem prazo; senao now() <= deadline)
--     chamado pela edge function (service_role). Nenhum parse/timezone em JS.
--   * get_slides_deadline()    -> TIMESTAMPTZ exposto a anon (admin e participante exibem)
--   * set_slides_deadline(ts)  -> admin grava/limpa (NULL remove o prazo)

-- ------------------------------------------------------------
-- 1. Singleton slides_config (espelha wall_state)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS slides_config (
  id              BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  submit_deadline TIMESTAMPTZ,                 -- NULL = sem prazo
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO slides_config (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

-- Deny-all: acesso so via RPCs SECURITY DEFINER abaixo.
ALTER TABLE slides_config ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 2. slides_upload_allowed() — gate consumido pela edge function
-- ------------------------------------------------------------
-- TRUE quando nao ha prazo OU o prazo ainda nao passou. Toda a regra de
-- tempo/timezone vive aqui (now() do Postgres vs TIMESTAMPTZ) — a edge nunca
-- compara datas em JS.
CREATE OR REPLACE FUNCTION slides_upload_allowed()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT submit_deadline IS NULL OR now() <= submit_deadline
  FROM slides_config WHERE id = TRUE;
$$;

REVOKE ALL ON FUNCTION slides_upload_allowed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION slides_upload_allowed() TO service_role;

-- ------------------------------------------------------------
-- 3. get_slides_deadline() — leitura publica (admin + participante exibem)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_slides_deadline()
RETURNS TIMESTAMPTZ
LANGUAGE sql SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT submit_deadline FROM slides_config WHERE id = TRUE;
$$;

GRANT EXECUTE ON FUNCTION get_slides_deadline() TO anon, authenticated;

-- ------------------------------------------------------------
-- 4. set_slides_deadline(ts) — admin grava ou limpa (NULL = remove o prazo)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_slides_deadline(p_deadline TIMESTAMPTZ)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  UPDATE slides_config SET submit_deadline = p_deadline, updated_at = now() WHERE id = TRUE;

  RETURN p_deadline;
END;
$$;

REVOKE ALL ON FUNCTION set_slides_deadline(TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_slides_deadline(TIMESTAMPTZ) TO authenticated;
