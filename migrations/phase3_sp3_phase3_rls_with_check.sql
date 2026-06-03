-- SP3 Phase 3 — read_only enforcement on direct-PostgREST write paths (Choke point B).
-- The ~13 admin-direct-write tables + 4 storage write policies (of 6; the 2
-- SELECT storage policies stay broad) are written via
-- .from().insert/update/delete (bypassing the Phase-2 RPC guards), so RLS is the
-- only gate. Add `AND NOT public.scope_read_only()` to every admin/facilitator
-- WRITE policy's USING and WITH CHECK. DELETE has no WITH CHECK → the USING term
-- is what blocks a read_only DELETE; INSERT has no USING → WITH CHECK blocks it.
--
-- READS STAY BROAD (Option 2). Narrowing an ALL/USING policy also strips its
-- SELECT contribution, so we FIRST add SELECT policies mirroring each narrowed
-- policy's CURRENT USING verbatim, for tables whose narrowed policy was their only
-- SELECT source (jurors, resources, schedule_items [admin+facilitator],
-- schedule_days [admin]). RLS OR-semantics then keep reads working.
--
-- read_only ONLY (no tab terms) — scope_tab_allowed on direct writes is optional
-- (spec) and deferred to Phase 4 (the tab vocabulary is unreliable until then).
-- INVARIANT: scope_read_only() == false for {}/null/no-grant → no-op for legacy
-- admins. Zero grants have non-empty scope today → behavioral no-op on rollout.
-- team_evaluations write policy is standardized off its hardcoded
-- auth.jwt()->>'role'='admin' onto is_admin().

-- ===== mirror SELECT policies (preserve reads after narrowing) =====
DROP POLICY IF EXISTS "sp3_jurors_read" ON public.jurors;
CREATE POLICY "sp3_jurors_read" ON public.jurors FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "sp3_resources_read" ON public.resources;
CREATE POLICY "sp3_resources_read" ON public.resources FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "sp3_schedule_items_read_admin" ON public.schedule_items;
CREATE POLICY "sp3_schedule_items_read_admin" ON public.schedule_items FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "sp3_schedule_items_read_facilitator" ON public.schedule_items;
CREATE POLICY "sp3_schedule_items_read_facilitator" ON public.schedule_items FOR SELECT TO authenticated USING (is_facilitator());

DROP POLICY IF EXISTS "sp3_schedule_days_read_admin" ON public.schedule_days;
CREATE POLICY "sp3_schedule_days_read_admin" ON public.schedule_days FOR SELECT TO authenticated USING (is_admin());

-- ===== narrow write policies (read_only gate) =====
ALTER POLICY "Admin can manage jurors"              ON public.jurors                USING (is_admin() AND NOT public.scope_read_only()) WITH CHECK (is_admin() AND NOT public.scope_read_only());
ALTER POLICY "Admin can manage mentors"             ON public.mentors               USING (is_admin() AND NOT public.scope_read_only()) WITH CHECK (is_admin() AND NOT public.scope_read_only());
ALTER POLICY "Admin can manage mentor teams"        ON public.mentor_teams          USING (is_admin() AND NOT public.scope_read_only()) WITH CHECK (is_admin() AND NOT public.scope_read_only());
ALTER POLICY "Admin manages prepitch rooms"         ON public.prepitch_rooms        USING (is_admin() AND NOT public.scope_read_only()) WITH CHECK (is_admin() AND NOT public.scope_read_only());
ALTER POLICY "Admin manages prepitch room mentors"  ON public.prepitch_room_mentors USING (is_admin() AND NOT public.scope_read_only()) WITH CHECK (is_admin() AND NOT public.scope_read_only());
ALTER POLICY "Admin manages prepitch room teams"    ON public.prepitch_room_teams   USING (is_admin() AND NOT public.scope_read_only()) WITH CHECK (is_admin() AND NOT public.scope_read_only());
ALTER POLICY "resources_admin_all"                  ON public.resources             USING (is_admin() AND NOT public.scope_read_only()) WITH CHECK (is_admin() AND NOT public.scope_read_only());
ALTER POLICY "schedule_items_admin_all"             ON public.schedule_items        USING (is_admin() AND NOT public.scope_read_only()) WITH CHECK (is_admin() AND NOT public.scope_read_only());
ALTER POLICY "Facilitator manages schedule_items"   ON public.schedule_items        USING (is_facilitator() AND NOT public.scope_read_only()) WITH CHECK (is_facilitator() AND NOT public.scope_read_only());
ALTER POLICY "schedule_days_admin_all"              ON public.schedule_days         USING (is_admin() AND NOT public.scope_read_only()) WITH CHECK (is_admin() AND NOT public.scope_read_only());
ALTER POLICY "Facilitator updates schedule_days"    ON public.schedule_days         USING (is_facilitator() AND NOT public.scope_read_only()) WITH CHECK (is_facilitator() AND NOT public.scope_read_only());
ALTER POLICY "Admin can update registrations"       ON public.registrations         USING (is_admin() AND NOT public.scope_read_only()) WITH CHECK (is_admin() AND NOT public.scope_read_only());
ALTER POLICY "Admin can insert teams"               ON public.teams                 WITH CHECK (is_admin() AND NOT public.scope_read_only());
ALTER POLICY "Admin can update teams"               ON public.teams                 USING (is_admin() AND NOT public.scope_read_only()) WITH CHECK (is_admin() AND NOT public.scope_read_only());
ALTER POLICY "Admin can update team join requests"  ON public.team_join_requests    USING (is_admin() AND NOT public.scope_read_only()) WITH CHECK (is_admin() AND NOT public.scope_read_only());
-- team_evaluations: standardize off hardcoded auth.jwt()->>'role'='admin' onto is_admin()
ALTER POLICY "Admin write team evaluations"         ON public.team_evaluations      USING (is_admin() AND NOT public.scope_read_only()) WITH CHECK (is_admin() AND NOT public.scope_read_only());

-- ===== storage.objects (deliverables_/resources_ insert+delete) =====
ALTER POLICY "deliverables_storage_admin_insert" ON storage.objects WITH CHECK ((bucket_id = 'files'::text) AND (name ~~ 'deliverables/%'::text) AND is_admin() AND NOT public.scope_read_only());
ALTER POLICY "deliverables_storage_admin_delete" ON storage.objects USING ((bucket_id = 'files'::text) AND (name ~~ 'deliverables/%'::text) AND is_admin() AND NOT public.scope_read_only());
ALTER POLICY "resources_storage_admin_insert"    ON storage.objects WITH CHECK ((bucket_id = 'files'::text) AND (name ~~ 'resources/%'::text) AND is_admin() AND NOT public.scope_read_only());
ALTER POLICY "resources_storage_admin_delete"    ON storage.objects USING ((bucket_id = 'files'::text) AND (name ~~ 'resources/%'::text) AND is_admin() AND NOT public.scope_read_only());
