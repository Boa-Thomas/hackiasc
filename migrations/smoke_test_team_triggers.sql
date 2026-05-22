-- ============================================================
-- Smoke test: team-membership triggers
-- sync_registration_team_id (BEFORE INSERT/UPDATE OF team_name) +
-- cascade_team_rename (AFTER UPDATE OF name ON teams)
-- ============================================================
-- Validates the trigger logic introduced with the teams table:
--   1. INSERT a registration with a team_name -> teams row is found-or-created,
--      registrations.team_id mirrors it.
--   2. A second member with the same team_name reuses the SAME teams row.
--   3. Renaming teams.name keeps teams.id stable, preserves the JSONB
--      deliverables, and cascades the new name to members WITHOUT recursion.
--   4. Clearing team_name (leaving the team) sets team_id back to NULL.
--
-- HOW TO RUN: paste into the Supabase SQL Editor and run as a single batch,
--   AFTER applying migrations/add_team_and_mentors.sql. The whole script is
--   wrapped in BEGIN ... ROLLBACK, so it creates NO permanent rows even when
--   every assertion passes. Progress prints via RAISE NOTICE.
--
-- STATUS: written against the schema in supabase-setup.sql but NOT executed in
--   CI (the repo has no automated DB harness). Run it once to confirm before
--   relying on it. Mentor RPC note-scoping (mentor_get_me) is intentionally out
--   of scope here -- it needs session-token setup and is deferred (see #192).
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_team_id    UUID;
  v_team_id2   UUID;
  v_reg_a      UUID;
  v_reg_b      UUID;
  v_team_id_a  UUID;
  v_team_id_b  UUID;
  v_count      INTEGER;
  v_name       TEXT;
  v_canvas     JSONB;
BEGIN
  -- ---- 1. find-or-create on INSERT ----
  INSERT INTO registrations (
    full_name, email, phone, birth_date, cpf,
    occupation_type, ai_experience_level, dietary_restrictions,
    inscription_modality, payment_method, ticket_tier, ticket_price,
    payment_status, team_name
  ) VALUES (
    'Smoke Member A', 'smoke-a@hackiasc.invalid', '00000000000', '2000-01-01', '00000000001',
    'hacker', 5, 'nenhuma',
    'team', 'pix', 'regular', 20000,
    'confirmed', '__smoke_team__'
  ) RETURNING id, team_id INTO v_reg_a, v_team_id_a;

  SELECT COUNT(*) INTO v_count FROM teams WHERE name = '__smoke_team__';
  ASSERT v_count = 1, format('expected 1 teams row for __smoke_team__, got %s', v_count);

  SELECT id INTO v_team_id FROM teams WHERE name = '__smoke_team__';
  ASSERT v_team_id_a = v_team_id, 'reg A team_id should mirror the teams row id';
  RAISE NOTICE 'OK 1/4: INSERT created teams row % and mirrored team_id', v_team_id;

  -- ---- 2. second member reuses the same teams row (no duplicate) ----
  INSERT INTO registrations (
    full_name, email, phone, birth_date, cpf,
    occupation_type, ai_experience_level, dietary_restrictions,
    inscription_modality, payment_method, ticket_tier, ticket_price,
    payment_status, team_name
  ) VALUES (
    'Smoke Member B', 'smoke-b@hackiasc.invalid', '00000000000', '2000-01-01', '00000000002',
    'hustler', 5, 'nenhuma',
    'team', 'pix', 'regular', 20000,
    'confirmed', '__smoke_team__'
  ) RETURNING id, team_id INTO v_reg_b, v_team_id_b;

  SELECT COUNT(*) INTO v_count FROM teams WHERE name = '__smoke_team__';
  ASSERT v_count = 1, format('still expected 1 teams row, got %s (duplicate created?)', v_count);
  ASSERT v_team_id_b = v_team_id, 'reg B team_id should reuse the same teams row id';
  RAISE NOTICE 'OK 2/4: second member reused teams row (no duplicate)';

  -- ---- 3. rename: id stable, deliverables preserved, cascade, no recursion ----
  UPDATE teams SET hypotheses_canvas = '{"valor": "smoke"}'::jsonb WHERE id = v_team_id;
  UPDATE teams SET name = '__smoke_team_renamed__' WHERE id = v_team_id;  -- fires cascade_team_rename

  SELECT id, name, hypotheses_canvas INTO v_team_id2, v_name, v_canvas
    FROM teams WHERE id = v_team_id;
  ASSERT v_team_id2 = v_team_id, 'teams.id must stay stable across rename';
  ASSERT v_name = '__smoke_team_renamed__', 'teams.name should be the new name';
  ASSERT v_canvas->>'valor' = 'smoke', 'deliverables must survive the rename';

  SELECT COUNT(*) INTO v_count FROM registrations
    WHERE id IN (v_reg_a, v_reg_b) AND team_name = '__smoke_team_renamed__';
  ASSERT v_count = 2, format('both members should carry the new team_name, got %s', v_count);

  SELECT COUNT(*) INTO v_count FROM registrations
    WHERE id IN (v_reg_a, v_reg_b) AND team_id = v_team_id;
  ASSERT v_count = 2, 'team_id must stay pointed at the same (stable) teams row after rename';
  RAISE NOTICE 'OK 3/4: rename kept id %, preserved deliverables, cascaded name, no recursion', v_team_id;

  -- ---- 4. leaving the team (team_name -> NULL) clears team_id ----
  UPDATE registrations SET team_name = NULL WHERE id = v_reg_a;
  SELECT team_id INTO v_team_id_a FROM registrations WHERE id = v_reg_a;
  ASSERT v_team_id_a IS NULL, 'clearing team_name should null out team_id';
  RAISE NOTICE 'OK 4/4: clearing team_name nulled team_id';

  RAISE NOTICE 'ALL PASSED -- team triggers behave as expected';
END $$;

ROLLBACK;
