-- ============================================================
-- SLIDES UPLOAD — entrega final do pitch como PDF (bucket privado)
-- ============================================================
-- O campo "Slides do pitch" da entrega final deixa de ser uma URL e
-- passa a ser UPLOAD de PDF. Os arquivos vivem no bucket privado
-- `files` sob o prefixo `deliverables/<team_id>/slides.pdf` (um por
-- equipe — o upload sobrescreve o anterior via upsert).
--
-- Fluxo:
--   * Participante (token custom, NÃO Supabase Auth) faz upload via
--     signed upload URL gerada pela edge function `team-slides`
--     (service role). Por isso NÃO há policy de INSERT para anon.
--   * O caminho final é gravado em teams.final_deliverables->slides_path
--     via a RPC participant_save_team_deliverable.
--   * Download: admin (authenticated) gera signed URL direto; participante
--     baixa via a edge function `team-slides` (action 'download-url').
--
-- A migration `add_resources.sql` cobre o prefixo `resources/`; esta
-- segue o mesmo molde para `deliverables/`.

-- ------------------------------------------------------------
-- 1. Limite de tamanho do bucket: 50MB (cobre todo o bucket `files`)
-- ------------------------------------------------------------
UPDATE storage.buckets SET file_size_limit = 52428800 WHERE id = 'files';

-- ------------------------------------------------------------
-- 2. Storage RLS — bucket `files`, prefixo `deliverables/`
-- ------------------------------------------------------------
-- Admin (authenticated, is_admin) pode SELECT/DELETE objetos sob o
-- prefixo deliverables/. O upload do participante é feito via signed
-- upload URL gerada pelo service role (ignora RLS), portanto NÃO há
-- policy de INSERT — anon nunca escreve direto no storage.

DROP POLICY IF EXISTS "deliverables_storage_admin_select" ON storage.objects;
CREATE POLICY "deliverables_storage_admin_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'files' AND name LIKE 'deliverables/%' AND is_admin());

DROP POLICY IF EXISTS "deliverables_storage_admin_delete" ON storage.objects;
CREATE POLICY "deliverables_storage_admin_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'files' AND name LIKE 'deliverables/%' AND is_admin());

-- A edge function team-slides chama participant_session_owner_confirmed
-- via service_role (grant já garantido em add_resources.sql; defensivo).
GRANT EXECUTE ON FUNCTION participant_session_owner_confirmed(UUID) TO service_role;
