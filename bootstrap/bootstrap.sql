-- HackIA schema bootstrap — generated from prod qshrzfahotmjshtjuvno (verbatim, 2026-06-03).
-- Run on a FRESH Supabase project to stand up a new edition's schema in one shot.
-- Out of scope (see bootstrap/README.md): edge functions, secrets, cron, real data.
-- Supabase-managed schemas (auth, storage tables, vault) are NOT recreated here —
-- a fresh Supabase project already has them; we only add OUR bucket + policies.
SET check_function_bodies = false;
SET client_min_messages = warning;
CREATE SCHEMA IF NOT EXISTS extensions;
-- pg_net / supabase_vault / pg_stat_statements are Supabase-managed (pre-installed on a
-- fresh project); the IF NOT EXISTS lines are no-ops there. pgcrypto + uuid-ossp are the
-- ones our functions actually use (gen_random_bytes/digest/crypt/gen_salt, uuid).
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE TABLE IF NOT EXISTS public.access_grants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  label text NOT NULL,
  role text NOT NULL,
  auth_kind text NOT NULL,
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  token_hash text,
  supabase_user_id uuid,
  ref_id uuid,
  email text,
  expires_at timestamp with time zone,
  revoked_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_used_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  body text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text NOT NULL,
  value text NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  action text NOT NULL,
  actor_type text NOT NULL,
  actor_email text,
  target_table text,
  target_id uuid,
  target_email text,
  old_data jsonb,
  new_data jsonb,
  metadata jsonb
);

