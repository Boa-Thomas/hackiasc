-- ============================================================
-- MIGRACAO: Salas de pre-pitch (organizacao / planejamento do admin)
-- ============================================================
-- Aba admin-only para organizar as rodadas de pre-pitch: N salas por rodada,
-- cada sala com X mentores e Y equipes (com ordem de apresentacao). E puramente
-- ORGANIZACIONAL: NAO restringe quem o mentor avalia (mentor_prepitch_* seguem
-- liberando qualquer equipe) e NAO e exposta a mentor/participante. Admin faz
-- DML direto nas tabelas (RLS autoriza), espelhando o padrao de mentor_teams.
--
-- Aplicar via MCP apply_migration ou SQL Editor. Idempotente.

-- 1) Salas (round-scoped: "Sala A" da rodada 1 e da rodada 2 sao linhas distintas)
CREATE TABLE IF NOT EXISTS prepitch_rooms (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  round      SMALLINT NOT NULL CHECK (round IN (1, 2)),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prepitch_rooms_round ON prepitch_rooms(round);

-- 2) Mentores alocados a uma sala
CREATE TABLE IF NOT EXISTS prepitch_room_mentors (
  room_id    UUID NOT NULL REFERENCES prepitch_rooms(id) ON DELETE CASCADE,
  mentor_id  UUID NOT NULL REFERENCES mentors(id)        ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, mentor_id)
);
CREATE INDEX IF NOT EXISTS idx_prepitch_room_mentors_room   ON prepitch_room_mentors(room_id);
CREATE INDEX IF NOT EXISTS idx_prepitch_room_mentors_mentor ON prepitch_room_mentors(mentor_id);

-- 3) Equipes alocadas a uma sala, com ordem de apresentacao
CREATE TABLE IF NOT EXISTS prepitch_room_teams (
  room_id       UUID NOT NULL REFERENCES prepitch_rooms(id) ON DELETE CASCADE,
  team_id       UUID NOT NULL REFERENCES teams(id)          ON DELETE CASCADE,
  present_order INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, team_id)
);
CREATE INDEX IF NOT EXISTS idx_prepitch_room_teams_room ON prepitch_room_teams(room_id);
CREATE INDEX IF NOT EXISTS idx_prepitch_room_teams_team ON prepitch_room_teams(team_id);

-- 4) RLS — leitura admin+viewer, escrita so admin (espelha mentor_teams)
ALTER TABLE prepitch_rooms         ENABLE ROW LEVEL SECURITY;
ALTER TABLE prepitch_room_mentors  ENABLE ROW LEVEL SECURITY;
ALTER TABLE prepitch_room_teams    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin reads prepitch rooms" ON prepitch_rooms;
CREATE POLICY "Admin reads prepitch rooms" ON prepitch_rooms
  FOR SELECT TO authenticated USING (is_admin_or_viewer());
DROP POLICY IF EXISTS "Admin manages prepitch rooms" ON prepitch_rooms;
CREATE POLICY "Admin manages prepitch rooms" ON prepitch_rooms
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admin reads prepitch room mentors" ON prepitch_room_mentors;
CREATE POLICY "Admin reads prepitch room mentors" ON prepitch_room_mentors
  FOR SELECT TO authenticated USING (is_admin_or_viewer());
DROP POLICY IF EXISTS "Admin manages prepitch room mentors" ON prepitch_room_mentors;
CREATE POLICY "Admin manages prepitch room mentors" ON prepitch_room_mentors
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admin reads prepitch room teams" ON prepitch_room_teams;
CREATE POLICY "Admin reads prepitch room teams" ON prepitch_room_teams
  FOR SELECT TO authenticated USING (is_admin_or_viewer());
DROP POLICY IF EXISTS "Admin manages prepitch room teams" ON prepitch_room_teams;
CREATE POLICY "Admin manages prepitch room teams" ON prepitch_room_teams
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
