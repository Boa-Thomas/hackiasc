-- ============================================================
-- SCHEDULE — cronograma como fonte unica + avisos ao vivo
-- ============================================================
-- O cronograma do evento (hoje triplicado e hardcoded em Timeline.jsx,
-- ParticipantPanel.jsx e linkado no guia do mentor) passa a viver no banco.
-- A aba Facilitador (admin) edita ordem/horario, marca blocos como feitos
-- ao vivo e publica avisos. Landing publica e painel do participante leem
-- via RPC anon get_public_schedule() (SEM os campos de check, que sao
-- internos da facilitadora). Avisos chegam ao participante via
-- get_active_announcement(). Espelha o padrao admin-escreve / publico-le
-- ja usado por resources + app_settings.

-- ------------------------------------------------------------
-- 1. Tabelas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schedule_days (
  day_key     TEXT PRIMARY KEY,              -- 'fri' | 'sat' | 'sun'
  label       TEXT NOT NULL,                 -- ex: 'Sexta · 29/Mai'
  time_window TEXT,                          -- ex: '18:30 – 22:00' (window e palavra reservada)
  note        TEXT,                          -- observacao do dia (abertura antecipada, etc.)
  accent      TEXT NOT NULL DEFAULT 'cyan',  -- 'cyan' | 'electric' | 'violet'
  sort_order  INT  NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS schedule_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_key     TEXT NOT NULL REFERENCES schedule_days(day_key) ON DELETE CASCADE,
  sort_order  INT  NOT NULL DEFAULT 0,
  time        TEXT,                          -- 'HH:MM' (texto livre; alguns blocos sao aproximados)
  title       TEXT NOT NULL,
  description TEXT,
  done        BOOLEAN NOT NULL DEFAULT false, -- INTERNO da facilitadora (nunca exposto a anon)
  done_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS schedule_items_day_idx ON schedule_items (day_key, sort_order);

CREATE TABLE IF NOT EXISTS announcements (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  body       TEXT NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS announcements_active_idx ON announcements (active, created_at DESC);

-- ------------------------------------------------------------
-- 2. RLS — somente admin (authenticated) acessa as tabelas direto.
--    Sem SELECT publico: landing/participante leem via RPC abaixo.
-- ------------------------------------------------------------
ALTER TABLE schedule_days  ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "schedule_days_admin_all" ON schedule_days;
CREATE POLICY "schedule_days_admin_all"
  ON schedule_days FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "schedule_items_admin_all" ON schedule_items;
CREATE POLICY "schedule_items_admin_all"
  ON schedule_items FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "announcements_admin_all" ON announcements;
CREATE POLICY "announcements_admin_all"
  ON announcements FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- ------------------------------------------------------------
-- 3. Leitura publica do cronograma (anon).
--    Caminho unico para Timeline (landing) e ParticipantPanel.
--    NOTA: a versao ABAIXO omite `done` (decisao original). Foi DEPOIS
--    revista por migrations/add_schedule_done_to_public.sql, que expoe o
--    booleano `done` por item (done_at segue interno) para o destaque
--    "voce esta aqui" no painel do participante. Aquele arquivo e a fonte
--    de verdade atual desta funcao — NAO re-rode este bloco sem reaplicar
--    a migracao seguinte, ou o `done` some do RPC publico.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_public_schedule()
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(json_agg(d ORDER BY d.sort_order), '[]'::json)
  FROM (
    SELECT
      sd.day_key,
      sd.label,
      sd.time_window AS window,
      sd.note,
      sd.accent,
      sd.sort_order,
      COALESCE(
        (
          SELECT json_agg(
            json_build_object('time', si.time, 'title', si.title, 'description', si.description)
            ORDER BY si.sort_order
          )
          FROM schedule_items si
          WHERE si.day_key = sd.day_key
        ),
        '[]'::json
      ) AS items
    FROM schedule_days sd
  ) d;
$$;

GRANT EXECUTE ON FUNCTION get_public_schedule() TO anon;

-- ------------------------------------------------------------
-- 4. Avisos
-- ------------------------------------------------------------
-- 4a. Leitura publica do aviso vigente (anon). Retorna o ativo mais
--     recente ou NULL.
CREATE OR REPLACE FUNCTION get_active_announcement()
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT json_build_object('id', id, 'body', body, 'created_at', created_at)
  FROM announcements
  WHERE active
  ORDER BY created_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_active_announcement() TO anon;

-- 4b. Publica um aviso (SOMENTE admin). Desativa os anteriores para
--     garantir um unico vigente por vez. Espelha set_team_scores_visible.
CREATE OR REPLACE FUNCTION set_announcement(p_body TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_body IS NULL OR length(btrim(p_body)) = 0 THEN
    RAISE EXCEPTION 'empty announcement';
  END IF;
  UPDATE announcements SET active = false WHERE active;
  INSERT INTO announcements (body) VALUES (btrim(p_body)) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION set_announcement(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION set_announcement(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION set_announcement(TEXT) TO authenticated;

-- 4c. Limpa o aviso vigente (SOMENTE admin).
CREATE OR REPLACE FUNCTION clear_announcement()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE announcements SET active = false WHERE active;
END;
$$;

REVOKE EXECUTE ON FUNCTION clear_announcement() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION clear_announcement() FROM anon;
GRANT EXECUTE ON FUNCTION clear_announcement() TO authenticated;

-- ------------------------------------------------------------
-- 5. Seed do cronograma atual (idempotente). Base: SCHEDULE detalhado
--    do ParticipantPanel (mais blocos que o Timeline). sort_order em
--    passos de 10 para facilitar reordenacao/insercao.
-- ------------------------------------------------------------
INSERT INTO schedule_days (day_key, label, time_window, note, accent, sort_order) VALUES
  ('fri', 'Sexta · 29/Mai', '18:30 – 22:00', NULL, 'cyan', 10),
  ('sat', 'Sábado · 30/Mai', '09:00 – madrugada', 'Abertura antecipada às 7h confirmada por e-mail/WhatsApp. Pode virar a noite.', 'electric', 20),
  ('sun', 'Domingo · 31/Mai', '09:00 – 20:00', 'Abertura às 7h confirmada por e-mail/WhatsApp.', 'violet', 30)
ON CONFLICT (day_key) DO NOTHING;

-- Insere os itens apenas se o dia ainda nao tiver nenhum (idempotente).
INSERT INTO schedule_items (day_key, sort_order, time, title, description)
SELECT v.day_key, v.sort_order, v.time, v.title, v.description
FROM (VALUES
  ('fri', 10, '18:30', 'Welcome Coffee', NULL),
  ('fri', 20, '19:00', 'Abertura', 'Organização, facilitadora, patrocinadores, mentores, dinâmica, critérios.'),
  ('fri', 30, '19:45', 'Formação e apresentação de times', NULL),
  ('fri', 40, '20:20', 'Sessão Hard 1 — Basics First', 'Eixos de governança, internacionalização, IA no produto.'),
  ('fri', 50, '21:00', 'Próximos passos', 'O que trazer no sábado.'),
  ('sat', 10, '09:00', 'Café + trabalho', NULL),
  ('sat', 20, '10:00', 'Sessão Hard 2 — O seu problema é real?', NULL),
  ('sat', 30, '11:00', 'Working Time', NULL),
  ('sat', 40, '12:00', 'Almoço', NULL),
  ('sat', 50, '13:30', 'Working Time', NULL),
  ('sat', 60, '15:00', 'Sessão Hard 3 — Escalabilidade e Modelo de Negócio', NULL),
  ('sat', 70, '16:00', 'Working Time (ideal ter MVP)', NULL),
  ('sat', 80, '19:00', 'Pitch de Guerrilha 1', NULL),
  ('sat', 90, '19:30', 'Working Time', NULL),
  ('sat', 100, '21:00', 'Avisos', NULL),
  ('sat', 110, '21:15', 'Jantar', NULL),
  ('sun', 10, '09:00', 'Café', NULL),
  ('sun', 20, '10:00', 'Sessão Hard 4 — Pitch de Alta Performance', NULL),
  ('sun', 30, '10:30', 'Pitch de Guerrilha 2', NULL),
  ('sun', 40, '11:00', 'Working Time', NULL),
  ('sun', 50, '12:00', 'Almoço', NULL),
  ('sun', 60, '13:30', 'Working Time', NULL),
  ('sun', 70, '14:00', 'Banca de Pré-Pitch 1', NULL),
  ('sun', 80, '14:30', 'Working Time', NULL),
  ('sun', 90, '15:30', 'Banca de Pré-Pitch 2', NULL),
  ('sun', 100, '16:45', 'Working Time Final', NULL),
  ('sun', 110, '17:30', 'Entrega do Pitch Final / Código / Solução', 'Sem alterações depois. + Coffee.'),
  ('sun', 120, '18:00', 'Cerimônia de Pitches Finais e Premiação', 'Até 20:00.')
) AS v(day_key, sort_order, time, title, description)
WHERE NOT EXISTS (
  SELECT 1 FROM schedule_items si WHERE si.day_key = v.day_key
);

-- ============================================================
-- Apos aplicar: a aba Facilitador ja le os dados. Timeline e
-- ParticipantPanel passam a usar get_public_schedule() (com fallback
-- hardcoded enquanto o deploy do front nao sobe).
-- ============================================================
