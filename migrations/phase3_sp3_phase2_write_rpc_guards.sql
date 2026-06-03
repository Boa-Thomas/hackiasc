-- SP3 Phase 2 — read_only + allowed_tabs guards on the 25 in-scope write RPCs
-- (Choke point A). Each function body is copied VERBATIM from prod
-- (pg_get_functiondef) with exactly two lines inserted right AFTER the existing
-- role-authorization block:
--     IF public.scope_read_only() THEN RAISE EXCEPTION 'read_only'; END IF;
--     PERFORM public.assert_tab('<owning-tab>'[, '<tab2>']);
--
-- DELIBERATE DEVIATION FROM THE SPEC TEXT: the spec wrote `IF NOT can_write()`.
-- can_write() = is_admin() AND NOT scope_read_only(). Six of these RPCs authorize
-- NON-admin roles (set_checkin=is_checkin_staff; wall_hide/unhide/add_pain=
-- is_wall_staff; wall_set_phase/set_team_scores_visible=admin|facilitator).
-- can_write() would hard-block those legit roles. scope_read_only() placed AFTER
-- the role check is identical to NOT can_write() for admin-only RPCs (is_admin
-- already proven) and correct for the multi-role ones. Do NOT "fix" this back.
--
-- Helpers are public.-qualified so they resolve even in the 6 RPCs that lack
-- SET search_path. INVARIANT: {}/null/no-grant == unrestricted (helpers COALESCE
-- to allow) → no-op for every existing account. allowed_tabs ships DORMANT
-- (no grant has non-empty scope; AdminAccess tab input still free-text) — declared
-- live only after SP3 Phase 4.

-- ===== access tab =====

