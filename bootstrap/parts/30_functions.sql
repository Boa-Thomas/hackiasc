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
$function$

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
$function$

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
$function$

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
$function$

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
END; $function$

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
END; $function$

CREATE OR REPLACE FUNCTION public.admin_get_bulk_order(p_order_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_order JSON;
  v_vouchers JSON;
BEGIN
  IF NOT is_admin_or_viewer() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT row_to_json(bo) INTO v_order FROM bulk_orders bo WHERE id = p_order_id;
  IF v_order IS NULL THEN
    RAISE EXCEPTION 'order not found';
  END IF;

  SELECT json_agg(v ORDER BY v.created_at)
  INTO v_vouchers
  FROM (
    SELECT
      bv.id,
      bv.code,
      bv.status,
      bv.created_at,
      bv.redeemed_at,
      bv.redeemed_by_id,
      r.full_name AS redeemed_by_name,
      r.email AS redeemed_by_email
    FROM bulk_vouchers bv
    LEFT JOIN registrations r ON r.id = bv.redeemed_by_id
    WHERE bv.bulk_order_id = p_order_id
  ) v;

  RETURN json_build_object(
    'order', v_order,
    'vouchers', COALESCE(v_vouchers, '[]'::JSON)
  );
END;
$function$

CREATE OR REPLACE FUNCTION public.admin_list_bulk_orders()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE v_result JSON;
BEGIN
  IF NOT is_admin_or_viewer() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT json_agg(o ORDER BY o.created_at DESC)
  INTO v_result
  FROM (
    SELECT
      bo.id,
      bo.created_at,
      bo.company_name,
      bo.cnpj,
      bo.contact_name,
      bo.contact_email,
      bo.contact_phone,
      bo.total_tickets,
      bo.ticket_price,
      bo.ticket_tier,
      bo.payment_status,
      bo.payment_method,
      bo.payment_notes,
      bo.paid_at,
      bo.created_by_email,
      (SELECT COUNT(*)::INTEGER FROM bulk_vouchers v WHERE v.bulk_order_id = bo.id AND v.status = 'redeemed') AS redeemed_count,
      (SELECT COUNT(*)::INTEGER FROM bulk_vouchers v WHERE v.bulk_order_id = bo.id AND v.status = 'active') AS active_count,
      (SELECT COUNT(*)::INTEGER FROM bulk_vouchers v WHERE v.bulk_order_id = bo.id AND v.status = 'cancelled') AS cancelled_count
    FROM bulk_orders bo
  ) o;

  RETURN COALESCE(v_result, '[]'::JSON);
END;
$function$

CREATE OR REPLACE FUNCTION public.admin_list_grants()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT COALESCE(jsonb_agg(g ORDER BY g.created_at DESC), '[]'::jsonb) INTO v
  FROM (
    SELECT id, label, role, auth_kind, scope, email, expires_at, revoked_at,
           created_at, last_used_at,
           (revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())) AS active
    FROM access_grants
  ) g;
  RETURN v;
END; $function$

CREATE OR REPLACE FUNCTION public.admin_list_jurors()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  RETURN COALESCE((
    SELECT json_agg(json_build_object(
      'id', j.id,
      'name', j.name,
      'email', j.email,
      'access_token', j.access_token,
      'active', j.active,
      'created_at', j.created_at,
      'evaluated_count', (
        SELECT count(*) FROM team_evaluations te WHERE te.juror_id = j.id
      )
    ) ORDER BY j.created_at)
    FROM jurors j
  ), '[]'::json);
END; $function$

CREATE OR REPLACE FUNCTION public.admin_list_mentors()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  RETURN COALESCE((
    SELECT json_agg(json_build_object(
      'id', m.id, 'email', m.email, 'name', m.name,
      'access_token', m.access_token, 'created_at', m.created_at
    ) ORDER BY m.created_at)
    FROM mentors m
  ), '[]'::json);
END;
$function$

CREATE OR REPLACE FUNCTION public.admin_notifications_history(p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, event_key text, title text, body text, audience jsonb, recipients bigint, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT n.id,n.event_key,n.title,n.body,n.audience,
    (SELECT count(*) FROM notification_recipients r WHERE r.notification_id=n.id), n.created_at
    FROM notifications n ORDER BY n.created_at DESC LIMIT p_limit;
END; $function$

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
$function$

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
END; $function$

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
END; $function$

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
END; $function$

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
END; $function$

CREATE OR REPLACE FUNCTION public.admin_teams_for_broadcast()
 RETURNS TABLE(id uuid, name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT t.id, t.name FROM teams t ORDER BY t.name;
END; $function$

CREATE OR REPLACE FUNCTION public.anonymize_user_data(p_email text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
                                                          DECLARE
                                                            v_count INTEGER;
                                                              v_caller_role TEXT;
                                                              BEGIN
                                                                -- Only allow admins to anonymize data
                                                                  v_caller_role := (auth.jwt() -> 'app_metadata' ->> 'role');
                                                                    IF v_caller_role IS DISTINCT FROM 'admin' THEN
                                                                        RAISE EXCEPTION 'Access denied: admin role required';
                                                                          END IF;

                                                                            SELECT COUNT(*) INTO v_count
                                                                              FROM registrations
                                                                                WHERE LOWER(email) = LOWER(p_email);

                                                                                  IF v_count = 0 THEN
                                                                                      RETURN FALSE;
                                                                                        END IF;

                                                                                          UPDATE registrations
                                                                                            SET
                                                                                                full_name = '[DADOS REMOVIDOS]',
                                                                                                    cpf = '[REMOVIDO]',
                                                                                                        phone = '[REMOVIDO]',
                                                                                                            email = CONCAT('anonimizado_', gen_random_uuid(), '@removed.local'),
                                                                                                                linkedin_url = NULL,
                                                                                                                    birth_date = '1900-01-01',
                                                                                                                        dietary_restrictions = '[REMOVIDO]',
                                                                                                                            pcd_type = NULL
                                                                                                                              WHERE LOWER(email) = LOWER(p_email);

                                                                                                                                RETURN TRUE;
                                                                                                                                END;
                                                                                                                                $function$

CREATE OR REPLACE FUNCTION public.assert_tab(VARIADIC p_tabs text[])
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM unnest(p_tabs) t WHERE scope_tab_allowed(t)) THEN
    RAISE EXCEPTION 'tab_not_allowed';
  END IF;
END $function$

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
END; $function$

CREATE OR REPLACE FUNCTION public.can_write()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$ SELECT is_admin() AND NOT scope_read_only() $function$

CREATE OR REPLACE FUNCTION public.cascade_team_rename()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE registrations SET team_name = NEW.name
      WHERE team_id = NEW.id AND team_name IS DISTINCT FROM NEW.name;
    UPDATE team_join_requests SET team_name = NEW.name, updated_at = now()
      WHERE team_name = OLD.name AND status = 'pending';
  END IF;
  RETURN NULL;
END;
$function$

CREATE OR REPLACE FUNCTION public.check_rate_limit(p_key text, p_max_attempts integer DEFAULT 5, p_window_minutes integer DEFAULT 5)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_record RECORD;
BEGIN
  -- Upsert to avoid race condition on concurrent INSERT
  INSERT INTO rate_limits (key)
  VALUES (p_key)
  ON CONFLICT (key) DO NOTHING;

  SELECT * INTO v_record FROM rate_limits WHERE key = p_key;

  -- Reset if outside window
  IF v_record.first_attempt_at < now() - (p_window_minutes || ' minutes')::INTERVAL THEN
    UPDATE rate_limits
    SET attempts = 1, first_attempt_at = now(), last_attempt_at = now()
    WHERE key = p_key;
    RETURN TRUE;
  END IF;

  -- Check limit
  IF v_record.attempts >= p_max_attempts THEN
    RETURN FALSE;
  END IF;

  -- Increment
  UPDATE rate_limits
  SET attempts = attempts + 1, last_attempt_at = now()
  WHERE key = p_key;
  RETURN TRUE;
END;
$function$

CREATE OR REPLACE FUNCTION public.check_team_size()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_count INTEGER;
BEGIN
  IF NEW.team_name IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count
    FROM registrations
    WHERE team_name = NEW.team_name AND payment_status <> 'cancelled';
    IF v_count >= 6 THEN
      RAISE EXCEPTION 'Team size cannot exceed 6 members';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$

CREATE OR REPLACE FUNCTION public.check_team_size_update()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE v_count INTEGER;
BEGIN
  IF NEW.team_name IS NOT NULL
     AND (OLD.team_name IS NULL OR OLD.team_name <> NEW.team_name) THEN
    SELECT COUNT(*) INTO v_count FROM registrations WHERE team_name = NEW.team_name AND payment_status <> 'cancelled';
    IF v_count >= 6 THEN
      RAISE EXCEPTION 'Team size cannot exceed 6 members';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$

CREATE OR REPLACE FUNCTION public.claim_early_bird_slot(p_reg_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_confirmed INTEGER;
  v_current_tier TEXT;
BEGIN
  SELECT ticket_tier INTO v_current_tier
  FROM registrations
  WHERE id = p_reg_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_current_tier IN ('dati', 'corporate') THEN
    RETURN FALSE;
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_confirmed
  FROM registrations
  WHERE payment_status = 'confirmed' AND ticket_tier = 'early_bird';

  IF v_confirmed < 10 THEN
    UPDATE registrations
    SET ticket_tier = 'early_bird', ticket_price = 15000
    WHERE id = p_reg_id;
    RETURN TRUE;
  ELSE
    UPDATE registrations
    SET ticket_tier = 'regular', ticket_price = 20000
    WHERE id = p_reg_id;
    RETURN FALSE;
  END IF;
END;
$function$

CREATE OR REPLACE FUNCTION public.clear_announcement()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (is_admin() OR is_facilitator()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE announcements SET active = false WHERE active;
END; $function$

CREATE OR REPLACE FUNCTION public.current_grant_ref()
 RETURNS TABLE(grant_id uuid, role text, ref_id uuid, scope jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT g.id, g.role, g.ref_id, g.scope
  FROM access_grants g
  WHERE g.supabase_user_id = auth.uid()
    AND g.revoked_at IS NULL
    AND (g.expires_at IS NULL OR g.expires_at > now())
  LIMIT 1
$function$

CREATE OR REPLACE FUNCTION public.current_juror_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$ SELECT ref_id FROM current_grant_ref() WHERE role = 'juror' $function$

CREATE OR REPLACE FUNCTION public.current_mentor_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$ SELECT ref_id FROM current_grant_ref() WHERE role = 'mentor' $function$

CREATE OR REPLACE FUNCTION public.enforce_anon_insert_defaults()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF current_user <> 'anon' THEN
    RETURN NEW;
  END IF;

  NEW.payment_status        := 'pending';
  NEW.payment_confirmed_at  := NULL;
  NEW.checked_in_at         := NULL;
  NEW.transferred_to_id     := NULL;
  NEW.transferred_from_id   := NULL;
  NEW.transferred_at        := NULL;
  NEW.failed_login_count    := 0;
  NEW.failed_login_until    := NULL;

  RETURN NEW;
END;
$function$

CREATE OR REPLACE FUNCTION public.enforce_ticket_price()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_confirmed INTEGER;
  v_dati_code TEXT;
BEGIN
  IF NEW.ticket_tier = 'corporate' THEN
    RETURN NEW;
  END IF;

  IF NEW.ticket_tier = 'dati' THEN
    v_dati_code := get_app_setting('dati_discount_code');
    IF v_dati_code IS NOT NULL
       AND v_dati_code <> ''
       AND NEW.applied_discount_code IS NOT NULL
       AND NEW.applied_discount_code = v_dati_code THEN
      NEW.ticket_tier := 'dati';
      NEW.ticket_price := 16000;
      RETURN NEW;
    END IF;
    NEW.applied_discount_code := NULL;
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_confirmed
  FROM registrations
  WHERE payment_status = 'confirmed' AND ticket_tier = 'early_bird';

  IF v_confirmed < 10 THEN
    NEW.ticket_tier := 'early_bird';
    NEW.ticket_price := 15000;
  ELSE
    NEW.ticket_tier := 'regular';
    NEW.ticket_price := 20000;
  END IF;

  RETURN NEW;
END;
$function$

CREATE OR REPLACE FUNCTION public.event_eval_resolve(p_token uuid, p_type text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id UUID;
BEGIN
  IF p_type = 'participant' THEN
    BEGIN
      v_id := participant_session_owner(p_token);
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
    IF v_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM registrations WHERE id = v_id AND payment_status = 'confirmed'
    ) THEN
      RETURN NULL;
    END IF;
    RETURN v_id;
  ELSIF p_type = 'mentor' THEN
    v_id := current_mentor_id();
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
    IF p_token IS NOT NULL THEN
      SELECT mentor_id INTO v_id FROM mentor_sessions
        WHERE token = p_token AND expires_at > now();
      IF v_id IS NULL THEN
        SELECT id INTO v_id FROM mentors WHERE access_token = p_token;
      END IF;
    END IF;
    RETURN v_id;
  END IF;
  RETURN NULL;
END;
$function$

CREATE OR REPLACE FUNCTION public.expand_recipients(p_notification_id uuid, p_audience jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_kind text := p_audience->>'kind'; v_count integer;
BEGIN
  WITH keys AS (
    SELECT 'participant:' || r.id::text AS user_key
      FROM registrations r
     WHERE r.payment_status = 'confirmed'
       AND v_kind IN ('all_participants','participants_and_mentors')
    UNION
    SELECT 'mentor:' || m.id::text FROM mentors m
     WHERE v_kind IN ('all_mentors','participants_and_mentors')
    UNION
    SELECT 'participant:' || r.id::text FROM registrations r
     WHERE v_kind = 'team_members' AND r.team_id = (p_audience->>'team_id')::uuid
    UNION
    SELECT 'participant:' || r.id::text FROM registrations r
     WHERE v_kind = 'teams_members'
       AND r.team_id = ANY (SELECT (jsonb_array_elements_text(p_audience->'team_ids'))::uuid)
    UNION
    SELECT 'mentor:' || mt.mentor_id::text FROM mentor_teams mt
     WHERE v_kind = 'team_mentors' AND mt.team_id = (p_audience->>'team_id')::uuid
    UNION
    SELECT 'participant:' || (p_audience->>'reg_id')::uuid::text WHERE v_kind = 'participant'
    UNION
    SELECT 'mentor:' || (p_audience->>'mentor_id')::uuid::text WHERE v_kind = 'mentor'
  )
  INSERT INTO notification_recipients (notification_id, user_key)
  SELECT p_notification_id, user_key FROM keys WHERE user_key IS NOT NULL
  ON CONFLICT (notification_id, user_key) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $function$

CREATE OR REPLACE FUNCTION public.generate_voucher_code()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  chars CONSTANT TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- 31 chars, no 0/O/1/I/L
  result TEXT := '';
  raw    BYTEA;
  b      INTEGER;
  i      INTEGER := 0;
  pos    INTEGER := 0;
BEGIN
  raw := extensions.gen_random_bytes(32);
  WHILE i < 10 LOOP
    IF pos >= octet_length(raw) THEN
      raw := extensions.gen_random_bytes(32);
      pos := 0;
    END IF;
    b := get_byte(raw, pos);
    pos := pos + 1;
    IF b < 248 THEN  -- 256 = 8*31 + 8; reject top 8 to avoid modulo bias
      result := result || substr(chars, 1 + (b % 31), 1);
      i := i + 1;
    END IF;
  END LOOP;
  RETURN result;
END;
$function$

CREATE OR REPLACE FUNCTION public.get_active_announcement()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT json_build_object('id', id, 'body', body, 'created_at', created_at)
  FROM announcements
  WHERE active
  ORDER BY created_at DESC
  LIMIT 1;
$function$

CREATE OR REPLACE FUNCTION public.get_app_setting(p_key text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT value FROM app_settings WHERE key = p_key LIMIT 1;
$function$

CREATE OR REPLACE FUNCTION public.get_confirmed_count()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT COUNT(*)::INTEGER
  FROM registrations
  WHERE payment_status = 'confirmed';
$function$

CREATE OR REPLACE FUNCTION public.get_early_bird_sold()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
    SELECT COUNT(*)::INTEGER
    FROM registrations
    WHERE ticket_tier = 'early_bird'
      AND payment_status != 'cancelled';
  $function$

CREATE OR REPLACE FUNCTION public.get_event_evaluation_results()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rows JSON;
  v_comments JSON;
  v_open BOOLEAN;
BEGIN
  IF NOT is_admin_or_viewer() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COALESCE(json_agg(json_build_object(
    'respondent_type', respondent_type,
    'scores', scores
  )), '[]'::json) INTO v_rows FROM event_evaluations;

  SELECT COALESCE(json_agg(json_build_object(
    'respondent_type', respondent_type,
    'comment', comment,
    'created_at', created_at
  ) ORDER BY created_at DESC), '[]'::json) INTO v_comments
  FROM event_evaluations WHERE comment IS NOT NULL;

  v_open := COALESCE(
    (SELECT value = 'true' FROM app_settings WHERE key = 'evaluation_open'),
    false
  );

  RETURN json_build_object('open', v_open, 'rows', v_rows, 'comments', v_comments);
END;
$function$

CREATE OR REPLACE FUNCTION public.get_juror_idea_visible()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT value = 'true' FROM app_settings WHERE key = 'juror_idea_visible'),
    false
  );
$function$

CREATE OR REPLACE FUNCTION public.get_mp_fee_summary()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_admin_or_viewer() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN (
    SELECT json_build_object(
      'total_gross', COALESCE(SUM(gross_amount), 0),
      'total_net', COALESCE(SUM(net_amount), 0),
      'total_marketplace_fee', COALESCE(SUM(marketplace_fee), 0),
      'total_financing_fee', COALESCE(SUM(financing_fee), 0),
      'total_fees', COALESCE(SUM(marketplace_fee + financing_fee + shipping_fee + discount_fee), 0),
      'payment_count', COUNT(*),
      'last_synced_at', MAX(synced_at)
    )
    FROM mp_payments
    WHERE status = 'approved'
      AND COALESCE(operation_type, 'regular_payment') = 'regular_payment'
  );
END;
$function$

CREATE OR REPLACE FUNCTION public.get_my_event_evaluation(p_token uuid, p_type text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id UUID;
  v_open BOOLEAN;
  v_row event_evaluations%ROWTYPE;
BEGIN
  v_id := event_eval_resolve(p_token, p_type);
  IF v_id IS NULL THEN
    RETURN json_build_object('authorized', false);
  END IF;

  v_open := COALESCE(
    (SELECT value = 'true' FROM app_settings WHERE key = 'evaluation_open'),
    false
  );

  SELECT * INTO v_row FROM event_evaluations
    WHERE respondent_type = p_type AND respondent_id = v_id;

  RETURN json_build_object(
    'authorized', true,
    'open', v_open,
    'submitted', v_row.id IS NOT NULL,
    'scores', COALESCE(v_row.scores, '{}'::jsonb),
    'comment', v_row.comment,
    'created_at', v_row.created_at
  );
END;
$function$

CREATE OR REPLACE FUNCTION public.get_notify_events()
 RETURNS TABLE(event_key text, enabled boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT substring(key from 14), value <> 'off'
    FROM app_settings WHERE key LIKE 'notify_event_%' ORDER BY key;
$function$

CREATE OR REPLACE FUNCTION public.get_public_schedule()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
            json_build_object(
              'time', si.time,
              'title', si.title,
              'description', si.description,
              'done', si.done
            )
            ORDER BY si.sort_order
          )
          FROM schedule_items si
          WHERE si.day_key = sd.day_key
        ),
        '[]'::json
      ) AS items
    FROM schedule_days sd
  ) d;
$function$

CREATE OR REPLACE FUNCTION public.get_slides_deadline()
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT submit_deadline FROM slides_config WHERE id = TRUE;
$function$

CREATE OR REPLACE FUNCTION public.get_sugar_released()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((SELECT value = 'true' FROM app_settings WHERE key = 'sugar_released'), false);
$function$

CREATE OR REPLACE FUNCTION public.get_team_phase_aliases()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT value::jsonb FROM app_settings WHERE key = 'team_phase_aliases'),
    '[]'::jsonb
  );
$function$

CREATE OR REPLACE FUNCTION public.get_team_scores_visible()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT value = 'true' FROM app_settings WHERE key = 'team_scores_visible'),
    false
  );
