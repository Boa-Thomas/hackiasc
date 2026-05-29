-- ============================================================
-- add_staff_role.sql — role "staff" = Muro de Dores + Check-in.
-- Aditivo e idempotente (CREATE OR REPLACE). Aplicar via MCP.
-- ============================================================

-- Helper: operador do muro = admin OU staff.
CREATE OR REPLACE FUNCTION is_wall_staff()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff'),
    false
  );
$$;
REVOKE EXECUTE ON FUNCTION is_wall_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_wall_staff() TO authenticated;

-- Check-in passa a aceitar staff (alem de admin/checkin).
CREATE OR REPLACE FUNCTION is_checkin_staff()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'checkin', 'staff'),
    false
  );
$$;

-- SELECT de confirmados: inclui staff (necessario p/ check-in e p/ busca do
-- "adicionar dor por participante", que filtram confirmados). Permissiva,
-- OR-combinada com as policies admin/viewer existentes.
DROP POLICY IF EXISTS "Checkin can read confirmed registrations" ON registrations;
CREATE POLICY "Checkin can read confirmed registrations"
  ON registrations
  FOR SELECT
  TO authenticated
  USING (
    COALESCE((auth.jwt() -> 'app_metadata' ->> 'role') IN ('checkin','staff'), false)
    AND payment_status = 'confirmed'
  );

-- RPCs do muro: trocar o gate is_admin()/is_admin_or_viewer() para aceitar staff.
-- Corpos identicos aos atuais (add_wall_identity.sql / add_wall_voters.sql);
-- muda APENAS a checagem de autorizacao.

CREATE OR REPLACE FUNCTION wall_set_phase(p_phase TEXT)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_wall_staff() THEN
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
  IF NOT is_wall_staff() THEN
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
  IF NOT is_wall_staff() THEN
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
  IF NOT (is_admin_or_viewer() OR is_wall_staff()) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT phase INTO v_phase FROM wall_state WHERE id = true;

  SELECT json_agg(p ORDER BY p.vote_count DESC, p.created_at)
  INTO v_pains
  FROM (
    SELECT
      pn.id, pn.title, pn.description, pn.author_name, pn.axis,
      pn.status, pn.created_at,
      COUNT(pv.id)::INTEGER AS vote_count,
      (
        SELECT COALESCE(
          json_agg(
            json_build_object(
              'full_name', r.full_name,
              'email', r.email,
              'phone', r.phone
            ) ORDER BY r.full_name
          ), '[]'::json)
        FROM pain_votes pv2
        JOIN registrations r ON r.id = pv2.registration_id
        WHERE pv2.pain_id = pn.id
      ) AS voters
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

-- wall_admin_add_pain: gate is_admin() -> is_wall_staff(). Resto identico.
CREATE OR REPLACE FUNCTION wall_admin_add_pain(
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
  v_phase TEXT;
  v_name  TEXT;
  v_title TEXT;
  v_pain  pains;
BEGIN
  IF NOT is_wall_staff() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT phase INTO v_phase FROM wall_state WHERE id = true;
  IF v_phase <> 'wall_open' THEN
    RAISE EXCEPTION 'wall_not_open';
  END IF;

  v_name := wall_require_confirmed(p_registration_id);

  v_title := TRIM(COALESCE(p_title, ''));
  IF v_title = '' THEN
    RAISE EXCEPTION 'title_required';
  END IF;
  IF length(v_title) > 140 THEN
    v_title := left(v_title, 140);
  END IF;

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
    'id', v_pain.id,
    'title', v_pain.title,
    'author_name', v_pain.author_name
  );
END;
$$;
REVOKE ALL ON FUNCTION wall_admin_add_pain(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wall_admin_add_pain(UUID, TEXT, TEXT, TEXT) TO authenticated;
