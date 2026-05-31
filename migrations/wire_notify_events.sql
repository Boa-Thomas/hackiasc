-- ============================================================
-- Push Notifications — Unit B
-- Liga notify_event nas RPCs existentes + triggers + RPC do cronograma.
-- Cada chamada de notify_event é best-effort: embrulhada em
-- BEGIN/EXCEPTION WHEN OTHERS THEN NULL para NUNCA quebrar a ação principal.
-- Recria funções existentes preservando o corpo original + a notificação.
-- NOTA: participant_save_team_deliverable ganha "SET search_path TO 'public'"
--       (o original não tinha) — endurecimento seguro; todos os objetos
--       referenciados estão em public.
-- ============================================================

-- ---------- #1 Mural liberado (OFF->ON) ----------
CREATE OR REPLACE FUNCTION public.set_sugar_released(p_bool boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_bool AND COALESCE((SELECT value FROM app_settings WHERE key='sugar_released'),'false') <> 'true' THEN
    BEGIN
      PERFORM notify_event('sugar_released','Mural de elogios liberado 🍬',
        'Veja o que escreveram sobre você!', '#participante',
        jsonb_build_object('kind','all_participants'));
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
  INSERT INTO app_settings (key, value, updated_at)
  VALUES ('sugar_released', CASE WHEN p_bool THEN 'true' ELSE 'false' END, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  RETURN p_bool;
END; $function$;

-- ---------- #2 Notas da IA visíveis (OFF->ON) ----------
CREATE OR REPLACE FUNCTION public.set_team_scores_visible(p_visible boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_visible AND COALESCE((SELECT value FROM app_settings WHERE key='team_scores_visible'),'false') <> 'true' THEN
    BEGIN
      PERFORM notify_event('team_scores_visible','Notas da IA disponíveis 📊',
        'As notas do seu time já podem ser vistas.', '#participante',
        jsonb_build_object('kind','all_participants'));
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
  INSERT INTO app_settings (key, value, updated_at)
  VALUES ('team_scores_visible', CASE WHEN p_visible THEN 'true' ELSE 'false' END, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  RETURN p_visible;
END; $function$;

-- ---------- #3 Fase do muro ----------
CREATE OR REPLACE FUNCTION public.wall_set_phase(p_phase text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF p_phase NOT IN ('closed','wall_open','voting_open','results') THEN
    RAISE EXCEPTION 'invalid_phase';
  END IF;
  UPDATE wall_state SET phase = p_phase, updated_at = now() WHERE id = true;
  BEGIN
    IF p_phase = 'wall_open' THEN
      PERFORM notify_event('wall_phase','Muro de Dores aberto 🧱','Envie sua dor agora!','#muro',
        jsonb_build_object('kind','all_participants'));
    ELSIF p_phase = 'voting_open' THEN
      PERFORM notify_event('wall_phase','Votação aberta 🗳️','Vote nas dores que mais importam.','#muro',
        jsonb_build_object('kind','all_participants'));
    ELSIF p_phase = 'results' THEN
      PERFORM notify_event('wall_phase','Resultados no telão 🏆','Veja as dores mais votadas.','#muro',
        jsonb_build_object('kind','all_participants'));
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN json_build_object('ok', true, 'phase', p_phase);
END; $function$;

-- ---------- #5 Avaliação do evento aberta (OFF->ON) ----------
CREATE OR REPLACE FUNCTION public.set_evaluation_open(p_open boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_open AND COALESCE((SELECT value FROM app_settings WHERE key='evaluation_open'),'false') <> 'true' THEN
    BEGIN
      PERFORM notify_event('evaluation_open','Avaliação do evento aberta 📝',
        'Leva 2 minutos e ajuda demais. Responda!', '#participante',
        jsonb_build_object('kind','participants_and_mentors'));
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
  INSERT INTO app_settings (key, value, updated_at)
  VALUES ('evaluation_open', CASE WHEN p_open THEN 'true' ELSE 'false' END, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  RETURN p_open;
END; $function$;

-- ---------- #6 Aviso publicado ----------
CREATE OR REPLACE FUNCTION public.set_announcement(p_body text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_id UUID;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_body IS NULL OR length(btrim(p_body)) = 0 THEN RAISE EXCEPTION 'empty announcement'; END IF;
  UPDATE announcements SET active = false WHERE active;
  INSERT INTO announcements (body) VALUES (btrim(p_body)) RETURNING id INTO v_id;
  BEGIN
    PERFORM notify_event('announcement','Aviso 📣', btrim(p_body), '#participante',
      jsonb_build_object('kind','all_participants'));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN v_id;
END; $function$;

-- ---------- #7 Almoço do time ----------
CREATE OR REPLACE FUNCTION public.set_team_lunch(p_team_id uuid, p_done boolean)
RETURNS timestamp with time zone LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_lunch_at timestamptz;
BEGIN
  IF NOT is_admin_or_viewer() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE teams SET lunch_at = CASE WHEN p_done THEN now() ELSE NULL END
  WHERE id = p_team_id RETURNING lunch_at INTO v_lunch_at;
  IF NOT FOUND THEN RAISE EXCEPTION 'team_not_found'; END IF;
  IF p_done THEN
    BEGIN
      PERFORM notify_event('team_lunch','Almoço liberado 🍽️','O almoço do seu time foi liberado!','#participante',
        jsonb_build_object('kind','team_members','team_id', p_team_id::text));
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
  RETURN v_lunch_at;
END; $function$;

-- ---------- #9 Deadline de slides ----------
CREATE OR REPLACE FUNCTION public.set_slides_deadline(p_deadline timestamp with time zone)
RETURNS timestamp with time zone LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE slides_config SET submit_deadline = p_deadline, updated_at = now() WHERE id = TRUE;
  IF p_deadline IS NOT NULL THEN
    BEGIN
      PERFORM notify_event('slides_deadline','Prazo dos slides ⏰',
        'Novo prazo: ' || to_char(p_deadline AT TIME ZONE 'America/Sao_Paulo','DD/MM HH24:MI'),
        '#participante', jsonb_build_object('kind','all_participants'));
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
  RETURN p_deadline;
END; $function$;

-- ---------- #8 Entrega iniciada (primeira vez que um campo é preenchido) ----------
CREATE OR REPLACE FUNCTION public.participant_save_team_deliverable(p_token uuid, p_field text, p_data jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_reg_id UUID;
  v_team_id UUID;
  v_full_name TEXT;
  v_team_name TEXT;
  v_first BOOLEAN;
  v_label TEXT;
BEGIN
  v_reg_id := participant_session_owner_confirmed(p_token);

  IF p_field NOT IN ('hypotheses_canvas','slc_ia_canvas','learning_diary','final_deliverables') THEN
    RAISE EXCEPTION 'invalid_field';
  END IF;

  IF p_data IS NULL OR length(p_data::text) > 65536 THEN
    RAISE EXCEPTION 'invalid_payload';
  END IF;

  SELECT team_id, full_name INTO v_team_id, v_full_name FROM registrations WHERE id = v_reg_id;
  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'not_in_team';
  END IF;

  -- "Primeira vez": ainda não há meta para (time, campo) antes deste save.
  v_first := NOT EXISTS (SELECT 1 FROM team_deliverable_meta WHERE team_id = v_team_id AND field = p_field);

  UPDATE teams SET
    hypotheses_canvas  = CASE WHEN p_field = 'hypotheses_canvas'  THEN p_data ELSE hypotheses_canvas  END,
    slc_ia_canvas      = CASE WHEN p_field = 'slc_ia_canvas'      THEN p_data ELSE slc_ia_canvas      END,
    learning_diary     = CASE WHEN p_field = 'learning_diary'     THEN p_data ELSE learning_diary     END,
    final_deliverables = CASE WHEN p_field = 'final_deliverables' THEN p_data ELSE final_deliverables END,
    updated_at = now(),
    updated_by = v_reg_id
  WHERE id = v_team_id;

  INSERT INTO team_deliverable_meta (team_id, field, updated_by_name, updated_at)
  VALUES (v_team_id, p_field, v_full_name, now())
  ON CONFLICT (team_id, field)
  DO UPDATE SET updated_by_name = EXCLUDED.updated_by_name, updated_at = EXCLUDED.updated_at;

  IF v_first THEN
    BEGIN
      SELECT name INTO v_team_name FROM teams WHERE id = v_team_id;
      v_label := CASE p_field
        WHEN 'hypotheses_canvas'  THEN 'Canvas de Hipóteses'
        WHEN 'slc_ia_canvas'      THEN 'Canvas SLC-IA'
        WHEN 'learning_diary'     THEN 'Diário de Aprendizado'
        WHEN 'final_deliverables' THEN 'Entregáveis Finais'
        ELSE p_field END;
      PERFORM notify_event('deliverable_started','Entrega iniciada 📦',
        'O time ' || COALESCE(v_team_name,'(sem nome)') || ' começou: ' || v_label, '#mentor',
        jsonb_build_object('kind','team_mentors','team_id', v_team_id::text));
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  RETURN true;
END; $function$;

-- ---------- #4 Pagamento confirmado (trigger) ----------
CREATE OR REPLACE FUNCTION trg_notify_payment_confirmed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.payment_status = 'confirmed' AND COALESCE(OLD.payment_status,'') <> 'confirmed' THEN
    BEGIN
      PERFORM notify_event('payment_confirmed','Inscrição confirmada ✅',
        'Bem-vindo(a) ao HackIA SC! Seu acesso está liberado.', '#participante',
        jsonb_build_object('kind','participant','reg_id', NEW.id::text));
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS notify_payment_confirmed ON registrations;
CREATE TRIGGER notify_payment_confirmed AFTER UPDATE OF payment_status ON registrations
  FOR EACH ROW EXECUTE FUNCTION trg_notify_payment_confirmed();

-- ---------- #10 Mentor designado (trigger) ----------
CREATE OR REPLACE FUNCTION trg_notify_mentor_assigned()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_team text;
BEGIN
  BEGIN
    SELECT name INTO v_team FROM teams WHERE id = NEW.team_id;
    PERFORM notify_event('mentor_assigned','Você foi designado a um time 🎓',
      'Time: ' || COALESCE(v_team,'(sem nome)'), '#mentor',
      jsonb_build_object('kind','mentor','mentor_id', NEW.mentor_id::text));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS notify_mentor_assigned ON mentor_teams;
CREATE TRIGGER notify_mentor_assigned AFTER INSERT ON mentor_teams
  FOR EACH ROW EXECUTE FUNCTION trg_notify_mentor_assigned();

-- ---------- #11 Início de atividade do cronograma (RPC admin) ----------
CREATE OR REPLACE FUNCTION notify_schedule_start(p_item_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_title text; v_id uuid;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT title INTO v_title FROM schedule_items WHERE id = p_item_id;
  IF v_title IS NULL THEN RAISE EXCEPTION 'item_not_found'; END IF;
  v_id := notify_event('schedule_start','Começou agora ▶️', v_title, '#participante',
    jsonb_build_object('kind','all_participants'));
  RETURN v_id;
END; $$;
REVOKE EXECUTE ON FUNCTION notify_schedule_start(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION notify_schedule_start(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION notify_schedule_start(uuid) TO authenticated;
