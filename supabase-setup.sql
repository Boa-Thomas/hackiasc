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
  linkedin_url TEXT NOT NULL,

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
