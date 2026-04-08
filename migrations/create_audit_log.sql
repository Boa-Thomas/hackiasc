CREATE TABLE IF NOT EXISTS audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  action TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('public','admin','system')),
  actor_email TEXT,
  target_table TEXT,
  target_id UUID,
  target_email TEXT,
  old_data JSONB,
  new_data JSONB,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_target_id ON audit_log(target_id);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow audit log insert" ON audit_log FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow auth audit log insert" ON audit_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admin can read audit log" ON audit_log FOR SELECT TO authenticated USING (true);
