-- ============================================================
-- HackIA SC — Supabase Database Setup
-- Execute este SQL no Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 1. Tabela de inscrições
CREATE TABLE registrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- Dados pessoais
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  birth_date DATE NOT NULL,
  linkedin_url TEXT,
  cpf TEXT NOT NULL,

  -- Perfil
  occupation_type TEXT NOT NULL CHECK (occupation_type IN ('hacker','hustler','hipster','enthusiast')),
  ai_experience_level INTEGER NOT NULL CHECK (ai_experience_level BETWEEN 1 AND 10),

  -- Necessidades do evento
  dietary_restrictions TEXT NOT NULL,
  is_pcd BOOLEAN NOT NULL DEFAULT false,
  pcd_type TEXT,

  -- Projeto
  has_project BOOLEAN NOT NULL DEFAULT false,
  project_name TEXT,

  -- Eixos econômicos (opcional)
  economic_axes TEXT[] DEFAULT '{}',

  -- Modalidade de inscrição
  inscription_modality TEXT NOT NULL CHECK (inscription_modality IN ('individual_form_team','individual_own','team')),
  team_name TEXT,
  -- Team leader flag (only relevant when inscription_modality = 'team')
  is_team_leader BOOLEAN NOT NULL DEFAULT false,

  -- Pagamento
  payment_method TEXT NOT NULL CHECK (payment_method IN ('pix','card')),
  ticket_tier TEXT NOT NULL CHECK (ticket_tier IN ('early_bird','regular','dati')),
  ticket_price INTEGER NOT NULL,
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending','confirmed','cancelled')),
  payment_confirmed_at TIMESTAMPTZ,
  payment_notes TEXT,

  -- Early bird expiration (30 min window)
  price_expires_at TIMESTAMPTZ,

  -- Check-in (dia do evento)
  checked_in_at TIMESTAMPTZ,

  -- Participação remota (equipes — máx. 1 por equipe, edital 2.2.1)
  is_remote BOOLEAN NOT NULL DEFAULT false,

  -- LGPD e declarações adicionais
  accept_lgpd BOOLEAN NOT NULL DEFAULT false,
  accept_code_ip BOOLEAN NOT NULL DEFAULT false
);

-- Para bancos de dados existentes, executar a migração:
-- ALTER TABLE registrations ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Index para queries de status de pagamento
CREATE INDEX idx_reg_payment_status ON registrations(payment_status);

-- 2a. Índice único parcial no e-mail — só vale para inscrições ativas.
-- Linhas com payment_status = 'cancelled' não bloqueiam reinscrição.
CREATE UNIQUE INDEX uq_registrations_email_active
  ON registrations (LOWER(email))
  WHERE payment_status <> 'cancelled';

-- 3. Habilitar Row Level Security
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;

-- 3a. Helper functions for role-based RLS checks
-- Uses app_metadata (not user_metadata) because users can self-modify user_metadata
CREATE OR REPLACE FUNCTION is_admin_or_viewer()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'viewer'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

-- 4. Policy: Qualquer pessoa pode se inscrever (INSERT)
CREATE POLICY "Allow public registration insert"
  ON registrations
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- 5. Policy: Apenas admin/viewer pode ler (role checked via JWT metadata)
CREATE POLICY "Admin can read all registrations"
  ON registrations
  FOR SELECT
  TO authenticated
  USING (is_admin_or_viewer());

-- 6. Policy: Apenas admin pode atualizar (confirmar pagamento)
CREATE POLICY "Admin can update registrations"
  ON registrations
  FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- 7. Função RPC para contar inscrições confirmadas (seguro para anon)
CREATE OR REPLACE FUNCTION get_confirmed_count()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COUNT(*)::INTEGER
  FROM registrations
  WHERE payment_status = 'confirmed';
$$;

-- Permitir que anon chame essa função
GRANT EXECUTE ON FUNCTION get_confirmed_count() TO anon;

