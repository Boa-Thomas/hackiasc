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
  ticket_tier TEXT NOT NULL CHECK (ticket_tier IN ('early_bird','regular')),
  ticket_price INTEGER NOT NULL,
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending','confirmed','cancelled')),
  payment_confirmed_at TIMESTAMPTZ,
  payment_notes TEXT,

  -- Early bird expiration (30 min window)
  price_expires_at TIMESTAMPTZ,

  -- Check-in (dia do evento)
  checked_in_at TIMESTAMPTZ,

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

-- 4. Policy: Qualquer pessoa pode se inscrever (INSERT)
CREATE POLICY "Allow public registration insert"
  ON registrations
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- 5. Policy: Apenas admin (authenticated) pode ler
CREATE POLICY "Admin can read all registrations"
  ON registrations
  FOR SELECT
  TO authenticated
  USING (true);

-- 6. Policy: Apenas admin pode atualizar (confirmar pagamento)
CREATE POLICY "Admin can update registrations"
  ON registrations
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

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

-- Anyone can insert (public registration, edge functions via service role)
CREATE POLICY "Allow audit log insert"
  ON audit_log FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow auth audit log insert"
  ON audit_log FOR INSERT TO authenticated WITH CHECK (true);

-- Only admin can read
CREATE POLICY "Admin can read audit log"
  ON audit_log FOR SELECT TO authenticated USING (true);

-- ============================================================
-- MIGRATION: Run on existing databases
-- ============================================================
-- ALTER TABLE registrations ADD COLUMN accept_lgpd BOOLEAN NOT NULL DEFAULT false;
-- ALTER TABLE registrations ADD COLUMN accept_code_ip BOOLEAN NOT NULL DEFAULT false;
-- ALTER TABLE registrations ADD COLUMN cpf TEXT NOT NULL DEFAULT '';
-- ALTER TABLE registrations ALTER COLUMN linkedin_url DROP NOT NULL;
-- ALTER TABLE registrations ADD COLUMN price_expires_at TIMESTAMPTZ;
