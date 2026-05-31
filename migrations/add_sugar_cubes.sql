-- ============================================================
-- MIGRACAO: Sugar Cubes — Mural de Elogios (curadoria + liberacao)
-- ============================================================
-- Aplique no Supabase SQL Editor (NAO e auto-aplicada).
-- Idempotente (IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT).
-- Depende de: registrations, mentors, app_settings, is_admin(),
-- is_admin_or_viewer(), participant_session_owner_confirmed(UUID),
-- mentor_session_owner(UUID) (definidos em migrations anteriores).
--
-- Participantes/mentores/organizacao enviam elogios uns aos outros. Cada
-- elogio nasce 'pending' e so aparece para o destinatario quando: (a) o admin
-- aprova item a item E (b) o switch global app_settings('sugar_released')='true'.
-- O mural e ANONIMO: os RPCs de "recebidos" nunca devolvem o remetente; o
-- sender_name fica guardado so para o admin moderar. Identidade do remetente e
-- resolvida no servidor (token/admin); o cliente nunca a forja.

-- ============================================================
-- 1. Tabela + flag
-- ============================================================
CREATE TABLE IF NOT EXISTS sugar_cubes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  message         TEXT NOT NULL,
  sender_type     TEXT NOT NULL CHECK (sender_type IN ('participant','mentor','organization')),
  sender_ref      UUID,
  sender_name     TEXT NOT NULL,
  recipient_type  TEXT NOT NULL CHECK (recipient_type IN ('participant','mentor','organization')),
  recipient_ref   UUID,
  recipient_name  TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  moderated_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sugar_cubes_status    ON sugar_cubes(status);
CREATE INDEX IF NOT EXISTS idx_sugar_cubes_recipient ON sugar_cubes(recipient_type, recipient_ref);
CREATE INDEX IF NOT EXISTS idx_sugar_cubes_sender    ON sugar_cubes(sender_type, sender_ref);

-- app_settings ja existe (migration do DATI). Semeia o flag desligado.
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO app_settings (key, value) VALUES ('sugar_released', 'false')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 2. RLS deny-all (admin/viewer le direto p/ moderacao)
-- ============================================================
ALTER TABLE sugar_cubes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin can read sugar_cubes" ON sugar_cubes;
CREATE POLICY "Admin can read sugar_cubes" ON sugar_cubes
  FOR SELECT TO authenticated USING (is_admin_or_viewer());