$function$

CREATE OR REPLACE FUNCTION public.get_total_registration_count()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT COUNT(*)::INTEGER
  FROM registrations
  WHERE payment_status IN ('pending', 'confirmed');
$function$

CREATE OR REPLACE FUNCTION public.grant_auth_kind(p_role text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$ SELECT 'jwt_exchange' $function$

CREATE OR REPLACE FUNCTION public.grant_resolve(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_hash text; v_attempts int;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN RAISE EXCEPTION 'invalid_grant'; END IF;
  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  INSERT INTO rate_limits(key, attempts, first_attempt_at, last_attempt_at)
  VALUES ('grant_resolve:' || v_hash, 1, now(), now())
  ON CONFLICT (key) DO UPDATE SET
    attempts = CASE WHEN rate_limits.first_attempt_at > now() - interval '1 minute'
                    THEN rate_limits.attempts + 1 ELSE 1 END,
    first_attempt_at = CASE WHEN rate_limits.first_attempt_at > now() - interval '1 minute'
                    THEN rate_limits.first_attempt_at ELSE now() END,
    last_attempt_at = now()
  RETURNING attempts INTO v_attempts;
  IF v_attempts > 5 THEN RAISE EXCEPTION 'rate_limited'; END IF;
  RETURN grant_resolve_internal(p_token);
END; $function$

CREATE OR REPLACE FUNCTION public.grant_resolve_internal(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_hash text; v_grant access_grants%ROWTYPE;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN RAISE EXCEPTION 'invalid_grant'; END IF;
  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  SELECT * INTO v_grant FROM access_grants WHERE token_hash = v_hash;
  IF NOT FOUND
     OR v_grant.revoked_at IS NOT NULL
     OR (v_grant.expires_at IS NOT NULL AND v_grant.expires_at <= now()) THEN
    RAISE EXCEPTION 'invalid_grant';
  END IF;
  UPDATE access_grants SET last_used_at = now() WHERE id = v_grant.id;
  RETURN jsonb_build_object(
    'auth_kind', v_grant.auth_kind, 'role', v_grant.role, 'scope', v_grant.scope,
    'ref_id', v_grant.ref_id, 'grant_id', v_grant.id, 'label', v_grant.label
  );
END; $function$

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
              SELECT COALESCE(
                  (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
                      false
                        );
                        $function$

CREATE OR REPLACE FUNCTION public.is_admin_or_viewer()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
      (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'viewer'),
          false
            );
            $function$

CREATE OR REPLACE FUNCTION public.is_checkin_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'checkin', 'staff'),
    false
  );
$function$

CREATE OR REPLACE FUNCTION public.is_facilitator()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'role') = 'facilitator', false);
$function$

CREATE OR REPLACE FUNCTION public.is_wall_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff'),
    false
  );
$function$