CREATE OR REPLACE FUNCTION public.admin_create_grant(p_label text, p_role text, p_scope jsonb DEFAULT '{}'::jsonb, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_raw text := encode(extensions.gen_random_bytes(32),'hex'); v_id uuid;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF public.scope_read_only() THEN RAISE EXCEPTION 'read_only'; END IF;
  PERFORM public.assert_tab('access');
  IF p_role NOT IN ('admin','viewer','checkin','staff','facilitator','mentor','juror') THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;
  INSERT INTO access_grants(label, role, auth_kind, scope, token_hash, email, expires_at, created_by)
  VALUES (p_label, p_role, grant_auth_kind(p_role), COALESCE(p_scope,'{}'::jsonb),
          encode(extensions.digest(v_raw,'sha256'),'hex'), p_email, p_expires_at, auth.uid())
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('grant_id', v_id, 'token', v_raw);
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_revoke_grant(p_grant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF public.scope_read_only() THEN RAISE EXCEPTION 'read_only'; END IF;
  PERFORM public.assert_tab('access');
  UPDATE access_grants SET revoked_at = now() WHERE id = p_grant_id AND revoked_at IS NULL;
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_regenerate_grant_token(p_grant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_raw text := encode(extensions.gen_random_bytes(32),'hex');
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF public.scope_read_only() THEN RAISE EXCEPTION 'read_only'; END IF;
  PERFORM public.assert_tab('access');
  UPDATE access_grants
     SET token_hash = encode(extensions.digest(v_raw,'sha256'),'hex'), revoked_at = NULL
   WHERE id = p_grant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  RETURN jsonb_build_object('token', v_raw);
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_set_grant_expiry(p_grant_id uuid, p_expires_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF public.scope_read_only() THEN RAISE EXCEPTION 'read_only'; END IF;
  PERFORM public.assert_tab('access');
  UPDATE access_grants SET expires_at = p_expires_at WHERE id = p_grant_id;
END; $function$;

-- ===== bulk tab =====

CREATE OR REPLACE FUNCTION public.admin_create_bulk_order(p_company_name text, p_cnpj text, p_contact_name text, p_contact_email text, p_contact_phone text, p_total_tickets integer, p_ticket_price integer, p_ticket_tier text DEFAULT 'corporate'::text, p_payment_method text DEFAULT NULL::text, p_payment_notes text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_order_id UUID;
  v_admin_email TEXT;
  v_actor_id UUID := auth.uid();
  v_code TEXT;
  v_codes TEXT[] := '{}';
  i INTEGER;
  v_attempts INTEGER;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF public.scope_read_only() THEN RAISE EXCEPTION 'read_only'; END IF;
  PERFORM public.assert_tab('bulk');

  IF p_total_tickets IS NULL OR p_total_tickets < 1 OR p_total_tickets > 100 THEN
    RAISE EXCEPTION 'total_tickets must be between 1 and 100';
  END IF;

  IF p_ticket_price IS NULL OR p_ticket_price <= 0 THEN
    RAISE EXCEPTION 'ticket_price must be positive';
  END IF;

  IF p_company_name IS NULL OR length(TRIM(p_company_name)) = 0 THEN
    RAISE EXCEPTION 'company_name required';
  END IF;

  IF p_contact_email IS NULL OR length(TRIM(p_contact_email)) = 0 THEN
    RAISE EXCEPTION 'contact_email required';
  END IF;

  v_admin_email := COALESCE(
    (auth.jwt() ->> 'email'),
    (SELECT email FROM auth.users WHERE id = v_actor_id),
    'unknown'
  );

  INSERT INTO bulk_orders (
    company_name, cnpj, contact_name, contact_email, contact_phone,
    total_tickets, ticket_price, ticket_tier,
    payment_method, payment_notes, created_by_email
  ) VALUES (
    TRIM(p_company_name),
    NULLIF(TRIM(COALESCE(p_cnpj, '')), ''),
    TRIM(p_contact_name),
    LOWER(TRIM(p_contact_email)),
    NULLIF(TRIM(COALESCE(p_contact_phone, '')), ''),
    p_total_tickets,
    p_ticket_price,
    p_ticket_tier,
    NULLIF(TRIM(COALESCE(p_payment_method, '')), ''),
    NULLIF(TRIM(COALESCE(p_payment_notes, '')), ''),
    v_admin_email
  ) RETURNING id INTO v_order_id;

  -- Gera vouchers únicos. Em caso raro de colisão, tenta de novo.
  FOR i IN 1..p_total_tickets LOOP
    v_attempts := 0;
    LOOP
      v_attempts := v_attempts + 1;
      v_code := generate_voucher_code();
      BEGIN
        INSERT INTO bulk_vouchers (bulk_order_id, code) VALUES (v_order_id, v_code);
        v_codes := array_append(v_codes, v_code);
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        IF v_attempts > 10 THEN
          RAISE EXCEPTION 'failed to generate unique voucher code after 10 attempts';
        END IF;
      END;
    END LOOP;
  END LOOP;

  RETURN json_build_object(
    'order_id', v_order_id,
    'codes', v_codes,
    'total_tickets', p_total_tickets,
    'ticket_price', p_ticket_price
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_confirm_bulk_order(p_order_id uuid, p_payment_method text DEFAULT NULL::text, p_payment_notes text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_status TEXT;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF public.scope_read_only() THEN RAISE EXCEPTION 'read_only'; END IF;
  PERFORM public.assert_tab('bulk');

  SELECT payment_status INTO v_status FROM bulk_orders WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found';
  END IF;

  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'order is cancelled';
  END IF;

  UPDATE bulk_orders
  SET payment_status = 'confirmed',
      paid_at = COALESCE(paid_at, now()),
      payment_method = COALESCE(NULLIF(TRIM(COALESCE(p_payment_method, '')), ''), payment_method),
      payment_notes = COALESCE(NULLIF(TRIM(COALESCE(p_payment_notes, '')), ''), payment_notes)
  WHERE id = p_order_id;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_cancel_bulk_order(p_order_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF public.scope_read_only() THEN RAISE EXCEPTION 'read_only'; END IF;
  PERFORM public.assert_tab('bulk');

  IF NOT EXISTS (SELECT 1 FROM bulk_orders WHERE id = p_order_id) THEN
    RAISE EXCEPTION 'order not found';
  END IF;

  UPDATE bulk_orders SET payment_status = 'cancelled' WHERE id = p_order_id;

  UPDATE bulk_vouchers
  SET status = 'cancelled'
  WHERE bulk_order_id = p_order_id AND status = 'active';

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_cancel_voucher(p_voucher_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_status TEXT;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF public.scope_read_only() THEN RAISE EXCEPTION 'read_only'; END IF;
  PERFORM public.assert_tab('bulk');

  SELECT status INTO v_status FROM bulk_vouchers WHERE id = p_voucher_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'voucher not found';
  END IF;

  IF v_status = 'redeemed' THEN
    RAISE EXCEPTION 'voucher already redeemed';
  END IF;

  UPDATE bulk_vouchers SET status = 'cancelled' WHERE id = p_voucher_id;
  RETURN true;
END;
$function$;

-- ===== mentors tab =====

CREATE OR REPLACE FUNCTION public.admin_create_mentor(p_email text, p_name text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_code TEXT; v_id UUID; v_rand BYTEA;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF public.scope_read_only() THEN RAISE EXCEPTION 'read_only'; END IF;
  PERFORM public.assert_tab('mentors');
  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN RAISE EXCEPTION 'email_required'; END IF;
  v_rand := gen_random_bytes(4);
  v_code := lpad(((get_byte(v_rand,0)::bigint*16777216 + get_byte(v_rand,1)*65536 + get_byte(v_rand,2)*256 + get_byte(v_rand,3)) % 10000)::text, 4, '0');
  INSERT INTO mentors (email, name, access_code_hash)
  VALUES (LOWER(TRIM(p_email)), NULLIF(TRIM(COALESCE(p_name,'')),''), crypt(v_code, gen_salt('bf')))
  RETURNING id INTO v_id;
  RETURN json_build_object('id', v_id, 'code', v_code);
EXCEPTION
  WHEN unique_violation THEN RAISE EXCEPTION 'email_already_exists';
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_reset_mentor_code(p_mentor_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_code TEXT; v_rand BYTEA;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF public.scope_read_only() THEN RAISE EXCEPTION 'read_only'; END IF;
  PERFORM public.assert_tab('mentors');
  v_rand := gen_random_bytes(4);
  v_code := lpad(((get_byte(v_rand, 0)::bigint * 16777216 + get_byte(v_rand, 1) * 65536 + get_byte(v_rand, 2) * 256 + get_byte(v_rand, 3)) % 10000)::text, 4, '0');
  UPDATE mentors
  SET access_code_hash = crypt(v_code, gen_salt('bf')),
      failed_login_count = 0, failed_login_until = NULL
  WHERE id = p_mentor_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'mentor_not_found'; END IF;
  RETURN json_build_object('code', v_code);
END; $function$;

-- ===== teams tab =====

CREATE OR REPLACE FUNCTION public.admin_promote_leader(p_team_name text, p_new_leader_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF public.scope_read_only() THEN RAISE EXCEPTION 'read_only'; END IF;
  PERFORM public.assert_tab('teams');

  UPDATE registrations
  SET is_team_leader = (id = p_new_leader_id)
  WHERE team_name = p_team_name
    AND payment_status <> 'cancelled';

  IF NOT EXISTS (
    SELECT 1 FROM registrations
    WHERE id = p_new_leader_id
      AND team_name = p_team_name
      AND is_team_leader = true
  ) THEN
    RAISE EXCEPTION 'invalid_leader: member not in team or cancelled';
  END IF;
END;
$function$;

-- ===== checkin tab (non-admin role: is_checkin_staff) =====

CREATE OR REPLACE FUNCTION public.set_checkin(p_id uuid, p_present boolean)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_now   TIMESTAMPTZ := now();
  v_actor TEXT;
  v_reg   RECORD;
  v_ts    TIMESTAMPTZ;
BEGIN
  IF NOT is_checkin_staff() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF public.scope_read_only() THEN RAISE EXCEPTION 'read_only'; END IF;
  PERFORM public.assert_tab('checkin');

  v_actor := auth.jwt() ->> 'email';

  SELECT email, full_name, payment_status, checked_in_at
    INTO v_reg
    FROM registrations
   WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'registration not found';
  END IF;

  IF p_present AND v_reg.payment_status <> 'confirmed' THEN
    RAISE EXCEPTION 'registration is not confirmed';
  END IF;

  v_ts := CASE WHEN p_present THEN v_now ELSE NULL END;

  UPDATE registrations SET checked_in_at = v_ts WHERE id = p_id;

  INSERT INTO audit_log (
    action, actor_type, actor_email, target_table, target_id, target_email,
    old_data, new_data, metadata
  )
  VALUES (
    CASE WHEN p_present THEN 'checkin.in' ELSE 'checkin.undo' END,
    'admin',
    v_actor,
    'registrations',
    p_id,
    v_reg.email,
    CASE WHEN p_present THEN NULL ELSE jsonb_build_object('checked_in_at', v_reg.checked_in_at) END,
    CASE WHEN p_present THEN jsonb_build_object('checked_in_at', v_now) ELSE NULL END,
    CASE
      WHEN p_present THEN jsonb_build_object('full_name', v_reg.full_name, 'identity_verified', true)
      ELSE jsonb_build_object('full_name', v_reg.full_name)
    END
  );

  RETURN v_ts;
END;
$function$;

-- ===== evaluation tab =====

CREATE OR REPLACE FUNCTION public.set_evaluation_open(p_open boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF public.scope_read_only() THEN RAISE EXCEPTION 'read_only'; END IF;
  PERFORM public.assert_tab('evaluation');
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

-- ===== deliverables tab =====

CREATE OR REPLACE FUNCTION public.set_slides_deadline(p_deadline timestamp with time zone)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF public.scope_read_only() THEN RAISE EXCEPTION 'read_only'; END IF;
  PERFORM public.assert_tab('deliverables');
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

-- set_team_scores_visible: also reachable from the Facilitator surface → multi-tag.
CREATE OR REPLACE FUNCTION public.set_team_scores_visible(p_visible boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (is_admin() OR is_facilitator()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF public.scope_read_only() THEN RAISE EXCEPTION 'read_only'; END IF;
  PERFORM public.assert_tab('deliverables','facilitator');
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

-- ===== jurors tab =====

CREATE OR REPLACE FUNCTION public.set_juror_idea_visible(p_visible boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF public.scope_read_only() THEN RAISE EXCEPTION 'read_only'; END IF;
  PERFORM public.assert_tab('jurors');
  INSERT INTO app_settings (key, value, updated_at)
  VALUES ('juror_idea_visible', CASE WHEN p_visible THEN 'true' ELSE 'false' END, now())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now();
  RETURN p_visible;
END;
$function$;

CREATE OR REPLACE FUNCTION public.juror_force_reload()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_now TEXT;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF public.scope_read_only() THEN RAISE EXCEPTION 'read_only'; END IF;
  PERFORM public.assert_tab('jurors');
  v_now := (extract(epoch from now()) * 1000)::bigint::text;
  INSERT INTO app_settings (key, value, updated_at)
  VALUES ('juror_reload_at', v_now, now())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now();
  RETURN v_now;
END;
$function$;

-- ===== sugarcubes tab =====

CREATE OR REPLACE FUNCTION public.set_sugar_released(p_bool boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF public.scope_read_only() THEN RAISE EXCEPTION 'read_only'; END IF;
  PERFORM public.assert_tab('sugarcubes');
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

CREATE OR REPLACE FUNCTION public.sugar_moderate(p_id uuid, p_status text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_updated INTEGER;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF public.scope_read_only() THEN RAISE EXCEPTION 'read_only'; END IF;
  PERFORM public.assert_tab('sugarcubes');
  IF p_status NOT IN ('approved','rejected','pending') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  UPDATE sugar_cubes
     SET status = p_status,
         moderated_at = CASE WHEN p_status = 'pending' THEN NULL ELSE now() END
   WHERE id = p_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN RAISE EXCEPTION 'not_found'; END IF;
  RETURN json_build_object('ok', true);
END; $function$;

-- ===== notifications tab =====

CREATE OR REPLACE FUNCTION public.set_notify_event(p_event_key text, p_on boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF public.scope_read_only() THEN RAISE EXCEPTION 'read_only'; END IF;
  PERFORM public.assert_tab('notifications');
  INSERT INTO app_settings (key, value, updated_at)
  VALUES ('notify_event_' || p_event_key, CASE WHEN p_on THEN 'on' ELSE 'off' END, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  RETURN p_on;
END; $function$;

CREATE OR REPLACE FUNCTION public.broadcast_notification(p_title text, p_body text, p_audience_kind text, p_team_ids uuid[] DEFAULT NULL::uuid[], p_url text DEFAULT '#participante'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_aud jsonb; v_id uuid;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF public.scope_read_only() THEN RAISE EXCEPTION 'read_only'; END IF;
  PERFORM public.assert_tab('notifications');
  IF p_audience_kind NOT IN ('all_participants','all_mentors','participants_and_mentors','teams_members') THEN
    RAISE EXCEPTION 'invalid_audience';
  END IF;
  IF p_audience_kind = 'teams_members' THEN
    v_aud := jsonb_build_object('kind','teams_members','team_ids', to_jsonb(p_team_ids));
  ELSE
    v_aud := jsonb_build_object('kind', p_audience_kind);
  END IF;
  INSERT INTO notifications (event_key, title, body, url, audience, created_by)
  VALUES ('broadcast', p_title, p_body, p_url, v_aud, 'admin:'||coalesce(auth.uid()::text,'?'))
  RETURNING id INTO v_id;
  PERFORM expand_recipients(v_id, v_aud);
  RETURN v_id;
END; $function$;

-- ===== wall tab (non-admin roles: is_wall_staff / facilitator) — multi-tag wall+facilitator =====

CREATE OR REPLACE FUNCTION public.wall_set_phase(p_phase text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (is_admin() OR is_facilitator()) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF public.scope_read_only() THEN RAISE EXCEPTION 'read_only'; END IF;
  PERFORM public.assert_tab('wall','facilitator');
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

CREATE OR REPLACE FUNCTION public.wall_hide_pain(p_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_updated INTEGER;
BEGIN
  IF NOT is_wall_staff() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF public.scope_read_only() THEN RAISE EXCEPTION 'read_only'; END IF;
  PERFORM public.assert_tab('wall','facilitator');

  UPDATE pains SET status = 'hidden' WHERE id = p_id AND status = 'visible';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'pain_not_found';
  END IF;

  RETURN json_build_object('ok', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.wall_unhide_pain(p_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_updated INTEGER;
BEGIN
  IF NOT is_wall_staff() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF public.scope_read_only() THEN RAISE EXCEPTION 'read_only'; END IF;
  PERFORM public.assert_tab('wall','facilitator');

  UPDATE pains SET status = 'visible' WHERE id = p_id AND status = 'hidden';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'pain_not_found';
  END IF;

  RETURN json_build_object('ok', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.wall_admin_add_pain(p_registration_id uuid, p_title text, p_description text, p_axis text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_phase TEXT;
  v_name  TEXT;
  v_title TEXT;
  v_pain  pains;
BEGIN
  IF NOT is_wall_staff() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF public.scope_read_only() THEN RAISE EXCEPTION 'read_only'; END IF;
  PERFORM public.assert_tab('wall','facilitator');

  SELECT phase INTO v_phase FROM wall_state WHERE id = true;
  IF v_phase <> 'wall_open' THEN
    RAISE EXCEPTION 'wall_not_open';
  END IF;

  v_name := wall_require_confirmed(p_registration_id);

  v_title := TRIM(COALESCE(p_title, ''));
  IF v_title = '' THEN
    RAISE EXCEPTION 'title_required';
  END IF;
  IF length(v_title) > 140 THEN
    v_title := left(v_title, 140);
  END IF;

  INSERT INTO pains (title, description, author_name, registration_id, axis)
  VALUES (
    v_title,
    NULLIF(TRIM(COALESCE(p_description, '')), ''),
    v_name,
    p_registration_id,
    NULLIF(TRIM(COALESCE(p_axis, '')), '')
  )
  RETURNING * INTO v_pain;

  RETURN json_build_object(
    'id', v_pain.id,
    'title', v_pain.title,
    'author_name', v_pain.author_name
  );
END;
$function$;
