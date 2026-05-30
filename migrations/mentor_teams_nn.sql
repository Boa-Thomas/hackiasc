-- ============================================================
-- MIGRACAO: Associacao mentor<->equipe N:N
-- ============================================================
-- Aplique no Supabase SQL Editor (ou via MCP apply_migration) num banco JA
-- POPULADO, JUNTO com o deploy do frontend novo. Mudanca COM QUEBRA: dropa
-- mentors.team_id e troca a assinatura de mentor_save_note/admin_create_mentor.

-- 1) Tabela de juncao ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS mentor_teams (
  mentor_id UUID NOT NULL REFERENCES mentors(id) ON DELETE CASCADE,
  team_id   UUID NOT NULL REFERENCES teams(id)   ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (mentor_id, team_id)
);
CREATE INDEX IF NOT EXISTS idx_mentor_teams_team   ON mentor_teams(team_id);
CREATE INDEX IF NOT EXISTS idx_mentor_teams_mentor ON mentor_teams(mentor_id);

ALTER TABLE mentor_teams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin can read mentor teams" ON mentor_teams;
CREATE POLICY "Admin can read mentor teams" ON mentor_teams
  FOR SELECT TO authenticated USING (is_admin_or_viewer());
DROP POLICY IF EXISTS "Admin can manage mentor teams" ON mentor_teams;
CREATE POLICY "Admin can manage mentor teams" ON mentor_teams
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- 2) Backfill a partir da coluna antiga (idempotente) -------------------------
INSERT INTO mentor_teams (mentor_id, team_id)
  SELECT id, team_id FROM mentors WHERE team_id IS NOT NULL
  ON CONFLICT DO NOTHING;