CREATE OR REPLACE FUNCTION public.juror_accept_consent(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_juror_id UUID; v_consent TIMESTAMPTZ;
BEGIN
  v_juror_id := current_juror_id();
  IF v_juror_id IS NULL AND p_token IS NOT NULL THEN v_juror_id := juror_token_owner(p_token); END IF;
  IF v_juror_id IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE jurors SET consent_at = now() WHERE id = v_juror_id AND consent_at IS NULL;
  SELECT consent_at INTO v_consent FROM jurors WHERE id = v_juror_id;
  RETURN json_build_object('consent_at', v_consent);
END; $function$

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
$function$

CREATE OR REPLACE FUNCTION public.juror_get_context(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_juror_id UUID; v_juror RECORD; v_show BOOLEAN; v_reload TEXT;
BEGIN
  v_juror_id := current_juror_id();
  IF v_juror_id IS NULL AND p_token IS NOT NULL THEN v_juror_id := juror_token_owner(p_token); END IF;
  IF v_juror_id IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT id, name, consent_at INTO v_juror FROM jurors WHERE id = v_juror_id;
  v_show := COALESCE((SELECT value = 'true' FROM app_settings WHERE key = 'juror_idea_visible'), false);
  v_reload := COALESCE((SELECT value FROM app_settings WHERE key = 'juror_reload_at'), '0');
  RETURN json_build_object(
    'juror', json_build_object('id', v_juror.id, 'name', v_juror.name, 'consent_at', v_juror.consent_at),
    'idea_visible', v_show,
    'reload_at', v_reload,
    'teams', COALESCE((
      SELECT json_agg(json_build_object(
        'id', t.id, 'name', t.name,
        'idea_description',   CASE WHEN v_show THEN t.idea_description   ELSE NULL END,
        'final_deliverables', CASE WHEN v_show THEN t.final_deliverables ELSE NULL END,
        'pitch_transcript',   CASE WHEN v_show THEN t.pitch_transcript   ELSE NULL END,
        'members', CASE WHEN v_show THEN COALESCE((
          SELECT json_agg(json_build_object(
            'full_name', r.full_name, 'is_team_leader', r.is_team_leader, 'occupation_type', r.occupation_type
          ) ORDER BY r.is_team_leader DESC, r.created_at)
          FROM registrations r WHERE r.team_id = t.id AND r.payment_status <> 'cancelled'
        ), '[]'::json) ELSE '[]'::json END,
        'economic_axes', CASE WHEN v_show THEN COALESCE((
          SELECT json_agg(DISTINCT ax ORDER BY ax)
          FROM registrations r2, unnest(r2.economic_axes) AS ax
          WHERE r2.team_id = t.id AND r2.payment_status = 'confirmed'
        ), '[]'::json) ELSE '[]'::json END
      ) ORDER BY t.name) FROM teams t
    ), '[]'::json),
    'my_scores', COALESCE((
      SELECT json_agg(json_build_object(
        'team_id', te.team_id, 'scores', te.scores, 'summary', te.summary,
        'total_score', te.total_score, 'eliminated', te.eliminated
      )) FROM team_evaluations te WHERE te.juror_id = v_juror_id
    ), '[]'::json)
  );
END; $function$

CREATE OR REPLACE FUNCTION public.juror_submit_score(p_token text, p_team_id uuid, p_scores jsonb, p_summary text, p_eliminated boolean)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_juror_id UUID;
  v_weights JSONB := '{"tecnica_ia":30,"validacao_problema":25,"escala_negocio":25,"pitch_equipe":20}'::jsonb;
  v_labels JSONB := '{"tecnica_ia":"Execução Técnica e IA","validacao_problema":"Validação do Problema","escala_negocio":"Escalabilidade e Negócio","pitch_equipe":"Pitch e Equipe"}'::jsonb;
  v_key TEXT; v_in JSONB; v_score NUMERIC; v_just TEXT; v_total NUMERIC := 0;
  v_norm JSONB := '[]'::jsonb; v_summary TEXT; v_eval_id UUID;
BEGIN
  v_juror_id := current_juror_id();
  IF v_juror_id IS NULL AND p_token IS NOT NULL THEN v_juror_id := juror_token_owner(p_token); END IF;
  IF v_juror_id IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF p_team_id IS NULL OR NOT EXISTS (SELECT 1 FROM teams WHERE id = p_team_id) THEN RAISE EXCEPTION 'invalid_team'; END IF;
  IF p_scores IS NULL OR jsonb_typeof(p_scores) <> 'array' THEN RAISE EXCEPTION 'invalid_scores'; END IF;
  FOREACH v_key IN ARRAY ARRAY['tecnica_ia','validacao_problema','escala_negocio','pitch_equipe'] LOOP
    v_in := NULL;
    SELECT elem INTO v_in FROM jsonb_array_elements(p_scores) AS elem WHERE elem->>'criterion_key' = v_key LIMIT 1;
    IF v_in IS NULL THEN RAISE EXCEPTION 'missing_criterion: %', v_key; END IF;
    BEGIN v_score := (v_in->>'score')::numeric; EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid_score: %', v_key; END;
    IF v_score IS NULL OR v_score < 0 OR v_score > 100 THEN RAISE EXCEPTION 'score_out_of_range: %', v_key; END IF;
    v_just := COALESCE(v_in->>'justification', '');
    IF length(v_just) > 5000 THEN RAISE EXCEPTION 'justification_too_long: %', v_key; END IF;
    v_total := v_total + (v_score * (v_weights->>v_key)::numeric) / 100;
    v_norm := v_norm || jsonb_build_object('criterion_key', v_key, 'label', v_labels->>v_key,
      'weight', (v_weights->>v_key)::numeric, 'score', v_score, 'justification', v_just);
  END LOOP;
  v_total := round(v_total * 10) / 10;
  v_summary := COALESCE(p_summary, '');
  IF length(v_summary) > 5000 THEN RAISE EXCEPTION 'summary_too_long'; END IF;
  SELECT id INTO v_eval_id FROM team_evaluations WHERE juror_id = v_juror_id AND team_id = p_team_id LIMIT 1;
  IF v_eval_id IS NULL THEN
    INSERT INTO team_evaluations (team_id, evaluator_type, rubric_version, scores, total_score,
      eliminated, summary, status, juror_id, created_by, updated_at)
    VALUES (p_team_id, 'human', 'edital_v1', v_norm, v_total,
      COALESCE(p_eliminated, false), NULLIF(v_summary, ''), 'done', v_juror_id, v_juror_id, now())
    RETURNING id INTO v_eval_id;
  ELSE
    UPDATE team_evaluations SET scores = v_norm, total_score = v_total,
      eliminated = COALESCE(p_eliminated, false), summary = NULLIF(v_summary, ''),
      rubric_version = 'edital_v1', status = 'done', updated_at = now()
    WHERE id = v_eval_id;
  END IF;
  RETURN json_build_object('id', v_eval_id, 'total_score', v_total, 'eliminated', COALESCE(p_eliminated, false));
END; $function$

CREATE OR REPLACE FUNCTION public.juror_token_owner(p_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id UUID; v jsonb;
BEGIN
  IF p_token IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  BEGIN
    SELECT id INTO v_id FROM jurors WHERE access_token = p_token::uuid AND active = true LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  EXCEPTION WHEN invalid_text_representation THEN v_id := NULL; END;
  v := grant_resolve_internal(p_token);
  IF v->>'role' = 'juror' AND v->>'ref_id' IS NOT NULL THEN RETURN (v->>'ref_id')::uuid; END IF;
  RAISE EXCEPTION 'invalid_token';
END; $function$

CREATE OR REPLACE FUNCTION public.lookup_voucher(p_code text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_voucher RECORD;
  v_order RECORD;
BEGIN
  IF p_code IS NULL OR length(TRIM(p_code)) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT v.id, v.status, v.bulk_order_id, v.redeemed_at
  INTO v_voucher
  FROM bulk_vouchers v
  WHERE UPPER(v.code) = UPPER(TRIM(p_code))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('valid', false, 'reason', 'not_found');
  END IF;

  SELECT id, company_name, payment_status, ticket_price, ticket_tier
  INTO v_order
  FROM bulk_orders WHERE id = v_voucher.bulk_order_id;

  IF v_voucher.status = 'redeemed' THEN
    RETURN json_build_object('valid', false, 'reason', 'redeemed');
  END IF;

  IF v_voucher.status = 'cancelled' THEN
    RETURN json_build_object('valid', false, 'reason', 'cancelled');
  END IF;

  IF v_order.payment_status <> 'confirmed' THEN
    RETURN json_build_object('valid', false, 'reason', 'order_not_paid');
  END IF;

  RETURN json_build_object(
    'valid', true,
    'company_name', v_order.company_name,
    'ticket_price', v_order.ticket_price,
    'ticket_tier', v_order.ticket_tier
  );
END;
$function$

CREATE OR REPLACE FUNCTION public.mentor_delete_note(p_token text, p_note_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_mentor_id UUID; v_deleted INTEGER;
BEGIN
  v_mentor_id := current_mentor_id();
  IF v_mentor_id IS NULL AND p_token IS NOT NULL THEN v_mentor_id := mentor_session_owner(p_token); END IF;
  IF v_mentor_id IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  DELETE FROM mentor_notes WHERE id = p_note_id AND mentor_id = v_mentor_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN RAISE EXCEPTION 'note_not_found'; END IF;
  RETURN true;
END; $function$

CREATE OR REPLACE FUNCTION public.mentor_get_me(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_mentor_id UUID;
BEGIN
  v_mentor_id := current_mentor_id();
  IF v_mentor_id IS NULL AND p_token IS NOT NULL THEN v_mentor_id := mentor_session_owner(p_token); END IF;
  IF v_mentor_id IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  RETURN mentor_serialize_me(v_mentor_id);
END; $function$

CREATE OR REPLACE FUNCTION public.mentor_get_me_by_token(p_access_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_mentor_id UUID;
BEGIN
  v_mentor_id := mentor_prepitch_resolve(p_access_token);
  IF v_mentor_id IS NULL THEN RETURN NULL; END IF;
  RETURN mentor_serialize_me(v_mentor_id);
END; $function$

CREATE OR REPLACE FUNCTION public.mentor_login(p_email text, p_code text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_mentor RECORD;
  v_token UUID;
  v_now TIMESTAMPTZ := now();
  v_max CONSTANT INTEGER := 10;
  v_lockout CONSTANT INTERVAL := interval '1 minute';
BEGIN
  IF p_email IS NULL OR p_email = '' OR p_code IS NULL OR p_code = '' THEN
    RETURN NULL;
  END IF;

  SELECT id, access_code_hash, failed_login_until, failed_login_count
  INTO v_mentor FROM mentors WHERE LOWER(email) = LOWER(TRIM(p_email)) LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_mentor.failed_login_until IS NOT NULL AND v_mentor.failed_login_until > v_now THEN
    RETURN NULL;
  END IF;

  IF crypt(p_code, v_mentor.access_code_hash) <> v_mentor.access_code_hash THEN
    UPDATE mentors
    SET failed_login_count = failed_login_count + 1,
        failed_login_until = CASE
          WHEN failed_login_count + 1 >= v_max THEN v_now + v_lockout
          ELSE failed_login_until END
    WHERE id = v_mentor.id;
    RETURN NULL;
  END IF;

  UPDATE mentors SET failed_login_count = 0, failed_login_until = NULL WHERE id = v_mentor.id;
  INSERT INTO mentor_sessions (mentor_id) VALUES (v_mentor.id) RETURNING token INTO v_token;
  RETURN json_build_object('token', v_token, 'expires_at', v_now + interval '7 days');
END; $function$

CREATE OR REPLACE FUNCTION public.mentor_logout(p_token text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    DELETE FROM mentor_sessions WHERE token = p_token::uuid;
  EXCEPTION WHEN invalid_text_representation THEN NULL; END;
  RETURN true;
END; $function$

CREATE OR REPLACE FUNCTION public.mentor_prepitch_list(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_mentor_id UUID; v_mentor RECORD; v_teams JSON; v_evals JSON;
BEGIN
  v_mentor_id := current_mentor_id();
  IF v_mentor_id IS NULL AND p_token IS NOT NULL THEN v_mentor_id := mentor_prepitch_resolve(p_token); END IF;
  IF v_mentor_id IS NULL THEN RETURN NULL; END IF;
  SELECT id, name, email INTO v_mentor FROM mentors WHERE id = v_mentor_id;
  SELECT COALESCE(json_agg(t_obj ORDER BY t_name), '[]'::json) INTO v_teams
  FROM (
    SELECT t.name AS t_name, json_build_object(
      'id', t.id, 'name', t.name, 'idea_description', COALESCE(t.idea_description, ''),
      'members', COALESCE((
        SELECT json_agg(json_build_object('full_name', r.full_name, 'is_team_leader', r.is_team_leader)
          ORDER BY r.is_team_leader DESC, r.created_at)
        FROM registrations r WHERE r.team_id = t.id AND r.payment_status = 'confirmed'
      ), '[]'::json)
    ) AS t_obj FROM teams t
  ) sub;
  SELECT COALESCE(json_agg(json_build_object(
    'team_id', e.team_id, 'round', e.round, 'scores', e.scores, 'total_score', e.total_score,
    'summary', COALESCE(e.summary, ''), 'updated_at', e.updated_at
  ) ORDER BY e.team_id, e.round), '[]'::json) INTO v_evals
  FROM pre_pitch_evaluations e WHERE e.mentor_id = v_mentor_id;
  RETURN json_build_object(
    'mentor', json_build_object('id', v_mentor.id, 'name', v_mentor.name, 'email', v_mentor.email),
    'teams', v_teams, 'my_evaluations', v_evals);
END; $function$

CREATE OR REPLACE FUNCTION public.mentor_prepitch_resolve(p_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id UUID; v jsonb;
BEGIN
  IF p_token IS NULL THEN RETURN NULL; END IF;
  BEGIN
    SELECT mentor_id INTO v_id FROM mentor_sessions WHERE token = p_token::uuid AND expires_at > now() LIMIT 1;
    IF v_id IS NOT NULL THEN
      UPDATE mentor_sessions SET last_used_at = now() WHERE token = p_token::uuid;
      RETURN v_id;
    END IF;
    SELECT id INTO v_id FROM mentors WHERE access_token = p_token::uuid LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  EXCEPTION WHEN invalid_text_representation THEN v_id := NULL; END;
  BEGIN
    v := grant_resolve_internal(p_token);
    IF v->>'role' = 'mentor' AND v->>'ref_id' IS NOT NULL THEN RETURN (v->>'ref_id')::uuid; END IF;
  EXCEPTION WHEN others THEN RETURN NULL; END;
  RETURN NULL;
END; $function$

CREATE OR REPLACE FUNCTION public.mentor_prepitch_submit(p_token text, p_team_id uuid, p_round integer, p_scores jsonb, p_summary text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mentor_id UUID; v_total NUMERIC(5,2); v_total_sum NUMERIC(5,2); v_keys TEXT[];
  v_num_count INTEGER; v_valid_count INTEGER; v_summary TEXT; v_row RECORD;
  v_weights JSONB := '{"tecnica_ia":30,"validacao_problema":25,"escala_negocio":25,"pitch_equipe":20}'::jsonb;
BEGIN
  v_mentor_id := current_mentor_id();
  IF v_mentor_id IS NULL AND p_token IS NOT NULL THEN v_mentor_id := mentor_prepitch_resolve(p_token); END IF;
  IF v_mentor_id IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  IF p_round IS NULL OR p_round NOT IN (1, 2) THEN RAISE EXCEPTION 'invalid_round'; END IF;
  IF p_team_id IS NULL OR NOT EXISTS (SELECT 1 FROM teams WHERE id = p_team_id) THEN RAISE EXCEPTION 'team_not_found'; END IF;
  IF p_scores IS NULL OR jsonb_typeof(p_scores) <> 'array' THEN RAISE EXCEPTION 'invalid_scores'; END IF;
  IF jsonb_array_length(p_scores) <> 4 THEN RAISE EXCEPTION 'invalid_scores'; END IF;
  SELECT
    array_agg(elem->>'key'),
    COUNT(*) FILTER (WHERE jsonb_typeof(elem->'score') = 'number'),
    COUNT(*) FILTER (WHERE jsonb_typeof(elem->'score') = 'number' AND (elem->>'score')::numeric >= 0 AND (elem->>'score')::numeric <= 100),
    ROUND(SUM(CASE WHEN jsonb_typeof(elem->'score') = 'number'
      THEN ((elem->>'score')::numeric) * ((v_weights->>(elem->>'key'))::numeric) / 100.0 ELSE 0 END), 2)
  INTO v_keys, v_num_count, v_valid_count, v_total_sum
  FROM jsonb_array_elements(p_scores) AS elem
  WHERE elem ? 'key' AND (elem->>'key') IN ('tecnica_ia','validacao_problema','escala_negocio','pitch_equipe');
  IF v_keys IS NULL OR array_length(v_keys, 1) <> 4 OR (SELECT COUNT(DISTINCT k) FROM unnest(v_keys) AS k) <> 4 THEN RAISE EXCEPTION 'invalid_scores'; END IF;
  IF v_valid_count <> v_num_count THEN RAISE EXCEPTION 'invalid_scores'; END IF;
  IF v_num_count = 4 THEN v_total := v_total_sum; ELSE v_total := NULL; END IF;
  v_summary := LEFT(COALESCE(p_summary, ''), 5000);
  INSERT INTO pre_pitch_evaluations (team_id, mentor_id, round, scores, total_score, summary, updated_at)
  VALUES (p_team_id, v_mentor_id, p_round::smallint, p_scores, v_total, v_summary, now())
  ON CONFLICT (mentor_id, team_id, round)
  DO UPDATE SET scores = EXCLUDED.scores, total_score = EXCLUDED.total_score, summary = EXCLUDED.summary, updated_at = now()
  RETURNING id, team_id, mentor_id, round, scores, total_score, summary, created_at, updated_at INTO v_row;
  RETURN json_build_object('id', v_row.id, 'team_id', v_row.team_id, 'mentor_id', v_row.mentor_id,
    'round', v_row.round, 'scores', v_row.scores, 'total_score', v_row.total_score,
    'summary', COALESCE(v_row.summary, ''), 'created_at', v_row.created_at, 'updated_at', v_row.updated_at);
END; $function$

CREATE OR REPLACE FUNCTION public.mentor_save_note(p_token text, p_phase text, p_body text, p_is_public boolean, p_note_id uuid DEFAULT NULL::uuid, p_team_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_mentor_id UUID; v_note_id UUID;
BEGIN
  v_mentor_id := current_mentor_id();
  IF v_mentor_id IS NULL AND p_token IS NOT NULL THEN v_mentor_id := mentor_session_owner(p_token); END IF;
  IF v_mentor_id IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF p_phase NOT IN ('ignicao','construcao','apresentacao') THEN RAISE EXCEPTION 'invalid_phase'; END IF;
  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN RAISE EXCEPTION 'empty_body'; END IF;
  IF length(p_body) > 5000 THEN RAISE EXCEPTION 'body_too_long'; END IF;
  IF p_team_id IS NULL THEN RAISE EXCEPTION 'team_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM mentor_teams WHERE mentor_id = v_mentor_id AND team_id = p_team_id) THEN RAISE EXCEPTION 'not_paired'; END IF;
  IF p_note_id IS NULL THEN
    INSERT INTO mentor_notes (team_id, mentor_id, phase, body, is_public)
    VALUES (p_team_id, v_mentor_id, p_phase, p_body, COALESCE(p_is_public, false))
    RETURNING id INTO v_note_id;
  ELSE
    UPDATE mentor_notes SET phase = p_phase, body = p_body, is_public = COALESCE(p_is_public, false), updated_at = now()
    WHERE id = p_note_id AND mentor_id = v_mentor_id RETURNING id INTO v_note_id;
    IF v_note_id IS NULL THEN RAISE EXCEPTION 'note_not_found'; END IF;
  END IF;
  RETURN v_note_id;
END; $function$

CREATE OR REPLACE FUNCTION public.mentor_serialize_me(p_mentor_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        AND EXISTS (
          SELECT 1 FROM mentor_teams mt
          WHERE mt.mentor_id = p_mentor_id AND mt.team_id = n.team_id
        )
    ), '[]'::json),
    'evaluations', COALESCE((
      SELECT json_agg(json_build_object(
        'team_id', e.team_id, 'deliverable', e.deliverable,
        'total_score', e.total_score, 'eliminated', e.eliminated,
        'scores', e.scores, 'axes', e.axes, 'summary', e.summary,
        'model', e.model, 'updated_at', e.updated_at
      ) ORDER BY e.deliverable)
      FROM team_evaluations e
      WHERE e.evaluator_type = 'ai'
        AND e.status = 'done'
        AND e.deliverable IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM mentor_teams mt
          WHERE mt.mentor_id = p_mentor_id AND mt.team_id = e.team_id
        )
    ), '[]'::json)
  );
END; $function$

CREATE OR REPLACE FUNCTION public.mentor_session_owner(p_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id UUID; v jsonb;
BEGIN
  BEGIN
    SELECT mentor_id INTO v_id FROM mentor_sessions WHERE token = p_token::uuid AND expires_at > now() LIMIT 1;
    IF v_id IS NOT NULL THEN
      UPDATE mentor_sessions SET last_used_at = now() WHERE token = p_token::uuid;
      RETURN v_id;
    END IF;
    SELECT id INTO v_id FROM mentors WHERE access_token = p_token::uuid LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  EXCEPTION WHEN invalid_text_representation THEN v_id := NULL; END;
  v := grant_resolve_internal(p_token);
  IF v->>'role' = 'mentor' AND v->>'ref_id' IS NOT NULL THEN RETURN (v->>'ref_id')::uuid; END IF;
  RAISE EXCEPTION 'invalid_or_expired_session';
END; $function$

CREATE OR REPLACE FUNCTION public.my_scope()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$ SELECT COALESCE((SELECT scope FROM current_grant_ref()), '{}'::jsonb) $function$

CREATE OR REPLACE FUNCTION public.notifications_list_admin(p_limit integer DEFAULT 30)
 RETURNS TABLE(id uuid, title text, body text, url text, event_key text, created_at timestamp with time zone, read boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  RETURN QUERY SELECT n.id,n.title,n.body,n.url,n.event_key,n.created_at,(r.read_at IS NOT NULL)
    FROM notification_recipients r JOIN notifications n ON n.id=r.notification_id
   WHERE r.user_key='admin:'||v_uid::text ORDER BY n.created_at DESC LIMIT p_limit;
END; $function$

CREATE OR REPLACE FUNCTION public.notifications_list_mentor(p_token text, p_limit integer DEFAULT 30)
 RETURNS TABLE(id uuid, title text, body text, url text, event_key text, created_at timestamp with time zone, read boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_mentor uuid;
BEGIN
  v_mentor := current_mentor_id();
  IF v_mentor IS NULL AND p_token IS NOT NULL THEN
    SELECT mentor_id INTO v_mentor FROM mentor_sessions
     WHERE token::text = p_token AND (expires_at IS NULL OR expires_at > now());
    IF v_mentor IS NULL THEN SELECT id INTO v_mentor FROM mentors WHERE access_token::text = p_token; END IF;
  END IF;
  IF v_mentor IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  RETURN QUERY SELECT n.id,n.title,n.body,n.url,n.event_key,n.created_at,(r.read_at IS NOT NULL)
    FROM notification_recipients r JOIN notifications n ON n.id=r.notification_id
   WHERE r.user_key='mentor:'||v_mentor::text ORDER BY n.created_at DESC LIMIT p_limit;
END; $function$

CREATE OR REPLACE FUNCTION public.notifications_list_participant(p_token text, p_limit integer DEFAULT 30)
 RETURNS TABLE(id uuid, title text, body text, url text, event_key text, created_at timestamp with time zone, read boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_reg uuid;
BEGIN
  SELECT registration_id INTO v_reg FROM participant_sessions
   WHERE token::text = p_token AND (expires_at IS NULL OR expires_at > now());
  IF v_reg IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  RETURN QUERY SELECT n.id,n.title,n.body,n.url,n.event_key,n.created_at,(r.read_at IS NOT NULL)
    FROM notification_recipients r JOIN notifications n ON n.id=r.notification_id
   WHERE r.user_key='participant:'||v_reg::text ORDER BY n.created_at DESC LIMIT p_limit;
END; $function$

CREATE OR REPLACE FUNCTION public.notifications_mark_read_admin(p_ids uuid[])
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  UPDATE notification_recipients SET read_at=now()
   WHERE user_key='admin:'||v_uid::text AND notification_id=ANY(p_ids) AND read_at IS NULL;
  RETURN true;
END; $function$

CREATE OR REPLACE FUNCTION public.notifications_mark_read_mentor(p_token text, p_ids uuid[])
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_mentor uuid;
BEGIN
  v_mentor := current_mentor_id();
  IF v_mentor IS NULL AND p_token IS NOT NULL THEN
    SELECT mentor_id INTO v_mentor FROM mentor_sessions
     WHERE token::text = p_token AND (expires_at IS NULL OR expires_at > now());
    IF v_mentor IS NULL THEN SELECT id INTO v_mentor FROM mentors WHERE access_token::text = p_token; END IF;
  END IF;
  IF v_mentor IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  UPDATE notification_recipients SET read_at=now()
   WHERE user_key='mentor:'||v_mentor::text AND notification_id=ANY(p_ids) AND read_at IS NULL;
  RETURN true;
END; $function$

CREATE OR REPLACE FUNCTION public.notifications_mark_read_participant(p_token text, p_ids uuid[])
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_reg uuid;
BEGIN
  SELECT registration_id INTO v_reg FROM participant_sessions
   WHERE token::text = p_token AND (expires_at IS NULL OR expires_at > now());
  IF v_reg IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  UPDATE notification_recipients SET read_at=now()
   WHERE user_key='participant:'||v_reg::text AND notification_id=ANY(p_ids) AND read_at IS NULL;
  RETURN true;
END; $function$

CREATE OR REPLACE FUNCTION public.notify_event(p_event_key text, p_title text, p_body text, p_url text, p_audience jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_enabled boolean; v_id uuid;
BEGIN
  SELECT COALESCE((SELECT value <> 'off' FROM app_settings WHERE key = 'notify_event_' || p_event_key), true)
    INTO v_enabled;
  IF NOT v_enabled THEN RETURN NULL; END IF;
  INSERT INTO notifications (event_key, title, body, url, audience)
  VALUES (p_event_key, p_title, p_body, p_url, p_audience) RETURNING id INTO v_id;
  PERFORM expand_recipients(v_id, p_audience);
  RETURN v_id;
END; $function$

CREATE OR REPLACE FUNCTION public.notify_schedule_start(p_item_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_title text; v_id uuid;
BEGIN
  IF NOT (is_admin() OR is_facilitator()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT title INTO v_title FROM schedule_items WHERE id = p_item_id;
  IF v_title IS NULL THEN RAISE EXCEPTION 'item_not_found'; END IF;
  v_id := notify_event('schedule_start','Começou agora ▶️', v_title, '#participante',
    jsonb_build_object('kind','all_participants'));
  RETURN v_id;
END; $function$

CREATE OR REPLACE FUNCTION public.participant_approve_request(p_token uuid, p_request_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_reg_id UUID;
  v_leader_team TEXT;
  v_leader_is_leader BOOLEAN;
  v_request RECORD;
  v_team_count INTEGER;
  v_requester_team TEXT;
BEGIN
  v_reg_id := participant_session_owner_confirmed(p_token);

  SELECT team_name, is_team_leader INTO v_leader_team, v_leader_is_leader
  FROM registrations WHERE id = v_reg_id FOR UPDATE;

  IF NOT v_leader_is_leader OR v_leader_team IS NULL THEN
    RAISE EXCEPTION 'not_team_leader';
  END IF;

  SELECT requester_id, team_name, status INTO v_request
  FROM team_join_requests WHERE id = p_request_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found';
  END IF;

  IF v_request.team_name <> v_leader_team THEN
    RAISE EXCEPTION 'request_not_for_your_team';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'request_already_decided';
  END IF;

  SELECT COUNT(*) INTO v_team_count
  FROM registrations
  WHERE team_name = v_leader_team AND payment_status <> 'cancelled';

  IF v_team_count >= 6 THEN
    RAISE EXCEPTION 'team_full';
  END IF;

  SELECT team_name INTO v_requester_team FROM registrations WHERE id = v_request.requester_id FOR UPDATE;
  IF v_requester_team IS NOT NULL THEN
    RAISE EXCEPTION 'requester_already_in_team';
  END IF;

  UPDATE registrations
  SET team_name = v_leader_team,
      inscription_modality = 'team',
      is_team_leader = false
  WHERE id = v_request.requester_id;

  UPDATE team_join_requests
  SET status = 'approved', decided_by_id = v_reg_id, decided_at = now(), updated_at = now()
  WHERE id = p_request_id;

  UPDATE team_join_requests
  SET status = 'cancelled', updated_at = now()
  WHERE requester_id = v_request.requester_id
    AND status = 'pending'
    AND id <> p_request_id;

  RETURN true;
END;
$function$

CREATE OR REPLACE FUNCTION public.participant_cancel_request(p_token uuid, p_request_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_reg_id UUID;
  v_updated INTEGER;
BEGIN
  v_reg_id := participant_session_owner_confirmed(p_token);

  UPDATE team_join_requests
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_request_id AND requester_id = v_reg_id AND status = 'pending';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'request_not_found_or_already_decided';
  END IF;

  RETURN true;
END;
$function$

CREATE OR REPLACE FUNCTION public.participant_create_team(p_token uuid, p_team_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_reg_id UUID;
  v_current_team TEXT;
  v_clean_name TEXT;
  v_exists BOOLEAN;
BEGIN
  v_reg_id := participant_session_owner_confirmed(p_token);
  v_clean_name := TRIM(COALESCE(p_team_name, ''));

  IF v_clean_name = '' OR length(v_clean_name) > 120 THEN
    RAISE EXCEPTION 'team_name_required';
  END IF;

  SELECT team_name INTO v_current_team FROM registrations WHERE id = v_reg_id;
  IF v_current_team IS NOT NULL THEN
    RAISE EXCEPTION 'already_in_team';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM registrations
    WHERE team_name = v_clean_name AND payment_status <> 'cancelled'
  ) INTO v_exists;
  IF v_exists THEN
    RAISE EXCEPTION 'team_name_taken';
  END IF;

  UPDATE registrations
  SET team_name = v_clean_name,
      inscription_modality = 'team',
      is_team_leader = true
  WHERE id = v_reg_id;

  UPDATE team_join_requests
  SET status = 'cancelled', updated_at = now()
  WHERE requester_id = v_reg_id AND status = 'pending';

  RETURN true;
END;
$function$

CREATE OR REPLACE FUNCTION public.participant_get_me(p_token uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_reg_id UUID;
  v_reg RECORD;
  v_members JSON;
  v_pending_requests JSON;
  v_my_requests JSON;
  v_team JSON;
BEGIN
  v_reg_id := participant_session_owner(p_token);
  SELECT id, full_name, email, phone, birth_date, linkedin_url,
         occupation_type, ai_experience_level, dietary_restrictions,
         is_pcd, pcd_type, has_project, project_name, economic_axes,
         inscription_modality, team_name, team_id, is_team_leader, is_remote,
         payment_status, payment_method, ticket_tier, ticket_price,
         created_at, checked_in_at
  INTO v_reg
  FROM registrations WHERE id = v_reg_id;
  IF v_reg.payment_status <> 'confirmed' THEN
    RETURN json_build_object(
      'profile', row_to_json(v_reg),
      'team_members', '[]'::JSON,
      'pending_requests', '[]'::JSON,
      'my_requests', '[]'::JSON,
      'team', NULL
    );
  END IF;
  IF v_reg.team_name IS NOT NULL THEN
    SELECT json_agg(m ORDER BY m.is_team_leader DESC, m.created_at)
    INTO v_members
    FROM (
      SELECT id, full_name, email, is_team_leader, occupation_type,
             ai_experience_level, is_remote, created_at
      FROM registrations
      WHERE team_name = v_reg.team_name
    ) m;
  ELSE
    v_members := '[]'::JSON;
  END IF;
  IF v_reg.is_team_leader AND v_reg.team_name IS NOT NULL THEN
    SELECT json_agg(p ORDER BY p.created_at)
    INTO v_pending_requests
    FROM (
      SELECT tjr.id, tjr.created_at, tjr.message,
             json_build_object(
               'id', r.id,
               'full_name', r.full_name,
               'email', r.email,
               'occupation_type', r.occupation_type,
               'ai_experience_level', r.ai_experience_level
             ) AS requester
      FROM team_join_requests tjr
      JOIN registrations r ON r.id = tjr.requester_id
      WHERE tjr.team_name = v_reg.team_name AND tjr.status = 'pending'
    ) p;
  ELSE
    v_pending_requests := '[]'::JSON;
  END IF;
  SELECT json_agg(q ORDER BY q.created_at DESC)
  INTO v_my_requests
  FROM (
    SELECT id, team_name, status, created_at, decided_at
    FROM team_join_requests
    WHERE requester_id = v_reg_id
      AND status IN ('pending', 'rejected')
      AND created_at > now() - interval '30 days'
  ) q;
  IF v_reg.team_id IS NOT NULL THEN
    SELECT json_build_object(
      'id', t.id,
      'name', t.name,
      'idea_description', t.idea_description,
      'hypotheses_canvas', t.hypotheses_canvas,
      'slc_ia_canvas', t.slc_ia_canvas,
      'learning_diary', t.learning_diary,
      'final_deliverables', t.final_deliverables,
      'updated_at', t.updated_at,
      'updated_by_name', (SELECT full_name FROM registrations WHERE id = t.updated_by),
      'public_notes', COALESCE((
        SELECT json_agg(json_build_object(
          'id', n.id, 'phase', n.phase, 'body', n.body, 'updated_at', n.updated_at
        ) ORDER BY n.created_at)
        FROM mentor_notes n WHERE n.team_id = t.id AND n.is_public = true
      ), '[]'::json)
    ) INTO v_team
    FROM teams t WHERE t.id = v_reg.team_id;
  ELSE
    v_team := NULL;
  END IF;
  RETURN json_build_object(
    'profile', row_to_json(v_reg),
    'team_members', COALESCE(v_members, '[]'::JSON),
    'pending_requests', COALESCE(v_pending_requests, '[]'::JSON),
    'my_requests', COALESCE(v_my_requests, '[]'::JSON),
    'team', v_team
  );
END;
$function$

CREATE OR REPLACE FUNCTION public.participant_get_team_scores(p_token uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reg_id UUID;
  v_team_id UUID;
  v_status TEXT;
  v_visible BOOLEAN;
  v_scores JSON;
BEGIN
  v_reg_id := participant_session_owner(p_token);

  SELECT team_id, payment_status INTO v_team_id, v_status
  FROM registrations WHERE id = v_reg_id;

  IF v_status IS DISTINCT FROM 'confirmed' OR v_team_id IS NULL THEN
    RETURN json_build_object('visible', false, 'scores', '[]'::json);
  END IF;

  v_visible := COALESCE(
    (SELECT value = 'true' FROM app_settings WHERE key = 'team_scores_visible'),
    false
  );

  IF NOT v_visible THEN
    RETURN json_build_object('visible', false, 'scores', '[]'::json);
  END IF;

  SELECT COALESCE(json_agg(
    json_build_object('deliverable', deliverable, 'total_score', total_score)
    ORDER BY deliverable
  ), '[]'::json)
  INTO v_scores
  FROM team_evaluations
  WHERE team_id = v_team_id
    AND evaluator_type = 'ai'
    AND deliverable IS NOT NULL
    AND status = 'done'
    AND total_score IS NOT NULL;

  RETURN json_build_object('visible', true, 'scores', v_scores);
END;
$function$

CREATE OR REPLACE FUNCTION public.participant_leave_team(p_token uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_reg_id UUID;
  v_team TEXT;
  v_is_leader BOOLEAN;
  v_team_count INTEGER;
BEGIN
  v_reg_id := participant_session_owner_confirmed(p_token);

  SELECT team_name, is_team_leader INTO v_team, v_is_leader
  FROM registrations WHERE id = v_reg_id;

  IF v_team IS NULL THEN
    RAISE EXCEPTION 'not_in_team';
  END IF;

  IF v_is_leader THEN
    SELECT COUNT(*) INTO v_team_count FROM registrations WHERE team_name = v_team;
    IF v_team_count > 1 THEN
      RAISE EXCEPTION 'leader_must_transfer_or_be_alone';
    END IF;
    UPDATE team_join_requests SET status = 'cancelled', updated_at = now()
    WHERE team_name = v_team AND status = 'pending';
  END IF;

  UPDATE registrations
  SET team_name = NULL,
      inscription_modality = 'individual_form_team',
      is_team_leader = false
  WHERE id = v_reg_id;

  RETURN true;
END;
$function$

CREATE OR REPLACE FUNCTION public.participant_list_resources(p_token uuid)
 RETURNS TABLE(id uuid, title text, description text, url text, body text, file_name text, content_type text, size_bytes bigint, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM participant_session_owner_confirmed(p_token);

  RETURN QUERY
    SELECT r.id, r.title, r.description, r.url, r.body, r.file_name, r.content_type, r.size_bytes, r.created_at
    FROM resources r
    ORDER BY r.created_at DESC;
END;
$function$

CREATE OR REPLACE FUNCTION public.participant_list_teams(p_token uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_reg_id UUID;
  v_result JSON;
BEGIN
  v_reg_id := participant_session_owner_confirmed(p_token);
  SELECT json_agg(t ORDER BY t.team_name)
  INTO v_result
  FROM (
    SELECT
      r.team_name,
      COUNT(*)::INTEGER AS member_count,
      (SELECT full_name FROM registrations
       WHERE team_name = r.team_name AND is_team_leader = true LIMIT 1) AS leader_name,
      (SELECT idea_description FROM teams WHERE name = r.team_name) AS idea_description
    FROM registrations r
    WHERE r.team_name IS NOT NULL
      AND r.payment_status <> 'cancelled'
    GROUP BY r.team_name
    HAVING COUNT(*) < 6
  ) t;
  RETURN COALESCE(v_result, '[]'::JSON);
END;
$function$

CREATE OR REPLACE FUNCTION public.participant_login(p_email text, p_cpf text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_reg RECORD;
  v_clean_cpf TEXT;
  v_token UUID;
  v_now TIMESTAMPTZ := now();
  v_max_attempts CONSTANT INTEGER := 10;
  v_lockout_duration CONSTANT INTERVAL := interval '1 minute';
BEGIN
  v_clean_cpf := REGEXP_REPLACE(COALESCE(p_cpf, ''), '\D', '', 'g');

  IF p_email IS NULL OR p_email = '' OR length(v_clean_cpf) <> 11 THEN
    RETURN NULL;
  END IF;

  SELECT id, full_name, email, payment_status, failed_login_until
  INTO v_reg
  FROM registrations
  WHERE LOWER(email) = LOWER(TRIM(p_email))
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Locked out (anti-brute-force)
  IF v_reg.failed_login_until IS NOT NULL AND v_reg.failed_login_until > v_now THEN
    RETURN NULL;
  END IF;

  -- Cancelled registration: behave like not-found
  IF v_reg.payment_status = 'cancelled' THEN
    RETURN NULL;
  END IF;

  -- Lockout has expired: reset counter so a single wrong CPF doesn't immediately re-lock
  IF v_reg.failed_login_until IS NOT NULL AND v_reg.failed_login_until <= v_now THEN
    UPDATE registrations
    SET failed_login_count = 0, failed_login_until = NULL
    WHERE id = v_reg.id;
  END IF;

  -- Verify CPF
  IF NOT EXISTS (
    SELECT 1 FROM registrations
    WHERE id = v_reg.id
      AND REGEXP_REPLACE(cpf, '\D', '', 'g') = v_clean_cpf
  ) THEN
    UPDATE registrations
    SET failed_login_count = failed_login_count + 1,
        failed_login_until = CASE
          WHEN failed_login_count + 1 >= v_max_attempts THEN v_now + v_lockout_duration
          ELSE failed_login_until
        END
    WHERE id = v_reg.id;
    RETURN NULL;
  END IF;

  -- Success
  UPDATE registrations
  SET failed_login_count = 0, failed_login_until = NULL
  WHERE id = v_reg.id;

  INSERT INTO participant_sessions (registration_id)
  VALUES (v_reg.id)
  RETURNING token INTO v_token;

  RETURN json_build_object(
    'token', v_token,
    'expires_at', v_now + interval '7 days',
    'full_name', v_reg.full_name,
    'email', v_reg.email,
    'registration_id', v_reg.id
  );
END;
$function$

CREATE OR REPLACE FUNCTION public.participant_logout(p_token uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  DELETE FROM participant_sessions WHERE token = p_token;
  RETURN true;
END;
$function$

CREATE OR REPLACE FUNCTION public.participant_prepitch_feedback(p_token uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reg_id  UUID;
  v_team_id UUID;
  v_team    RECORD;
  v_rounds  JSON;
BEGIN
  IF p_token IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_reg_id := participant_session_owner(p_token);
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  SELECT team_id INTO v_team_id FROM registrations WHERE id = v_reg_id;
  IF v_team_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id, name INTO v_team FROM teams WHERE id = v_team_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(json_agg(r_obj ORDER BY r_round), '[]'::json) INTO v_rounds
  FROM (
    SELECT e.round AS r_round, json_build_object(
      'round', e.round,
      'evaluations', json_agg(json_build_object(
        'mentor_name', COALESCE(m.name, m.email, 'Mentor'),
        'scores', e.scores,
        'total_score', e.total_score,
        'summary', COALESCE(e.summary, ''),
        'updated_at', e.updated_at
      ) ORDER BY e.updated_at)
    ) AS r_obj
    FROM pre_pitch_evaluations e
    JOIN mentors m ON m.id = e.mentor_id
    WHERE e.team_id = v_team_id
    GROUP BY e.round
  ) sub;

  RETURN json_build_object(
    'team', json_build_object('id', v_team.id, 'name', v_team.name),
    'rounds', v_rounds
  );
END;
$function$

CREATE OR REPLACE FUNCTION public.participant_reject_request(p_token uuid, p_request_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_reg_id UUID;
  v_leader_team TEXT;
  v_leader_is_leader BOOLEAN;
  v_request RECORD;
BEGIN
  v_reg_id := participant_session_owner_confirmed(p_token);

  SELECT team_name, is_team_leader INTO v_leader_team, v_leader_is_leader
  FROM registrations WHERE id = v_reg_id;

  IF NOT v_leader_is_leader OR v_leader_team IS NULL THEN
    RAISE EXCEPTION 'not_team_leader';
  END IF;

  SELECT team_name, status INTO v_request
  FROM team_join_requests WHERE id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found';
  END IF;

  IF v_request.team_name <> v_leader_team THEN
    RAISE EXCEPTION 'request_not_for_your_team';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'request_already_decided';
  END IF;

  UPDATE team_join_requests
  SET status = 'rejected', decided_by_id = v_reg_id, decided_at = now(), updated_at = now()
  WHERE id = p_request_id;

  RETURN true;
END;
$function$

CREATE OR REPLACE FUNCTION public.participant_request_join(p_token uuid, p_team_name text, p_message text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_reg_id UUID;
  v_current_team TEXT;
  v_team_count INTEGER;
  v_request_id UUID;
  v_clean_team TEXT;
BEGIN
  v_reg_id := participant_session_owner_confirmed(p_token);
  v_clean_team := TRIM(COALESCE(p_team_name, ''));

  IF v_clean_team = '' THEN
    RAISE EXCEPTION 'team_name_required';
  END IF;

  SELECT team_name INTO v_current_team FROM registrations WHERE id = v_reg_id;

  IF v_current_team IS NOT NULL THEN
    RAISE EXCEPTION 'already_in_team';
  END IF;

  SELECT COUNT(*) INTO v_team_count
  FROM registrations
  WHERE team_name = v_clean_team AND payment_status <> 'cancelled';

  IF v_team_count = 0 THEN
    RAISE EXCEPTION 'team_not_found';
  END IF;

  IF v_team_count >= 6 THEN
    RAISE EXCEPTION 'team_full';
  END IF;

  INSERT INTO team_join_requests (requester_id, team_name, message)
  VALUES (v_reg_id, v_clean_team, NULLIF(TRIM(COALESCE(p_message, '')), ''))
  RETURNING id INTO v_request_id;

  RETURN json_build_object('id', v_request_id, 'team_name', v_clean_team);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'request_already_pending';
END;
$function$

CREATE OR REPLACE FUNCTION public.participant_save_team_deliverable(p_token uuid, p_field text, p_data jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END; $function$

CREATE OR REPLACE FUNCTION public.participant_session_owner(p_token uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_id UUID;
BEGIN
  SELECT registration_id INTO v_id
  FROM participant_sessions
  WHERE token = p_token AND expires_at > now()
  LIMIT 1;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'invalid_or_expired_session';
  END IF;

  UPDATE participant_sessions SET last_used_at = now() WHERE token = p_token;
  RETURN v_id;
END;
$function$

CREATE OR REPLACE FUNCTION public.participant_session_owner_confirmed(p_token uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_id UUID;
  v_status TEXT;
BEGIN
  v_id := participant_session_owner(p_token);
  SELECT payment_status INTO v_status FROM registrations WHERE id = v_id;
  IF v_status <> 'confirmed' THEN
    RAISE EXCEPTION 'payment_not_confirmed';
  END IF;
  RETURN v_id;
END;
$function$

CREATE OR REPLACE FUNCTION public.participant_transfer_leadership(p_token uuid, p_new_leader_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_reg_id UUID;
  v_team TEXT;
  v_is_leader BOOLEAN;
  v_new_leader_team TEXT;
BEGIN
  v_reg_id := participant_session_owner_confirmed(p_token);

  IF v_reg_id = p_new_leader_id THEN
    RAISE EXCEPTION 'cannot_transfer_to_self';
  END IF;

  IF v_reg_id < p_new_leader_id THEN
    SELECT team_name, is_team_leader INTO v_team, v_is_leader
    FROM registrations WHERE id = v_reg_id FOR UPDATE;
    SELECT team_name INTO v_new_leader_team
    FROM registrations WHERE id = p_new_leader_id FOR UPDATE;
  ELSE
    SELECT team_name INTO v_new_leader_team
    FROM registrations WHERE id = p_new_leader_id FOR UPDATE;
    SELECT team_name, is_team_leader INTO v_team, v_is_leader
    FROM registrations WHERE id = v_reg_id FOR UPDATE;
  END IF;

  IF NOT v_is_leader OR v_team IS NULL THEN
    RAISE EXCEPTION 'not_team_leader';
  END IF;

  IF v_new_leader_team IS NULL OR v_new_leader_team <> v_team THEN
    RAISE EXCEPTION 'new_leader_not_in_team';
  END IF;

  UPDATE registrations SET is_team_leader = false WHERE id = v_reg_id;
  UPDATE registrations SET is_team_leader = true WHERE id = p_new_leader_id;

  RETURN true;
END;
$function$

CREATE OR REPLACE FUNCTION public.participant_update_profile(p_token uuid, p_phone text, p_linkedin_url text, p_dietary_restrictions text, p_is_pcd boolean, p_pcd_type text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_reg_id UUID;
BEGIN
  v_reg_id := participant_session_owner_confirmed(p_token);

  UPDATE registrations SET
    phone = COALESCE(NULLIF(TRIM(p_phone), ''), phone),
    linkedin_url = NULLIF(TRIM(COALESCE(p_linkedin_url, '')), ''),
    dietary_restrictions = COALESCE(NULLIF(TRIM(p_dietary_restrictions), ''), dietary_restrictions),
    is_pcd = COALESCE(p_is_pcd, is_pcd),
    pcd_type = CASE
      WHEN COALESCE(p_is_pcd, is_pcd) THEN NULLIF(TRIM(COALESCE(p_pcd_type, '')), '')
      ELSE NULL
    END
  WHERE id = v_reg_id;

  RETURN true;
END;
$function$

CREATE OR REPLACE FUNCTION public.participant_update_team(p_token uuid, p_team_name text, p_idea_description text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reg_id UUID;
  v_team_id UUID;
  v_clean_name TEXT;
  v_clean_idea TEXT;
BEGIN
  v_reg_id := participant_session_owner_confirmed(p_token);
  SELECT team_id INTO v_team_id FROM registrations WHERE id = v_reg_id;
  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'not_in_team';
  END IF;
  v_clean_name := TRIM(COALESCE(p_team_name, ''));
  IF v_clean_name = '' OR length(v_clean_name) > 120 THEN
    RAISE EXCEPTION 'team_name_required';
  END IF;
  v_clean_idea := NULLIF(TRIM(COALESCE(p_idea_description, '')), '');
  IF v_clean_idea IS NOT NULL AND length(v_clean_idea) > 500 THEN
    RAISE EXCEPTION 'idea_too_long';
  END IF;
  UPDATE teams
  SET name = v_clean_name,
      idea_description = v_clean_idea,
      updated_at = now(),
      updated_by = v_reg_id
  WHERE id = v_team_id;
  RETURN true;
EXCEPTION
  WHEN unique_violation THEN RAISE EXCEPTION 'team_name_taken';
END;
$function$

CREATE OR REPLACE FUNCTION public.public_list_teams()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_result JSON;
BEGIN
  SELECT COALESCE(json_agg(obj ORDER BY obj_name), '[]'::json)
  INTO v_result
  FROM (
    SELECT t.name AS obj_name, json_build_object(
      'name', t.name,
      'idea_description', t.idea_description,
      'member_count', (
        SELECT COUNT(*)::INTEGER FROM registrations r
        WHERE r.team_id = t.id AND r.payment_status = 'confirmed'
      ),
      'economic_axes', COALESCE((
        SELECT json_agg(DISTINCT ax ORDER BY ax)
        FROM registrations r2, unnest(r2.economic_axes) AS ax
        WHERE r2.team_id = t.id AND r2.payment_status = 'confirmed'
      ), '[]'::json)
    ) AS obj
    FROM teams t
    WHERE EXISTS (
      SELECT 1 FROM registrations r
      WHERE r.team_id = t.id AND r.payment_status = 'confirmed'
    )
  ) sub;
  RETURN v_result;
END;
$function$

CREATE OR REPLACE FUNCTION public.push_subscribe_admin(p_endpoint text, p_p256dh text, p_auth text, p_ua text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  INSERT INTO push_subscriptions (user_key, endpoint, p256dh, auth, user_agent)
  VALUES ('admin:' || v_uid::text, p_endpoint, p_p256dh, p_auth, p_ua)
  ON CONFLICT (endpoint) DO UPDATE SET user_key=EXCLUDED.user_key, p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth, user_agent=EXCLUDED.user_agent;
  RETURN true;
END; $function$

CREATE OR REPLACE FUNCTION public.push_subscribe_mentor(p_token text, p_endpoint text, p_p256dh text, p_auth text, p_ua text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_mentor uuid;
BEGIN
  v_mentor := current_mentor_id();
  IF v_mentor IS NULL AND p_token IS NOT NULL THEN
    SELECT mentor_id INTO v_mentor FROM mentor_sessions
     WHERE token::text = p_token AND (expires_at IS NULL OR expires_at > now());
    IF v_mentor IS NULL THEN SELECT id INTO v_mentor FROM mentors WHERE access_token::text = p_token; END IF;
  END IF;
  IF v_mentor IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  INSERT INTO push_subscriptions (user_key, endpoint, p256dh, auth, user_agent)
  VALUES ('mentor:' || v_mentor::text, p_endpoint, p_p256dh, p_auth, p_ua)
  ON CONFLICT (endpoint) DO UPDATE SET user_key=EXCLUDED.user_key, p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth, user_agent=EXCLUDED.user_agent;
  RETURN true;
END; $function$

CREATE OR REPLACE FUNCTION public.push_subscribe_participant(p_token text, p_endpoint text, p_p256dh text, p_auth text, p_ua text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_reg uuid;
BEGIN
  SELECT registration_id INTO v_reg FROM participant_sessions
   WHERE token::text = p_token AND (expires_at IS NULL OR expires_at > now());
  IF v_reg IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  INSERT INTO push_subscriptions (user_key, endpoint, p256dh, auth, user_agent)
  VALUES ('participant:' || v_reg::text, p_endpoint, p_p256dh, p_auth, p_ua)
  ON CONFLICT (endpoint) DO UPDATE SET user_key=EXCLUDED.user_key, p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth, user_agent=EXCLUDED.user_agent;
  RETURN true;
END; $function$

CREATE OR REPLACE FUNCTION public.push_unsubscribe(p_endpoint text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM push_subscriptions WHERE endpoint = p_endpoint;
  RETURN true;
END; $function$

CREATE OR REPLACE FUNCTION public.recover_pending_registration(p_email text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_reg RECORD;
  v_member_count INTEGER;
  v_leader_id UUID;
BEGIN
  -- Rate limit: 5 attempts per 5 minutes per email
  IF NOT check_rate_limit('recover:' || LOWER(p_email), 5, 5) THEN
    PERFORM pg_sleep(0.1 + random() * 0.2);
    RETURN NULL;
  END IF;

  SELECT id, email, full_name, payment_method, ticket_price, ticket_tier,
         team_name, inscription_modality, is_team_leader, price_expires_at
  INTO v_reg
  FROM registrations
  WHERE LOWER(email) = LOWER(p_email)
    AND payment_status = 'pending'
  LIMIT 1;

  IF NOT FOUND THEN
    PERFORM pg_sleep(0.05 + random() * 0.1);
    RETURN NULL;
  END IF;

  IF v_reg.inscription_modality = 'team' AND v_reg.team_name IS NOT NULL THEN
    SELECT COUNT(*)::INTEGER INTO v_member_count
    FROM registrations
    WHERE team_name = v_reg.team_name;
  ELSE
    v_member_count := 1;
  END IF;

  v_leader_id := v_reg.id;
  IF v_reg.inscription_modality = 'team' AND NOT v_reg.is_team_leader THEN
    SELECT id INTO v_leader_id
    FROM registrations
    WHERE team_name = v_reg.team_name
      AND is_team_leader = true
    LIMIT 1;
  END IF;

  RETURN json_build_object(
    'status', 'pending',
    'id', v_leader_id,
    'full_name', v_reg.full_name,
    'email', v_reg.email,
    'payment_method', v_reg.payment_method,
    'ticket_price', v_reg.ticket_price,
    'ticket_tier', v_reg.ticket_tier,
    'inscription_modality', v_reg.inscription_modality,
    'member_count', v_member_count,
    'price_expires_at', v_reg.price_expires_at
  );
END;
$function$

CREATE OR REPLACE FUNCTION public.redeem_voucher(p_code text, p_data jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_voucher RECORD;
  v_order RECORD;
  v_reg_id UUID;
  v_clean_code TEXT;
  v_email TEXT;
BEGIN
  v_clean_code := UPPER(TRIM(COALESCE(p_code, '')));
  IF v_clean_code = '' THEN
    RAISE EXCEPTION 'voucher_code_required';
  END IF;

  -- Lock the voucher row so two participants can't claim it simultaneously
  SELECT id, status, bulk_order_id INTO v_voucher
  FROM bulk_vouchers
  WHERE UPPER(code) = v_clean_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'voucher_not_found';
  END IF;

  IF v_voucher.status = 'redeemed' THEN
    RAISE EXCEPTION 'voucher_already_redeemed';
  END IF;

  IF v_voucher.status = 'cancelled' THEN
    RAISE EXCEPTION 'voucher_cancelled';
  END IF;

  SELECT id, company_name, payment_status, ticket_price, ticket_tier
  INTO v_order
  FROM bulk_orders WHERE id = v_voucher.bulk_order_id;

  IF v_order.payment_status <> 'confirmed' THEN
    RAISE EXCEPTION 'order_not_paid';
  END IF;

  v_email := LOWER(TRIM(COALESCE(p_data->>'email', '')));
  IF v_email = '' OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'invalid_email';
  END IF;

  -- Insere registration
  INSERT INTO registrations (
    full_name, email, phone, birth_date, linkedin_url, cpf,
    occupation_type, ai_experience_level,
    dietary_restrictions, is_pcd, pcd_type,
    has_project, project_name, economic_axes,
    inscription_modality, team_name, is_team_leader, is_remote,
    payment_method, ticket_tier, ticket_price, payment_status,
    payment_confirmed_at, payment_notes,
    accept_lgpd, accept_code_ip
  ) VALUES (
    TRIM(p_data->>'full_name'),
    v_email,
    TRIM(p_data->>'phone'),
    (p_data->>'birth_date')::DATE,
    NULLIF(TRIM(COALESCE(p_data->>'linkedin_url', '')), ''),
    TRIM(COALESCE(p_data->>'cpf', '')),
    p_data->>'occupation_type',
    (p_data->>'ai_experience_level')::INTEGER,
    TRIM(COALESCE(p_data->>'dietary_restrictions', '')),
    COALESCE((p_data->>'is_pcd')::BOOLEAN, false),
    NULLIF(TRIM(COALESCE(p_data->>'pcd_type', '')), ''),
    COALESCE((p_data->>'has_project')::BOOLEAN, false),
    NULLIF(TRIM(COALESCE(p_data->>'project_name', '')), ''),
    CASE
      WHEN p_data ? 'economic_axes' AND jsonb_typeof(p_data->'economic_axes') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_data->'economic_axes'))
      ELSE ARRAY[]::TEXT[]
    END,
    'individual_form_team',  -- voucher = sempre individual; participante pode formar/entrar em time depois
    NULL,
    false,
    COALESCE((p_data->>'is_remote')::BOOLEAN, false),
    'card',  -- placeholder; pagamento foi feito pela empresa por fora
    v_order.ticket_tier,
    v_order.ticket_price,
    'confirmed',
    now(),
    'Voucher empresarial: ' || v_order.company_name || ' (' || v_clean_code || ')',
    COALESCE((p_data->>'accept_lgpd')::BOOLEAN, false),
    COALESCE((p_data->>'accept_code_ip')::BOOLEAN, false)
  ) RETURNING id INTO v_reg_id;

  -- Marca voucher como resgatado
  UPDATE bulk_vouchers
  SET status = 'redeemed',
      redeemed_by_id = v_reg_id,
      redeemed_at = now()
  WHERE id = v_voucher.id;

  RETURN json_build_object(
    'registration_id', v_reg_id,
    'company_name', v_order.company_name,
    'ticket_tier', v_order.ticket_tier,
    'ticket_price', v_order.ticket_price
  );
END;
$function$

CREATE OR REPLACE FUNCTION public.scope_read_only()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$ SELECT COALESCE((SELECT (scope->>'read_only')::boolean FROM current_grant_ref()), false) $function$

CREATE OR REPLACE FUNCTION public.scope_tab_allowed(p_tab text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT COALESCE(
    (SELECT CASE
       WHEN scope->'allowed_tabs' IS NULL OR jsonb_array_length(scope->'allowed_tabs') = 0 THEN true
       ELSE scope->'allowed_tabs' ? p_tab
     END FROM current_grant_ref()),
    true)
$function$

CREATE OR REPLACE FUNCTION public.set_announcement(p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
END; $function$

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
$function$

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
END; $function$

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
$function$

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
END; $function$

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
END; $function$

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
END; $function$

CREATE OR REPLACE FUNCTION public.set_team_lunch(p_team_id uuid, p_done boolean)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END; $function$

CREATE OR REPLACE FUNCTION public.set_team_phase_aliases(p_aliases jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  el jsonb;
  ext text;
  hk text;
  cleaned jsonb := '[]'::jsonb;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF jsonb_typeof(p_aliases) <> 'array' THEN RAISE EXCEPTION 'invalid_payload'; END IF;
  IF jsonb_array_length(p_aliases) > 200 THEN RAISE EXCEPTION 'too_many'; END IF;

  FOR el IN SELECT * FROM jsonb_array_elements(p_aliases)
  LOOP
    ext := btrim(COALESCE(el->>'external', ''));
    hk  := btrim(COALESCE(el->>'hackia', ''));
    IF ext <> '' AND hk <> '' THEN
      cleaned := cleaned || jsonb_build_object('external', ext, 'hackia', hk);
    END IF;
  END LOOP;

  INSERT INTO app_settings (key, value, updated_at)
  VALUES ('team_phase_aliases', cleaned::text, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  RETURN cleaned;
END;
$function$

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
END; $function$

CREATE OR REPLACE FUNCTION public.slides_upload_allowed()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT submit_deadline IS NULL OR now() <= submit_deadline
  FROM slides_config WHERE id = TRUE;
$function$

CREATE OR REPLACE FUNCTION public.submit_event_evaluation(p_token uuid, p_type text, p_scores jsonb, p_comment text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id UUID;
  v_open BOOLEAN;
  v_inserted INT;
BEGIN
  v_id := event_eval_resolve(p_token, p_type);
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  v_open := COALESCE(
    (SELECT value = 'true' FROM app_settings WHERE key = 'evaluation_open'),
    false
  );
  IF NOT v_open THEN
    RAISE EXCEPTION 'evaluation_closed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_each(COALESCE(p_scores, '{}'::jsonb)) e
    WHERE jsonb_typeof(e.value) <> 'number'
       OR (e.value)::numeric < 0
       OR (e.value)::numeric > 10
  ) THEN
    RAISE EXCEPTION 'invalid_scores';
  END IF;

  INSERT INTO event_evaluations (respondent_type, respondent_id, scores, comment)
  VALUES (
    p_type, v_id,
    COALESCE(p_scores, '{}'::jsonb),
    NULLIF(btrim(COALESCE(p_comment, '')), '')
  )
  ON CONFLICT (respondent_type, respondent_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    RAISE EXCEPTION 'already_submitted';
  END IF;

  RETURN json_build_object('ok', true);
END;
$function$

CREATE OR REPLACE FUNCTION public.sugar_admin_list(p_status text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_list JSON;
BEGIN
  IF NOT is_admin_or_viewer() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT json_agg(c ORDER BY c.created_at DESC) INTO v_list FROM (
    SELECT id, message, sender_type, sender_name,
           recipient_type, recipient_name, status, created_at, moderated_at
    FROM sugar_cubes
    WHERE p_status IS NULL OR status = p_status
  ) c;
  RETURN COALESCE(v_list, '[]'::JSON);
END; $function$

CREATE OR REPLACE FUNCTION public.sugar_insert(p_sender_type text, p_sender_ref uuid, p_sender_name text, p_recipient_type text, p_recipient_ref uuid, p_message text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c_throttle       CONSTANT INTERVAL := '5 seconds';
  c_max_per_sender CONSTANT INTEGER  := 30;
  v_recipient_name TEXT;
  v_msg            TEXT;
BEGIN
  v_recipient_name := sugar_resolve_recipient(p_recipient_type, p_recipient_ref);
  IF p_sender_type = p_recipient_type
     AND p_sender_ref IS NOT DISTINCT FROM p_recipient_ref THEN
    RAISE EXCEPTION 'self_compliment';
  END IF;
  IF p_sender_type <> 'organization' THEN
    IF (SELECT COUNT(*) FROM sugar_cubes
          WHERE sender_type = p_sender_type
            AND sender_ref IS NOT DISTINCT FROM p_sender_ref) >= c_max_per_sender THEN
      RAISE EXCEPTION 'rate_limited';
    END IF;
    IF EXISTS (SELECT 1 FROM sugar_cubes
          WHERE sender_type = p_sender_type
            AND sender_ref IS NOT DISTINCT FROM p_sender_ref
            AND created_at > now() - c_throttle) THEN
      RAISE EXCEPTION 'rate_limited';
    END IF;
  END IF;
  v_msg := TRIM(COALESCE(p_message, ''));
  IF v_msg = '' THEN RAISE EXCEPTION 'message_required'; END IF;
  IF length(v_msg) > 280 THEN v_msg := left(v_msg, 280); END IF;
  INSERT INTO sugar_cubes (message, sender_type, sender_ref, sender_name,
                           recipient_type, recipient_ref, recipient_name)
  VALUES (v_msg, p_sender_type, p_sender_ref, p_sender_name,
          p_recipient_type, p_recipient_ref, v_recipient_name);
  RETURN json_build_object('ok', true);
END; $function$

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
END; $function$

CREATE OR REPLACE FUNCTION public.sugar_my_received_mentor(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_mentor UUID; v_released BOOLEAN; v_list JSON;
BEGIN
  v_mentor := current_mentor_id();
  IF v_mentor IS NULL AND p_token IS NOT NULL THEN v_mentor := mentor_session_owner(p_token); END IF;
  IF v_mentor IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT COALESCE((SELECT value = 'true' FROM app_settings WHERE key = 'sugar_released'), false) INTO v_released;
  IF NOT v_released THEN RETURN '[]'::JSON; END IF;
  SELECT json_agg(json_build_object('message', message, 'created_at', created_at) ORDER BY created_at DESC)
    INTO v_list FROM sugar_cubes
    WHERE recipient_type = 'mentor' AND recipient_ref = v_mentor AND status = 'approved';
  RETURN COALESCE(v_list, '[]'::JSON);
END; $function$

CREATE OR REPLACE FUNCTION public.sugar_my_received_participant(p_token uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_reg UUID; v_released BOOLEAN; v_list JSON;
BEGIN
  v_reg := participant_session_owner_confirmed(p_token);
  SELECT COALESCE((SELECT value = 'true' FROM app_settings WHERE key = 'sugar_released'), false)
    INTO v_released;
  IF NOT v_released THEN RETURN '[]'::JSON; END IF;
  SELECT json_agg(json_build_object('message', message, 'created_at', created_at) ORDER BY created_at DESC)
    INTO v_list FROM sugar_cubes
    WHERE recipient_type = 'participant' AND recipient_ref = v_reg AND status = 'approved';
  RETURN COALESCE(v_list, '[]'::JSON);
END; $function$

CREATE OR REPLACE FUNCTION public.sugar_resolve_recipient(p_type text, p_ref uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_name TEXT;
BEGIN
  IF p_type = 'organization' THEN
    IF p_ref IS NOT NULL THEN RAISE EXCEPTION 'invalid_recipient'; END IF;
    RETURN 'Organização HackIA';
  ELSIF p_type = 'participant' THEN
    SELECT full_name INTO v_name FROM registrations
      WHERE id = p_ref AND payment_status = 'confirmed' AND checked_in_at IS NOT NULL;
  ELSIF p_type = 'mentor' THEN
    SELECT name INTO v_name FROM mentors WHERE id = p_ref;
  ELSE
    RAISE EXCEPTION 'invalid_recipient';
  END IF;
  IF v_name IS NULL THEN RAISE EXCEPTION 'recipient_not_found'; END IF;
  RETURN v_name;
END; $function$

CREATE OR REPLACE FUNCTION public.sugar_roster(p_participant_token uuid DEFAULT NULL::uuid, p_mentor_token text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_ok BOOLEAN := false; v_participants JSON; v_mentors JSON;
BEGIN
  IF p_participant_token IS NOT NULL THEN
    BEGIN PERFORM participant_session_owner_confirmed(p_participant_token); v_ok := true;
    EXCEPTION WHEN raise_exception THEN NULL; END;
  END IF;
  IF NOT v_ok AND current_mentor_id() IS NOT NULL THEN v_ok := true; END IF;
  IF NOT v_ok AND p_mentor_token IS NOT NULL THEN
    BEGIN PERFORM mentor_session_owner(p_mentor_token); v_ok := true;
    EXCEPTION WHEN raise_exception THEN NULL; END;
  END IF;
  IF NOT v_ok THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT json_agg(json_build_object('ref', id, 'name', full_name) ORDER BY full_name)
    INTO v_participants FROM registrations WHERE payment_status = 'confirmed' AND checked_in_at IS NOT NULL;
  SELECT json_agg(json_build_object('ref', id, 'name', name) ORDER BY name) INTO v_mentors FROM mentors;
  RETURN json_build_object('participants', COALESCE(v_participants, '[]'::JSON),
    'mentors', COALESCE(v_mentors, '[]'::JSON), 'organization', true);
END; $function$

CREATE OR REPLACE FUNCTION public.sugar_roster_admin()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_participants JSON; v_mentors JSON;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT json_agg(json_build_object('ref', id, 'name', full_name) ORDER BY full_name)
    INTO v_participants FROM registrations
    WHERE payment_status = 'confirmed' AND checked_in_at IS NOT NULL;
  SELECT json_agg(json_build_object('ref', id, 'name', name) ORDER BY name)
    INTO v_mentors FROM mentors;
  RETURN json_build_object(
    'participants', COALESCE(v_participants, '[]'::JSON),
    'mentors',      COALESCE(v_mentors, '[]'::JSON),
    'organization', true
  );
END; $function$

CREATE OR REPLACE FUNCTION public.sugar_send_mentor(p_token text, p_recipient_type text, p_recipient_ref uuid, p_message text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_mentor UUID; v_name TEXT;
BEGIN
  v_mentor := current_mentor_id();
  IF v_mentor IS NULL AND p_token IS NOT NULL THEN v_mentor := mentor_session_owner(p_token); END IF;
  IF v_mentor IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT name INTO v_name FROM mentors WHERE id = v_mentor;
  RETURN sugar_insert('mentor', v_mentor, v_name, p_recipient_type, p_recipient_ref, p_message);
END; $function$

CREATE OR REPLACE FUNCTION public.sugar_send_org(p_recipient_type text, p_recipient_ref uuid, p_message text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'unauthorized'; END IF;
  RETURN sugar_insert('organization', NULL, 'Organização HackIA',
                      p_recipient_type, p_recipient_ref, p_message);
END; $function$

CREATE OR REPLACE FUNCTION public.sugar_send_participant(p_token uuid, p_recipient_type text, p_recipient_ref uuid, p_message text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_reg UUID; v_name TEXT;
BEGIN
  v_reg := participant_session_owner_confirmed(p_token);
  SELECT full_name INTO v_name FROM registrations WHERE id = v_reg;
  RETURN sugar_insert('participant', v_reg, v_name,
                      p_recipient_type, p_recipient_ref, p_message);
END; $function$

CREATE OR REPLACE FUNCTION public.sync_registration_team_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_team_id UUID;
BEGIN
  IF NEW.team_name IS NULL THEN
    NEW.team_id := NULL;
    RETURN NEW;
  END IF;
  SELECT id INTO v_team_id FROM teams WHERE name = NEW.team_name;
  IF v_team_id IS NULL THEN
    INSERT INTO teams (name) VALUES (NEW.team_name)
    ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_team_id;
  END IF;
  NEW.team_id := v_team_id;
  RETURN NEW;
END;
$function$

CREATE OR REPLACE FUNCTION public.transfer_ticket(p_from_id uuid, p_to_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_from registrations;
  v_to   registrations;
  v_now  TIMESTAMPTZ := now();
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF p_from_id = p_to_id THEN
    RAISE EXCEPTION 'origem e destino devem ser diferentes';
  END IF;

  SELECT * INTO v_from FROM registrations WHERE id = p_from_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'inscrição de origem não encontrada';
  END IF;

  SELECT * INTO v_to FROM registrations WHERE id = p_to_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'inscrição de destino não encontrada';
  END IF;

  IF v_from.payment_status <> 'confirmed' THEN
    RAISE EXCEPTION 'origem precisa ter pagamento confirmado (atual: %)', v_from.payment_status;
  END IF;

  IF v_to.payment_status = 'confirmed' THEN
    RAISE EXCEPTION 'destino já tem pagamento confirmado';
  END IF;

  IF v_to.payment_status = 'cancelled' THEN
    RAISE EXCEPTION 'destino está cancelado';
  END IF;

  IF v_from.transferred_to_id IS NOT NULL THEN
    RAISE EXCEPTION 'ingresso de origem já foi transferido anteriormente';
  END IF;

  -- Destino herda o pagamento
  UPDATE registrations SET
    payment_method        = v_from.payment_method,
    ticket_tier           = v_from.ticket_tier,
    ticket_price          = v_from.ticket_price,
    payment_status        = 'confirmed',
    payment_confirmed_at  = COALESCE(v_from.payment_confirmed_at, v_now),
    payment_notes         = TRIM(BOTH E'\n' FROM
                              COALESCE(payment_notes, '') ||
                              E'\n[' || to_char(v_now, 'YYYY-MM-DD HH24:MI') ||
                              '] Transferido de ' || v_from.email),
    transferred_from_id   = v_from.id
  WHERE id = p_to_id;

  -- Origem é marcada como transferida (cancelled, sem reembolso)
  UPDATE registrations SET
    payment_status = 'cancelled',
    payment_notes  = TRIM(BOTH E'\n' FROM
                       COALESCE(payment_notes, '') ||
                       E'\n[' || to_char(v_now, 'YYYY-MM-DD HH24:MI') ||
                       '] Transferido para ' || v_to.email),
    transferred_to_id = v_to.id,
    transferred_at    = v_now
  WHERE id = p_from_id;

  RETURN json_build_object(
    'success', true,
    'from_id', p_from_id,
    'to_id', p_to_id,
    'ticket_tier', v_from.ticket_tier,
    'ticket_price', v_from.ticket_price,
    'transferred_at', v_now
  );
END;
$function$

CREATE OR REPLACE FUNCTION public.trg_notifications_send_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_anon_key text;
  v_secret   text;
  v_url      text := 'https://qshrzfahotmjshtjuvno.supabase.co/functions/v1/send-push';
BEGIN
  SELECT decrypted_secret INTO v_anon_key FROM vault.decrypted_secrets WHERE name = 'edge_anon_key';
  IF v_anon_key IS NULL THEN RETURN NEW; END IF;

  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'push_webhook_secret';
  IF v_secret IS NULL THEN RETURN NEW; END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type',     'application/json',
                 'Authorization',    'Bearer ' || v_anon_key,
                 'x-webhook-secret', v_secret
               ),
    body    := jsonb_build_object('record', jsonb_build_object('id', NEW.id))
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END; $function$

CREATE OR REPLACE FUNCTION public.trg_notify_mentor_assigned()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_team text;
BEGIN
  BEGIN
    SELECT name INTO v_team FROM teams WHERE id = NEW.team_id;
    PERFORM notify_event('mentor_assigned','Você foi designado a um time 🎓',
      'Time: ' || COALESCE(v_team,'(sem nome)'), '#mentor',
      jsonb_build_object('kind','mentor','mentor_id', NEW.mentor_id::text));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NEW;
END; $function$

CREATE OR REPLACE FUNCTION public.trg_notify_payment_confirmed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.payment_status = 'confirmed' AND COALESCE(OLD.payment_status,'') <> 'confirmed' THEN
    BEGIN
      PERFORM notify_event('payment_confirmed','Inscrição confirmada ✅',
        'Bem-vindo(a) ao HackIA SC! Seu acesso está liberado.', '#participante',
        jsonb_build_object('kind','participant','reg_id', NEW.id::text));
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
  RETURN NEW;
END; $function$

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
$function$

CREATE OR REPLACE FUNCTION public.wall_admin_list()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_phase TEXT;
  v_pains JSON;
BEGIN
  IF NOT (is_admin_or_viewer() OR is_wall_staff()) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT phase INTO v_phase FROM wall_state WHERE id = true;

  SELECT json_agg(p ORDER BY p.vote_count DESC, p.created_at)
  INTO v_pains
  FROM (
    SELECT
      pn.id, pn.title, pn.description, pn.author_name, pn.axis,
      pn.status, pn.created_at,
      COUNT(pv.id)::INTEGER AS vote_count,
      (
        SELECT COALESCE(
          json_agg(
            json_build_object(
              'full_name', r.full_name,
              'email', r.email,
              'phone', r.phone
            ) ORDER BY r.full_name
          ), '[]'::json)
        FROM pain_votes pv2
        JOIN registrations r ON r.id = pv2.registration_id
        WHERE pv2.pain_id = pn.id
      ) AS voters
    FROM pains pn
    LEFT JOIN pain_votes pv ON pv.pain_id = pn.id
    GROUP BY pn.id
  ) p;

  RETURN json_build_object(
    'phase', v_phase,
    'pains', COALESCE(v_pains, '[]'::JSON)
  );
END;
$function$

CREATE OR REPLACE FUNCTION public.wall_display_name(p_full_name text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_parts TEXT[];
  v_first TEXT;
  v_last  TEXT;
BEGIN
  v_parts := regexp_split_to_array(btrim(COALESCE(p_full_name, '')), '\s+');
  IF v_parts IS NULL OR array_length(v_parts, 1) IS NULL OR v_parts[1] = '' THEN
    RETURN '';
  END IF;
  v_first := v_parts[1];
  IF array_length(v_parts, 1) = 1 THEN
    RETURN v_first;
  END IF;
  v_last := v_parts[array_length(v_parts, 1)];
  RETURN v_first || ' ' || upper(left(v_last, 1)) || '.';
END;
$function$

CREATE OR REPLACE FUNCTION public.wall_get_phase()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT phase FROM wall_state WHERE id = true $function$

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
$function$

CREATE OR REPLACE FUNCTION public.wall_identify(p_cpf text, p_birth_date date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_clean_cpf TEXT;
  v_reg RECORD;
BEGIN
  v_clean_cpf := REGEXP_REPLACE(COALESCE(p_cpf, ''), '\D', '', 'g');

  IF length(v_clean_cpf) <> 11 OR p_birth_date IS NULL THEN
    RAISE EXCEPTION 'not_found_or_not_confirmed';
  END IF;

  SELECT id, full_name
  INTO v_reg
  FROM registrations
  WHERE REGEXP_REPLACE(cpf, '\D', '', 'g') = v_clean_cpf
    AND birth_date = p_birth_date
    AND payment_status = 'confirmed'
  LIMIT 1;

  IF v_reg.id IS NULL THEN
    RAISE EXCEPTION 'not_found_or_not_confirmed';
  END IF;

  RETURN json_build_object(
    'registration_id', v_reg.id,
    'full_name', v_reg.full_name
  );
END;
$function$

CREATE OR REPLACE FUNCTION public.wall_list(p_token uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_phase TEXT; v_reg_id UUID; v_pains JSON; v_my_votes JSON; v_votes_used INTEGER := 0;
BEGIN
  IF p_token IS NOT NULL THEN
    BEGIN v_reg_id := participant_session_owner_confirmed(p_token);
    EXCEPTION WHEN raise_exception THEN v_reg_id := NULL; END;
  END IF;
  SELECT phase INTO v_phase FROM wall_state WHERE id = true;
  SELECT json_agg(p ORDER BY p.vote_count DESC, p.created_at) INTO v_pains
  FROM (
    SELECT pn.id, pn.title, pn.description, pn.author_name, pn.axis, pn.created_at,
      COUNT(pv.id)::INTEGER AS vote_count,
      CASE WHEN v_reg_id IS NULL THEN (
        SELECT COALESCE(json_agg(json_build_object('display', wall_display_name(r.full_name)) ORDER BY r.full_name), '[]'::json)
        FROM pain_votes pv2 JOIN registrations r ON r.id = pv2.registration_id WHERE pv2.pain_id = pn.id
      ) ELSE '[]'::json END AS voters
    FROM pains pn LEFT JOIN pain_votes pv ON pv.pain_id = pn.id
    WHERE pn.status = 'visible' GROUP BY pn.id
  ) p;
  IF v_reg_id IS NOT NULL THEN
    SELECT json_agg(pain_id), COUNT(*)::INTEGER INTO v_my_votes, v_votes_used FROM pain_votes WHERE registration_id = v_reg_id;
  END IF;
  RETURN json_build_object('phase', v_phase, 'pains', COALESCE(v_pains, '[]'::JSON),
    'my_votes', COALESCE(v_my_votes, '[]'::JSON), 'votos_restantes', GREATEST(3 - v_votes_used, 0));
END; $function$

CREATE OR REPLACE FUNCTION public.wall_require_confirmed(p_registration_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_name TEXT;
BEGIN
  IF p_registration_id IS NULL THEN
    RAISE EXCEPTION 'not_confirmed';
  END IF;

  SELECT full_name INTO v_name
  FROM registrations
  WHERE id = p_registration_id
    AND payment_status = 'confirmed';

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'not_confirmed';
  END IF;

  RETURN v_name;
END;
$function$

CREATE OR REPLACE FUNCTION public.wall_resolve_token(p_token uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id UUID;
BEGIN
  v_id := participant_session_owner_confirmed(p_token);
  RETURN v_id;
END; $function$

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
END; $function$

CREATE OR REPLACE FUNCTION public.wall_submit_pain(p_token uuid, p_title text, p_description text, p_axis text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c_max_pains_per_user CONSTANT INTEGER := 5;
  c_throttle_interval  CONSTANT INTERVAL := '5 seconds';
  v_phase TEXT; v_reg_id UUID; v_name TEXT; v_title TEXT; v_pain pains;
BEGIN
  v_reg_id := wall_resolve_token(p_token);
  SELECT full_name INTO v_name FROM registrations WHERE id = v_reg_id;
  SELECT phase INTO v_phase FROM wall_state WHERE id = true;
  IF v_phase <> 'wall_open' THEN RAISE EXCEPTION 'wall_not_open'; END IF;
  IF (SELECT COUNT(*) FROM pains WHERE registration_id = v_reg_id AND status <> 'hidden') >= c_max_pains_per_user THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;
  IF EXISTS (SELECT 1 FROM pains WHERE registration_id = v_reg_id AND created_at > now() - c_throttle_interval) THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;
  v_title := TRIM(COALESCE(p_title, ''));
  IF v_title = '' THEN RAISE EXCEPTION 'title_required'; END IF;
  IF length(v_title) > 140 THEN v_title := left(v_title, 140); END IF;
  INSERT INTO pains (title, description, author_name, registration_id, axis)
  VALUES (v_title, NULLIF(TRIM(COALESCE(p_description, '')), ''), v_name, v_reg_id, NULLIF(TRIM(COALESCE(p_axis, '')), ''))
  RETURNING * INTO v_pain;
  RETURN json_build_object('id', v_pain.id, 'title', v_pain.title, 'description', v_pain.description,
    'author_name', v_pain.author_name, 'axis', v_pain.axis, 'created_at', v_pain.created_at);
END; $function$

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
$function$

CREATE OR REPLACE FUNCTION public.wall_unvote(p_token uuid, p_pain_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_phase TEXT; v_reg_id UUID; v_deleted INTEGER; v_remaining INTEGER;
BEGIN
  v_reg_id := wall_resolve_token(p_token);
  SELECT phase INTO v_phase FROM wall_state WHERE id = true;
  IF v_phase <> 'voting_open' THEN RAISE EXCEPTION 'voting_not_open'; END IF;
  DELETE FROM pain_votes WHERE pain_id = p_pain_id AND registration_id = v_reg_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN RAISE EXCEPTION 'vote_not_found'; END IF;
  SELECT 3 - COUNT(*) INTO v_remaining FROM pain_votes WHERE registration_id = v_reg_id;
  RETURN json_build_object('ok', true, 'votos_restantes', GREATEST(v_remaining, 0));
END; $function$

CREATE OR REPLACE FUNCTION public.wall_vote(p_token uuid, p_pain_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c_throttle_interval CONSTANT INTERVAL := '2 seconds';
  v_phase TEXT; v_reg_id UUID; v_inserted INTEGER; v_remaining INTEGER;
BEGIN
  v_reg_id := wall_resolve_token(p_token);
  SELECT phase INTO v_phase FROM wall_state WHERE id = true;
  IF v_phase <> 'voting_open' THEN RAISE EXCEPTION 'voting_not_open'; END IF;
  IF EXISTS (SELECT 1 FROM pain_votes WHERE registration_id = v_reg_id AND created_at > now() - c_throttle_interval) THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pains WHERE id = p_pain_id AND status = 'visible') THEN
    RAISE EXCEPTION 'pain_not_found';
  END IF;
  INSERT INTO pain_votes (pain_id, registration_id)
  SELECT p_pain_id, v_reg_id
  WHERE (SELECT COUNT(*) FROM pain_votes WHERE registration_id = v_reg_id) < 3
  ON CONFLICT (pain_id, registration_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    IF EXISTS (SELECT 1 FROM pain_votes WHERE pain_id = p_pain_id AND registration_id = v_reg_id) THEN
      RAISE EXCEPTION 'already_voted';
    ELSE RAISE EXCEPTION 'vote_limit_reached'; END IF;
  END IF;
  SELECT 3 - COUNT(*) INTO v_remaining FROM pain_votes WHERE registration_id = v_reg_id;
  RETURN json_build_object('ok', true, 'votos_restantes', GREATEST(v_remaining, 0));
END; $function$