CREATE TABLE IF NOT EXISTS public.bulk_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  company_name text NOT NULL,
  cnpj text,
  contact_name text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text,
  total_tickets integer NOT NULL,
  ticket_price integer NOT NULL,
  ticket_tier text NOT NULL,
  payment_status text NOT NULL DEFAULT 'pending'::text,
  payment_method text,
  payment_notes text,
  paid_at timestamp with time zone,
  created_by_email text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.bulk_vouchers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  bulk_order_id uuid NOT NULL,
  code text NOT NULL,
  status text NOT NULL DEFAULT 'active'::text,
  redeemed_by_id uuid,
  redeemed_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.event_evaluations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  respondent_type text NOT NULL,
  respondent_id uuid NOT NULL,
  scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  comment text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.jurors (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  access_token uuid NOT NULL DEFAULT gen_random_uuid(),
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  consent_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.mentor_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  mentor_id uuid NOT NULL,
  phase text NOT NULL,
  body text NOT NULL,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mentor_sessions (
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  mentor_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + '7 days'::interval),
  last_used_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mentor_teams (
  mentor_id uuid NOT NULL,
  team_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mentors (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text,
  access_code_hash text NOT NULL,
  failed_login_count integer NOT NULL DEFAULT 0,
  failed_login_until timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  access_token uuid DEFAULT gen_random_uuid()
);

CREATE TABLE IF NOT EXISTS public.mp_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  payment_id bigint NOT NULL,
  registration_id uuid,
  status text NOT NULL,
  gross_amount integer NOT NULL,
  net_amount integer NOT NULL,
  marketplace_fee integer DEFAULT 0,
  financing_fee integer DEFAULT 0,
  shipping_fee integer DEFAULT 0,
  discount_fee integer DEFAULT 0,
  payment_method text,
  payment_type text,
  payer_email text,
  date_approved timestamp with time zone,
  date_created timestamp with time zone,
  synced_at timestamp with time zone DEFAULT now(),
  raw_data jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  operation_type text
);

CREATE TABLE IF NOT EXISTS public.mp_sync_status (
  id integer NOT NULL DEFAULT 1,
  last_sync_at timestamp with time zone,
  last_sync_count integer DEFAULT 0,
  last_sync_error text,
  is_syncing boolean DEFAULT false,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notification_recipients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL,
  user_key text NOT NULL,
  read_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_key text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  url text,
  audience jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pain_votes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  pain_id uuid NOT NULL,
  registration_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.pains (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  title text NOT NULL,
  description text,
  author_name text,
  registration_id uuid NOT NULL,
  axis text,
  status text NOT NULL DEFAULT 'visible'::text
);

CREATE TABLE IF NOT EXISTS public.participant_sessions (
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + '7 days'::interval),
  last_used_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pre_pitch_evaluations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  mentor_id uuid NOT NULL,
  round smallint NOT NULL,
  scores jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_score numeric(5,2) DEFAULT 0,
  summary text DEFAULT ''::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.prepitch_room_mentors (
  room_id uuid NOT NULL,
  mentor_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.prepitch_room_teams (
  room_id uuid NOT NULL,
  team_id uuid NOT NULL,
  present_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.prepitch_rooms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  round smallint NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_key text NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key text NOT NULL,
  attempts integer DEFAULT 1,
  first_attempt_at timestamp with time zone DEFAULT now(),
  last_attempt_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.registrations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  full_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  birth_date date NOT NULL,
  linkedin_url text,
  occupation_type text NOT NULL,
  ai_experience_level integer NOT NULL,
  dietary_restrictions text NOT NULL,
  is_pcd boolean NOT NULL DEFAULT false,
  pcd_type text,
  has_project boolean NOT NULL DEFAULT false,
  project_name text,
  economic_axes text[] DEFAULT '{}'::text[],
  inscription_modality text NOT NULL,
  team_name text,
  payment_method text NOT NULL,
  ticket_tier text NOT NULL,
  ticket_price integer NOT NULL,
  payment_status text DEFAULT 'pending'::text,
  payment_confirmed_at timestamp with time zone,
  payment_notes text,
  is_team_leader boolean NOT NULL DEFAULT false,
  accept_lgpd boolean NOT NULL DEFAULT false,
  accept_code_ip boolean NOT NULL DEFAULT false,
  cpf text NOT NULL DEFAULT ''::text,
  price_expires_at timestamp with time zone,
  checked_in_at timestamp with time zone,
  is_remote boolean NOT NULL DEFAULT false,
  transferred_to_id uuid,
  transferred_from_id uuid,
  transferred_at timestamp with time zone,
  failed_login_count integer NOT NULL DEFAULT 0,
  failed_login_until timestamp with time zone,
  applied_discount_code text,
  team_id uuid
);

CREATE TABLE IF NOT EXISTS public.resources (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  file_path text,
  file_name text,
  content_type text,
  size_bytes bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  url text,
  body text
);

CREATE TABLE IF NOT EXISTS public.schedule_days (
  day_key text NOT NULL,
  label text NOT NULL,
  time_window text,
  note text,
  accent text NOT NULL DEFAULT 'cyan'::text,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.schedule_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  day_key text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  "time" text,
  title text NOT NULL,
  description text,
  done boolean NOT NULL DEFAULT false,
  done_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.slides_config (
  id boolean NOT NULL DEFAULT true,
  submit_deadline timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sugar_cubes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  message text NOT NULL,
  sender_type text NOT NULL,
  sender_ref uuid,
  sender_name text NOT NULL,
  recipient_type text NOT NULL,
  recipient_ref uuid,
  recipient_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  moderated_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.team_deliverable_meta (
  team_id uuid NOT NULL,
  field text NOT NULL,
  updated_by_name text,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_evaluations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  evaluator_type text NOT NULL DEFAULT 'ai'::text,
  rubric_version text NOT NULL DEFAULT 'edital_v1'::text,
  scores jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_score numeric,
  eliminated boolean NOT NULL DEFAULT false,
  summary text,
  model text,
  status text NOT NULL DEFAULT 'pending'::text,
  error text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  juror_id uuid,
  deliverable text,
  axes jsonb
);

CREATE TABLE IF NOT EXISTS public.team_join_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  requester_id uuid NOT NULL,
  team_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  decided_by_id uuid,
  decided_at timestamp with time zone,
  message text
);

CREATE TABLE IF NOT EXISTS public.teams (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  hypotheses_canvas jsonb NOT NULL DEFAULT '{}'::jsonb,
  slc_ia_canvas jsonb NOT NULL DEFAULT '{}'::jsonb,
  learning_diary jsonb NOT NULL DEFAULT '{}'::jsonb,
  final_deliverables jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  status text NOT NULL DEFAULT 'draft'::text,
  idea_description text,
  pitch_transcript text,
  pitch_segments jsonb,
  pitch_transcribed_at timestamp with time zone,
  lunch_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.waitlist (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  full_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  notes text
);

CREATE TABLE IF NOT EXISTS public.wall_state (
  id boolean NOT NULL DEFAULT true,
  phase text NOT NULL DEFAULT 'closed'::text,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
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
ALTER TABLE public.access_grants ADD CONSTRAINT access_grants_auth_kind_check CHECK ((auth_kind = ANY (ARRAY['jwt_exchange'::text, 'rpc_token'::text, 'password'::text])));
ALTER TABLE public.access_grants ADD CONSTRAINT access_grants_password_shape_check CHECK (((auth_kind <> 'password'::text) OR ((email IS NOT NULL) AND (token_hash IS NULL))));
ALTER TABLE public.access_grants ADD CONSTRAINT access_grants_pkey PRIMARY KEY (id);
ALTER TABLE public.access_grants ADD CONSTRAINT access_grants_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'viewer'::text, 'checkin'::text, 'staff'::text, 'facilitator'::text, 'mentor'::text, 'juror'::text])));
ALTER TABLE public.access_grants ADD CONSTRAINT access_grants_token_hash_key UNIQUE (token_hash);
ALTER TABLE public.announcements ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);
ALTER TABLE public.app_settings ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_actor_type_check CHECK ((actor_type = ANY (ARRAY['public'::text, 'admin'::text, 'system'::text])));
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);
ALTER TABLE public.bulk_orders ADD CONSTRAINT bulk_orders_payment_status_check CHECK ((payment_status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'cancelled'::text])));
ALTER TABLE public.bulk_orders ADD CONSTRAINT bulk_orders_pkey PRIMARY KEY (id);
ALTER TABLE public.bulk_orders ADD CONSTRAINT bulk_orders_ticket_price_check CHECK ((ticket_price > 0));
ALTER TABLE public.bulk_orders ADD CONSTRAINT bulk_orders_ticket_tier_check CHECK ((ticket_tier = ANY (ARRAY['early_bird'::text, 'regular'::text, 'dati'::text, 'corporate'::text])));
ALTER TABLE public.bulk_orders ADD CONSTRAINT bulk_orders_total_tickets_check CHECK (((total_tickets > 0) AND (total_tickets <= 100)));
ALTER TABLE public.bulk_vouchers ADD CONSTRAINT bulk_vouchers_code_key UNIQUE (code);
ALTER TABLE public.bulk_vouchers ADD CONSTRAINT bulk_vouchers_pkey PRIMARY KEY (id);
ALTER TABLE public.bulk_vouchers ADD CONSTRAINT bulk_vouchers_status_check CHECK ((status = ANY (ARRAY['active'::text, 'redeemed'::text, 'cancelled'::text])));
ALTER TABLE public.event_evaluations ADD CONSTRAINT event_evaluations_pkey PRIMARY KEY (id);
ALTER TABLE public.event_evaluations ADD CONSTRAINT event_evaluations_respondent_type_check CHECK ((respondent_type = ANY (ARRAY['participant'::text, 'mentor'::text])));
ALTER TABLE public.event_evaluations ADD CONSTRAINT event_evaluations_respondent_type_respondent_id_key UNIQUE (respondent_type, respondent_id);
ALTER TABLE public.jurors ADD CONSTRAINT jurors_access_token_key UNIQUE (access_token);
ALTER TABLE public.jurors ADD CONSTRAINT jurors_pkey PRIMARY KEY (id);
ALTER TABLE public.mentor_notes ADD CONSTRAINT mentor_notes_phase_check CHECK ((phase = ANY (ARRAY['ignicao'::text, 'construcao'::text, 'apresentacao'::text])));
ALTER TABLE public.mentor_notes ADD CONSTRAINT mentor_notes_pkey PRIMARY KEY (id);
ALTER TABLE public.mentor_sessions ADD CONSTRAINT mentor_sessions_pkey PRIMARY KEY (token);
ALTER TABLE public.mentor_teams ADD CONSTRAINT mentor_teams_pkey PRIMARY KEY (mentor_id, team_id);
ALTER TABLE public.mentors ADD CONSTRAINT mentors_access_token_key UNIQUE (access_token);
ALTER TABLE public.mentors ADD CONSTRAINT mentors_email_key UNIQUE (email);
ALTER TABLE public.mentors ADD CONSTRAINT mentors_pkey PRIMARY KEY (id);
ALTER TABLE public.mp_payments ADD CONSTRAINT mp_payments_payment_id_key UNIQUE (payment_id);
ALTER TABLE public.mp_payments ADD CONSTRAINT mp_payments_pkey PRIMARY KEY (id);
ALTER TABLE public.mp_sync_status ADD CONSTRAINT mp_sync_status_id_check CHECK ((id = 1));
ALTER TABLE public.mp_sync_status ADD CONSTRAINT mp_sync_status_pkey PRIMARY KEY (id);
ALTER TABLE public.notification_recipients ADD CONSTRAINT notification_recipients_pkey PRIMARY KEY (id);
ALTER TABLE public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
ALTER TABLE public.pain_votes ADD CONSTRAINT pain_votes_pain_id_registration_id_key UNIQUE (pain_id, registration_id);
ALTER TABLE public.pain_votes ADD CONSTRAINT pain_votes_pkey PRIMARY KEY (id);
ALTER TABLE public.pains ADD CONSTRAINT pains_pkey PRIMARY KEY (id);
ALTER TABLE public.pains ADD CONSTRAINT pains_status_check CHECK ((status = ANY (ARRAY['visible'::text, 'hidden'::text])));
ALTER TABLE public.participant_sessions ADD CONSTRAINT participant_sessions_pkey PRIMARY KEY (token);
ALTER TABLE public.pre_pitch_evaluations ADD CONSTRAINT pre_pitch_evaluations_pkey PRIMARY KEY (id);
ALTER TABLE public.pre_pitch_evaluations ADD CONSTRAINT pre_pitch_evaluations_round_check CHECK ((round = ANY (ARRAY[1, 2])));
ALTER TABLE public.pre_pitch_evaluations ADD CONSTRAINT uq_prepitch_mentor_team_round UNIQUE (mentor_id, team_id, round);
ALTER TABLE public.prepitch_room_mentors ADD CONSTRAINT prepitch_room_mentors_pkey PRIMARY KEY (room_id, mentor_id);
ALTER TABLE public.prepitch_room_teams ADD CONSTRAINT prepitch_room_teams_pkey PRIMARY KEY (room_id, team_id);
ALTER TABLE public.prepitch_rooms ADD CONSTRAINT prepitch_rooms_pkey PRIMARY KEY (id);
ALTER TABLE public.prepitch_rooms ADD CONSTRAINT prepitch_rooms_round_check CHECK ((round = ANY (ARRAY[1, 2])));
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE public.rate_limits ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (key);
ALTER TABLE public.registrations ADD CONSTRAINT chk_ticket_price CHECK ((((ticket_tier = 'corporate'::text) AND (ticket_price > 0)) OR ((ticket_tier <> 'corporate'::text) AND (ticket_price = ANY (ARRAY[15000, 16000, 20000])))));
ALTER TABLE public.registrations ADD CONSTRAINT registrations_ai_experience_level_check CHECK (((ai_experience_level >= 1) AND (ai_experience_level <= 10)));
ALTER TABLE public.registrations ADD CONSTRAINT registrations_inscription_modality_check CHECK ((inscription_modality = ANY (ARRAY['individual_form_team'::text, 'individual_own'::text, 'team'::text])));
ALTER TABLE public.registrations ADD CONSTRAINT registrations_occupation_type_check CHECK ((occupation_type = ANY (ARRAY['hacker'::text, 'hustler'::text, 'hipster'::text, 'enthusiast'::text])));
ALTER TABLE public.registrations ADD CONSTRAINT registrations_payment_method_check CHECK ((payment_method = ANY (ARRAY['pix'::text, 'card'::text])));
ALTER TABLE public.registrations ADD CONSTRAINT registrations_payment_status_check CHECK ((payment_status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'cancelled'::text])));
ALTER TABLE public.registrations ADD CONSTRAINT registrations_pkey PRIMARY KEY (id);
ALTER TABLE public.registrations ADD CONSTRAINT registrations_ticket_tier_check CHECK ((ticket_tier = ANY (ARRAY['early_bird'::text, 'regular'::text, 'dati'::text, 'corporate'::text])));
ALTER TABLE public.resources ADD CONSTRAINT resources_file_xor_link CHECK (((file_path IS NOT NULL) <> (url IS NOT NULL)));
ALTER TABLE public.resources ADD CONSTRAINT resources_pkey PRIMARY KEY (id);
ALTER TABLE public.schedule_days ADD CONSTRAINT schedule_days_pkey PRIMARY KEY (day_key);
ALTER TABLE public.schedule_items ADD CONSTRAINT schedule_items_pkey PRIMARY KEY (id);
ALTER TABLE public.slides_config ADD CONSTRAINT slides_config_id_check CHECK (id);
ALTER TABLE public.slides_config ADD CONSTRAINT slides_config_pkey PRIMARY KEY (id);
ALTER TABLE public.sugar_cubes ADD CONSTRAINT sugar_cubes_pkey PRIMARY KEY (id);
ALTER TABLE public.sugar_cubes ADD CONSTRAINT sugar_cubes_recipient_type_check CHECK ((recipient_type = ANY (ARRAY['participant'::text, 'mentor'::text, 'organization'::text])));
ALTER TABLE public.sugar_cubes ADD CONSTRAINT sugar_cubes_sender_type_check CHECK ((sender_type = ANY (ARRAY['participant'::text, 'mentor'::text, 'organization'::text])));
ALTER TABLE public.sugar_cubes ADD CONSTRAINT sugar_cubes_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
ALTER TABLE public.team_deliverable_meta ADD CONSTRAINT team_deliverable_meta_pkey PRIMARY KEY (team_id, field);
ALTER TABLE public.team_evaluations ADD CONSTRAINT team_evaluations_deliverable_check CHECK ((deliverable = ANY (ARRAY['fase1'::text, 'fase2'::text, 'fase3'::text])));
ALTER TABLE public.team_evaluations ADD CONSTRAINT team_evaluations_evaluator_type_check CHECK ((evaluator_type = ANY (ARRAY['ai'::text, 'human'::text])));
ALTER TABLE public.team_evaluations ADD CONSTRAINT team_evaluations_pkey PRIMARY KEY (id);
ALTER TABLE public.team_evaluations ADD CONSTRAINT team_evaluations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'done'::text, 'error'::text])));
ALTER TABLE public.team_join_requests ADD CONSTRAINT team_join_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.team_join_requests ADD CONSTRAINT team_join_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text])));
ALTER TABLE public.teams ADD CONSTRAINT teams_pkey PRIMARY KEY (id);
ALTER TABLE public.teams ADD CONSTRAINT teams_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'reviewing'::text, 'evaluated'::text])));
ALTER TABLE public.waitlist ADD CONSTRAINT waitlist_email_key UNIQUE (email);
ALTER TABLE public.waitlist ADD CONSTRAINT waitlist_pkey PRIMARY KEY (id);
ALTER TABLE public.wall_state ADD CONSTRAINT wall_state_id_check CHECK ((id = true));
ALTER TABLE public.wall_state ADD CONSTRAINT wall_state_phase_check CHECK ((phase = ANY (ARRAY['closed'::text, 'wall_open'::text, 'voting_open'::text, 'results'::text])));
ALTER TABLE public.wall_state ADD CONSTRAINT wall_state_pkey PRIMARY KEY (id);
ALTER TABLE public.bulk_vouchers ADD CONSTRAINT bulk_vouchers_bulk_order_id_fkey FOREIGN KEY (bulk_order_id) REFERENCES bulk_orders(id) ON DELETE CASCADE;
ALTER TABLE public.bulk_vouchers ADD CONSTRAINT bulk_vouchers_redeemed_by_id_fkey FOREIGN KEY (redeemed_by_id) REFERENCES registrations(id);
ALTER TABLE public.mentor_notes ADD CONSTRAINT mentor_notes_mentor_id_fkey FOREIGN KEY (mentor_id) REFERENCES mentors(id) ON DELETE CASCADE;
ALTER TABLE public.mentor_notes ADD CONSTRAINT mentor_notes_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.mentor_sessions ADD CONSTRAINT mentor_sessions_mentor_id_fkey FOREIGN KEY (mentor_id) REFERENCES mentors(id) ON DELETE CASCADE;
ALTER TABLE public.mentor_teams ADD CONSTRAINT mentor_teams_mentor_id_fkey FOREIGN KEY (mentor_id) REFERENCES mentors(id) ON DELETE CASCADE;
ALTER TABLE public.mentor_teams ADD CONSTRAINT mentor_teams_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.mp_payments ADD CONSTRAINT mp_payments_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES registrations(id);
ALTER TABLE public.notification_recipients ADD CONSTRAINT notification_recipients_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE;
ALTER TABLE public.pain_votes ADD CONSTRAINT pain_votes_pain_id_fkey FOREIGN KEY (pain_id) REFERENCES pains(id) ON DELETE CASCADE;
ALTER TABLE public.pain_votes ADD CONSTRAINT pain_votes_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE CASCADE;
ALTER TABLE public.pains ADD CONSTRAINT pains_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE CASCADE;
ALTER TABLE public.participant_sessions ADD CONSTRAINT participant_sessions_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE CASCADE;
ALTER TABLE public.pre_pitch_evaluations ADD CONSTRAINT pre_pitch_evaluations_mentor_id_fkey FOREIGN KEY (mentor_id) REFERENCES mentors(id) ON DELETE CASCADE;
ALTER TABLE public.pre_pitch_evaluations ADD CONSTRAINT pre_pitch_evaluations_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.prepitch_room_mentors ADD CONSTRAINT prepitch_room_mentors_mentor_id_fkey FOREIGN KEY (mentor_id) REFERENCES mentors(id) ON DELETE CASCADE;
ALTER TABLE public.prepitch_room_mentors ADD CONSTRAINT prepitch_room_mentors_room_id_fkey FOREIGN KEY (room_id) REFERENCES prepitch_rooms(id) ON DELETE CASCADE;
ALTER TABLE public.prepitch_room_teams ADD CONSTRAINT prepitch_room_teams_room_id_fkey FOREIGN KEY (room_id) REFERENCES prepitch_rooms(id) ON DELETE CASCADE;
ALTER TABLE public.prepitch_room_teams ADD CONSTRAINT prepitch_room_teams_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.registrations ADD CONSTRAINT registrations_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE public.registrations ADD CONSTRAINT registrations_transferred_from_id_fkey FOREIGN KEY (transferred_from_id) REFERENCES registrations(id);
ALTER TABLE public.registrations ADD CONSTRAINT registrations_transferred_to_id_fkey FOREIGN KEY (transferred_to_id) REFERENCES registrations(id);
ALTER TABLE public.schedule_items ADD CONSTRAINT schedule_items_day_key_fkey FOREIGN KEY (day_key) REFERENCES schedule_days(day_key) ON DELETE CASCADE;
ALTER TABLE public.team_deliverable_meta ADD CONSTRAINT team_deliverable_meta_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.team_evaluations ADD CONSTRAINT team_evaluations_juror_id_fkey FOREIGN KEY (juror_id) REFERENCES jurors(id) ON DELETE CASCADE;
ALTER TABLE public.team_evaluations ADD CONSTRAINT team_evaluations_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.team_join_requests ADD CONSTRAINT team_join_requests_decided_by_id_fkey FOREIGN KEY (decided_by_id) REFERENCES registrations(id);
ALTER TABLE public.team_join_requests ADD CONSTRAINT team_join_requests_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES registrations(id) ON DELETE CASCADE;
ALTER TABLE public.teams ADD CONSTRAINT teams_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES registrations(id);
CREATE INDEX IF NOT EXISTS idx_access_grants_role ON public.access_grants USING btree (role);
CREATE INDEX IF NOT EXISTS idx_access_grants_token_hash ON public.access_grants USING btree (token_hash);
CREATE INDEX IF NOT EXISTS announcements_active_idx ON public.announcements USING btree (active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON public.audit_log USING btree (action);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON public.audit_log USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_target_id ON public.audit_log USING btree (target_id);
CREATE INDEX IF NOT EXISTS idx_bulk_orders_email ON public.bulk_orders USING btree (lower(contact_email));
CREATE INDEX IF NOT EXISTS idx_bulk_orders_status ON public.bulk_orders USING btree (payment_status);
CREATE INDEX IF NOT EXISTS idx_bulk_vouchers_order ON public.bulk_vouchers USING btree (bulk_order_id);
CREATE INDEX IF NOT EXISTS idx_bulk_vouchers_redeemed ON public.bulk_vouchers USING btree (redeemed_by_id);
CREATE INDEX IF NOT EXISTS idx_bulk_vouchers_status ON public.bulk_vouchers USING btree (status);
CREATE INDEX IF NOT EXISTS idx_mentor_notes_team ON public.mentor_notes USING btree (team_id);
CREATE INDEX IF NOT EXISTS idx_mentor_sessions_mentor ON public.mentor_sessions USING btree (mentor_id);
CREATE INDEX IF NOT EXISTS idx_mentor_teams_mentor ON public.mentor_teams USING btree (mentor_id);
CREATE INDEX IF NOT EXISTS idx_mentor_teams_team ON public.mentor_teams USING btree (team_id);
CREATE INDEX IF NOT EXISTS idx_mp_payments_operation_type ON public.mp_payments USING btree (operation_type);
CREATE INDEX IF NOT EXISTS idx_mp_payments_registration_id ON public.mp_payments USING btree (registration_id);
CREATE INDEX IF NOT EXISTS idx_mp_payments_status ON public.mp_payments USING btree (status);
CREATE INDEX IF NOT EXISTS idx_notif_recip_notif ON public.notification_recipients USING btree (notification_id);
CREATE INDEX IF NOT EXISTS idx_notif_recip_user ON public.notification_recipients USING btree (user_key, read_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_recip ON public.notification_recipients USING btree (notification_id, user_key);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pain_votes_pain ON public.pain_votes USING btree (pain_id);
CREATE INDEX IF NOT EXISTS idx_pain_votes_registration ON public.pain_votes USING btree (registration_id);
CREATE INDEX IF NOT EXISTS idx_pains_registration ON public.pains USING btree (registration_id);
CREATE INDEX IF NOT EXISTS idx_pains_status ON public.pains USING btree (status);
CREATE INDEX IF NOT EXISTS idx_participant_sessions_expires ON public.participant_sessions USING btree (expires_at);
CREATE INDEX IF NOT EXISTS idx_participant_sessions_reg ON public.participant_sessions USING btree (registration_id);
CREATE INDEX IF NOT EXISTS idx_prepitch_mentor ON public.pre_pitch_evaluations USING btree (mentor_id);
CREATE INDEX IF NOT EXISTS idx_prepitch_team ON public.pre_pitch_evaluations USING btree (team_id);
CREATE INDEX IF NOT EXISTS idx_prepitch_room_mentors_mentor ON public.prepitch_room_mentors USING btree (mentor_id);
CREATE INDEX IF NOT EXISTS idx_prepitch_room_mentors_room ON public.prepitch_room_mentors USING btree (room_id);
CREATE INDEX IF NOT EXISTS idx_prepitch_room_teams_room ON public.prepitch_room_teams USING btree (room_id);
CREATE INDEX IF NOT EXISTS idx_prepitch_room_teams_team ON public.prepitch_room_teams USING btree (team_id);
CREATE INDEX IF NOT EXISTS idx_prepitch_rooms_round ON public.prepitch_rooms USING btree (round);
CREATE INDEX IF NOT EXISTS idx_push_sub_user_key ON public.push_subscriptions USING btree (user_key);
CREATE INDEX IF NOT EXISTS idx_reg_payment_status ON public.registrations USING btree (payment_status);
CREATE INDEX IF NOT EXISTS idx_reg_transferred_from ON public.registrations USING btree (transferred_from_id);
CREATE INDEX IF NOT EXISTS idx_reg_transferred_to ON public.registrations USING btree (transferred_to_id);
CREATE INDEX IF NOT EXISTS idx_registrations_team_id ON public.registrations USING btree (team_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_registrations_email_active ON public.registrations USING btree (lower(email)) WHERE (payment_status <> 'cancelled'::text);
CREATE INDEX IF NOT EXISTS schedule_items_day_idx ON public.schedule_items USING btree (day_key, sort_order);
CREATE INDEX IF NOT EXISTS idx_sugar_cubes_recipient ON public.sugar_cubes USING btree (recipient_type, recipient_ref);
CREATE INDEX IF NOT EXISTS idx_sugar_cubes_sender ON public.sugar_cubes USING btree (sender_type, sender_ref);
CREATE INDEX IF NOT EXISTS idx_sugar_cubes_status ON public.sugar_cubes USING btree (status);
CREATE INDEX IF NOT EXISTS idx_team_evaluations_team_id ON public.team_evaluations USING btree (team_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_eval_ai_deliverable ON public.team_evaluations USING btree (team_id, deliverable) WHERE ((evaluator_type = 'ai'::text) AND (deliverable IS NOT NULL));
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_evaluations_juror_team ON public.team_evaluations USING btree (juror_id, team_id) WHERE (juror_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_team_join_requests_requester ON public.team_join_requests USING btree (requester_id);
CREATE INDEX IF NOT EXISTS idx_team_join_requests_team_pending ON public.team_join_requests USING btree (team_name) WHERE (status = 'pending'::text);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_join_request ON public.team_join_requests USING btree (requester_id, team_name) WHERE (status = 'pending'::text);
CREATE UNIQUE INDEX IF NOT EXISTS uq_teams_name ON public.teams USING btree (name);
CREATE TRIGGER notify_mentor_assigned AFTER INSERT ON public.mentor_teams FOR EACH ROW EXECUTE FUNCTION trg_notify_mentor_assigned();
CREATE TRIGGER notifications_send_push AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION trg_notifications_send_push();
CREATE TRIGGER notify_payment_confirmed AFTER UPDATE OF payment_status ON public.registrations FOR EACH ROW EXECUTE FUNCTION trg_notify_payment_confirmed();
CREATE TRIGGER trg_check_team_size BEFORE INSERT ON public.registrations FOR EACH ROW EXECUTE FUNCTION check_team_size();
CREATE TRIGGER trg_check_team_size_update BEFORE UPDATE OF team_name ON public.registrations FOR EACH ROW EXECUTE FUNCTION check_team_size_update();
CREATE TRIGGER trg_enforce_anon_insert_defaults BEFORE INSERT ON public.registrations FOR EACH ROW EXECUTE FUNCTION enforce_anon_insert_defaults();
CREATE TRIGGER trg_enforce_ticket_price BEFORE INSERT ON public.registrations FOR EACH ROW EXECUTE FUNCTION enforce_ticket_price();
CREATE TRIGGER trg_sync_team_id_ins BEFORE INSERT ON public.registrations FOR EACH ROW EXECUTE FUNCTION sync_registration_team_id();
CREATE TRIGGER trg_sync_team_id_upd BEFORE UPDATE OF team_name ON public.registrations FOR EACH ROW EXECUTE FUNCTION sync_registration_team_id();
CREATE TRIGGER trg_cascade_team_rename AFTER UPDATE OF name ON public.teams FOR EACH ROW EXECUTE FUNCTION cascade_team_rename();
ALTER TABLE public.access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jurors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentor_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentor_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentor_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mp_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mp_sync_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pain_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participant_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pre_pitch_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prepitch_room_mentors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prepitch_room_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prepitch_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slides_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sugar_cubes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_deliverable_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wall_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manages access_grants" ON public.access_grants;
CREATE POLICY "Admin manages access_grants" ON public.access_grants AS PERMISSIVE FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Facilitator reads announcements" ON public.announcements;
CREATE POLICY "Facilitator reads announcements" ON public.announcements AS PERMISSIVE FOR SELECT TO authenticated USING (is_facilitator());

DROP POLICY IF EXISTS announcements_admin_all ON public.announcements;
CREATE POLICY announcements_admin_all ON public.announcements AS PERMISSIVE FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admin can read app settings" ON public.app_settings;
CREATE POLICY "Admin can read app settings" ON public.app_settings AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "Admin can write app settings" ON public.app_settings;
CREATE POLICY "Admin can write app settings" ON public.app_settings AS PERMISSIVE FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admin can insert audit log" ON public.audit_log;
CREATE POLICY "Admin can insert audit log" ON public.audit_log AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admin can read audit log" ON public.audit_log;
CREATE POLICY "Admin can read audit log" ON public.audit_log AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_viewer());

DROP POLICY IF EXISTS "Admin can read bulk orders" ON public.bulk_orders;
CREATE POLICY "Admin can read bulk orders" ON public.bulk_orders AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_viewer());

DROP POLICY IF EXISTS "Admin can write bulk orders" ON public.bulk_orders;
CREATE POLICY "Admin can write bulk orders" ON public.bulk_orders AS PERMISSIVE FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admin can read bulk vouchers" ON public.bulk_vouchers;
CREATE POLICY "Admin can read bulk vouchers" ON public.bulk_vouchers AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_viewer());

DROP POLICY IF EXISTS "Admin can write bulk vouchers" ON public.bulk_vouchers;
CREATE POLICY "Admin can write bulk vouchers" ON public.bulk_vouchers AS PERMISSIVE FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admin can manage jurors" ON public.jurors;
CREATE POLICY "Admin can manage jurors" ON public.jurors AS PERMISSIVE FOR ALL TO authenticated USING ((is_admin() AND (NOT scope_read_only()))) WITH CHECK ((is_admin() AND (NOT scope_read_only())));

DROP POLICY IF EXISTS sp3_jurors_read ON public.jurors;
CREATE POLICY sp3_jurors_read ON public.jurors AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "Admin can read mentor notes" ON public.mentor_notes;
CREATE POLICY "Admin can read mentor notes" ON public.mentor_notes AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_viewer());

DROP POLICY IF EXISTS "Admin can read mentor sessions" ON public.mentor_sessions;
CREATE POLICY "Admin can read mentor sessions" ON public.mentor_sessions AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_viewer());

