-- Allow facilitator on its operational RPCs. Bodies verbatim from prod; ONLY the
-- gate line changed to `is_admin() OR is_facilitator()`. search_path kept = 'public'.
-- NOTE: wall_admin_list is intentionally NOT widened — it returns voter PII; the
-- facilitator only needs the phase, served by the new minimal wall_get_phase().

CREATE OR REPLACE FUNCTION public.set_announcement(p_body text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id UUID;
BEGIN
  IF NOT (is_admin() OR is_facilitator()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_body IS NULL OR length(btrim(p_body)) = 0 THEN RAISE EXCEPTION 'empty announcement'; END IF;
  UPDATE announcements SET active = false WHERE active;
  INSERT INTO announcements (body) VALUES (btrim(p_body)) RETURNING id INTO v_id;
  BEGIN
    PERFORM notify_event('announcement','Aviso 📣', btrim(p_body), '#participante',
      jsonb_build_object('kind','all_participants'));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN v_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.clear_announcement()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (is_admin() OR is_facilitator()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE announcements SET active = false WHERE active;
END; $function$;

CREATE OR REPLACE FUNCTION public.notify_schedule_start(p_item_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_title text; v_id uuid;
BEGIN
  IF NOT (is_admin() OR is_facilitator()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT title INTO v_title FROM schedule_items WHERE id = p_item_id;
  IF v_title IS NULL THEN RAISE EXCEPTION 'item_not_found'; END IF;
  v_id := notify_event('schedule_start','Começou agora ▶️', v_title, '#participante',
    jsonb_build_object('kind','all_participants'));
  RETURN v_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.wall_set_phase(p_phase text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (is_admin() OR is_facilitator()) THEN RAISE EXCEPTION 'unauthorized'; END IF;
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

CREATE OR REPLACE FUNCTION public.set_team_scores_visible(p_visible boolean)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (is_admin() OR is_facilitator()) THEN RAISE EXCEPTION 'forbidden'; END IF;
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

-- Minimal phase read for the facilitator (no PII, unlike wall_admin_list).
CREATE OR REPLACE FUNCTION public.wall_get_phase()
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT phase FROM wall_state WHERE id = true $function$;
REVOKE ALL ON FUNCTION wall_get_phase() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wall_get_phase() TO anon, authenticated;

-- get_team_scores_visible has no internal gate; ensure facilitator can call it.
GRANT EXECUTE ON FUNCTION get_team_scores_visible() TO authenticated;
