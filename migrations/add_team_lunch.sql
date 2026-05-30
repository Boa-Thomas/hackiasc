-- ============================================================
-- add_team_lunch.sql — controle de almoço por equipe (um checkbox por time).
-- Aditivo e idempotente (CREATE OR REPLACE / ADD COLUMN IF NOT EXISTS).
-- Aplicar via MCP.
-- ============================================================

-- 1. Coluna: NULL = não almoçou; timestamp = almoçou (e quando).
ALTER TABLE teams ADD COLUMN IF NOT EXISTS lunch_at timestamptz;

-- 2. RPC: admin OU viewer marca/desmarca o almoço da equipe.
--    Gate is_admin_or_viewer() — marcar almoço não é edição sensível e o
--    operador do almoço usa um login de "visualização" (viewer), que não tem
--    UPDATE direto em teams. SECURITY DEFINER contorna a policy de UPDATE
--    (restrita a admin), com a autorização explícita feita no corpo.
CREATE OR REPLACE FUNCTION set_team_lunch(p_team_id uuid, p_done boolean)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lunch_at timestamptz;
BEGIN
  IF NOT is_admin_or_viewer() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  UPDATE teams
  SET lunch_at = CASE WHEN p_done THEN now() ELSE NULL END
  WHERE id = p_team_id
  RETURNING lunch_at INTO v_lunch_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'team_not_found';
  END IF;

  RETURN v_lunch_at;
END;
$$;

REVOKE ALL ON FUNCTION set_team_lunch(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_team_lunch(uuid, boolean) TO authenticated;