DROP POLICY IF EXISTS "Admin can manage mentor teams" ON public.mentor_teams;
CREATE POLICY "Admin can manage mentor teams" ON public.mentor_teams AS PERMISSIVE FOR ALL TO authenticated USING ((is_admin() AND (NOT scope_read_only()))) WITH CHECK ((is_admin() AND (NOT scope_read_only())));

DROP POLICY IF EXISTS "Admin can read mentor teams" ON public.mentor_teams;
CREATE POLICY "Admin can read mentor teams" ON public.mentor_teams AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_viewer());

DROP POLICY IF EXISTS "Admin can manage mentors" ON public.mentors;
CREATE POLICY "Admin can manage mentors" ON public.mentors AS PERMISSIVE FOR ALL TO authenticated USING ((is_admin() AND (NOT scope_read_only()))) WITH CHECK ((is_admin() AND (NOT scope_read_only())));

DROP POLICY IF EXISTS "Admin can read mentors" ON public.mentors;
CREATE POLICY "Admin can read mentors" ON public.mentors AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_viewer());

DROP POLICY IF EXISTS "Admin can read mp_payments" ON public.mp_payments;
CREATE POLICY "Admin can read mp_payments" ON public.mp_payments AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_viewer());

DROP POLICY IF EXISTS "Admin can read sync_status" ON public.mp_sync_status;
CREATE POLICY "Admin can read sync_status" ON public.mp_sync_status AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_viewer());

DROP POLICY IF EXISTS "Admin can read pain_votes" ON public.pain_votes;
CREATE POLICY "Admin can read pain_votes" ON public.pain_votes AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_viewer());

DROP POLICY IF EXISTS "Admin can read pains" ON public.pains;
CREATE POLICY "Admin can read pains" ON public.pains AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_viewer());

DROP POLICY IF EXISTS "Admin can read participant sessions" ON public.participant_sessions;
CREATE POLICY "Admin can read participant sessions" ON public.participant_sessions AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_viewer());

DROP POLICY IF EXISTS "Admin can read prepitch" ON public.pre_pitch_evaluations;
CREATE POLICY "Admin can read prepitch" ON public.pre_pitch_evaluations AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_viewer());

DROP POLICY IF EXISTS "Admin manages prepitch room mentors" ON public.prepitch_room_mentors;
CREATE POLICY "Admin manages prepitch room mentors" ON public.prepitch_room_mentors AS PERMISSIVE FOR ALL TO authenticated USING ((is_admin() AND (NOT scope_read_only()))) WITH CHECK ((is_admin() AND (NOT scope_read_only())));

DROP POLICY IF EXISTS "Admin reads prepitch room mentors" ON public.prepitch_room_mentors;
CREATE POLICY "Admin reads prepitch room mentors" ON public.prepitch_room_mentors AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_viewer());

DROP POLICY IF EXISTS "Admin manages prepitch room teams" ON public.prepitch_room_teams;
CREATE POLICY "Admin manages prepitch room teams" ON public.prepitch_room_teams AS PERMISSIVE FOR ALL TO authenticated USING ((is_admin() AND (NOT scope_read_only()))) WITH CHECK ((is_admin() AND (NOT scope_read_only())));

DROP POLICY IF EXISTS "Admin reads prepitch room teams" ON public.prepitch_room_teams;
CREATE POLICY "Admin reads prepitch room teams" ON public.prepitch_room_teams AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_viewer());

DROP POLICY IF EXISTS "Admin manages prepitch rooms" ON public.prepitch_rooms;
CREATE POLICY "Admin manages prepitch rooms" ON public.prepitch_rooms AS PERMISSIVE FOR ALL TO authenticated USING ((is_admin() AND (NOT scope_read_only()))) WITH CHECK ((is_admin() AND (NOT scope_read_only())));

DROP POLICY IF EXISTS "Admin reads prepitch rooms" ON public.prepitch_rooms;
CREATE POLICY "Admin reads prepitch rooms" ON public.prepitch_rooms AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_viewer());

DROP POLICY IF EXISTS "No direct access to rate_limits" ON public.rate_limits;
CREATE POLICY "No direct access to rate_limits" ON public.rate_limits AS PERMISSIVE FOR ALL TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "Admin can read all registrations" ON public.registrations;
CREATE POLICY "Admin can read all registrations" ON public.registrations AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_viewer());

DROP POLICY IF EXISTS "Admin can update registrations" ON public.registrations;
CREATE POLICY "Admin can update registrations" ON public.registrations AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_admin() AND (NOT scope_read_only()))) WITH CHECK ((is_admin() AND (NOT scope_read_only())));

DROP POLICY IF EXISTS "Allow authenticated registration insert" ON public.registrations;
CREATE POLICY "Allow authenticated registration insert" ON public.registrations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public registration insert" ON public.registrations;
CREATE POLICY "Allow public registration insert" ON public.registrations AS PERMISSIVE FOR INSERT TO anon WITH CHECK (((payment_status = 'pending'::text) AND (payment_confirmed_at IS NULL) AND ((ticket_tier IS NULL) OR (ticket_tier = ANY (ARRAY['early_bird'::text, 'regular'::text, 'dati'::text]))) AND (checked_in_at IS NULL) AND (transferred_to_id IS NULL) AND (transferred_from_id IS NULL) AND (transferred_at IS NULL) AND ((failed_login_count IS NULL) OR (failed_login_count = 0)) AND (failed_login_until IS NULL)));

DROP POLICY IF EXISTS "Checkin can read confirmed registrations" ON public.registrations;
CREATE POLICY "Checkin can read confirmed registrations" ON public.registrations AS PERMISSIVE FOR SELECT TO authenticated USING ((COALESCE((((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['checkin'::text, 'staff'::text])), false) AND (payment_status = 'confirmed'::text)));

DROP POLICY IF EXISTS "Facilitator reads registrations" ON public.registrations;
CREATE POLICY "Facilitator reads registrations" ON public.registrations AS PERMISSIVE FOR SELECT TO authenticated USING (is_facilitator());

DROP POLICY IF EXISTS resources_admin_all ON public.resources;
CREATE POLICY resources_admin_all ON public.resources AS PERMISSIVE FOR ALL TO authenticated USING ((is_admin() AND (NOT scope_read_only()))) WITH CHECK ((is_admin() AND (NOT scope_read_only())));

DROP POLICY IF EXISTS sp3_resources_read ON public.resources;
CREATE POLICY sp3_resources_read ON public.resources AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "Facilitator reads schedule_days" ON public.schedule_days;
CREATE POLICY "Facilitator reads schedule_days" ON public.schedule_days AS PERMISSIVE FOR SELECT TO authenticated USING (is_facilitator());

DROP POLICY IF EXISTS "Facilitator updates schedule_days" ON public.schedule_days;
CREATE POLICY "Facilitator updates schedule_days" ON public.schedule_days AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_facilitator() AND (NOT scope_read_only()))) WITH CHECK ((is_facilitator() AND (NOT scope_read_only())));

DROP POLICY IF EXISTS schedule_days_admin_all ON public.schedule_days;
CREATE POLICY schedule_days_admin_all ON public.schedule_days AS PERMISSIVE FOR ALL TO authenticated USING ((is_admin() AND (NOT scope_read_only()))) WITH CHECK ((is_admin() AND (NOT scope_read_only())));

DROP POLICY IF EXISTS sp3_schedule_days_read_admin ON public.schedule_days;
CREATE POLICY sp3_schedule_days_read_admin ON public.schedule_days AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "Facilitator manages schedule_items" ON public.schedule_items;
CREATE POLICY "Facilitator manages schedule_items" ON public.schedule_items AS PERMISSIVE FOR ALL TO authenticated USING ((is_facilitator() AND (NOT scope_read_only()))) WITH CHECK ((is_facilitator() AND (NOT scope_read_only())));

DROP POLICY IF EXISTS schedule_items_admin_all ON public.schedule_items;
CREATE POLICY schedule_items_admin_all ON public.schedule_items AS PERMISSIVE FOR ALL TO authenticated USING ((is_admin() AND (NOT scope_read_only()))) WITH CHECK ((is_admin() AND (NOT scope_read_only())));

DROP POLICY IF EXISTS sp3_schedule_items_read_admin ON public.schedule_items;
CREATE POLICY sp3_schedule_items_read_admin ON public.schedule_items AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS sp3_schedule_items_read_facilitator ON public.schedule_items;
CREATE POLICY sp3_schedule_items_read_facilitator ON public.schedule_items AS PERMISSIVE FOR SELECT TO authenticated USING (is_facilitator());

DROP POLICY IF EXISTS "Admin can read sugar_cubes" ON public.sugar_cubes;
CREATE POLICY "Admin can read sugar_cubes" ON public.sugar_cubes AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_viewer());

DROP POLICY IF EXISTS deliverable_meta_select_admin ON public.team_deliverable_meta;
CREATE POLICY deliverable_meta_select_admin ON public.team_deliverable_meta AS PERMISSIVE FOR SELECT TO public USING (is_admin_or_viewer());

DROP POLICY IF EXISTS "Admin viewer read team evaluations" ON public.team_evaluations;
CREATE POLICY "Admin viewer read team evaluations" ON public.team_evaluations AS PERMISSIVE FOR SELECT TO authenticated USING ((((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'viewer'::text])));

DROP POLICY IF EXISTS "Admin write team evaluations" ON public.team_evaluations;
CREATE POLICY "Admin write team evaluations" ON public.team_evaluations AS PERMISSIVE FOR ALL TO authenticated USING ((is_admin() AND (NOT scope_read_only()))) WITH CHECK ((is_admin() AND (NOT scope_read_only())));

DROP POLICY IF EXISTS "Admin can read team join requests" ON public.team_join_requests;
CREATE POLICY "Admin can read team join requests" ON public.team_join_requests AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_viewer());

DROP POLICY IF EXISTS "Admin can update team join requests" ON public.team_join_requests;
CREATE POLICY "Admin can update team join requests" ON public.team_join_requests AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_admin() AND (NOT scope_read_only()))) WITH CHECK ((is_admin() AND (NOT scope_read_only())));

DROP POLICY IF EXISTS "Admin can insert teams" ON public.teams;
CREATE POLICY "Admin can insert teams" ON public.teams AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_admin() AND (NOT scope_read_only())));

DROP POLICY IF EXISTS "Admin can read teams" ON public.teams;
CREATE POLICY "Admin can read teams" ON public.teams AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_viewer());

DROP POLICY IF EXISTS "Admin can update teams" ON public.teams;
CREATE POLICY "Admin can update teams" ON public.teams AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_admin() AND (NOT scope_read_only()))) WITH CHECK ((is_admin() AND (NOT scope_read_only())));

DROP POLICY IF EXISTS "Facilitator reads teams" ON public.teams;
CREATE POLICY "Facilitator reads teams" ON public.teams AS PERMISSIVE FOR SELECT TO authenticated USING (is_facilitator());

