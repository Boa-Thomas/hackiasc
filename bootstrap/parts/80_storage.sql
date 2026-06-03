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
