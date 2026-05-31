-- ============================================================
-- MIGRACAO: Sugar Cubes — roster/destinatario so com CHECK-IN confirmado
-- ============================================================
-- Aplique no Supabase SQL Editor (NAO e auto-aplicada). Idempotente (CREATE OR
-- REPLACE). Depende de add_sugar_cubes.sql.
--
-- Ajuste pos-deploy: o seletor de destinatario deve listar SO participantes que
-- ja fizeram check-in (registrations.checked_in_at IS NOT NULL), nao apenas
-- pagamento confirmado. Mentores nao tem check-in (sem coluna), seguem todos.
-- Atualiza as duas RPCs de roster e a validacao de destinatario participante.
-- Identidade do remetente (participant_session_owner_confirmed) NAO muda:
-- exige so pagamento confirmado para enviar.

-- 1. Roster publico (participante/mentor) — participantes so com check-in
CREATE OR REPLACE FUNCTION sugar_roster(
  p_participant_token UUID DEFAULT NULL, p_mentor_token UUID DEFAULT NULL
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ok BOOLEAN := false; v_participants JSON; v_mentors JSON;
BEGIN
  IF p_participant_token IS NOT NULL THEN
    BEGIN PERFORM participant_session_owner_confirmed(p_participant_token); v_ok := true;
    EXCEPTION WHEN raise_exception THEN NULL; END;
  END IF;
  IF NOT v_ok AND p_mentor_token IS NOT NULL THEN
    BEGIN PERFORM mentor_session_owner(p_mentor_token); v_ok := true;
    EXCEPTION WHEN raise_exception THEN NULL; END;
  END IF;
  IF NOT v_ok THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT json_agg(json_build_object('ref', id, 'name', full_name) ORDER BY full_name)
    INTO v_participants FROM registrations
    WHERE payment_status = 'confirmed' AND checked_in_at IS NOT NULL;
  SELECT json_agg(json_build_object('ref', id, 'name', name) ORDER BY name)
    INTO v_mentors FROM mentors;

  RETURN json_build_object(
    'participants', COALESCE(v_participants, '[]'::JSON),
    'mentors',      COALESCE(v_mentors, '[]'::JSON),
    'organization', true
  );
END; $$;
GRANT EXECUTE ON FUNCTION sugar_roster(UUID, UUID) TO anon;

-- 2. Roster admin — mesma regra
CREATE OR REPLACE FUNCTION sugar_roster_admin()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_participants JSON; v_mentors JSON;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT json_agg(json_build_object('ref', id, 'name', full_name) ORDER BY full_name)
    INTO v_participants FROM registrations
    WHERE payment_status = 'confirmed' AND checked_in_at IS NOT NULL;
  SELECT json_agg(json_build_object('ref', id, 'name', name) ORDER BY name)
    INTO v_mentors FROM mentors;
  RETURN json_build_object(
    'participants', COALESCE(v_participants, '[]'::JSON),
    'mentors',      COALESCE(v_mentors, '[]'::JSON),
    'organization', true
  );
END; $$;
REVOKE ALL ON FUNCTION sugar_roster_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sugar_roster_admin() TO authenticated;

-- 3. Validacao de destinatario — participante so e valido se fez check-in
CREATE OR REPLACE FUNCTION sugar_resolve_recipient(p_type TEXT, p_ref UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name TEXT;
BEGIN
  IF p_type = 'organization' THEN
    IF p_ref IS NOT NULL THEN RAISE EXCEPTION 'invalid_recipient'; END IF;
    RETURN 'Organização HackIA';
  ELSIF p_type = 'participant' THEN
    SELECT full_name INTO v_name FROM registrations
      WHERE id = p_ref AND payment_status = 'confirmed' AND checked_in_at IS NOT NULL;
  ELSIF p_type = 'mentor' THEN
    SELECT name INTO v_name FROM mentors WHERE id = p_ref;
  ELSE
    RAISE EXCEPTION 'invalid_recipient';
  END IF;
  IF v_name IS NULL THEN RAISE EXCEPTION 'recipient_not_found'; END IF;
  RETURN v_name;
END; $$;
REVOKE ALL ON FUNCTION sugar_resolve_recipient(TEXT, UUID) FROM PUBLIC;