DROP POLICY IF EXISTS "Admin can read waitlist" ON public.waitlist;
CREATE POLICY "Admin can read waitlist" ON public.waitlist AS PERMISSIVE FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow public waitlist insert" ON public.waitlist;
CREATE POLICY "Allow public waitlist insert" ON public.waitlist AS PERMISSIVE FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Admin can read wall_state" ON public.wall_state;
CREATE POLICY "Admin can read wall_state" ON public.wall_state AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin_or_viewer());
GRANT DELETE ON public.access_grants TO anon;
GRANT INSERT ON public.access_grants TO anon;
GRANT REFERENCES ON public.access_grants TO anon;
GRANT SELECT ON public.access_grants TO anon;
GRANT TRIGGER ON public.access_grants TO anon;
GRANT TRUNCATE ON public.access_grants TO anon;
GRANT UPDATE ON public.access_grants TO anon;
GRANT DELETE ON public.access_grants TO authenticated;
GRANT INSERT ON public.access_grants TO authenticated;
GRANT REFERENCES ON public.access_grants TO authenticated;
GRANT SELECT ON public.access_grants TO authenticated;
GRANT TRIGGER ON public.access_grants TO authenticated;
GRANT TRUNCATE ON public.access_grants TO authenticated;
GRANT UPDATE ON public.access_grants TO authenticated;
GRANT DELETE ON public.access_grants TO service_role;
GRANT INSERT ON public.access_grants TO service_role;
GRANT REFERENCES ON public.access_grants TO service_role;
GRANT SELECT ON public.access_grants TO service_role;
GRANT TRIGGER ON public.access_grants TO service_role;
GRANT TRUNCATE ON public.access_grants TO service_role;
GRANT UPDATE ON public.access_grants TO service_role;
GRANT DELETE ON public.announcements TO anon;
GRANT INSERT ON public.announcements TO anon;
GRANT REFERENCES ON public.announcements TO anon;
GRANT SELECT ON public.announcements TO anon;
GRANT TRIGGER ON public.announcements TO anon;
GRANT TRUNCATE ON public.announcements TO anon;
GRANT UPDATE ON public.announcements TO anon;
GRANT DELETE ON public.announcements TO authenticated;
GRANT INSERT ON public.announcements TO authenticated;
GRANT REFERENCES ON public.announcements TO authenticated;
GRANT SELECT ON public.announcements TO authenticated;
GRANT TRIGGER ON public.announcements TO authenticated;
GRANT TRUNCATE ON public.announcements TO authenticated;
GRANT UPDATE ON public.announcements TO authenticated;
GRANT DELETE ON public.announcements TO service_role;
GRANT INSERT ON public.announcements TO service_role;
GRANT REFERENCES ON public.announcements TO service_role;
GRANT SELECT ON public.announcements TO service_role;
GRANT TRIGGER ON public.announcements TO service_role;
GRANT TRUNCATE ON public.announcements TO service_role;
GRANT UPDATE ON public.announcements TO service_role;
GRANT DELETE ON public.app_settings TO anon;
GRANT INSERT ON public.app_settings TO anon;
GRANT REFERENCES ON public.app_settings TO anon;
GRANT SELECT ON public.app_settings TO anon;
GRANT TRIGGER ON public.app_settings TO anon;
GRANT TRUNCATE ON public.app_settings TO anon;
GRANT UPDATE ON public.app_settings TO anon;
GRANT DELETE ON public.app_settings TO authenticated;
GRANT INSERT ON public.app_settings TO authenticated;
GRANT REFERENCES ON public.app_settings TO authenticated;
GRANT SELECT ON public.app_settings TO authenticated;
GRANT TRIGGER ON public.app_settings TO authenticated;
GRANT TRUNCATE ON public.app_settings TO authenticated;
GRANT UPDATE ON public.app_settings TO authenticated;
GRANT DELETE ON public.app_settings TO service_role;
GRANT INSERT ON public.app_settings TO service_role;
GRANT REFERENCES ON public.app_settings TO service_role;
GRANT SELECT ON public.app_settings TO service_role;
GRANT TRIGGER ON public.app_settings TO service_role;
GRANT TRUNCATE ON public.app_settings TO service_role;
GRANT UPDATE ON public.app_settings TO service_role;
GRANT DELETE ON public.audit_log TO anon;
GRANT INSERT ON public.audit_log TO anon;
GRANT REFERENCES ON public.audit_log TO anon;
GRANT SELECT ON public.audit_log TO anon;
GRANT TRIGGER ON public.audit_log TO anon;
GRANT TRUNCATE ON public.audit_log TO anon;
GRANT UPDATE ON public.audit_log TO anon;
GRANT DELETE ON public.audit_log TO authenticated;
GRANT INSERT ON public.audit_log TO authenticated;
GRANT REFERENCES ON public.audit_log TO authenticated;
GRANT SELECT ON public.audit_log TO authenticated;
GRANT TRIGGER ON public.audit_log TO authenticated;
GRANT TRUNCATE ON public.audit_log TO authenticated;
GRANT UPDATE ON public.audit_log TO authenticated;
GRANT DELETE ON public.audit_log TO service_role;
GRANT INSERT ON public.audit_log TO service_role;
GRANT REFERENCES ON public.audit_log TO service_role;
GRANT SELECT ON public.audit_log TO service_role;
GRANT TRIGGER ON public.audit_log TO service_role;
GRANT TRUNCATE ON public.audit_log TO service_role;
GRANT UPDATE ON public.audit_log TO service_role;
GRANT DELETE ON public.bulk_orders TO anon;
GRANT INSERT ON public.bulk_orders TO anon;
GRANT REFERENCES ON public.bulk_orders TO anon;
GRANT SELECT ON public.bulk_orders TO anon;
GRANT TRIGGER ON public.bulk_orders TO anon;
GRANT TRUNCATE ON public.bulk_orders TO anon;
GRANT UPDATE ON public.bulk_orders TO anon;
GRANT DELETE ON public.bulk_orders TO authenticated;
GRANT INSERT ON public.bulk_orders TO authenticated;
GRANT REFERENCES ON public.bulk_orders TO authenticated;
GRANT SELECT ON public.bulk_orders TO authenticated;
GRANT TRIGGER ON public.bulk_orders TO authenticated;
GRANT TRUNCATE ON public.bulk_orders TO authenticated;
GRANT UPDATE ON public.bulk_orders TO authenticated;
GRANT DELETE ON public.bulk_orders TO service_role;
GRANT INSERT ON public.bulk_orders TO service_role;
GRANT REFERENCES ON public.bulk_orders TO service_role;
GRANT SELECT ON public.bulk_orders TO service_role;
GRANT TRIGGER ON public.bulk_orders TO service_role;
GRANT TRUNCATE ON public.bulk_orders TO service_role;
GRANT UPDATE ON public.bulk_orders TO service_role;
GRANT DELETE ON public.bulk_vouchers TO anon;
GRANT INSERT ON public.bulk_vouchers TO anon;
GRANT REFERENCES ON public.bulk_vouchers TO anon;
GRANT SELECT ON public.bulk_vouchers TO anon;
GRANT TRIGGER ON public.bulk_vouchers TO anon;
GRANT TRUNCATE ON public.bulk_vouchers TO anon;
GRANT UPDATE ON public.bulk_vouchers TO anon;
GRANT DELETE ON public.bulk_vouchers TO authenticated;
GRANT INSERT ON public.bulk_vouchers TO authenticated;
GRANT REFERENCES ON public.bulk_vouchers TO authenticated;
GRANT SELECT ON public.bulk_vouchers TO authenticated;
GRANT TRIGGER ON public.bulk_vouchers TO authenticated;
GRANT TRUNCATE ON public.bulk_vouchers TO authenticated;
GRANT UPDATE ON public.bulk_vouchers TO authenticated;
GRANT DELETE ON public.bulk_vouchers TO service_role;
GRANT INSERT ON public.bulk_vouchers TO service_role;
GRANT REFERENCES ON public.bulk_vouchers TO service_role;
GRANT SELECT ON public.bulk_vouchers TO service_role;
GRANT TRIGGER ON public.bulk_vouchers TO service_role;
GRANT TRUNCATE ON public.bulk_vouchers TO service_role;
GRANT UPDATE ON public.bulk_vouchers TO service_role;
GRANT DELETE ON public.event_evaluations TO anon;
GRANT INSERT ON public.event_evaluations TO anon;
GRANT REFERENCES ON public.event_evaluations TO anon;
GRANT SELECT ON public.event_evaluations TO anon;
GRANT TRIGGER ON public.event_evaluations TO anon;
GRANT TRUNCATE ON public.event_evaluations TO anon;
GRANT UPDATE ON public.event_evaluations TO anon;
GRANT DELETE ON public.event_evaluations TO authenticated;
GRANT INSERT ON public.event_evaluations TO authenticated;
GRANT REFERENCES ON public.event_evaluations TO authenticated;
GRANT SELECT ON public.event_evaluations TO authenticated;
GRANT TRIGGER ON public.event_evaluations TO authenticated;
GRANT TRUNCATE ON public.event_evaluations TO authenticated;
GRANT UPDATE ON public.event_evaluations TO authenticated;
GRANT DELETE ON public.event_evaluations TO service_role;
GRANT INSERT ON public.event_evaluations TO service_role;
GRANT REFERENCES ON public.event_evaluations TO service_role;
GRANT SELECT ON public.event_evaluations TO service_role;
GRANT TRIGGER ON public.event_evaluations TO service_role;
GRANT TRUNCATE ON public.event_evaluations TO service_role;
GRANT UPDATE ON public.event_evaluations TO service_role;
GRANT DELETE ON public.jurors TO anon;
GRANT INSERT ON public.jurors TO anon;
GRANT REFERENCES ON public.jurors TO anon;
GRANT SELECT ON public.jurors TO anon;
GRANT TRIGGER ON public.jurors TO anon;
GRANT TRUNCATE ON public.jurors TO anon;
GRANT UPDATE ON public.jurors TO anon;
GRANT DELETE ON public.jurors TO authenticated;
GRANT INSERT ON public.jurors TO authenticated;
GRANT REFERENCES ON public.jurors TO authenticated;
GRANT SELECT ON public.jurors TO authenticated;
GRANT TRIGGER ON public.jurors TO authenticated;
GRANT TRUNCATE ON public.jurors TO authenticated;
GRANT UPDATE ON public.jurors TO authenticated;
GRANT DELETE ON public.jurors TO service_role;
GRANT INSERT ON public.jurors TO service_role;
GRANT REFERENCES ON public.jurors TO service_role;
GRANT SELECT ON public.jurors TO service_role;
GRANT TRIGGER ON public.jurors TO service_role;
GRANT TRUNCATE ON public.jurors TO service_role;
GRANT UPDATE ON public.jurors TO service_role;
GRANT DELETE ON public.mentor_notes TO anon;
GRANT INSERT ON public.mentor_notes TO anon;
GRANT REFERENCES ON public.mentor_notes TO anon;
GRANT SELECT ON public.mentor_notes TO anon;
GRANT TRIGGER ON public.mentor_notes TO anon;
GRANT TRUNCATE ON public.mentor_notes TO anon;
GRANT UPDATE ON public.mentor_notes TO anon;
GRANT DELETE ON public.mentor_notes TO authenticated;
GRANT INSERT ON public.mentor_notes TO authenticated;
GRANT REFERENCES ON public.mentor_notes TO authenticated;
GRANT SELECT ON public.mentor_notes TO authenticated;
GRANT TRIGGER ON public.mentor_notes TO authenticated;
GRANT TRUNCATE ON public.mentor_notes TO authenticated;
GRANT UPDATE ON public.mentor_notes TO authenticated;
GRANT DELETE ON public.mentor_notes TO service_role;
GRANT INSERT ON public.mentor_notes TO service_role;
GRANT REFERENCES ON public.mentor_notes TO service_role;
GRANT SELECT ON public.mentor_notes TO service_role;
GRANT TRIGGER ON public.mentor_notes TO service_role;
GRANT TRUNCATE ON public.mentor_notes TO service_role;
GRANT UPDATE ON public.mentor_notes TO service_role;
GRANT DELETE ON public.mentor_sessions TO anon;
GRANT INSERT ON public.mentor_sessions TO anon;
GRANT REFERENCES ON public.mentor_sessions TO anon;
GRANT SELECT ON public.mentor_sessions TO anon;
GRANT TRIGGER ON public.mentor_sessions TO anon;
GRANT TRUNCATE ON public.mentor_sessions TO anon;
GRANT UPDATE ON public.mentor_sessions TO anon;
GRANT DELETE ON public.mentor_sessions TO authenticated;
GRANT INSERT ON public.mentor_sessions TO authenticated;
GRANT REFERENCES ON public.mentor_sessions TO authenticated;
GRANT SELECT ON public.mentor_sessions TO authenticated;
GRANT TRIGGER ON public.mentor_sessions TO authenticated;
GRANT TRUNCATE ON public.mentor_sessions TO authenticated;
GRANT UPDATE ON public.mentor_sessions TO authenticated;
GRANT DELETE ON public.mentor_sessions TO service_role;
GRANT INSERT ON public.mentor_sessions TO service_role;
GRANT REFERENCES ON public.mentor_sessions TO service_role;
GRANT SELECT ON public.mentor_sessions TO service_role;
GRANT TRIGGER ON public.mentor_sessions TO service_role;
GRANT TRUNCATE ON public.mentor_sessions TO service_role;
GRANT UPDATE ON public.mentor_sessions TO service_role;
GRANT DELETE ON public.mentor_teams TO anon;
GRANT INSERT ON public.mentor_teams TO anon;
GRANT REFERENCES ON public.mentor_teams TO anon;
GRANT SELECT ON public.mentor_teams TO anon;
GRANT TRIGGER ON public.mentor_teams TO anon;
GRANT TRUNCATE ON public.mentor_teams TO anon;
GRANT UPDATE ON public.mentor_teams TO anon;
GRANT DELETE ON public.mentor_teams TO authenticated;
GRANT INSERT ON public.mentor_teams TO authenticated;
GRANT REFERENCES ON public.mentor_teams TO authenticated;
GRANT SELECT ON public.mentor_teams TO authenticated;
GRANT TRIGGER ON public.mentor_teams TO authenticated;
GRANT TRUNCATE ON public.mentor_teams TO authenticated;
GRANT UPDATE ON public.mentor_teams TO authenticated;
GRANT DELETE ON public.mentor_teams TO service_role;
GRANT INSERT ON public.mentor_teams TO service_role;
GRANT REFERENCES ON public.mentor_teams TO service_role;
GRANT SELECT ON public.mentor_teams TO service_role;
GRANT TRIGGER ON public.mentor_teams TO service_role;
GRANT TRUNCATE ON public.mentor_teams TO service_role;
GRANT UPDATE ON public.mentor_teams TO service_role;
GRANT DELETE ON public.mentors TO anon;
GRANT INSERT ON public.mentors TO anon;
GRANT REFERENCES ON public.mentors TO anon;
GRANT TRIGGER ON public.mentors TO anon;
GRANT TRUNCATE ON public.mentors TO anon;
GRANT UPDATE ON public.mentors TO anon;
GRANT DELETE ON public.mentors TO authenticated;
GRANT INSERT ON public.mentors TO authenticated;
GRANT REFERENCES ON public.mentors TO authenticated;
GRANT TRIGGER ON public.mentors TO authenticated;
GRANT TRUNCATE ON public.mentors TO authenticated;
GRANT UPDATE ON public.mentors TO authenticated;
GRANT DELETE ON public.mentors TO service_role;
GRANT INSERT ON public.mentors TO service_role;
GRANT REFERENCES ON public.mentors TO service_role;
GRANT SELECT ON public.mentors TO service_role;
GRANT TRIGGER ON public.mentors TO service_role;
GRANT TRUNCATE ON public.mentors TO service_role;
GRANT UPDATE ON public.mentors TO service_role;
GRANT DELETE ON public.mp_payments TO anon;
GRANT INSERT ON public.mp_payments TO anon;
GRANT REFERENCES ON public.mp_payments TO anon;
GRANT SELECT ON public.mp_payments TO anon;
GRANT TRIGGER ON public.mp_payments TO anon;
GRANT TRUNCATE ON public.mp_payments TO anon;
GRANT UPDATE ON public.mp_payments TO anon;
GRANT DELETE ON public.mp_payments TO authenticated;
GRANT INSERT ON public.mp_payments TO authenticated;
GRANT REFERENCES ON public.mp_payments TO authenticated;
GRANT SELECT ON public.mp_payments TO authenticated;
GRANT TRIGGER ON public.mp_payments TO authenticated;
GRANT TRUNCATE ON public.mp_payments TO authenticated;
GRANT UPDATE ON public.mp_payments TO authenticated;
GRANT DELETE ON public.mp_payments TO service_role;
GRANT INSERT ON public.mp_payments TO service_role;
GRANT REFERENCES ON public.mp_payments TO service_role;
GRANT SELECT ON public.mp_payments TO service_role;
GRANT TRIGGER ON public.mp_payments TO service_role;
GRANT TRUNCATE ON public.mp_payments TO service_role;
GRANT UPDATE ON public.mp_payments TO service_role;
GRANT DELETE ON public.mp_sync_status TO anon;
GRANT INSERT ON public.mp_sync_status TO anon;
GRANT REFERENCES ON public.mp_sync_status TO anon;
GRANT SELECT ON public.mp_sync_status TO anon;
GRANT TRIGGER ON public.mp_sync_status TO anon;
GRANT TRUNCATE ON public.mp_sync_status TO anon;
GRANT UPDATE ON public.mp_sync_status TO anon;
GRANT DELETE ON public.mp_sync_status TO authenticated;
GRANT INSERT ON public.mp_sync_status TO authenticated;
GRANT REFERENCES ON public.mp_sync_status TO authenticated;
GRANT SELECT ON public.mp_sync_status TO authenticated;
GRANT TRIGGER ON public.mp_sync_status TO authenticated;
GRANT TRUNCATE ON public.mp_sync_status TO authenticated;
GRANT UPDATE ON public.mp_sync_status TO authenticated;
GRANT DELETE ON public.mp_sync_status TO service_role;
GRANT INSERT ON public.mp_sync_status TO service_role;
GRANT REFERENCES ON public.mp_sync_status TO service_role;
GRANT SELECT ON public.mp_sync_status TO service_role;
GRANT TRIGGER ON public.mp_sync_status TO service_role;
GRANT TRUNCATE ON public.mp_sync_status TO service_role;
GRANT UPDATE ON public.mp_sync_status TO service_role;
GRANT DELETE ON public.notification_recipients TO anon;
GRANT INSERT ON public.notification_recipients TO anon;
GRANT REFERENCES ON public.notification_recipients TO anon;
GRANT SELECT ON public.notification_recipients TO anon;
GRANT TRIGGER ON public.notification_recipients TO anon;
GRANT TRUNCATE ON public.notification_recipients TO anon;
GRANT UPDATE ON public.notification_recipients TO anon;
GRANT DELETE ON public.notification_recipients TO authenticated;
GRANT INSERT ON public.notification_recipients TO authenticated;
GRANT REFERENCES ON public.notification_recipients TO authenticated;
GRANT SELECT ON public.notification_recipients TO authenticated;
GRANT TRIGGER ON public.notification_recipients TO authenticated;
GRANT TRUNCATE ON public.notification_recipients TO authenticated;
GRANT UPDATE ON public.notification_recipients TO authenticated;
GRANT DELETE ON public.notification_recipients TO service_role;
GRANT INSERT ON public.notification_recipients TO service_role;
GRANT REFERENCES ON public.notification_recipients TO service_role;
GRANT SELECT ON public.notification_recipients TO service_role;
GRANT TRIGGER ON public.notification_recipients TO service_role;
GRANT TRUNCATE ON public.notification_recipients TO service_role;
GRANT UPDATE ON public.notification_recipients TO service_role;
GRANT DELETE ON public.notifications TO anon;
GRANT INSERT ON public.notifications TO anon;
GRANT REFERENCES ON public.notifications TO anon;
GRANT SELECT ON public.notifications TO anon;
GRANT TRIGGER ON public.notifications TO anon;
GRANT TRUNCATE ON public.notifications TO anon;
GRANT UPDATE ON public.notifications TO anon;
GRANT DELETE ON public.notifications TO authenticated;
GRANT INSERT ON public.notifications TO authenticated;
GRANT REFERENCES ON public.notifications TO authenticated;
GRANT SELECT ON public.notifications TO authenticated;
GRANT TRIGGER ON public.notifications TO authenticated;
GRANT TRUNCATE ON public.notifications TO authenticated;
GRANT UPDATE ON public.notifications TO authenticated;
GRANT DELETE ON public.notifications TO service_role;
GRANT INSERT ON public.notifications TO service_role;
GRANT REFERENCES ON public.notifications TO service_role;
GRANT SELECT ON public.notifications TO service_role;
GRANT TRIGGER ON public.notifications TO service_role;
GRANT TRUNCATE ON public.notifications TO service_role;
GRANT UPDATE ON public.notifications TO service_role;
GRANT DELETE ON public.pain_votes TO anon;
GRANT INSERT ON public.pain_votes TO anon;
GRANT REFERENCES ON public.pain_votes TO anon;
GRANT SELECT ON public.pain_votes TO anon;
GRANT TRIGGER ON public.pain_votes TO anon;
GRANT TRUNCATE ON public.pain_votes TO anon;
GRANT UPDATE ON public.pain_votes TO anon;
GRANT DELETE ON public.pain_votes TO authenticated;
GRANT INSERT ON public.pain_votes TO authenticated;
GRANT REFERENCES ON public.pain_votes TO authenticated;
GRANT SELECT ON public.pain_votes TO authenticated;
GRANT TRIGGER ON public.pain_votes TO authenticated;
GRANT TRUNCATE ON public.pain_votes TO authenticated;
GRANT UPDATE ON public.pain_votes TO authenticated;
GRANT DELETE ON public.pain_votes TO service_role;
GRANT INSERT ON public.pain_votes TO service_role;
GRANT REFERENCES ON public.pain_votes TO service_role;
GRANT SELECT ON public.pain_votes TO service_role;
GRANT TRIGGER ON public.pain_votes TO service_role;
GRANT TRUNCATE ON public.pain_votes TO service_role;
GRANT UPDATE ON public.pain_votes TO service_role;
GRANT DELETE ON public.pains TO anon;
GRANT INSERT ON public.pains TO anon;
GRANT REFERENCES ON public.pains TO anon;
GRANT SELECT ON public.pains TO anon;
GRANT TRIGGER ON public.pains TO anon;
GRANT TRUNCATE ON public.pains TO anon;
GRANT UPDATE ON public.pains TO anon;
GRANT DELETE ON public.pains TO authenticated;
GRANT INSERT ON public.pains TO authenticated;
GRANT REFERENCES ON public.pains TO authenticated;
GRANT SELECT ON public.pains TO authenticated;
GRANT TRIGGER ON public.pains TO authenticated;
GRANT TRUNCATE ON public.pains TO authenticated;
GRANT UPDATE ON public.pains TO authenticated;
GRANT DELETE ON public.pains TO service_role;
GRANT INSERT ON public.pains TO service_role;
GRANT REFERENCES ON public.pains TO service_role;
GRANT SELECT ON public.pains TO service_role;
GRANT TRIGGER ON public.pains TO service_role;
GRANT TRUNCATE ON public.pains TO service_role;
GRANT UPDATE ON public.pains TO service_role;
GRANT DELETE ON public.participant_sessions TO anon;
GRANT INSERT ON public.participant_sessions TO anon;
GRANT REFERENCES ON public.participant_sessions TO anon;
GRANT SELECT ON public.participant_sessions TO anon;
GRANT TRIGGER ON public.participant_sessions TO anon;
GRANT TRUNCATE ON public.participant_sessions TO anon;
GRANT UPDATE ON public.participant_sessions TO anon;
GRANT DELETE ON public.participant_sessions TO authenticated;
GRANT INSERT ON public.participant_sessions TO authenticated;
GRANT REFERENCES ON public.participant_sessions TO authenticated;
GRANT SELECT ON public.participant_sessions TO authenticated;
GRANT TRIGGER ON public.participant_sessions TO authenticated;
GRANT TRUNCATE ON public.participant_sessions TO authenticated;
GRANT UPDATE ON public.participant_sessions TO authenticated;
GRANT DELETE ON public.participant_sessions TO service_role;
GRANT INSERT ON public.participant_sessions TO service_role;
GRANT REFERENCES ON public.participant_sessions TO service_role;
GRANT SELECT ON public.participant_sessions TO service_role;
GRANT TRIGGER ON public.participant_sessions TO service_role;
GRANT TRUNCATE ON public.participant_sessions TO service_role;
GRANT UPDATE ON public.participant_sessions TO service_role;
GRANT DELETE ON public.pre_pitch_evaluations TO anon;
GRANT INSERT ON public.pre_pitch_evaluations TO anon;
GRANT REFERENCES ON public.pre_pitch_evaluations TO anon;
GRANT SELECT ON public.pre_pitch_evaluations TO anon;
GRANT TRIGGER ON public.pre_pitch_evaluations TO anon;
GRANT TRUNCATE ON public.pre_pitch_evaluations TO anon;
GRANT UPDATE ON public.pre_pitch_evaluations TO anon;
GRANT DELETE ON public.pre_pitch_evaluations TO authenticated;
GRANT INSERT ON public.pre_pitch_evaluations TO authenticated;
GRANT REFERENCES ON public.pre_pitch_evaluations TO authenticated;
GRANT SELECT ON public.pre_pitch_evaluations TO authenticated;
GRANT TRIGGER ON public.pre_pitch_evaluations TO authenticated;
GRANT TRUNCATE ON public.pre_pitch_evaluations TO authenticated;
GRANT UPDATE ON public.pre_pitch_evaluations TO authenticated;
GRANT DELETE ON public.pre_pitch_evaluations TO service_role;
GRANT INSERT ON public.pre_pitch_evaluations TO service_role;
GRANT REFERENCES ON public.pre_pitch_evaluations TO service_role;
GRANT SELECT ON public.pre_pitch_evaluations TO service_role;
GRANT TRIGGER ON public.pre_pitch_evaluations TO service_role;
GRANT TRUNCATE ON public.pre_pitch_evaluations TO service_role;
GRANT UPDATE ON public.pre_pitch_evaluations TO service_role;
GRANT DELETE ON public.prepitch_room_mentors TO anon;
GRANT INSERT ON public.prepitch_room_mentors TO anon;
GRANT REFERENCES ON public.prepitch_room_mentors TO anon;
GRANT SELECT ON public.prepitch_room_mentors TO anon;
GRANT TRIGGER ON public.prepitch_room_mentors TO anon;
GRANT TRUNCATE ON public.prepitch_room_mentors TO anon;
GRANT UPDATE ON public.prepitch_room_mentors TO anon;
GRANT DELETE ON public.prepitch_room_mentors TO authenticated;
GRANT INSERT ON public.prepitch_room_mentors TO authenticated;
GRANT REFERENCES ON public.prepitch_room_mentors TO authenticated;
GRANT SELECT ON public.prepitch_room_mentors TO authenticated;
GRANT TRIGGER ON public.prepitch_room_mentors TO authenticated;
GRANT TRUNCATE ON public.prepitch_room_mentors TO authenticated;
GRANT UPDATE ON public.prepitch_room_mentors TO authenticated;
GRANT DELETE ON public.prepitch_room_mentors TO service_role;
GRANT INSERT ON public.prepitch_room_mentors TO service_role;
GRANT REFERENCES ON public.prepitch_room_mentors TO service_role;
GRANT SELECT ON public.prepitch_room_mentors TO service_role;
GRANT TRIGGER ON public.prepitch_room_mentors TO service_role;
GRANT TRUNCATE ON public.prepitch_room_mentors TO service_role;
GRANT UPDATE ON public.prepitch_room_mentors TO service_role;
GRANT DELETE ON public.prepitch_room_teams TO anon;
GRANT INSERT ON public.prepitch_room_teams TO anon;
GRANT REFERENCES ON public.prepitch_room_teams TO anon;
GRANT SELECT ON public.prepitch_room_teams TO anon;
GRANT TRIGGER ON public.prepitch_room_teams TO anon;
GRANT TRUNCATE ON public.prepitch_room_teams TO anon;
GRANT UPDATE ON public.prepitch_room_teams TO anon;
GRANT DELETE ON public.prepitch_room_teams TO authenticated;
GRANT INSERT ON public.prepitch_room_teams TO authenticated;
GRANT REFERENCES ON public.prepitch_room_teams TO authenticated;
GRANT SELECT ON public.prepitch_room_teams TO authenticated;
GRANT TRIGGER ON public.prepitch_room_teams TO authenticated;
GRANT TRUNCATE ON public.prepitch_room_teams TO authenticated;
GRANT UPDATE ON public.prepitch_room_teams TO authenticated;
GRANT DELETE ON public.prepitch_room_teams TO service_role;
GRANT INSERT ON public.prepitch_room_teams TO service_role;
GRANT REFERENCES ON public.prepitch_room_teams TO service_role;
GRANT SELECT ON public.prepitch_room_teams TO service_role;
GRANT TRIGGER ON public.prepitch_room_teams TO service_role;
GRANT TRUNCATE ON public.prepitch_room_teams TO service_role;
GRANT UPDATE ON public.prepitch_room_teams TO service_role;
GRANT DELETE ON public.prepitch_rooms TO anon;
GRANT INSERT ON public.prepitch_rooms TO anon;
GRANT REFERENCES ON public.prepitch_rooms TO anon;
GRANT SELECT ON public.prepitch_rooms TO anon;
GRANT TRIGGER ON public.prepitch_rooms TO anon;
GRANT TRUNCATE ON public.prepitch_rooms TO anon;
GRANT UPDATE ON public.prepitch_rooms TO anon;
GRANT DELETE ON public.prepitch_rooms TO authenticated;
GRANT INSERT ON public.prepitch_rooms TO authenticated;
GRANT REFERENCES ON public.prepitch_rooms TO authenticated;
GRANT SELECT ON public.prepitch_rooms TO authenticated;
GRANT TRIGGER ON public.prepitch_rooms TO authenticated;
GRANT TRUNCATE ON public.prepitch_rooms TO authenticated;
GRANT UPDATE ON public.prepitch_rooms TO authenticated;
GRANT DELETE ON public.prepitch_rooms TO service_role;
GRANT INSERT ON public.prepitch_rooms TO service_role;
GRANT REFERENCES ON public.prepitch_rooms TO service_role;
GRANT SELECT ON public.prepitch_rooms TO service_role;
GRANT TRIGGER ON public.prepitch_rooms TO service_role;
GRANT TRUNCATE ON public.prepitch_rooms TO service_role;
GRANT UPDATE ON public.prepitch_rooms TO service_role;
GRANT DELETE ON public.push_subscriptions TO anon;
GRANT INSERT ON public.push_subscriptions TO anon;
GRANT REFERENCES ON public.push_subscriptions TO anon;
GRANT SELECT ON public.push_subscriptions TO anon;
GRANT TRIGGER ON public.push_subscriptions TO anon;
GRANT TRUNCATE ON public.push_subscriptions TO anon;
GRANT UPDATE ON public.push_subscriptions TO anon;
GRANT DELETE ON public.push_subscriptions TO authenticated;
GRANT INSERT ON public.push_subscriptions TO authenticated;
GRANT REFERENCES ON public.push_subscriptions TO authenticated;
GRANT SELECT ON public.push_subscriptions TO authenticated;
GRANT TRIGGER ON public.push_subscriptions TO authenticated;
GRANT TRUNCATE ON public.push_subscriptions TO authenticated;
GRANT UPDATE ON public.push_subscriptions TO authenticated;
GRANT DELETE ON public.push_subscriptions TO service_role;
GRANT INSERT ON public.push_subscriptions TO service_role;
GRANT REFERENCES ON public.push_subscriptions TO service_role;
GRANT SELECT ON public.push_subscriptions TO service_role;
GRANT TRIGGER ON public.push_subscriptions TO service_role;
GRANT TRUNCATE ON public.push_subscriptions TO service_role;
GRANT UPDATE ON public.push_subscriptions TO service_role;
GRANT DELETE ON public.rate_limits TO anon;
GRANT INSERT ON public.rate_limits TO anon;
GRANT REFERENCES ON public.rate_limits TO anon;
GRANT SELECT ON public.rate_limits TO anon;
GRANT TRIGGER ON public.rate_limits TO anon;
GRANT TRUNCATE ON public.rate_limits TO anon;
GRANT UPDATE ON public.rate_limits TO anon;
GRANT DELETE ON public.rate_limits TO authenticated;
GRANT INSERT ON public.rate_limits TO authenticated;
GRANT REFERENCES ON public.rate_limits TO authenticated;
GRANT SELECT ON public.rate_limits TO authenticated;
GRANT TRIGGER ON public.rate_limits TO authenticated;
GRANT TRUNCATE ON public.rate_limits TO authenticated;
GRANT UPDATE ON public.rate_limits TO authenticated;
GRANT DELETE ON public.rate_limits TO service_role;
GRANT INSERT ON public.rate_limits TO service_role;
GRANT REFERENCES ON public.rate_limits TO service_role;
GRANT SELECT ON public.rate_limits TO service_role;
GRANT TRIGGER ON public.rate_limits TO service_role;
GRANT TRUNCATE ON public.rate_limits TO service_role;
GRANT UPDATE ON public.rate_limits TO service_role;
GRANT DELETE ON public.registrations TO anon;
GRANT INSERT ON public.registrations TO anon;
GRANT REFERENCES ON public.registrations TO anon;
GRANT SELECT ON public.registrations TO anon;
GRANT TRIGGER ON public.registrations TO anon;
GRANT TRUNCATE ON public.registrations TO anon;
GRANT UPDATE ON public.registrations TO anon;
GRANT DELETE ON public.registrations TO authenticated;
GRANT INSERT ON public.registrations TO authenticated;
GRANT REFERENCES ON public.registrations TO authenticated;
GRANT SELECT ON public.registrations TO authenticated;
GRANT TRIGGER ON public.registrations TO authenticated;
GRANT TRUNCATE ON public.registrations TO authenticated;
GRANT UPDATE ON public.registrations TO authenticated;
GRANT DELETE ON public.registrations TO service_role;
GRANT INSERT ON public.registrations TO service_role;
GRANT REFERENCES ON public.registrations TO service_role;
GRANT SELECT ON public.registrations TO service_role;
GRANT TRIGGER ON public.registrations TO service_role;
GRANT TRUNCATE ON public.registrations TO service_role;
GRANT UPDATE ON public.registrations TO service_role;
GRANT DELETE ON public.resources TO anon;
GRANT INSERT ON public.resources TO anon;
GRANT REFERENCES ON public.resources TO anon;
GRANT SELECT ON public.resources TO anon;
GRANT TRIGGER ON public.resources TO anon;
GRANT TRUNCATE ON public.resources TO anon;
GRANT UPDATE ON public.resources TO anon;
GRANT DELETE ON public.resources TO authenticated;
GRANT INSERT ON public.resources TO authenticated;
GRANT REFERENCES ON public.resources TO authenticated;
GRANT SELECT ON public.resources TO authenticated;
GRANT TRIGGER ON public.resources TO authenticated;
GRANT TRUNCATE ON public.resources TO authenticated;
GRANT UPDATE ON public.resources TO authenticated;
GRANT DELETE ON public.resources TO service_role;
GRANT INSERT ON public.resources TO service_role;
GRANT REFERENCES ON public.resources TO service_role;
GRANT SELECT ON public.resources TO service_role;
GRANT TRIGGER ON public.resources TO service_role;
GRANT TRUNCATE ON public.resources TO service_role;
GRANT UPDATE ON public.resources TO service_role;
GRANT DELETE ON public.schedule_days TO anon;
GRANT INSERT ON public.schedule_days TO anon;
GRANT REFERENCES ON public.schedule_days TO anon;
GRANT SELECT ON public.schedule_days TO anon;
GRANT TRIGGER ON public.schedule_days TO anon;
GRANT TRUNCATE ON public.schedule_days TO anon;
GRANT UPDATE ON public.schedule_days TO anon;
GRANT DELETE ON public.schedule_days TO authenticated;
GRANT INSERT ON public.schedule_days TO authenticated;
GRANT REFERENCES ON public.schedule_days TO authenticated;
GRANT SELECT ON public.schedule_days TO authenticated;
GRANT TRIGGER ON public.schedule_days TO authenticated;
GRANT TRUNCATE ON public.schedule_days TO authenticated;
GRANT UPDATE ON public.schedule_days TO authenticated;
GRANT DELETE ON public.schedule_days TO service_role;
GRANT INSERT ON public.schedule_days TO service_role;
GRANT REFERENCES ON public.schedule_days TO service_role;
GRANT SELECT ON public.schedule_days TO service_role;
GRANT TRIGGER ON public.schedule_days TO service_role;
GRANT TRUNCATE ON public.schedule_days TO service_role;
GRANT UPDATE ON public.schedule_days TO service_role;
GRANT DELETE ON public.schedule_items TO anon;
GRANT INSERT ON public.schedule_items TO anon;
GRANT REFERENCES ON public.schedule_items TO anon;
GRANT SELECT ON public.schedule_items TO anon;
GRANT TRIGGER ON public.schedule_items TO anon;
GRANT TRUNCATE ON public.schedule_items TO anon;
GRANT UPDATE ON public.schedule_items TO anon;
GRANT DELETE ON public.schedule_items TO authenticated;
GRANT INSERT ON public.schedule_items TO authenticated;
GRANT REFERENCES ON public.schedule_items TO authenticated;
GRANT SELECT ON public.schedule_items TO authenticated;
GRANT TRIGGER ON public.schedule_items TO authenticated;
GRANT TRUNCATE ON public.schedule_items TO authenticated;
GRANT UPDATE ON public.schedule_items TO authenticated;
GRANT DELETE ON public.schedule_items TO service_role;
GRANT INSERT ON public.schedule_items TO service_role;
GRANT REFERENCES ON public.schedule_items TO service_role;
GRANT SELECT ON public.schedule_items TO service_role;
GRANT TRIGGER ON public.schedule_items TO service_role;
GRANT TRUNCATE ON public.schedule_items TO service_role;
GRANT UPDATE ON public.schedule_items TO service_role;
GRANT DELETE ON public.slides_config TO anon;
GRANT INSERT ON public.slides_config TO anon;
GRANT REFERENCES ON public.slides_config TO anon;
GRANT SELECT ON public.slides_config TO anon;
GRANT TRIGGER ON public.slides_config TO anon;
GRANT TRUNCATE ON public.slides_config TO anon;
GRANT UPDATE ON public.slides_config TO anon;
GRANT DELETE ON public.slides_config TO authenticated;
GRANT INSERT ON public.slides_config TO authenticated;
GRANT REFERENCES ON public.slides_config TO authenticated;
GRANT SELECT ON public.slides_config TO authenticated;
GRANT TRIGGER ON public.slides_config TO authenticated;
GRANT TRUNCATE ON public.slides_config TO authenticated;
GRANT UPDATE ON public.slides_config TO authenticated;
GRANT DELETE ON public.slides_config TO service_role;
GRANT INSERT ON public.slides_config TO service_role;
GRANT REFERENCES ON public.slides_config TO service_role;
GRANT SELECT ON public.slides_config TO service_role;
GRANT TRIGGER ON public.slides_config TO service_role;
GRANT TRUNCATE ON public.slides_config TO service_role;
GRANT UPDATE ON public.slides_config TO service_role;
GRANT DELETE ON public.sugar_cubes TO anon;
GRANT INSERT ON public.sugar_cubes TO anon;
GRANT REFERENCES ON public.sugar_cubes TO anon;
GRANT SELECT ON public.sugar_cubes TO anon;
GRANT TRIGGER ON public.sugar_cubes TO anon;
GRANT TRUNCATE ON public.sugar_cubes TO anon;
GRANT UPDATE ON public.sugar_cubes TO anon;
GRANT DELETE ON public.sugar_cubes TO authenticated;
GRANT INSERT ON public.sugar_cubes TO authenticated;
GRANT REFERENCES ON public.sugar_cubes TO authenticated;
GRANT SELECT ON public.sugar_cubes TO authenticated;
GRANT TRIGGER ON public.sugar_cubes TO authenticated;
GRANT TRUNCATE ON public.sugar_cubes TO authenticated;
GRANT UPDATE ON public.sugar_cubes TO authenticated;
GRANT DELETE ON public.sugar_cubes TO service_role;
GRANT INSERT ON public.sugar_cubes TO service_role;
GRANT REFERENCES ON public.sugar_cubes TO service_role;
GRANT SELECT ON public.sugar_cubes TO service_role;
GRANT TRIGGER ON public.sugar_cubes TO service_role;
GRANT TRUNCATE ON public.sugar_cubes TO service_role;
GRANT UPDATE ON public.sugar_cubes TO service_role;
GRANT DELETE ON public.team_deliverable_meta TO anon;
GRANT INSERT ON public.team_deliverable_meta TO anon;
GRANT REFERENCES ON public.team_deliverable_meta TO anon;
GRANT SELECT ON public.team_deliverable_meta TO anon;
GRANT TRIGGER ON public.team_deliverable_meta TO anon;
GRANT TRUNCATE ON public.team_deliverable_meta TO anon;
GRANT UPDATE ON public.team_deliverable_meta TO anon;
GRANT DELETE ON public.team_deliverable_meta TO authenticated;
GRANT INSERT ON public.team_deliverable_meta TO authenticated;
GRANT REFERENCES ON public.team_deliverable_meta TO authenticated;
GRANT SELECT ON public.team_deliverable_meta TO authenticated;
GRANT TRIGGER ON public.team_deliverable_meta TO authenticated;
GRANT TRUNCATE ON public.team_deliverable_meta TO authenticated;
GRANT UPDATE ON public.team_deliverable_meta TO authenticated;
GRANT DELETE ON public.team_deliverable_meta TO service_role;
GRANT INSERT ON public.team_deliverable_meta TO service_role;
GRANT REFERENCES ON public.team_deliverable_meta TO service_role;
GRANT SELECT ON public.team_deliverable_meta TO service_role;
GRANT TRIGGER ON public.team_deliverable_meta TO service_role;
GRANT TRUNCATE ON public.team_deliverable_meta TO service_role;
GRANT UPDATE ON public.team_deliverable_meta TO service_role;
GRANT DELETE ON public.team_evaluations TO anon;
GRANT INSERT ON public.team_evaluations TO anon;
GRANT REFERENCES ON public.team_evaluations TO anon;
GRANT SELECT ON public.team_evaluations TO anon;
GRANT TRIGGER ON public.team_evaluations TO anon;
GRANT TRUNCATE ON public.team_evaluations TO anon;
GRANT UPDATE ON public.team_evaluations TO anon;
GRANT DELETE ON public.team_evaluations TO authenticated;
GRANT INSERT ON public.team_evaluations TO authenticated;
GRANT REFERENCES ON public.team_evaluations TO authenticated;
GRANT SELECT ON public.team_evaluations TO authenticated;
GRANT TRIGGER ON public.team_evaluations TO authenticated;
GRANT TRUNCATE ON public.team_evaluations TO authenticated;
GRANT UPDATE ON public.team_evaluations TO authenticated;
GRANT DELETE ON public.team_evaluations TO service_role;
GRANT INSERT ON public.team_evaluations TO service_role;
GRANT REFERENCES ON public.team_evaluations TO service_role;
GRANT SELECT ON public.team_evaluations TO service_role;
GRANT TRIGGER ON public.team_evaluations TO service_role;
GRANT TRUNCATE ON public.team_evaluations TO service_role;
GRANT UPDATE ON public.team_evaluations TO service_role;
GRANT DELETE ON public.team_join_requests TO anon;
GRANT INSERT ON public.team_join_requests TO anon;
GRANT REFERENCES ON public.team_join_requests TO anon;
GRANT SELECT ON public.team_join_requests TO anon;
GRANT TRIGGER ON public.team_join_requests TO anon;
GRANT TRUNCATE ON public.team_join_requests TO anon;
GRANT UPDATE ON public.team_join_requests TO anon;
GRANT DELETE ON public.team_join_requests TO authenticated;
GRANT INSERT ON public.team_join_requests TO authenticated;
GRANT REFERENCES ON public.team_join_requests TO authenticated;
GRANT SELECT ON public.team_join_requests TO authenticated;
GRANT TRIGGER ON public.team_join_requests TO authenticated;
GRANT TRUNCATE ON public.team_join_requests TO authenticated;
GRANT UPDATE ON public.team_join_requests TO authenticated;
GRANT DELETE ON public.team_join_requests TO service_role;
GRANT INSERT ON public.team_join_requests TO service_role;
GRANT REFERENCES ON public.team_join_requests TO service_role;
GRANT SELECT ON public.team_join_requests TO service_role;
GRANT TRIGGER ON public.team_join_requests TO service_role;
GRANT TRUNCATE ON public.team_join_requests TO service_role;
GRANT UPDATE ON public.team_join_requests TO service_role;
GRANT DELETE ON public.teams TO anon;
GRANT INSERT ON public.teams TO anon;
GRANT REFERENCES ON public.teams TO anon;
GRANT SELECT ON public.teams TO anon;
GRANT TRIGGER ON public.teams TO anon;
GRANT TRUNCATE ON public.teams TO anon;
GRANT UPDATE ON public.teams TO anon;
GRANT DELETE ON public.teams TO authenticated;
GRANT INSERT ON public.teams TO authenticated;
GRANT REFERENCES ON public.teams TO authenticated;
GRANT SELECT ON public.teams TO authenticated;
GRANT TRIGGER ON public.teams TO authenticated;
GRANT TRUNCATE ON public.teams TO authenticated;
GRANT UPDATE ON public.teams TO authenticated;
GRANT DELETE ON public.teams TO service_role;
GRANT INSERT ON public.teams TO service_role;
GRANT REFERENCES ON public.teams TO service_role;
GRANT SELECT ON public.teams TO service_role;
GRANT TRIGGER ON public.teams TO service_role;
GRANT TRUNCATE ON public.teams TO service_role;
GRANT UPDATE ON public.teams TO service_role;
GRANT DELETE ON public.waitlist TO anon;
GRANT INSERT ON public.waitlist TO anon;
GRANT REFERENCES ON public.waitlist TO anon;
GRANT SELECT ON public.waitlist TO anon;
GRANT TRIGGER ON public.waitlist TO anon;
GRANT TRUNCATE ON public.waitlist TO anon;
GRANT UPDATE ON public.waitlist TO anon;
GRANT DELETE ON public.waitlist TO authenticated;
GRANT INSERT ON public.waitlist TO authenticated;
GRANT REFERENCES ON public.waitlist TO authenticated;
GRANT SELECT ON public.waitlist TO authenticated;
GRANT TRIGGER ON public.waitlist TO authenticated;
GRANT TRUNCATE ON public.waitlist TO authenticated;
GRANT UPDATE ON public.waitlist TO authenticated;
GRANT DELETE ON public.waitlist TO service_role;
GRANT INSERT ON public.waitlist TO service_role;
GRANT REFERENCES ON public.waitlist TO service_role;
GRANT SELECT ON public.waitlist TO service_role;
GRANT TRIGGER ON public.waitlist TO service_role;
GRANT TRUNCATE ON public.waitlist TO service_role;
GRANT UPDATE ON public.waitlist TO service_role;
GRANT DELETE ON public.wall_state TO anon;
GRANT INSERT ON public.wall_state TO anon;
GRANT REFERENCES ON public.wall_state TO anon;
GRANT SELECT ON public.wall_state TO anon;
GRANT TRIGGER ON public.wall_state TO anon;
GRANT TRUNCATE ON public.wall_state TO anon;
GRANT UPDATE ON public.wall_state TO anon;
GRANT DELETE ON public.wall_state TO authenticated;
GRANT INSERT ON public.wall_state TO authenticated;
GRANT REFERENCES ON public.wall_state TO authenticated;
GRANT SELECT ON public.wall_state TO authenticated;
GRANT TRIGGER ON public.wall_state TO authenticated;
GRANT TRUNCATE ON public.wall_state TO authenticated;
GRANT UPDATE ON public.wall_state TO authenticated;
GRANT DELETE ON public.wall_state TO service_role;
GRANT INSERT ON public.wall_state TO service_role;
GRANT REFERENCES ON public.wall_state TO service_role;
GRANT SELECT ON public.wall_state TO service_role;
GRANT TRIGGER ON public.wall_state TO service_role;
GRANT TRUNCATE ON public.wall_state TO service_role;
GRANT UPDATE ON public.wall_state TO service_role;
REVOKE ALL ON FUNCTION public.admin_create_grant(p_label text, p_role text, p_scope jsonb, p_expires_at timestamp with time zone, p_email text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_grants() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_jurors() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_mentors() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_notifications_history(p_limit integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_regenerate_grant_token(p_grant_id uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_revoke_grant(p_grant_id uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_grant_expiry(p_grant_id uuid, p_expires_at timestamp with time zone) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_teams_for_broadcast() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_tab(VARIADIC p_tabs text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.broadcast_notification(p_title text, p_body text, p_audience_kind text, p_team_ids uuid[], p_url text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clear_announcement() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_grant_ref() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_juror_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_mentor_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.event_eval_resolve(p_token uuid, p_type text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expand_recipients(p_notification_id uuid, p_audience jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_app_setting(p_key text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_event_evaluation_results() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_juror_idea_visible() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_mp_fee_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_notify_events() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_sugar_released() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_team_scores_visible() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_resolve(p_token text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_resolve_internal(p_token text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_checkin_staff() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_facilitator() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_wall_staff() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.juror_force_reload() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notifications_list_admin(p_limit integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notifications_list_mentor(p_token text, p_limit integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notifications_list_participant(p_token text, p_limit integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notifications_mark_read_admin(p_ids uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notifications_mark_read_mentor(p_token text, p_ids uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notifications_mark_read_participant(p_token text, p_ids uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_event(p_event_key text, p_title text, p_body text, p_url text, p_audience jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_schedule_start(p_item_id uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.push_subscribe_admin(p_endpoint text, p_p256dh text, p_auth text, p_ua text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.push_subscribe_mentor(p_token text, p_endpoint text, p_p256dh text, p_auth text, p_ua text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.push_subscribe_participant(p_token text, p_endpoint text, p_p256dh text, p_auth text, p_ua text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.push_unsubscribe(p_endpoint text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.scope_read_only() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.scope_tab_allowed(p_tab text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_announcement(p_body text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_checkin(p_id uuid, p_present boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_evaluation_open(p_open boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_juror_idea_visible(p_visible boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_notify_event(p_event_key text, p_on boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_slides_deadline(p_deadline timestamp with time zone) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_sugar_released(p_bool boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_team_lunch(p_team_id uuid, p_done boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_team_scores_visible(p_visible boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.slides_upload_allowed() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sugar_admin_list(p_status text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sugar_insert(p_sender_type text, p_sender_ref uuid, p_sender_name text, p_recipient_type text, p_recipient_ref uuid, p_message text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sugar_moderate(p_id uuid, p_status text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sugar_resolve_recipient(p_type text, p_ref uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sugar_roster_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sugar_send_org(p_recipient_type text, p_recipient_ref uuid, p_message text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sugar_send_participant(p_token uuid, p_recipient_type text, p_recipient_ref uuid, p_message text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wall_admin_add_pain(p_registration_id uuid, p_title text, p_description text, p_axis text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wall_admin_list() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wall_display_name(p_full_name text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wall_get_phase() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wall_hide_pain(p_id uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wall_require_confirmed(p_registration_id uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wall_resolve_token(p_token uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wall_set_phase(p_phase text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wall_unhide_pain(p_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_cancel_bulk_order(p_order_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cancel_bulk_order(p_order_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_bulk_order(p_order_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_cancel_voucher(p_voucher_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cancel_voucher(p_voucher_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_cancel_voucher(p_voucher_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_confirm_bulk_order(p_order_id uuid, p_payment_method text, p_payment_notes text) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_confirm_bulk_order(p_order_id uuid, p_payment_method text, p_payment_notes text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_confirm_bulk_order(p_order_id uuid, p_payment_method text, p_payment_notes text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_bulk_order(p_company_name text, p_cnpj text, p_contact_name text, p_contact_email text, p_contact_phone text, p_total_tickets integer, p_ticket_price integer, p_ticket_tier text, p_payment_method text, p_payment_notes text) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_create_bulk_order(p_company_name text, p_cnpj text, p_contact_name text, p_contact_email text, p_contact_phone text, p_total_tickets integer, p_ticket_price integer, p_ticket_tier text, p_payment_method text, p_payment_notes text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_bulk_order(p_company_name text, p_cnpj text, p_contact_name text, p_contact_email text, p_contact_phone text, p_total_tickets integer, p_ticket_price integer, p_ticket_tier text, p_payment_method text, p_payment_notes text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_grant(p_label text, p_role text, p_scope jsonb, p_expires_at timestamp with time zone, p_email text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_grant(p_label text, p_role text, p_scope jsonb, p_expires_at timestamp with time zone, p_email text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_grant(p_label text, p_role text, p_scope jsonb, p_expires_at timestamp with time zone, p_email text) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_create_mentor(p_email text, p_name text) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_create_mentor(p_email text, p_name text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_mentor(p_email text, p_name text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_bulk_order(p_order_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_get_bulk_order(p_order_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_bulk_order(p_order_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_bulk_orders() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_bulk_orders() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_bulk_orders() TO anon;
GRANT EXECUTE ON FUNCTION public.admin_list_grants() TO anon;
GRANT EXECUTE ON FUNCTION public.admin_list_grants() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_grants() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_jurors() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_jurors() TO anon;
GRANT EXECUTE ON FUNCTION public.admin_list_jurors() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_mentors() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_mentors() TO anon;
GRANT EXECUTE ON FUNCTION public.admin_list_mentors() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_notifications_history(p_limit integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_notifications_history(p_limit integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_promote_leader(p_team_name text, p_new_leader_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_promote_leader(p_team_name text, p_new_leader_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_promote_leader(p_team_name text, p_new_leader_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_regenerate_grant_token(p_grant_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_regenerate_grant_token(p_grant_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_regenerate_grant_token(p_grant_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_reset_mentor_code(p_mentor_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_mentor_code(p_mentor_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_mentor_code(p_mentor_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_revoke_grant(p_grant_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_grant(p_grant_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_grant(p_grant_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_grant_expiry(p_grant_id uuid, p_expires_at timestamp with time zone) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_grant_expiry(p_grant_id uuid, p_expires_at timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_grant_expiry(p_grant_id uuid, p_expires_at timestamp with time zone) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_teams_for_broadcast() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_teams_for_broadcast() TO service_role;
GRANT EXECUTE ON FUNCTION public.anonymize_user_data(p_email text) TO anon;
GRANT EXECUTE ON FUNCTION public.anonymize_user_data(p_email text) TO service_role;
GRANT EXECUTE ON FUNCTION public.anonymize_user_data(p_email text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_tab(VARIADIC p_tabs text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.assert_tab(VARIADIC p_tabs text[]) TO anon;
GRANT EXECUTE ON FUNCTION public.assert_tab(VARIADIC p_tabs text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.broadcast_notification(p_title text, p_body text, p_audience_kind text, p_team_ids uuid[], p_url text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.broadcast_notification(p_title text, p_body text, p_audience_kind text, p_team_ids uuid[], p_url text) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_write() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write() TO service_role;
GRANT EXECUTE ON FUNCTION public.can_write() TO anon;
GRANT EXECUTE ON FUNCTION public.cascade_team_rename() TO service_role;
GRANT EXECUTE ON FUNCTION public.cascade_team_rename() TO anon;
GRANT EXECUTE ON FUNCTION public.cascade_team_rename() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(p_key text, p_max_attempts integer, p_window_minutes integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(p_key text, p_max_attempts integer, p_window_minutes integer) TO anon;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(p_key text, p_max_attempts integer, p_window_minutes integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_team_size() TO anon;
GRANT EXECUTE ON FUNCTION public.check_team_size() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_team_size() TO service_role;
GRANT EXECUTE ON FUNCTION public.check_team_size_update() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_team_size_update() TO service_role;
GRANT EXECUTE ON FUNCTION public.check_team_size_update() TO anon;
GRANT EXECUTE ON FUNCTION public.claim_early_bird_slot(p_reg_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.claim_early_bird_slot(p_reg_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_announcement() TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_announcement() TO service_role;
GRANT EXECUTE ON FUNCTION public.current_grant_ref() TO service_role;
GRANT EXECUTE ON FUNCTION public.current_grant_ref() TO anon;
GRANT EXECUTE ON FUNCTION public.current_grant_ref() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_juror_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.current_juror_id() TO anon;
GRANT EXECUTE ON FUNCTION public.current_juror_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_mentor_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_mentor_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.current_mentor_id() TO anon;
GRANT EXECUTE ON FUNCTION public.enforce_anon_insert_defaults() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_anon_insert_defaults() TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_anon_insert_defaults() TO anon;
GRANT EXECUTE ON FUNCTION public.enforce_ticket_price() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_ticket_price() TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_ticket_price() TO anon;
GRANT EXECUTE ON FUNCTION public.event_eval_resolve(p_token uuid, p_type text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.event_eval_resolve(p_token uuid, p_type text) TO service_role;
GRANT EXECUTE ON FUNCTION public.event_eval_resolve(p_token uuid, p_type text) TO anon;
GRANT EXECUTE ON FUNCTION public.expand_recipients(p_notification_id uuid, p_audience jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expand_recipients(p_notification_id uuid, p_audience jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_voucher_code() TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_voucher_code() TO anon;
GRANT EXECUTE ON FUNCTION public.generate_voucher_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_announcement() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_announcement() TO anon;
GRANT EXECUTE ON FUNCTION public.get_active_announcement() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_app_setting(p_key text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_confirmed_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_confirmed_count() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_confirmed_count() TO anon;
GRANT EXECUTE ON FUNCTION public.get_early_bird_sold() TO anon;
GRANT EXECUTE ON FUNCTION public.get_early_bird_sold() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_early_bird_sold() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_evaluation_results() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_evaluation_results() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_juror_idea_visible() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_juror_idea_visible() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mp_fee_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mp_fee_summary() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_my_event_evaluation(p_token uuid, p_type text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_my_event_evaluation(p_token uuid, p_type text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_event_evaluation(p_token uuid, p_type text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_notify_events() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_notify_events() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_public_schedule() TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_schedule() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_schedule() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_slides_deadline() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_slides_deadline() TO anon;
GRANT EXECUTE ON FUNCTION public.get_slides_deadline() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_sugar_released() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sugar_released() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_team_phase_aliases() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_team_phase_aliases() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_phase_aliases() TO anon;
GRANT EXECUTE ON FUNCTION public.get_team_scores_visible() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_scores_visible() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_total_registration_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_total_registration_count() TO anon;
GRANT EXECUTE ON FUNCTION public.get_total_registration_count() TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_auth_kind(p_role text) TO anon;
GRANT EXECUTE ON FUNCTION public.grant_auth_kind(p_role text) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_auth_kind(p_role text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_resolve(p_token text) TO anon;
GRANT EXECUTE ON FUNCTION public.grant_resolve(p_token text) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_resolve(p_token text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_resolve_internal(p_token text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_resolve_internal(p_token text) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_resolve_internal(p_token text) TO anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;
GRANT EXECUTE ON FUNCTION public.is_admin_or_viewer() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_or_viewer() TO anon;
GRANT EXECUTE ON FUNCTION public.is_admin_or_viewer() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_checkin_staff() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_checkin_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_facilitator() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_facilitator() TO anon;
GRANT EXECUTE ON FUNCTION public.is_facilitator() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_wall_staff() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_wall_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.juror_accept_consent(p_token text) TO service_role;
GRANT EXECUTE ON FUNCTION public.juror_accept_consent(p_token text) TO anon;
GRANT EXECUTE ON FUNCTION public.juror_accept_consent(p_token text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.juror_force_reload() TO authenticated;
GRANT EXECUTE ON FUNCTION public.juror_force_reload() TO service_role;
GRANT EXECUTE ON FUNCTION public.juror_get_context(p_token text) TO anon;
GRANT EXECUTE ON FUNCTION public.juror_get_context(p_token text) TO service_role;
GRANT EXECUTE ON FUNCTION public.juror_get_context(p_token text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.juror_submit_score(p_token text, p_team_id uuid, p_scores jsonb, p_summary text, p_eliminated boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.juror_submit_score(p_token text, p_team_id uuid, p_scores jsonb, p_summary text, p_eliminated boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.juror_submit_score(p_token text, p_team_id uuid, p_scores jsonb, p_summary text, p_eliminated boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.juror_token_owner(p_token text) TO anon;
GRANT EXECUTE ON FUNCTION public.juror_token_owner(p_token text) TO service_role;
GRANT EXECUTE ON FUNCTION public.juror_token_owner(p_token text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_voucher(p_code text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_voucher(p_code text) TO service_role;
GRANT EXECUTE ON FUNCTION public.lookup_voucher(p_code text) TO anon;
GRANT EXECUTE ON FUNCTION public.mentor_delete_note(p_token text, p_note_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mentor_delete_note(p_token text, p_note_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mentor_delete_note(p_token text, p_note_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.mentor_get_me(p_token text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mentor_get_me(p_token text) TO anon;
GRANT EXECUTE ON FUNCTION public.mentor_get_me(p_token text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mentor_get_me_by_token(p_access_token text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mentor_get_me_by_token(p_access_token text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mentor_get_me_by_token(p_access_token text) TO anon;
GRANT EXECUTE ON FUNCTION public.mentor_login(p_email text, p_code text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mentor_login(p_email text, p_code text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mentor_login(p_email text, p_code text) TO anon;
GRANT EXECUTE ON FUNCTION public.mentor_logout(p_token text) TO anon;
GRANT EXECUTE ON FUNCTION public.mentor_logout(p_token text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mentor_logout(p_token text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mentor_prepitch_list(p_token text) TO anon;
GRANT EXECUTE ON FUNCTION public.mentor_prepitch_list(p_token text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mentor_prepitch_list(p_token text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mentor_prepitch_resolve(p_token text) TO anon;
GRANT EXECUTE ON FUNCTION public.mentor_prepitch_resolve(p_token text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mentor_prepitch_resolve(p_token text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mentor_prepitch_submit(p_token text, p_team_id uuid, p_round integer, p_scores jsonb, p_summary text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mentor_prepitch_submit(p_token text, p_team_id uuid, p_round integer, p_scores jsonb, p_summary text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mentor_prepitch_submit(p_token text, p_team_id uuid, p_round integer, p_scores jsonb, p_summary text) TO anon;
GRANT EXECUTE ON FUNCTION public.mentor_save_note(p_token text, p_phase text, p_body text, p_is_public boolean, p_note_id uuid, p_team_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mentor_save_note(p_token text, p_phase text, p_body text, p_is_public boolean, p_note_id uuid, p_team_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mentor_save_note(p_token text, p_phase text, p_body text, p_is_public boolean, p_note_id uuid, p_team_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.mentor_serialize_me(p_mentor_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mentor_serialize_me(p_mentor_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mentor_serialize_me(p_mentor_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.mentor_session_owner(p_token text) TO anon;
GRANT EXECUTE ON FUNCTION public.mentor_session_owner(p_token text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mentor_session_owner(p_token text) TO service_role;
GRANT EXECUTE ON FUNCTION public.my_scope() TO service_role;
GRANT EXECUTE ON FUNCTION public.my_scope() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_scope() TO anon;
GRANT EXECUTE ON FUNCTION public.notifications_list_admin(p_limit integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.notifications_list_admin(p_limit integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notifications_list_mentor(p_token text, p_limit integer) TO anon;
GRANT EXECUTE ON FUNCTION public.notifications_list_mentor(p_token text, p_limit integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.notifications_list_mentor(p_token text, p_limit integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notifications_list_participant(p_token text, p_limit integer) TO anon;
GRANT EXECUTE ON FUNCTION public.notifications_list_participant(p_token text, p_limit integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notifications_list_participant(p_token text, p_limit integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.notifications_mark_read_admin(p_ids uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.notifications_mark_read_admin(p_ids uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notifications_mark_read_mentor(p_token text, p_ids uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.notifications_mark_read_mentor(p_token text, p_ids uuid[]) TO anon;
GRANT EXECUTE ON FUNCTION public.notifications_mark_read_mentor(p_token text, p_ids uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notifications_mark_read_participant(p_token text, p_ids uuid[]) TO anon;
GRANT EXECUTE ON FUNCTION public.notifications_mark_read_participant(p_token text, p_ids uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notifications_mark_read_participant(p_token text, p_ids uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_event(p_event_key text, p_title text, p_body text, p_url text, p_audience jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_event(p_event_key text, p_title text, p_body text, p_url text, p_audience jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_schedule_start(p_item_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_schedule_start(p_item_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.participant_approve_request(p_token uuid, p_request_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.participant_approve_request(p_token uuid, p_request_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.participant_approve_request(p_token uuid, p_request_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.participant_cancel_request(p_token uuid, p_request_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.participant_cancel_request(p_token uuid, p_request_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.participant_cancel_request(p_token uuid, p_request_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.participant_create_team(p_token uuid, p_team_name text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.participant_create_team(p_token uuid, p_team_name text) TO service_role;
GRANT EXECUTE ON FUNCTION public.participant_create_team(p_token uuid, p_team_name text) TO anon;
GRANT EXECUTE ON FUNCTION public.participant_get_me(p_token uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.participant_get_me(p_token uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.participant_get_me(p_token uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.participant_get_team_scores(p_token uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.participant_get_team_scores(p_token uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.participant_get_team_scores(p_token uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.participant_leave_team(p_token uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.participant_leave_team(p_token uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.participant_leave_team(p_token uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.participant_list_resources(p_token uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.participant_list_resources(p_token uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.participant_list_resources(p_token uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.participant_list_teams(p_token uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.participant_list_teams(p_token uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.participant_list_teams(p_token uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.participant_login(p_email text, p_cpf text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.participant_login(p_email text, p_cpf text) TO service_role;
GRANT EXECUTE ON FUNCTION public.participant_login(p_email text, p_cpf text) TO anon;
GRANT EXECUTE ON FUNCTION public.participant_logout(p_token uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.participant_logout(p_token uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.participant_logout(p_token uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.participant_prepitch_feedback(p_token uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.participant_prepitch_feedback(p_token uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.participant_prepitch_feedback(p_token uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.participant_reject_request(p_token uuid, p_request_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.participant_reject_request(p_token uuid, p_request_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.participant_reject_request(p_token uuid, p_request_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.participant_request_join(p_token uuid, p_team_name text, p_message text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.participant_request_join(p_token uuid, p_team_name text, p_message text) TO service_role;
GRANT EXECUTE ON FUNCTION public.participant_request_join(p_token uuid, p_team_name text, p_message text) TO anon;
GRANT EXECUTE ON FUNCTION public.participant_save_team_deliverable(p_token uuid, p_field text, p_data jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.participant_save_team_deliverable(p_token uuid, p_field text, p_data jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.participant_save_team_deliverable(p_token uuid, p_field text, p_data jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.participant_session_owner(p_token uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.participant_session_owner(p_token uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.participant_session_owner(p_token uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.participant_session_owner_confirmed(p_token uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.participant_session_owner_confirmed(p_token uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.participant_session_owner_confirmed(p_token uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.participant_transfer_leadership(p_token uuid, p_new_leader_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.participant_transfer_leadership(p_token uuid, p_new_leader_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.participant_transfer_leadership(p_token uuid, p_new_leader_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.participant_update_profile(p_token uuid, p_phone text, p_linkedin_url text, p_dietary_restrictions text, p_is_pcd boolean, p_pcd_type text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.participant_update_profile(p_token uuid, p_phone text, p_linkedin_url text, p_dietary_restrictions text, p_is_pcd boolean, p_pcd_type text) TO anon;
GRANT EXECUTE ON FUNCTION public.participant_update_profile(p_token uuid, p_phone text, p_linkedin_url text, p_dietary_restrictions text, p_is_pcd boolean, p_pcd_type text) TO service_role;
GRANT EXECUTE ON FUNCTION public.participant_update_team(p_token uuid, p_team_name text, p_idea_description text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.participant_update_team(p_token uuid, p_team_name text, p_idea_description text) TO anon;
GRANT EXECUTE ON FUNCTION public.participant_update_team(p_token uuid, p_team_name text, p_idea_description text) TO service_role;
GRANT EXECUTE ON FUNCTION public.public_list_teams() TO anon;
GRANT EXECUTE ON FUNCTION public.public_list_teams() TO service_role;
GRANT EXECUTE ON FUNCTION public.public_list_teams() TO authenticated;
GRANT EXECUTE ON FUNCTION public.push_subscribe_admin(p_endpoint text, p_p256dh text, p_auth text, p_ua text) TO service_role;
GRANT EXECUTE ON FUNCTION public.push_subscribe_admin(p_endpoint text, p_p256dh text, p_auth text, p_ua text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.push_subscribe_admin(p_endpoint text, p_p256dh text, p_auth text, p_ua text) TO anon;
GRANT EXECUTE ON FUNCTION public.push_subscribe_mentor(p_token text, p_endpoint text, p_p256dh text, p_auth text, p_ua text) TO anon;
GRANT EXECUTE ON FUNCTION public.push_subscribe_mentor(p_token text, p_endpoint text, p_p256dh text, p_auth text, p_ua text) TO service_role;
GRANT EXECUTE ON FUNCTION public.push_subscribe_mentor(p_token text, p_endpoint text, p_p256dh text, p_auth text, p_ua text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.push_subscribe_participant(p_token text, p_endpoint text, p_p256dh text, p_auth text, p_ua text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.push_subscribe_participant(p_token text, p_endpoint text, p_p256dh text, p_auth text, p_ua text) TO service_role;
GRANT EXECUTE ON FUNCTION public.push_subscribe_participant(p_token text, p_endpoint text, p_p256dh text, p_auth text, p_ua text) TO anon;
GRANT EXECUTE ON FUNCTION public.push_unsubscribe(p_endpoint text) TO service_role;
GRANT EXECUTE ON FUNCTION public.push_unsubscribe(p_endpoint text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.push_unsubscribe(p_endpoint text) TO anon;
GRANT EXECUTE ON FUNCTION public.recover_pending_registration(p_email text) TO anon;
GRANT EXECUTE ON FUNCTION public.recover_pending_registration(p_email text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recover_pending_registration(p_email text) TO service_role;
GRANT EXECUTE ON FUNCTION public.redeem_voucher(p_code text, p_data jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.redeem_voucher(p_code text, p_data jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.redeem_voucher(p_code text, p_data jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.scope_read_only() TO authenticated;
GRANT EXECUTE ON FUNCTION public.scope_read_only() TO service_role;
GRANT EXECUTE ON FUNCTION public.scope_read_only() TO anon;
GRANT EXECUTE ON FUNCTION public.scope_tab_allowed(p_tab text) TO anon;
GRANT EXECUTE ON FUNCTION public.scope_tab_allowed(p_tab text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.scope_tab_allowed(p_tab text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_announcement(p_body text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_announcement(p_body text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_checkin(p_id uuid, p_present boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_checkin(p_id uuid, p_present boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_evaluation_open(p_open boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_evaluation_open(p_open boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_juror_idea_visible(p_visible boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_juror_idea_visible(p_visible boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_notify_event(p_event_key text, p_on boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_notify_event(p_event_key text, p_on boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_slides_deadline(p_deadline timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_slides_deadline(p_deadline timestamp with time zone) TO anon;
GRANT EXECUTE ON FUNCTION public.set_slides_deadline(p_deadline timestamp with time zone) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_sugar_released(p_bool boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_sugar_released(p_bool boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_team_lunch(p_team_id uuid, p_done boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_team_lunch(p_team_id uuid, p_done boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_team_phase_aliases(p_aliases jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_team_phase_aliases(p_aliases jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_team_phase_aliases(p_aliases jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.set_team_scores_visible(p_visible boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_team_scores_visible(p_visible boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.slides_upload_allowed() TO anon;
GRANT EXECUTE ON FUNCTION public.slides_upload_allowed() TO authenticated;
GRANT EXECUTE ON FUNCTION public.slides_upload_allowed() TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_event_evaluation(p_token uuid, p_type text, p_scores jsonb, p_comment text) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_event_evaluation(p_token uuid, p_type text, p_scores jsonb, p_comment text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_event_evaluation(p_token uuid, p_type text, p_scores jsonb, p_comment text) TO anon;
GRANT EXECUTE ON FUNCTION public.sugar_admin_list(p_status text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sugar_admin_list(p_status text) TO anon;
GRANT EXECUTE ON FUNCTION public.sugar_admin_list(p_status text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sugar_insert(p_sender_type text, p_sender_ref uuid, p_sender_name text, p_recipient_type text, p_recipient_ref uuid, p_message text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sugar_insert(p_sender_type text, p_sender_ref uuid, p_sender_name text, p_recipient_type text, p_recipient_ref uuid, p_message text) TO anon;
GRANT EXECUTE ON FUNCTION public.sugar_insert(p_sender_type text, p_sender_ref uuid, p_sender_name text, p_recipient_type text, p_recipient_ref uuid, p_message text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sugar_moderate(p_id uuid, p_status text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sugar_moderate(p_id uuid, p_status text) TO anon;
GRANT EXECUTE ON FUNCTION public.sugar_moderate(p_id uuid, p_status text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sugar_my_received_mentor(p_token text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sugar_my_received_mentor(p_token text) TO anon;
GRANT EXECUTE ON FUNCTION public.sugar_my_received_mentor(p_token text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sugar_my_received_participant(p_token uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sugar_my_received_participant(p_token uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sugar_my_received_participant(p_token uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.sugar_resolve_recipient(p_type text, p_ref uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.sugar_resolve_recipient(p_type text, p_ref uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sugar_resolve_recipient(p_type text, p_ref uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sugar_roster(p_participant_token uuid, p_mentor_token text) TO anon;
GRANT EXECUTE ON FUNCTION public.sugar_roster(p_participant_token uuid, p_mentor_token text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sugar_roster(p_participant_token uuid, p_mentor_token text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sugar_roster_admin() TO anon;
GRANT EXECUTE ON FUNCTION public.sugar_roster_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sugar_roster_admin() TO service_role;
GRANT EXECUTE ON FUNCTION public.sugar_send_mentor(p_token text, p_recipient_type text, p_recipient_ref uuid, p_message text) TO anon;
GRANT EXECUTE ON FUNCTION public.sugar_send_mentor(p_token text, p_recipient_type text, p_recipient_ref uuid, p_message text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sugar_send_mentor(p_token text, p_recipient_type text, p_recipient_ref uuid, p_message text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sugar_send_org(p_recipient_type text, p_recipient_ref uuid, p_message text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sugar_send_org(p_recipient_type text, p_recipient_ref uuid, p_message text) TO anon;
GRANT EXECUTE ON FUNCTION public.sugar_send_org(p_recipient_type text, p_recipient_ref uuid, p_message text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sugar_send_participant(p_token uuid, p_recipient_type text, p_recipient_ref uuid, p_message text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sugar_send_participant(p_token uuid, p_recipient_type text, p_recipient_ref uuid, p_message text) TO anon;
GRANT EXECUTE ON FUNCTION public.sugar_send_participant(p_token uuid, p_recipient_type text, p_recipient_ref uuid, p_message text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_registration_team_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_registration_team_id() TO anon;
GRANT EXECUTE ON FUNCTION public.sync_registration_team_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_ticket(p_from_id uuid, p_to_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.transfer_ticket(p_from_id uuid, p_to_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_ticket(p_from_id uuid, p_to_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.trg_notifications_send_push() TO authenticated;
GRANT EXECUTE ON FUNCTION public.trg_notifications_send_push() TO anon;
GRANT EXECUTE ON FUNCTION public.trg_notifications_send_push() TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_notify_mentor_assigned() TO anon;
GRANT EXECUTE ON FUNCTION public.trg_notify_mentor_assigned() TO authenticated;
GRANT EXECUTE ON FUNCTION public.trg_notify_mentor_assigned() TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_notify_payment_confirmed() TO anon;
GRANT EXECUTE ON FUNCTION public.trg_notify_payment_confirmed() TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_notify_payment_confirmed() TO authenticated;
GRANT EXECUTE ON FUNCTION public.wall_admin_add_pain(p_registration_id uuid, p_title text, p_description text, p_axis text) TO service_role;
GRANT EXECUTE ON FUNCTION public.wall_admin_add_pain(p_registration_id uuid, p_title text, p_description text, p_axis text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wall_admin_add_pain(p_registration_id uuid, p_title text, p_description text, p_axis text) TO anon;
GRANT EXECUTE ON FUNCTION public.wall_admin_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.wall_admin_list() TO anon;
GRANT EXECUTE ON FUNCTION public.wall_admin_list() TO service_role;
GRANT EXECUTE ON FUNCTION public.wall_display_name(p_full_name text) TO service_role;
GRANT EXECUTE ON FUNCTION public.wall_display_name(p_full_name text) TO anon;
GRANT EXECUTE ON FUNCTION public.wall_display_name(p_full_name text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wall_get_phase() TO anon;
GRANT EXECUTE ON FUNCTION public.wall_get_phase() TO service_role;
GRANT EXECUTE ON FUNCTION public.wall_get_phase() TO authenticated;
GRANT EXECUTE ON FUNCTION public.wall_hide_pain(p_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wall_hide_pain(p_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.wall_hide_pain(p_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.wall_identify(p_cpf text, p_birth_date date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wall_identify(p_cpf text, p_birth_date date) TO anon;
GRANT EXECUTE ON FUNCTION public.wall_identify(p_cpf text, p_birth_date date) TO service_role;
GRANT EXECUTE ON FUNCTION public.wall_list(p_token uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.wall_list(p_token uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.wall_list(p_token uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wall_require_confirmed(p_registration_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.wall_require_confirmed(p_registration_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wall_resolve_token(p_token uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.wall_resolve_token(p_token uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.wall_resolve_token(p_token uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wall_set_phase(p_phase text) TO anon;
GRANT EXECUTE ON FUNCTION public.wall_set_phase(p_phase text) TO service_role;
GRANT EXECUTE ON FUNCTION public.wall_set_phase(p_phase text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wall_submit_pain(p_token uuid, p_title text, p_description text, p_axis text) TO service_role;
GRANT EXECUTE ON FUNCTION public.wall_submit_pain(p_token uuid, p_title text, p_description text, p_axis text) TO anon;
GRANT EXECUTE ON FUNCTION public.wall_submit_pain(p_token uuid, p_title text, p_description text, p_axis text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wall_unhide_pain(p_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.wall_unhide_pain(p_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.wall_unhide_pain(p_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wall_unvote(p_token uuid, p_pain_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.wall_unvote(p_token uuid, p_pain_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wall_unvote(p_token uuid, p_pain_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.wall_vote(p_token uuid, p_pain_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.wall_vote(p_token uuid, p_pain_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wall_vote(p_token uuid, p_pain_id uuid) TO service_role;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('files', 'files', false, 52428800, NULL) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS deliverables_storage_admin_delete ON storage.objects;
CREATE POLICY deliverables_storage_admin_delete ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'files'::text) AND (name ~~ 'deliverables/%'::text) AND is_admin() AND (NOT scope_read_only())));

DROP POLICY IF EXISTS deliverables_storage_admin_insert ON storage.objects;
CREATE POLICY deliverables_storage_admin_insert ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'files'::text) AND (name ~~ 'deliverables/%'::text) AND is_admin() AND (NOT scope_read_only())));

DROP POLICY IF EXISTS deliverables_storage_admin_select ON storage.objects;
CREATE POLICY deliverables_storage_admin_select ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'files'::text) AND (name ~~ 'deliverables/%'::text) AND is_admin()));

DROP POLICY IF EXISTS resources_storage_admin_delete ON storage.objects;
CREATE POLICY resources_storage_admin_delete ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'files'::text) AND (name ~~ 'resources/%'::text) AND is_admin() AND (NOT scope_read_only())));

DROP POLICY IF EXISTS resources_storage_admin_insert ON storage.objects;
CREATE POLICY resources_storage_admin_insert ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'files'::text) AND (name ~~ 'resources/%'::text) AND is_admin() AND (NOT scope_read_only())));

DROP POLICY IF EXISTS resources_storage_admin_select ON storage.objects;
CREATE POLICY resources_storage_admin_select ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'files'::text) AND (name ~~ 'resources/%'::text) AND is_admin()));
-- Structural singletons the app code reads/updates by fixed id (non-upserting).
-- Neutral initial values only — NO event data.
INSERT INTO public.mp_sync_status (id, is_syncing) VALUES (1, false) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.wall_state (id, phase) VALUES (true, 'closed') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.slides_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