-- ============================================================
-- 3. Helpers internos (REVOKE do PUBLIC: so chamados de outros DEFINER)
-- ============================================================
-- Resolve/valida o destinatario e devolve o nome de exibicao (snapshot).
CREATE OR REPLACE FUNCTION sugar_resolve_recipient(p_type TEXT, p_ref UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name TEXT;
BEGIN
  IF p_type = 'organization' THEN
    IF p_ref IS NOT NULL THEN RAISE EXCEPTION 'invalid_recipient'; END IF;
    RETURN 'Organização HackIA';
  ELSIF p_type = 'participant' THEN
    SELECT full_name INTO v_name FROM registrations
      WHERE id = p_ref AND payment_status = 'confirmed';
  ELSIF p_type = 'mentor' THEN
    SELECT name INTO v_name FROM mentors WHERE id = p_ref;
  ELSE
    RAISE EXCEPTION 'invalid_recipient';
  END IF;
  IF v_name IS NULL THEN RAISE EXCEPTION 'recipient_not_found'; END IF;
  RETURN v_name;
END; $$;
REVOKE ALL ON FUNCTION sugar_resolve_recipient(TEXT, UUID) FROM PUBLIC;

-- Insercao compartilhada: valida destinatario, bloqueia auto-elogio, anti-spam,
-- normaliza mensagem, insere 'pending'. sender_* ja vem resolvido no servidor.
CREATE OR REPLACE FUNCTION sugar_insert(
  p_sender_type TEXT, p_sender_ref UUID, p_sender_name TEXT,
  p_recipient_type TEXT, p_recipient_ref UUID, p_message TEXT
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c_throttle       CONSTANT INTERVAL := '5 seconds';
  c_max_per_sender CONSTANT INTEGER  := 30;
  v_recipient_name TEXT;
  v_msg            TEXT;
BEGIN
  -- 1. Resolve/valida destinatario
  v_recipient_name := sugar_resolve_recipient(p_recipient_type, p_recipient_ref);

  -- 2. Bloqueia auto-elogio (mesmo tipo E mesma ref; org tem ref NULL)
  IF p_sender_type = p_recipient_type
     AND p_sender_ref IS NOT DISTINCT FROM p_recipient_ref THEN
    RAISE EXCEPTION 'self_compliment';
  END IF;

  -- 3+4. Anti-spam (so para remetentes humanos; organizacao e admin-gated)
  IF p_sender_type <> 'organization' THEN
    -- teto por remetente
    IF (SELECT COUNT(*) FROM sugar_cubes
          WHERE sender_type = p_sender_type
            AND sender_ref IS NOT DISTINCT FROM p_sender_ref) >= c_max_per_sender THEN
      RAISE EXCEPTION 'rate_limited';
    END IF;
    -- throttle anti-duplo-clique
    IF EXISTS (SELECT 1 FROM sugar_cubes
          WHERE sender_type = p_sender_type
            AND sender_ref IS NOT DISTINCT FROM p_sender_ref
            AND created_at > now() - c_throttle) THEN
      RAISE EXCEPTION 'rate_limited';
    END IF;
  END IF;

  -- 5. Valida/normaliza mensagem
  v_msg := TRIM(COALESCE(p_message, ''));
  IF v_msg = '' THEN RAISE EXCEPTION 'message_required'; END IF;
  IF length(v_msg) > 280 THEN v_msg := left(v_msg, 280); END IF;

  -- 6. Insere pending
  INSERT INTO sugar_cubes (message, sender_type, sender_ref, sender_name,
                           recipient_type, recipient_ref, recipient_name)
  VALUES (v_msg, p_sender_type, p_sender_ref, p_sender_name,
          p_recipient_type, p_recipient_ref, v_recipient_name);

  RETURN json_build_object('ok', true);
END; $$;
REVOKE ALL ON FUNCTION sugar_insert(TEXT, UUID, TEXT, TEXT, UUID, TEXT) FROM PUBLIC;

-- ============================================================
-- 4. Envio (anon p/ participante/mentor; admin p/ organizacao)
-- ============================================================
CREATE OR REPLACE FUNCTION sugar_send_participant(
  p_token UUID, p_recipient_type TEXT, p_recipient_ref UUID, p_message TEXT
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_reg UUID; v_name TEXT;
BEGIN
  v_reg := participant_session_owner_confirmed(p_token);
  SELECT full_name INTO v_name FROM registrations WHERE id = v_reg;
  RETURN sugar_insert('participant', v_reg, v_name,
                      p_recipient_type, p_recipient_ref, p_message);
END; $$;
REVOKE ALL ON FUNCTION sugar_send_participant(UUID, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sugar_send_participant(UUID, TEXT, UUID, TEXT) TO anon;

CREATE OR REPLACE FUNCTION sugar_send_mentor(
  p_token UUID, p_recipient_type TEXT, p_recipient_ref UUID, p_message TEXT
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mentor UUID; v_name TEXT;
BEGIN
  v_mentor := mentor_session_owner(p_token);
  SELECT name INTO v_name FROM mentors WHERE id = v_mentor;
  RETURN sugar_insert('mentor', v_mentor, v_name,
                      p_recipient_type, p_recipient_ref, p_message);
END; $$;
REVOKE ALL ON FUNCTION sugar_send_mentor(UUID, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sugar_send_mentor(UUID, TEXT, UUID, TEXT) TO anon;

CREATE OR REPLACE FUNCTION sugar_send_org(
  p_recipient_type TEXT, p_recipient_ref UUID, p_message TEXT
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  RETURN sugar_insert('organization', NULL, 'Organização HackIA',
                      p_recipient_type, p_recipient_ref, p_message);
END; $$;
REVOKE ALL ON FUNCTION sugar_send_org(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sugar_send_org(TEXT, UUID, TEXT) TO authenticated;

-- ============================================================
-- 5. Roster (popular o seletor de destinatario)
-- ============================================================
-- Exige >=1 token valido (participante confirmado OU mentor). NAO e STABLE:
-- os resolvedores de sessao podem atualizar last_used_at.
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
    INTO v_participants FROM registrations WHERE payment_status = 'confirmed';
  SELECT json_agg(json_build_object('ref', id, 'name', name) ORDER BY name)
    INTO v_mentors FROM mentors;

  RETURN json_build_object(
    'participants', COALESCE(v_participants, '[]'::JSON),
    'mentors',      COALESCE(v_mentors, '[]'::JSON),
    'organization', true
  );
END; $$;
GRANT EXECUTE ON FUNCTION sugar_roster(UUID, UUID) TO anon;

CREATE OR REPLACE FUNCTION sugar_roster_admin()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_participants JSON; v_mentors JSON;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT json_agg(json_build_object('ref', id, 'name', full_name) ORDER BY full_name)
    INTO v_participants FROM registrations WHERE payment_status = 'confirmed';
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

-- ============================================================
-- 6. Recebidos (mural pessoal) — gate: liberado AND approved. Sem remetente.
-- ============================================================
CREATE OR REPLACE FUNCTION sugar_my_received_participant(p_token UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_reg UUID; v_released BOOLEAN; v_list JSON;
BEGIN
  v_reg := participant_session_owner_confirmed(p_token);
  SELECT COALESCE((SELECT value = 'true' FROM app_settings WHERE key = 'sugar_released'), false)
    INTO v_released;
  IF NOT v_released THEN RETURN '[]'::JSON; END IF;
  SELECT json_agg(json_build_object('message', message, 'created_at', created_at) ORDER BY created_at DESC)
    INTO v_list FROM sugar_cubes
    WHERE recipient_type = 'participant' AND recipient_ref = v_reg AND status = 'approved';
  RETURN COALESCE(v_list, '[]'::JSON);
END; $$;
GRANT EXECUTE ON FUNCTION sugar_my_received_participant(UUID) TO anon;

CREATE OR REPLACE FUNCTION sugar_my_received_mentor(p_token UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mentor UUID; v_released BOOLEAN; v_list JSON;
BEGIN
  v_mentor := mentor_session_owner(p_token);
  SELECT COALESCE((SELECT value = 'true' FROM app_settings WHERE key = 'sugar_released'), false)
    INTO v_released;
  IF NOT v_released THEN RETURN '[]'::JSON; END IF;
  SELECT json_agg(json_build_object('message', message, 'created_at', created_at) ORDER BY created_at DESC)
    INTO v_list FROM sugar_cubes
    WHERE recipient_type = 'mentor' AND recipient_ref = v_mentor AND status = 'approved';
  RETURN COALESCE(v_list, '[]'::JSON);
END; $$;
GRANT EXECUTE ON FUNCTION sugar_my_received_mentor(UUID) TO anon;

-- ============================================================
-- 7. Admin: lista (com remetente), moderacao, flag de liberacao
-- ============================================================
CREATE OR REPLACE FUNCTION sugar_admin_list(p_status TEXT DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_list JSON;
BEGIN
  IF NOT is_admin_or_viewer() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT json_agg(c ORDER BY c.created_at DESC) INTO v_list FROM (
    SELECT id, message, sender_type, sender_name,
           recipient_type, recipient_name, status, created_at, moderated_at
    FROM sugar_cubes
    WHERE p_status IS NULL OR status = p_status
  ) c;
  RETURN COALESCE(v_list, '[]'::JSON);
END; $$;
REVOKE ALL ON FUNCTION sugar_admin_list(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sugar_admin_list(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION sugar_moderate(p_id UUID, p_status TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_updated INTEGER;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF p_status NOT IN ('approved','rejected','pending') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  UPDATE sugar_cubes
     SET status = p_status,
         moderated_at = CASE WHEN p_status = 'pending' THEN NULL ELSE now() END
   WHERE id = p_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN RAISE EXCEPTION 'not_found'; END IF;
  RETURN json_build_object('ok', true);
END; $$;
REVOKE ALL ON FUNCTION sugar_moderate(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sugar_moderate(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION get_sugar_released()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT COALESCE((SELECT value = 'true' FROM app_settings WHERE key = 'sugar_released'), false);
$$;
REVOKE EXECUTE ON FUNCTION get_sugar_released() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_sugar_released() FROM anon;
GRANT EXECUTE ON FUNCTION get_sugar_released() TO authenticated;

CREATE OR REPLACE FUNCTION set_sugar_released(p_bool BOOLEAN)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO app_settings (key, value, updated_at)
  VALUES ('sugar_released', CASE WHEN p_bool THEN 'true' ELSE 'false' END, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  RETURN p_bool;
END; $$;
REVOKE EXECUTE ON FUNCTION set_sugar_released(BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION set_sugar_released(BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION set_sugar_released(BOOLEAN) TO authenticated;
