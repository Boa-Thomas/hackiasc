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
  email TEXT NOT NULL UNIQUE,
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
    WHERE team_name = NEW.team_name;
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
