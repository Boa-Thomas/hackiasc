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
