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