-- 3) Serializer: agora devolve `teams: [...]` (cada equipe = mesmo objeto de
--    antes, incluindo deliverable_meta) + `notes` de TODAS as equipes do mentor
--    (cada nota carrega team_id p/ o frontend filtrar). Bloco `mentor` nao expoe
--    mais team_id. Os RPCs mentor_get_me / mentor_get_me_by_token nao mudam:
--    eles ja delegam a este serializer.
CREATE OR REPLACE FUNCTION mentor_serialize_me(p_mentor_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_mentor RECORD;
  v_teams JSON;
BEGIN
  SELECT id, name, email INTO v_mentor FROM mentors WHERE id = p_mentor_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(json_agg(t_obj ORDER BY t_name), '[]'::json) INTO v_teams
  FROM (
    SELECT t.name AS t_name, json_build_object(
      'id', t.id, 'name', t.name,
      'hypotheses_canvas', t.hypotheses_canvas,
      'slc_ia_canvas', t.slc_ia_canvas,
      'learning_diary', t.learning_diary,
      'final_deliverables', t.final_deliverables,
      'updated_at', t.updated_at,
      'updated_by_name', (SELECT full_name FROM registrations WHERE id = t.updated_by),
      'deliverable_meta', COALESCE((
        SELECT json_object_agg(dm.field, json_build_object(
          'updated_by_name', dm.updated_by_name, 'updated_at', dm.updated_at
        ))
        FROM team_deliverable_meta dm WHERE dm.team_id = t.id
      ), '{}'::json),
      'members', COALESCE((
        SELECT json_agg(json_build_object(
          'full_name', r.full_name, 'email', r.email,
          'is_team_leader', r.is_team_leader, 'occupation_type', r.occupation_type,
          'is_remote', r.is_remote
        ) ORDER BY r.is_team_leader DESC, r.created_at)
        FROM registrations r
        WHERE r.team_id = t.id AND r.payment_status <> 'cancelled'
      ), '[]'::json)
    ) AS t_obj
    FROM mentor_teams mt JOIN teams t ON t.id = mt.team_id
    WHERE mt.mentor_id = p_mentor_id
  ) sub;

  RETURN json_build_object(
    'mentor', json_build_object(
      'id', v_mentor.id, 'name', v_mentor.name, 'email', v_mentor.email
    ),
    'teams', v_teams,
    'notes', COALESCE((
      SELECT json_agg(json_build_object(
        'id', n.id, 'team_id', n.team_id, 'phase', n.phase, 'body', n.body,
        'is_public', n.is_public, 'updated_at', n.updated_at
      ) ORDER BY n.created_at)
      FROM mentor_notes n
      WHERE n.mentor_id = p_mentor_id
        -- So notas de equipes em que o mentor AINDA esta pareado. As notas
        -- persistem ao desparear (decisao do spec), mas somem da visao do mentor.
        AND EXISTS (
          SELECT 1 FROM mentor_teams mt
          WHERE mt.mentor_id = p_mentor_id AND mt.team_id = n.team_id
        )
    ), '[]'::json)
  );
END; $$;

-- 4) mentor_save_note: nova assinatura com p_team_id (valida a associacao).
--    A antiga (5 args) precisa ser DROPADA — CREATE OR REPLACE nao troca
--    assinatura, criaria um overload e o frontend antigo chamaria a errada.
DROP FUNCTION IF EXISTS mentor_save_note(UUID, TEXT, TEXT, BOOLEAN, UUID);
CREATE OR REPLACE FUNCTION mentor_save_note(
  p_token UUID, p_phase TEXT, p_body TEXT, p_is_public BOOLEAN,
  p_note_id UUID DEFAULT NULL, p_team_id UUID DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_mentor_id UUID;
  v_note_id UUID;
BEGIN
  v_mentor_id := mentor_session_owner(p_token);
  IF p_phase NOT IN ('ignicao','construcao','apresentacao') THEN RAISE EXCEPTION 'invalid_phase'; END IF;
  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN RAISE EXCEPTION 'empty_body'; END IF;
  IF length(p_body) > 5000 THEN RAISE EXCEPTION 'body_too_long'; END IF;
  IF p_team_id IS NULL THEN RAISE EXCEPTION 'team_required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM mentor_teams WHERE mentor_id = v_mentor_id AND team_id = p_team_id
  ) THEN RAISE EXCEPTION 'not_paired'; END IF;

  IF p_note_id IS NULL THEN
    INSERT INTO mentor_notes (team_id, mentor_id, phase, body, is_public)
    VALUES (p_team_id, v_mentor_id, p_phase, p_body, COALESCE(p_is_public, false))
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
GRANT EXECUTE ON FUNCTION mentor_save_note(UUID, TEXT, TEXT, BOOLEAN, UUID, UUID) TO anon;

-- 5) admin_create_mentor: sem p_team_id (equipes sao atribuidas depois, como
--    linhas em mentor_teams pelo proprio admin). Dropa a assinatura antiga.
DROP FUNCTION IF EXISTS admin_create_mentor(TEXT, TEXT, UUID);
CREATE OR REPLACE FUNCTION admin_create_mentor(p_email TEXT, p_name TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions AS $$  -- pgcrypto (gen_random_bytes/crypt/gen_salt) vive em `extensions`
DECLARE v_code TEXT; v_id UUID; v_rand BYTEA;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN RAISE EXCEPTION 'email_required'; END IF;
  v_rand := gen_random_bytes(4);
  v_code := lpad(((get_byte(v_rand,0)::bigint*16777216 + get_byte(v_rand,1)*65536 + get_byte(v_rand,2)*256 + get_byte(v_rand,3)) % 10000)::text, 4, '0');
  INSERT INTO mentors (email, name, access_code_hash)
  VALUES (LOWER(TRIM(p_email)), NULLIF(TRIM(COALESCE(p_name,'')),''), crypt(v_code, gen_salt('bf')))
  RETURNING id INTO v_id;
  RETURN json_build_object('id', v_id, 'code', v_code);
EXCEPTION
  WHEN unique_violation THEN RAISE EXCEPTION 'email_already_exists';
END; $$;
GRANT EXECUTE ON FUNCTION admin_create_mentor(TEXT, TEXT) TO authenticated;

-- 6) Dropa a coluna antiga (POR ULTIMO — serializer/save_note ja nao a usam) --
ALTER TABLE mentors DROP COLUMN IF EXISTS team_id;
