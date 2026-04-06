-- ============================================================
-- HackIA SC — Supabase Database Setup
-- Execute este SQL no Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 1. Tabela de inscricoes
CREATE TABLE registrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- Dados pessoais
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  birth_date DATE NOT NULL,
  city TEXT NOT NULL,

  -- Perfil profissional
  occupation_type TEXT NOT NULL CHECK (occupation_type IN ('dev','designer','business','student')),
  linkedin_url TEXT,
  github_url TEXT,

  -- Equipe
  registration_type TEXT NOT NULL CHECK (registration_type IN ('individual','team')),
  team_name TEXT,
  desired_role TEXT NOT NULL CHECK (desired_role IN ('hacker','hustler','hipster')),

  -- Necessidades do evento
  dietary_restrictions TEXT,
  accessibility_needs TEXT,

  -- Pagamento
  payment_method TEXT NOT NULL CHECK (payment_method IN ('pix','card')),
  ticket_tier TEXT NOT NULL CHECK (ticket_tier IN ('early_bird','regular')),
  ticket_price INTEGER NOT NULL,
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending','confirmed','cancelled')),
  payment_confirmed_at TIMESTAMPTZ,
  payment_notes TEXT
);

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

-- 7. Funcao RPC para contar inscricoes confirmadas (seguro para anon)
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

-- Permitir que anon chame essa funcao
GRANT EXECUTE ON FUNCTION get_confirmed_count() TO anon;
