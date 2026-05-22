-- Migration: atomic team leader promotion
-- Replaces two sequential UPDATEs in AdminTeams.jsx with a single atomic statement.
-- This prevents a race condition that could leave a team without a leader if the
-- second UPDATE fails after the first has already cleared the old leader.

CREATE OR REPLACE FUNCTION admin_promote_leader(
  p_team_name TEXT,
  p_new_leader_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE registrations
  SET is_team_leader = (id = p_new_leader_id)
  WHERE team_name = p_team_name
    AND payment_status <> 'cancelled';
END;
$$;

GRANT EXECUTE ON FUNCTION admin_promote_leader(TEXT, UUID) TO authenticated;
