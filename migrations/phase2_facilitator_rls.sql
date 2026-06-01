-- Facilitator read/write scoped to exactly what FacilitatorPanel needs.
-- Additive permissive policies (OR'd with existing admin policies) — no existing
-- policy is altered.

-- schedule_items: full CRUD (advance/toggle/edit/reorder/add/remove)
DROP POLICY IF EXISTS "Facilitator manages schedule_items" ON schedule_items;
CREATE POLICY "Facilitator manages schedule_items" ON schedule_items
  FOR ALL TO authenticated USING (is_facilitator()) WITH CHECK (is_facilitator());

-- schedule_days: read + update (window/note)
DROP POLICY IF EXISTS "Facilitator reads schedule_days" ON schedule_days;
CREATE POLICY "Facilitator reads schedule_days" ON schedule_days
  FOR SELECT TO authenticated USING (is_facilitator());
DROP POLICY IF EXISTS "Facilitator updates schedule_days" ON schedule_days;
CREATE POLICY "Facilitator updates schedule_days" ON schedule_days
  FOR UPDATE TO authenticated USING (is_facilitator()) WITH CHECK (is_facilitator());

-- announcements: read (writes go through SECURITY DEFINER RPCs)
DROP POLICY IF EXISTS "Facilitator reads announcements" ON announcements;
CREATE POLICY "Facilitator reads announcements" ON announcements
  FOR SELECT TO authenticated USING (is_facilitator());

-- registrations: read only (pulse: status/check-in)
DROP POLICY IF EXISTS "Facilitator reads registrations" ON registrations;
CREATE POLICY "Facilitator reads registrations" ON registrations
  FOR SELECT TO authenticated USING (is_facilitator());

-- teams: read only (deliverable completion + name)
DROP POLICY IF EXISTS "Facilitator reads teams" ON teams;
CREATE POLICY "Facilitator reads teams" ON teams
  FOR SELECT TO authenticated USING (is_facilitator());
