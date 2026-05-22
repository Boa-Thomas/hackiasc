-- ============================================================
-- MIGRACAO: Painel da Equipe + Sistema de Mentor
-- ============================================================
-- Aplique no Supabase SQL Editor de um banco JA POPULADO.
-- Idempotente (IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT / DROP IF EXISTS).
-- Espelha as adicoes de supabase-setup.sql (estado canonico).

-- ============================================================
-- TEAM DELIVERABLES + MENTOR SYSTEM
-- ============================================================
-- Fundação: tabela `teams` com id estável que carrega os entregáveis da
-- metodologia (e, adiante, as ponderações dos mentores). `team_name` segue
-- canônico para PERTENÇA (escrito direto pelo admin); `registrations.team_id`
-- é um espelho derivado, mantido por trigger. Renomear via `teams.name`
-- (cascade AFTER UPDATE) preserva o id e o conteúdo.
-- Migração equivalente p/ banco existente: migrations/add_team_and_mentors.sql

-- 1. Tabela de equipes (identidade estável + entregáveis em JSONB)
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  hypotheses_canvas  JSONB NOT NULL DEFAULT '{}'::jsonb,  -- Fase 1: Canvas de Hipóteses
  slc_ia_canvas      JSONB NOT NULL DEFAULT '{}'::jsonb,  -- Fase 2: Canvas SLC-IA
  learning_diary     JSONB NOT NULL DEFAULT '{}'::jsonb,  -- Fase 2: Diário de Aprendizado
  final_deliverables JSONB NOT NULL DEFAULT '{}'::jsonb,  -- Fase 3: Entregas finais
  updated_by UUID REFERENCES registrations(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_teams_name ON teams(name);

ALTER TABLE registrations ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_registrations_team_id ON registrations(team_id);

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin can read teams" ON teams;
CREATE POLICY "Admin can read teams" ON teams
  FOR SELECT TO authenticated USING (is_admin_or_viewer());
DROP POLICY IF EXISTS "Admin can update teams" ON teams;
CREATE POLICY "Admin can update teams" ON teams
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "Admin can insert teams" ON teams;
CREATE POLICY "Admin can insert teams" ON teams
  FOR INSERT TO authenticated WITH CHECK (is_admin());

-- 2. Backfill idempotente: 1 teams-row por team_name distinto; popula team_id
INSERT INTO teams (name)
SELECT DISTINCT team_name FROM registrations
WHERE team_name IS NOT NULL AND payment_status <> 'cancelled'
ON CONFLICT (name) DO NOTHING;

UPDATE registrations r SET team_id = t.id
FROM teams t WHERE r.team_name = t.name AND r.team_id IS DISTINCT FROM t.id;

-- 3. Trigger: mantém registrations.team_id em sincronia com team_name (find-or-create)
CREATE OR REPLACE FUNCTION sync_registration_team_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_team_id UUID;
BEGIN
  IF NEW.team_name IS NULL THEN
    NEW.team_id := NULL;
    RETURN NEW;
  END IF;
  SELECT id INTO v_team_id FROM teams WHERE name = NEW.team_name;
  IF v_team_id IS NULL THEN
    INSERT INTO teams (name) VALUES (NEW.team_name)
    ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_team_id;
  END IF;
  NEW.team_id := v_team_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_team_id_ins ON registrations;
CREATE TRIGGER trg_sync_team_id_ins
  BEFORE INSERT ON registrations
  FOR EACH ROW EXECUTE FUNCTION sync_registration_team_id();

DROP TRIGGER IF EXISTS trg_sync_team_id_upd ON registrations;
CREATE TRIGGER trg_sync_team_id_upd
  BEFORE UPDATE OF team_name ON registrations
  FOR EACH ROW EXECUTE FUNCTION sync_registration_team_id();

-- 4. Trigger: renomear teams.name cascateia p/ membros e pedidos.
--    AFTER UPDATE (não BEFORE): o sync interno precisa enxergar o nome já
--    persistido, senão criaria uma teams-row órfã.
CREATE OR REPLACE FUNCTION cascade_team_rename()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE registrations SET team_name = NEW.name
      WHERE team_id = NEW.id AND team_name IS DISTINCT FROM NEW.name;
    UPDATE team_join_requests SET team_name = NEW.name, updated_at = now()
      WHERE team_name = OLD.name AND status = 'pending';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_cascade_team_rename ON teams;
CREATE TRIGGER trg_cascade_team_rename
  AFTER UPDATE OF name ON teams
  FOR EACH ROW EXECUTE FUNCTION cascade_team_rename();

-- 5. RPC: salvar um entregável da equipe (qualquer membro confirmado edita)
CREATE OR REPLACE FUNCTION participant_save_team_deliverable(p_token UUID, p_field TEXT, p_data JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_reg_id UUID;
  v_team_id UUID;
BEGIN
  v_reg_id := participant_session_owner_confirmed(p_token);

  IF p_field NOT IN ('hypotheses_canvas','slc_ia_canvas','learning_diary','final_deliverables') THEN
    RAISE EXCEPTION 'invalid_field';
  END IF;

  IF p_data IS NULL OR length(p_data::text) > 65536 THEN
    RAISE EXCEPTION 'invalid_payload';
  END IF;

  SELECT team_id INTO v_team_id FROM registrations WHERE id = v_reg_id;
  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'not_in_team';
  END IF;

  UPDATE teams SET
    hypotheses_canvas  = CASE WHEN p_field = 'hypotheses_canvas'  THEN p_data ELSE hypotheses_canvas  END,
    slc_ia_canvas      = CASE WHEN p_field = 'slc_ia_canvas'      THEN p_data ELSE slc_ia_canvas      END,
    learning_diary     = CASE WHEN p_field = 'learning_diary'     THEN p_data ELSE learning_diary     END,
    final_deliverables = CASE WHEN p_field = 'final_deliverables' THEN p_data ELSE final_deliverables END,
    updated_at = now(),
    updated_by = v_reg_id
  WHERE id = v_team_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION participant_save_team_deliverable(UUID, TEXT, JSONB) TO anon;

-- ============================================================
-- MENTOR LOGIN — Email + código de 4 dígitos (token custom)
-- ============================================================
-- Mentores NÃO usam Supabase Auth: mesmo molde dos participantes (RPC +
-- mentor_sessions). O admin cadastra o mentor e gera o código (Fase 6).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS mentors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  access_code_hash TEXT NOT NULL,
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  failed_login_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mentor_sessions (
  token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id UUID NOT NULL REFERENCES mentors(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mentor_sessions_mentor ON mentor_sessions(mentor_id);

ALTER TABLE mentors ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentor_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin can read mentors" ON mentors;
CREATE POLICY "Admin can read mentors" ON mentors
  FOR SELECT TO authenticated USING (is_admin_or_viewer());
DROP POLICY IF EXISTS "Admin can manage mentors" ON mentors;
CREATE POLICY "Admin can manage mentors" ON mentors
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "Admin can read mentor sessions" ON mentor_sessions;
CREATE POLICY "Admin can read mentor sessions" ON mentor_sessions
  FOR SELECT TO authenticated USING (is_admin_or_viewer());

-- Helper: valida token de mentor, refresca last_used_at, retorna mentor_id
CREATE OR REPLACE FUNCTION mentor_session_owner(p_token UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id UUID;
BEGIN
  SELECT mentor_id INTO v_id FROM mentor_sessions
  WHERE token = p_token AND expires_at > now() LIMIT 1;
  IF v_id IS NULL THEN RAISE EXCEPTION 'invalid_or_expired_session'; END IF;
  UPDATE mentor_sessions SET last_used_at = now() WHERE token = p_token;
  RETURN v_id;
END; $$;

-- Login: email + código; lockout de 1h após 10 tentativas (espelha participant_login)
CREATE OR REPLACE FUNCTION mentor_login(p_email TEXT, p_code TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_mentor RECORD;
  v_token UUID;
  v_now TIMESTAMPTZ := now();
  v_max CONSTANT INTEGER := 10;
  v_lockout CONSTANT INTERVAL := interval '1 hour';
BEGIN
  IF p_email IS NULL OR p_email = '' OR p_code IS NULL OR p_code = '' THEN
    RETURN NULL;
  END IF;

  SELECT id, access_code_hash, failed_login_until, failed_login_count
  INTO v_mentor FROM mentors WHERE LOWER(email) = LOWER(TRIM(p_email)) LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_mentor.failed_login_until IS NOT NULL AND v_mentor.failed_login_until > v_now THEN
    RETURN NULL;
  END IF;

  IF crypt(p_code, v_mentor.access_code_hash) <> v_mentor.access_code_hash THEN
    UPDATE mentors
    SET failed_login_count = failed_login_count + 1,
        failed_login_until = CASE
          WHEN failed_login_count + 1 >= v_max THEN v_now + v_lockout
          ELSE failed_login_until END
    WHERE id = v_mentor.id;
    RETURN NULL;
  END IF;

  UPDATE mentors SET failed_login_count = 0, failed_login_until = NULL WHERE id = v_mentor.id;
  INSERT INTO mentor_sessions (mentor_id) VALUES (v_mentor.id) RETURNING token INTO v_token;
  RETURN json_build_object('token', v_token, 'expires_at', v_now + interval '7 days');
END; $$;

GRANT EXECUTE ON FUNCTION mentor_login(TEXT, TEXT) TO anon;

CREATE OR REPLACE FUNCTION mentor_logout(p_token UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM mentor_sessions WHERE token = p_token;
  RETURN true;
END; $$;

GRANT EXECUTE ON FUNCTION mentor_logout(UUID) TO anon;

-- mentor_get_me: dados do mentor + equipe pareada (entregáveis em leitura + membros)
CREATE OR REPLACE FUNCTION mentor_get_me(p_token UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_mentor_id UUID;
  v_mentor RECORD;
  v_team JSON;
BEGIN
  v_mentor_id := mentor_session_owner(p_token);
  SELECT id, name, email, team_id INTO v_mentor FROM mentors WHERE id = v_mentor_id;

  IF v_mentor.team_id IS NOT NULL THEN
    SELECT json_build_object(
      'id', t.id, 'name', t.name,
      'hypotheses_canvas', t.hypotheses_canvas,
      'slc_ia_canvas', t.slc_ia_canvas,
      'learning_diary', t.learning_diary,
      'final_deliverables', t.final_deliverables,
      'updated_at', t.updated_at,
      'updated_by_name', (SELECT full_name FROM registrations WHERE id = t.updated_by),
      'members', COALESCE((
        SELECT json_agg(json_build_object(
          'full_name', r.full_name, 'email', r.email,
          'is_team_leader', r.is_team_leader, 'occupation_type', r.occupation_type,
          'is_remote', r.is_remote
        ) ORDER BY r.is_team_leader DESC, r.created_at)
        FROM registrations r
        WHERE r.team_id = t.id AND r.payment_status <> 'cancelled'
      ), '[]'::json)
    ) INTO v_team
    FROM teams t WHERE t.id = v_mentor.team_id;
  ELSE
    v_team := NULL;
  END IF;

  RETURN json_build_object(
    'mentor', json_build_object(
      'id', v_mentor.id, 'name', v_mentor.name,
      'email', v_mentor.email, 'team_id', v_mentor.team_id
    ),
    'team', v_team,
    'notes', COALESCE((
      SELECT json_agg(json_build_object(
        'id', n.id, 'phase', n.phase, 'body', n.body,
        'is_public', n.is_public, 'updated_at', n.updated_at
      ) ORDER BY n.created_at)
      FROM mentor_notes n WHERE n.team_id = v_mentor.team_id AND n.mentor_id = v_mentor_id
    ), '[]'::json)
  );
END; $$;

GRANT EXECUTE ON FUNCTION mentor_get_me(UUID) TO anon;

-- ============================================================
-- MENTOR NOTES — ponderações por fase (públicas e privadas)
-- ============================================================
CREATE TABLE IF NOT EXISTS mentor_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  mentor_id UUID NOT NULL REFERENCES mentors(id) ON DELETE CASCADE,
  phase TEXT NOT NULL CHECK (phase IN ('ignicao','construcao','apresentacao')),
  body TEXT NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mentor_notes_team ON mentor_notes(team_id);

ALTER TABLE mentor_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin can read mentor notes" ON mentor_notes;
CREATE POLICY "Admin can read mentor notes" ON mentor_notes
  FOR SELECT TO authenticated USING (is_admin_or_viewer());

-- Salvar (inserir/editar) uma ponderação — só o mentor autor, na sua equipe
CREATE OR REPLACE FUNCTION mentor_save_note(p_token UUID, p_phase TEXT, p_body TEXT, p_is_public BOOLEAN, p_note_id UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_mentor_id UUID;
  v_team_id UUID;
  v_note_id UUID;
BEGIN
  v_mentor_id := mentor_session_owner(p_token);
  IF p_phase NOT IN ('ignicao','construcao','apresentacao') THEN RAISE EXCEPTION 'invalid_phase'; END IF;
  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN RAISE EXCEPTION 'empty_body'; END IF;
  IF length(p_body) > 5000 THEN RAISE EXCEPTION 'body_too_long'; END IF;

  SELECT team_id INTO v_team_id FROM mentors WHERE id = v_mentor_id;
  IF v_team_id IS NULL THEN RAISE EXCEPTION 'not_paired'; END IF;

  IF p_note_id IS NULL THEN
    INSERT INTO mentor_notes (team_id, mentor_id, phase, body, is_public)
    VALUES (v_team_id, v_mentor_id, p_phase, p_body, COALESCE(p_is_public, false))
    RETURNING id INTO v_note_id;
  ELSE
    UPDATE mentor_notes
    SET phase = p_phase, body = p_body, is_public = COALESCE(p_is_public, false), updated_at = now()
    WHERE id = p_note_id AND mentor_id = v_mentor_id
    RETURNING id INTO v_note_id;
    IF v_note_id IS NULL THEN RAISE EXCEPTION 'note_not_found'; END IF;
  END IF;
  RETURN v_note_id;
END; $$;

GRANT EXECUTE ON FUNCTION mentor_save_note(UUID, TEXT, TEXT, BOOLEAN, UUID) TO anon;

CREATE OR REPLACE FUNCTION mentor_delete_note(p_token UUID, p_note_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_mentor_id UUID; v_deleted INTEGER;
BEGIN
  v_mentor_id := mentor_session_owner(p_token);
  DELETE FROM mentor_notes WHERE id = p_note_id AND mentor_id = v_mentor_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN RAISE EXCEPTION 'note_not_found'; END IF;
  RETURN true;
END; $$;

GRANT EXECUTE ON FUNCTION mentor_delete_note(UUID, UUID) TO anon;

-- ============================================================
-- ADMIN: cadastro de mentores (gera código de 4 dígitos)
-- ============================================================
-- Cria a conta do mentor pelo painel admin (sem Supabase Auth): gera o código,
-- hasheia (pgcrypto) e retorna o código em claro UMA vez para o admin repassar.
CREATE OR REPLACE FUNCTION admin_create_mentor(p_email TEXT, p_name TEXT, p_team_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_code TEXT;
  v_id UUID;
  v_rand BYTEA;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN RAISE EXCEPTION 'email_required'; END IF;

  -- CSPRNG (pgcrypto) em vez de random(): código de auth não deve usar PRNG seedado
  v_rand := gen_random_bytes(4);
  v_code := lpad(((get_byte(v_rand, 0)::bigint * 16777216 + get_byte(v_rand, 1) * 65536 + get_byte(v_rand, 2) * 256 + get_byte(v_rand, 3)) % 10000)::text, 4, '0');

  INSERT INTO mentors (email, name, team_id, access_code_hash)
  VALUES (LOWER(TRIM(p_email)), NULLIF(TRIM(COALESCE(p_name, '')), ''), p_team_id, crypt(v_code, gen_salt('bf')))
  RETURNING id INTO v_id;

  RETURN json_build_object('id', v_id, 'code', v_code);
EXCEPTION
  WHEN unique_violation THEN RAISE EXCEPTION 'email_already_exists';
END; $$;

GRANT EXECUTE ON FUNCTION admin_create_mentor(TEXT, TEXT, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION admin_reset_mentor_code(p_mentor_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_code TEXT; v_rand BYTEA;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  v_rand := gen_random_bytes(4);
  v_code := lpad(((get_byte(v_rand, 0)::bigint * 16777216 + get_byte(v_rand, 1) * 65536 + get_byte(v_rand, 2) * 256 + get_byte(v_rand, 3)) % 10000)::text, 4, '0');
  UPDATE mentors
  SET access_code_hash = crypt(v_code, gen_salt('bf')),
      failed_login_count = 0, failed_login_until = NULL
  WHERE id = p_mentor_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'mentor_not_found'; END IF;
  RETURN json_build_object('code', v_code);
END; $$;

GRANT EXECUTE ON FUNCTION admin_reset_mentor_code(UUID) TO authenticated;

-- ============================================================
-- participant_get_me ATUALIZADO (passa a retornar team + public_notes)
-- ============================================================
CREATE OR REPLACE FUNCTION participant_get_me(p_token UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_reg_id UUID;
  v_reg RECORD;
  v_members JSON;
  v_pending_requests JSON;
  v_my_requests JSON;
  v_team JSON;
BEGIN
  v_reg_id := participant_session_owner(p_token);

  SELECT id, full_name, email, phone, birth_date, linkedin_url,
         occupation_type, ai_experience_level, dietary_restrictions,
         is_pcd, pcd_type, has_project, project_name, economic_axes,
         inscription_modality, team_name, team_id, is_team_leader, is_remote,
         payment_status, payment_method, ticket_tier, ticket_price,
         created_at, checked_in_at
  INTO v_reg
  FROM registrations WHERE id = v_reg_id;

  -- Quem ainda não confirmou pagamento não acessa dados de equipe.
  IF v_reg.payment_status <> 'confirmed' THEN
    RETURN json_build_object(
      'profile', row_to_json(v_reg),
      'team_members', '[]'::JSON,
      'pending_requests', '[]'::JSON,
      'my_requests', '[]'::JSON,
      'team', NULL
    );
  END IF;

  IF v_reg.team_name IS NOT NULL THEN
    SELECT json_agg(m ORDER BY m.is_team_leader DESC, m.created_at)
    INTO v_members
    FROM (
      SELECT id, full_name, email, is_team_leader, occupation_type,
             ai_experience_level, is_remote, created_at
      FROM registrations
      WHERE team_name = v_reg.team_name
    ) m;
  ELSE
    v_members := '[]'::JSON;
  END IF;

  IF v_reg.is_team_leader AND v_reg.team_name IS NOT NULL THEN
    SELECT json_agg(p ORDER BY p.created_at)
    INTO v_pending_requests
    FROM (
      SELECT tjr.id, tjr.created_at, tjr.message,
             json_build_object(
               'id', r.id,
               'full_name', r.full_name,
               'email', r.email,
               'occupation_type', r.occupation_type,
               'ai_experience_level', r.ai_experience_level
             ) AS requester
      FROM team_join_requests tjr
      JOIN registrations r ON r.id = tjr.requester_id
      WHERE tjr.team_name = v_reg.team_name AND tjr.status = 'pending'
    ) p;
  ELSE
    v_pending_requests := '[]'::JSON;
  END IF;

  SELECT json_agg(q ORDER BY q.created_at DESC)
  INTO v_my_requests
  FROM (
    SELECT id, team_name, status, created_at, decided_at
    FROM team_join_requests
    WHERE requester_id = v_reg_id
      AND status IN ('pending', 'rejected')
      AND created_at > now() - interval '30 days'
  ) q;

  IF v_reg.team_id IS NOT NULL THEN
    SELECT json_build_object(
      'id', t.id,
      'name', t.name,
      'hypotheses_canvas', t.hypotheses_canvas,
      'slc_ia_canvas', t.slc_ia_canvas,
      'learning_diary', t.learning_diary,
      'final_deliverables', t.final_deliverables,
      'updated_at', t.updated_at,
      'updated_by_name', (SELECT full_name FROM registrations WHERE id = t.updated_by),
      'public_notes', COALESCE((
        SELECT json_agg(json_build_object(
          'id', n.id, 'phase', n.phase, 'body', n.body, 'updated_at', n.updated_at
        ) ORDER BY n.created_at)
        FROM mentor_notes n WHERE n.team_id = t.id AND n.is_public = true
      ), '[]'::json)
    ) INTO v_team
    FROM teams t WHERE t.id = v_reg.team_id;
  ELSE
    v_team := NULL;
  END IF;

  RETURN json_build_object(
    'profile', row_to_json(v_reg),
    'team_members', COALESCE(v_members, '[]'::JSON),
    'pending_requests', COALESCE(v_pending_requests, '[]'::JSON),
    'my_requests', COALESCE(v_my_requests, '[]'::JSON),
    'team', v_team
  );
END;
$$;

GRANT EXECUTE ON FUNCTION participant_get_me(UUID) TO anon;
