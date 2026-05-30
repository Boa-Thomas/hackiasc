-- ============================================================
-- MIGRACAO: Muro de Dores — 4a fase 'results' (votacao encerrada)
-- ============================================================
-- Aplique no Supabase SQL Editor (NAO e auto-aplicada).
-- Idempotente. Depende de add_pain_wall.sql + add_wall_identity.sql.
--
-- Adiciona a fase 'results' ao fluxo:
--   closed -> wall_open -> voting_open -> results
-- Em 'results' ninguem vota; o telao revela o ranking final com a contagem.
-- Nenhuma tabela nova, nenhum dado tocado.

-- 1. Libera 'results' no CHECK do singleton wall_state.phase.
ALTER TABLE wall_state DROP CONSTRAINT IF EXISTS wall_state_phase_check;
ALTER TABLE wall_state ADD CONSTRAINT wall_state_phase_check
  CHECK (phase IN ('closed','wall_open','voting_open','results'));

-- 2. Libera 'results' na validacao do wall_set_phase. Recria com a mesma
--    assinatura/grants vigentes (add_wall_identity.sql), so mudando o IN(...).
CREATE OR REPLACE FUNCTION wall_set_phase(p_phase TEXT)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF p_phase NOT IN ('closed','wall_open','voting_open','results') THEN
    RAISE EXCEPTION 'invalid_phase';
  END IF;

  UPDATE wall_state SET phase = p_phase, updated_at = now() WHERE id = true;

  RETURN json_build_object('ok', true, 'phase', p_phase);
END;
$$;

REVOKE ALL ON FUNCTION wall_set_phase(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wall_set_phase(TEXT) TO authenticated;