-- 7b. Contar ingressos early bird vendidos (pending + confirmed, exclui cancelled)
-- Usado para determinar se early bird ainda está disponível
CREATE OR REPLACE FUNCTION get_early_bird_sold()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COUNT(*)::INTEGER
  FROM registrations
  WHERE ticket_tier = 'early_bird'
    AND payment_status != 'cancelled';
$$;

GRANT EXECUTE ON FUNCTION get_early_bird_sold() TO anon;

-- ============================================================
-- RPC: Recover pending registration for payment retry
-- ============================================================
CREATE OR REPLACE FUNCTION recover_pending_registration(p_email TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_reg RECORD;
  v_member_count INTEGER;
BEGIN
  SELECT id, full_name, email, payment_method, ticket_price, ticket_tier,
         team_name, inscription_modality, is_team_leader, price_expires_at
  INTO v_reg
  FROM registrations
  WHERE LOWER(email) = LOWER(p_email)
    AND payment_status = 'pending'
  LIMIT 1;

  IF NOT FOUND THEN
    -- Return NULL for both "not found" and "already processed" to prevent email enumeration
    RETURN NULL;
  END IF;

  IF v_reg.inscription_modality = 'team' AND v_reg.team_name IS NOT NULL THEN
    SELECT COUNT(*)::INTEGER INTO v_member_count
    FROM registrations
    WHERE team_name = v_reg.team_name;
  ELSE
    v_member_count := 1;
  END IF;

  IF v_reg.inscription_modality = 'team' AND NOT v_reg.is_team_leader THEN
    SELECT id INTO v_reg.id
    FROM registrations
    WHERE team_name = v_reg.team_name
      AND is_team_leader = true
    LIMIT 1;
  END IF;

  RETURN json_build_object(
    'status', 'pending',
    'id', v_reg.id,
    'full_name', v_reg.full_name,
    'email', v_reg.email,
    'payment_method', v_reg.payment_method,
    'ticket_price', v_reg.ticket_price,
    'ticket_tier', v_reg.ticket_tier,
    'team_name', v_reg.team_name,
    'inscription_modality', v_reg.inscription_modality,
    'member_count', v_member_count,
    'price_expires_at', v_reg.price_expires_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION recover_pending_registration(TEXT) TO anon;

-- ============================================================
-- Trigger: Limit team size to 6 members
-- ============================================================
CREATE OR REPLACE FUNCTION check_team_size()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF NEW.team_name IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count
    FROM registrations
    WHERE team_name = NEW.team_name AND payment_status <> 'cancelled';
    IF v_count >= 6 THEN
      RAISE EXCEPTION 'Team size cannot exceed 6 members';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_team_size
  BEFORE INSERT ON registrations
  FOR EACH ROW
  EXECUTE FUNCTION check_team_size();

-- ============================================================
-- Audit Log — rastreamento de todas as ações do sistema
-- ============================================================

CREATE TABLE audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  action TEXT NOT NULL,             -- e.g. 'registration.create', 'payment.confirm'
  actor_type TEXT NOT NULL CHECK (actor_type IN ('public','admin','system')),
  actor_email TEXT,                 -- admin email or user email
  target_table TEXT,                -- 'registrations', 'waitlist'
  target_id UUID,                   -- ID of affected record
  target_email TEXT,                -- email of affected participant
  old_data JSONB,                   -- previous state (for updates)
  new_data JSONB,                   -- new state / action details
  metadata JSONB                    -- extra context (team_name, refund info, etc.)
);

CREATE INDEX idx_audit_created_at ON audit_log(created_at DESC);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_target_id ON audit_log(target_id);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Only admin can insert audit entries (service_role bypasses RLS automatically)
CREATE POLICY "Admin can insert audit log"
  ON audit_log FOR INSERT TO authenticated WITH CHECK (is_admin());

-- Only admin/viewer can read audit log (role checked via JWT metadata)
CREATE POLICY "Admin can read audit log"
  ON audit_log FOR SELECT TO authenticated USING (is_admin_or_viewer());

-- ============================================================
-- Ticket transfer — mover ingresso pago de A para B sem reembolso
-- (ex.: empresa pagou por A, A não pode comparecer, B vai no lugar)
-- ============================================================

ALTER TABLE registrations
  ADD COLUMN IF NOT EXISTS transferred_to_id UUID REFERENCES registrations(id),
  ADD COLUMN IF NOT EXISTS transferred_from_id UUID REFERENCES registrations(id),
  ADD COLUMN IF NOT EXISTS transferred_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_reg_transferred_to ON registrations(transferred_to_id);
CREATE INDEX IF NOT EXISTS idx_reg_transferred_from ON registrations(transferred_from_id);

-- RPC: transfere o pagamento de p_from_id (confirmado) para p_to_id (pendente).
-- A vira 'cancelled' com nota de transferência, B fica 'confirmed' herdando
-- payment_method, ticket_tier, ticket_price e payment_confirmed_at.
-- Não dispara reembolso — o dinheiro continua com o evento.
CREATE OR REPLACE FUNCTION transfer_ticket(p_from_id UUID, p_to_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_from registrations;
  v_to   registrations;
  v_now  TIMESTAMPTZ := now();
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF p_from_id = p_to_id THEN
    RAISE EXCEPTION 'origem e destino devem ser diferentes';
  END IF;

  SELECT * INTO v_from FROM registrations WHERE id = p_from_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'inscrição de origem não encontrada';
  END IF;

  SELECT * INTO v_to FROM registrations WHERE id = p_to_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'inscrição de destino não encontrada';
  END IF;

  IF v_from.payment_status <> 'confirmed' THEN
    RAISE EXCEPTION 'origem precisa ter pagamento confirmado (atual: %)', v_from.payment_status;
  END IF;

  IF v_to.payment_status = 'confirmed' THEN
    RAISE EXCEPTION 'destino já tem pagamento confirmado';
  END IF;

  IF v_to.payment_status = 'cancelled' THEN
    RAISE EXCEPTION 'destino está cancelado';
  END IF;

  IF v_from.transferred_to_id IS NOT NULL THEN
    RAISE EXCEPTION 'ingresso de origem já foi transferido anteriormente';
  END IF;

  -- Destino herda o pagamento
  UPDATE registrations SET
    payment_method        = v_from.payment_method,
    ticket_tier           = v_from.ticket_tier,
    ticket_price          = v_from.ticket_price,
    payment_status        = 'confirmed',
    payment_confirmed_at  = COALESCE(v_from.payment_confirmed_at, v_now),
    payment_notes         = TRIM(BOTH E'\n' FROM
                              COALESCE(payment_notes, '') ||
                              E'\n[' || to_char(v_now, 'YYYY-MM-DD HH24:MI') ||
                              '] Transferido de ' || v_from.email),
    transferred_from_id   = v_from.id
  WHERE id = p_to_id;

  -- Origem é marcada como transferida (cancelled, sem reembolso)
  UPDATE registrations SET
    payment_status = 'cancelled',
    payment_notes  = TRIM(BOTH E'\n' FROM
                       COALESCE(payment_notes, '') ||
                       E'\n[' || to_char(v_now, 'YYYY-MM-DD HH24:MI') ||
                       '] Transferido para ' || v_to.email),
    transferred_to_id = v_to.id,
    transferred_at    = v_now
  WHERE id = p_from_id;

  RETURN json_build_object(
    'success', true,
    'from_id', p_from_id,
    'to_id', p_to_id,
    'ticket_tier', v_from.ticket_tier,
    'ticket_price', v_from.ticket_price,
    'transferred_at', v_now
  );
END;
$$;

GRANT EXECUTE ON FUNCTION transfer_ticket(UUID, UUID) TO authenticated;

-- ============================================================
-- MIGRATION: Run on existing databases
-- ============================================================
-- ALTER TABLE registrations ADD COLUMN accept_lgpd BOOLEAN NOT NULL DEFAULT false;
-- ALTER TABLE registrations ADD COLUMN accept_code_ip BOOLEAN NOT NULL DEFAULT false;
-- ALTER TABLE registrations ADD COLUMN cpf TEXT NOT NULL DEFAULT '';
-- ALTER TABLE registrations ALTER COLUMN linkedin_url DROP NOT NULL;
-- ALTER TABLE registrations ADD COLUMN price_expires_at TIMESTAMPTZ;
-- ALTER TABLE registrations ADD COLUMN IF NOT EXISTS is_remote BOOLEAN NOT NULL DEFAULT false;
-- ALTER TABLE registrations DROP CONSTRAINT registrations_ticket_tier_check;
-- ALTER TABLE registrations ADD CONSTRAINT registrations_ticket_tier_check CHECK (ticket_tier IN ('early_bird','regular','dati'));
-- ALTER TABLE registrations ADD COLUMN IF NOT EXISTS transferred_to_id UUID REFERENCES registrations(id);
-- ALTER TABLE registrations ADD COLUMN IF NOT EXISTS transferred_from_id UUID REFERENCES registrations(id);
-- ALTER TABLE registrations ADD COLUMN IF NOT EXISTS transferred_at TIMESTAMPTZ;
-- ALTER TABLE registrations ADD COLUMN IF NOT EXISTS applied_discount_code TEXT;  -- migrations/support_dati_discount_validation.sql
-- ALTER TABLE registrations DROP CONSTRAINT IF EXISTS registrations_email_key;  -- migrations/allow_reregister_after_cancel.sql
-- CREATE UNIQUE INDEX IF NOT EXISTS uq_registrations_email_active ON registrations (LOWER(email)) WHERE payment_status <> 'cancelled';  -- migrations/allow_reregister_after_cancel.sql

-- ============================================================
-- PARTICIPANT LOGIN — Email + CPF auth for self-service panel
-- ============================================================
-- Adiciona painel do participante: ver equipe, sair/entrar (com aprovação),
-- editar dados próprios. Sessão via token UUID (sessionStorage), com
-- lockout anti-brute-force e RLS deny-all (acesso só via SECURITY DEFINER).

-- 1. Lockout columns on registrations
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS failed_login_until TIMESTAMPTZ;

-- 2. Sessions table (token + 7-day expiry)
CREATE TABLE IF NOT EXISTS participant_sessions (
  token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_participant_sessions_reg ON participant_sessions(registration_id);
CREATE INDEX IF NOT EXISTS idx_participant_sessions_expires ON participant_sessions(expires_at);

ALTER TABLE participant_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can read participant sessions"
  ON participant_sessions FOR SELECT TO authenticated USING (is_admin_or_viewer());

-- 3. Team join requests table
CREATE TABLE IF NOT EXISTS team_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  requester_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  team_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  decided_by_id UUID REFERENCES registrations(id),
  decided_at TIMESTAMPTZ,
  message TEXT
);

CREATE INDEX IF NOT EXISTS idx_team_join_requests_team_pending ON team_join_requests(team_name) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_team_join_requests_requester ON team_join_requests(requester_id);
-- Block duplicate pending requests from same person to same team
CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_join_request
  ON team_join_requests(requester_id, team_name) WHERE status = 'pending';

ALTER TABLE team_join_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can read team join requests"
  ON team_join_requests FOR SELECT TO authenticated USING (is_admin_or_viewer());

-- Admin pode aprovar/recusar/cancelar pedidos diretamente (override do líder)
CREATE POLICY "Admin can update team join requests"
  ON team_join_requests FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- 4. Trigger: enforce 6-member limit on team_name UPDATE (insert trigger already exists)
CREATE OR REPLACE FUNCTION check_team_size_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_count INTEGER;
BEGIN
  IF NEW.team_name IS NOT NULL
     AND (OLD.team_name IS NULL OR OLD.team_name <> NEW.team_name) THEN
    SELECT COUNT(*) INTO v_count FROM registrations WHERE team_name = NEW.team_name AND payment_status <> 'cancelled';
    IF v_count >= 6 THEN
      RAISE EXCEPTION 'Team size cannot exceed 6 members';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_team_size_update ON registrations;
CREATE TRIGGER trg_check_team_size_update
  BEFORE UPDATE OF team_name ON registrations
  FOR EACH ROW EXECUTE FUNCTION check_team_size_update();

-- 5. Helper: validate session token, refresh last_used_at, return registration_id
CREATE OR REPLACE FUNCTION participant_session_owner(p_token UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_id UUID;
BEGIN
  SELECT registration_id INTO v_id
  FROM participant_sessions
  WHERE token = p_token AND expires_at > now()
  LIMIT 1;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'invalid_or_expired_session';
  END IF;

  UPDATE participant_sessions SET last_used_at = now() WHERE token = p_token;
  RETURN v_id;
END;
$$;

-- 5b. Helper: same as above but also requires payment_status = 'confirmed'.
-- Used by all team / event resource RPCs — quem não pagou não acessa.
CREATE OR REPLACE FUNCTION participant_session_owner_confirmed(p_token UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
  v_status TEXT;
BEGIN
  v_id := participant_session_owner(p_token);
  SELECT payment_status INTO v_status FROM registrations WHERE id = v_id;
  IF v_status <> 'confirmed' THEN
    RAISE EXCEPTION 'payment_not_confirmed';
  END IF;
  RETURN v_id;
END;
$$;

-- 6. Login: validate email + CPF, return session token (NULL on failure)
CREATE OR REPLACE FUNCTION participant_login(p_email TEXT, p_cpf TEXT)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_reg RECORD;
  v_clean_cpf TEXT;
  v_token UUID;
  v_now TIMESTAMPTZ := now();
  v_max_attempts CONSTANT INTEGER := 10;
  v_lockout_duration CONSTANT INTERVAL := interval '1 hour';
BEGIN
  v_clean_cpf := REGEXP_REPLACE(COALESCE(p_cpf, ''), '\D', '', 'g');

  IF p_email IS NULL OR p_email = '' OR length(v_clean_cpf) <> 11 THEN
    RETURN NULL;
  END IF;

  SELECT id, full_name, email, payment_status, failed_login_until
  INTO v_reg
  FROM registrations
  WHERE LOWER(email) = LOWER(TRIM(p_email))
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Locked out (anti-brute-force)
  IF v_reg.failed_login_until IS NOT NULL AND v_reg.failed_login_until > v_now THEN
    RETURN NULL;
  END IF;

  -- Lockout has expired: reset counter so a single wrong CPF doesn't immediately re-lock
  IF v_reg.failed_login_until IS NOT NULL AND v_reg.failed_login_until <= v_now THEN
    UPDATE registrations
    SET failed_login_count = 0, failed_login_until = NULL
    WHERE id = v_reg.id;
  END IF;

  -- Cancelled registration: behave like not-found
  IF v_reg.payment_status = 'cancelled' THEN
    RETURN NULL;
  END IF;

  -- Verify CPF
  IF NOT EXISTS (
    SELECT 1 FROM registrations
    WHERE id = v_reg.id
      AND REGEXP_REPLACE(cpf, '\D', '', 'g') = v_clean_cpf
  ) THEN
    UPDATE registrations
    SET failed_login_count = failed_login_count + 1,
        failed_login_until = CASE
          WHEN failed_login_count + 1 >= v_max_attempts THEN v_now + v_lockout_duration
          ELSE failed_login_until
        END
    WHERE id = v_reg.id;
    RETURN NULL;
  END IF;

  -- Success
  UPDATE registrations
  SET failed_login_count = 0, failed_login_until = NULL
  WHERE id = v_reg.id;

  INSERT INTO participant_sessions (registration_id)
  VALUES (v_reg.id)
  RETURNING token INTO v_token;

  RETURN json_build_object(
    'token', v_token,
    'expires_at', v_now + interval '7 days',
    'full_name', v_reg.full_name,
    'email', v_reg.email,
    'registration_id', v_reg.id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION participant_login(TEXT, TEXT) TO anon;

-- 7. Logout
CREATE OR REPLACE FUNCTION participant_logout(p_token UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM participant_sessions WHERE token = p_token;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION participant_logout(UUID) TO anon;

-- 8. Get me + team data + pending requests (single round-trip)
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

-- 9. Update profile (allowed fields only)
CREATE OR REPLACE FUNCTION participant_update_profile(
  p_token UUID,
  p_phone TEXT,
  p_linkedin_url TEXT,
  p_dietary_restrictions TEXT,
  p_is_pcd BOOLEAN,
  p_pcd_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_reg_id UUID;
BEGIN
  v_reg_id := participant_session_owner_confirmed(p_token);

  UPDATE registrations SET
    phone = COALESCE(NULLIF(TRIM(p_phone), ''), phone),
    linkedin_url = NULLIF(TRIM(COALESCE(p_linkedin_url, '')), ''),
    dietary_restrictions = COALESCE(NULLIF(TRIM(p_dietary_restrictions), ''), dietary_restrictions),
    is_pcd = COALESCE(p_is_pcd, is_pcd),
    pcd_type = CASE
      WHEN COALESCE(p_is_pcd, is_pcd) THEN NULLIF(TRIM(COALESCE(p_pcd_type, '')), '')
      ELSE NULL
    END
  WHERE id = v_reg_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION participant_update_profile(UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT) TO anon;

-- 10. List teams open to new members (member_count < 6)
-- Agrupamos por team_name (alinha com AdminTeams). Não filtramos por
-- inscription_modality porque o admin pode mover membros para um time via
-- handleMove sem atualizar a modality, e queremos que esses times também
-- apareçam aqui.
CREATE OR REPLACE FUNCTION participant_list_teams(p_token UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_reg_id UUID;
  v_result JSON;
BEGIN
  v_reg_id := participant_session_owner_confirmed(p_token);

  SELECT json_agg(t ORDER BY t.team_name)
  INTO v_result
  FROM (
    SELECT
      r.team_name,
      COUNT(*)::INTEGER AS member_count,
      (SELECT full_name FROM registrations
       WHERE team_name = r.team_name AND is_team_leader = true LIMIT 1) AS leader_name
    FROM registrations r
    WHERE r.team_name IS NOT NULL
      AND r.payment_status <> 'cancelled'
    GROUP BY r.team_name
    HAVING COUNT(*) < 6
  ) t;

  RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

GRANT EXECUTE ON FUNCTION participant_list_teams(UUID) TO anon;

-- 11. Request to join a team
CREATE OR REPLACE FUNCTION participant_request_join(
  p_token UUID,
  p_team_name TEXT,
  p_message TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_reg_id UUID;
  v_current_team TEXT;
  v_team_count INTEGER;
  v_request_id UUID;
  v_clean_team TEXT;
BEGIN
  v_reg_id := participant_session_owner_confirmed(p_token);
  v_clean_team := TRIM(COALESCE(p_team_name, ''));

  IF v_clean_team = '' THEN
    RAISE EXCEPTION 'team_name_required';
  END IF;

  SELECT team_name INTO v_current_team FROM registrations WHERE id = v_reg_id;

  IF v_current_team IS NOT NULL THEN
    RAISE EXCEPTION 'already_in_team';
  END IF;

  SELECT COUNT(*) INTO v_team_count
  FROM registrations
  WHERE team_name = v_clean_team AND payment_status <> 'cancelled';

  IF v_team_count = 0 THEN
    RAISE EXCEPTION 'team_not_found';
  END IF;

  IF v_team_count >= 6 THEN
    RAISE EXCEPTION 'team_full';
  END IF;

  INSERT INTO team_join_requests (requester_id, team_name, message)
  VALUES (v_reg_id, v_clean_team, NULLIF(TRIM(COALESCE(p_message, '')), ''))
  RETURNING id INTO v_request_id;

  RETURN json_build_object('id', v_request_id, 'team_name', v_clean_team);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'request_already_pending';
END;
$$;

GRANT EXECUTE ON FUNCTION participant_request_join(UUID, TEXT, TEXT) TO anon;

-- 12. Cancel my own pending request
CREATE OR REPLACE FUNCTION participant_cancel_request(p_token UUID, p_request_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_reg_id UUID;
  v_updated INTEGER;
BEGIN
  v_reg_id := participant_session_owner_confirmed(p_token);

  UPDATE team_join_requests
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_request_id AND requester_id = v_reg_id AND status = 'pending';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'request_not_found_or_already_decided';
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION participant_cancel_request(UUID, UUID) TO anon;

-- 13. Approve request (leader only)
CREATE OR REPLACE FUNCTION participant_approve_request(p_token UUID, p_request_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_reg_id UUID;
  v_leader_team TEXT;
  v_leader_is_leader BOOLEAN;
  v_request RECORD;
  v_team_count INTEGER;
  v_requester_team TEXT;
BEGIN
  v_reg_id := participant_session_owner_confirmed(p_token);

  SELECT team_name, is_team_leader INTO v_leader_team, v_leader_is_leader
  FROM registrations WHERE id = v_reg_id FOR UPDATE;

  IF NOT v_leader_is_leader OR v_leader_team IS NULL THEN
    RAISE EXCEPTION 'not_team_leader';
  END IF;

  SELECT requester_id, team_name, status INTO v_request
  FROM team_join_requests WHERE id = p_request_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found';
  END IF;

  IF v_request.team_name <> v_leader_team THEN
    RAISE EXCEPTION 'request_not_for_your_team';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'request_already_decided';
  END IF;

  SELECT COUNT(*) INTO v_team_count
  FROM registrations
  WHERE team_name = v_leader_team AND payment_status <> 'cancelled';

  IF v_team_count >= 6 THEN
    RAISE EXCEPTION 'team_full';
  END IF;

  -- Re-check requester's current team to prevent joining multiple teams
  SELECT team_name INTO v_requester_team FROM registrations WHERE id = v_request.requester_id FOR UPDATE;
  IF v_requester_team IS NOT NULL THEN
    RAISE EXCEPTION 'requester_already_in_team';
  END IF;

  UPDATE registrations
  SET team_name = v_leader_team,
      inscription_modality = 'team',
      is_team_leader = false
  WHERE id = v_request.requester_id;

  UPDATE team_join_requests
  SET status = 'approved', decided_by_id = v_reg_id, decided_at = now(), updated_at = now()
  WHERE id = p_request_id;

  -- Auto-cancel any other pending requests by the same requester
  UPDATE team_join_requests
  SET status = 'cancelled', updated_at = now()
  WHERE requester_id = v_request.requester_id
    AND status = 'pending'
    AND id <> p_request_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION participant_approve_request(UUID, UUID) TO anon;

-- 14. Reject request (leader only)
CREATE OR REPLACE FUNCTION participant_reject_request(p_token UUID, p_request_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_reg_id UUID;
  v_leader_team TEXT;
  v_leader_is_leader BOOLEAN;
  v_request RECORD;
BEGIN
  v_reg_id := participant_session_owner_confirmed(p_token);

  SELECT team_name, is_team_leader INTO v_leader_team, v_leader_is_leader
  FROM registrations WHERE id = v_reg_id;

  IF NOT v_leader_is_leader OR v_leader_team IS NULL THEN
    RAISE EXCEPTION 'not_team_leader';
  END IF;

  SELECT team_name, status INTO v_request
  FROM team_join_requests WHERE id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found';
  END IF;

  IF v_request.team_name <> v_leader_team THEN
    RAISE EXCEPTION 'request_not_for_your_team';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'request_already_decided';
  END IF;

  UPDATE team_join_requests
  SET status = 'rejected', decided_by_id = v_reg_id, decided_at = now(), updated_at = now()
  WHERE id = p_request_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION participant_reject_request(UUID, UUID) TO anon;

-- 15. Leave team (leader only allowed if alone — must transfer leadership first otherwise)
CREATE OR REPLACE FUNCTION participant_leave_team(p_token UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_reg_id UUID;
  v_team TEXT;
  v_is_leader BOOLEAN;
  v_team_count INTEGER;
BEGIN
  v_reg_id := participant_session_owner_confirmed(p_token);

  SELECT team_name, is_team_leader INTO v_team, v_is_leader
  FROM registrations WHERE id = v_reg_id;

  IF v_team IS NULL THEN
    RAISE EXCEPTION 'not_in_team';
  END IF;

  IF v_is_leader THEN
    SELECT COUNT(*) INTO v_team_count FROM registrations WHERE team_name = v_team;
    IF v_team_count > 1 THEN
      RAISE EXCEPTION 'leader_must_transfer_or_be_alone';
    END IF;
    -- Last member: cancel any pending requests for the now-empty team
    UPDATE team_join_requests SET status = 'cancelled', updated_at = now()
    WHERE team_name = v_team AND status = 'pending';
  END IF;

  UPDATE registrations
  SET team_name = NULL,
      inscription_modality = 'individual_form_team',
      is_team_leader = false
  WHERE id = v_reg_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION participant_leave_team(UUID) TO anon;

-- 16. Create a new team (caller becomes leader)
CREATE OR REPLACE FUNCTION participant_create_team(p_token UUID, p_team_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_reg_id UUID;
  v_current_team TEXT;
  v_clean_name TEXT;
  v_exists BOOLEAN;
BEGIN
  v_reg_id := participant_session_owner_confirmed(p_token);
  v_clean_name := TRIM(COALESCE(p_team_name, ''));

  IF v_clean_name = '' OR length(v_clean_name) > 120 THEN
    RAISE EXCEPTION 'team_name_required';
  END IF;

  SELECT team_name INTO v_current_team FROM registrations WHERE id = v_reg_id;
  IF v_current_team IS NOT NULL THEN
    RAISE EXCEPTION 'already_in_team';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM registrations
    WHERE team_name = v_clean_name AND payment_status <> 'cancelled'
  ) INTO v_exists;
  IF v_exists THEN
    RAISE EXCEPTION 'team_name_taken';
  END IF;

  UPDATE registrations
  SET team_name = v_clean_name,
      inscription_modality = 'team',
      is_team_leader = true
  WHERE id = v_reg_id;

  -- Cancel any pending join requests this user had
  UPDATE team_join_requests
  SET status = 'cancelled', updated_at = now()
  WHERE requester_id = v_reg_id AND status = 'pending';

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION participant_create_team(UUID, TEXT) TO anon;

-- 17. Transfer leadership to another team member
CREATE OR REPLACE FUNCTION participant_transfer_leadership(p_token UUID, p_new_leader_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_reg_id UUID;
  v_team TEXT;
  v_is_leader BOOLEAN;
  v_new_leader_team TEXT;
BEGIN
  v_reg_id := participant_session_owner_confirmed(p_token);

  IF v_reg_id = p_new_leader_id THEN
    RAISE EXCEPTION 'cannot_transfer_to_self';
  END IF;

  -- Lock both rows in deterministic id order to prevent deadlocks
  IF v_reg_id < p_new_leader_id THEN
    SELECT team_name, is_team_leader INTO v_team, v_is_leader
    FROM registrations WHERE id = v_reg_id FOR UPDATE;
    SELECT team_name INTO v_new_leader_team
    FROM registrations WHERE id = p_new_leader_id FOR UPDATE;
  ELSE
    SELECT team_name INTO v_new_leader_team
    FROM registrations WHERE id = p_new_leader_id FOR UPDATE;
    SELECT team_name, is_team_leader INTO v_team, v_is_leader
    FROM registrations WHERE id = v_reg_id FOR UPDATE;
  END IF;

  IF NOT v_is_leader OR v_team IS NULL THEN
    RAISE EXCEPTION 'not_team_leader';
  END IF;

  IF v_new_leader_team IS NULL OR v_new_leader_team <> v_team THEN
    RAISE EXCEPTION 'new_leader_not_in_team';
  END IF;

  UPDATE registrations SET is_team_leader = false WHERE id = v_reg_id;
  UPDATE registrations SET is_team_leader = true WHERE id = p_new_leader_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION participant_transfer_leadership(UUID, UUID) TO anon;

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
