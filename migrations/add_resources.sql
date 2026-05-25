-- ============================================================
-- RESOURCES — materiais para participantes confirmados
-- ============================================================
-- Materiais (PDFs, slides, etc.) que o admin disponibiliza aos
-- participantes com pagamento confirmado. Os arquivos vivem no
-- bucket privado `files` sob o prefixo `resources/`. Participantes
-- nunca leem a tabela diretamente: listam via RPC SECURITY DEFINER
-- e baixam via edge function (resource-download) que gera signed URL.

CREATE TABLE IF NOT EXISTS resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  file_path TEXT NOT NULL,           -- caminho no bucket `files` (ex: resources/<uuid>.pdf)
  file_name TEXT,                    -- nome original p/ exibição
  content_type TEXT,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID                    -- auth.uid() do admin que enviou
);

ALTER TABLE resources ENABLE ROW LEVEL SECURITY;

-- RLS: somente admin (authenticated) tem acesso total. Sem SELECT público:
-- o participante acessa via participant_list_resources (RPC) + edge function.
DROP POLICY IF EXISTS "resources_admin_all" ON resources;
CREATE POLICY "resources_admin_all"
  ON resources FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ------------------------------------------------------------
-- RPC: participante confirmado lista os recursos (SEM URL)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION participant_list_resources(p_token UUID)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  file_name TEXT,
  content_type TEXT,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Valida sessão + pagamento confirmado. Lança exceção se inválido.
  PERFORM participant_session_owner_confirmed(p_token);

  RETURN QUERY
    SELECT r.id, r.title, r.description, r.file_name, r.content_type, r.size_bytes, r.created_at
    FROM resources r
    ORDER BY r.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION participant_list_resources(UUID) TO anon;

-- A edge function resource-download chama participant_session_owner_confirmed
-- via service_role. Garante o grant explícito (defensivo — service_role já é
-- membro de PUBLIC, mas torna a dependência explícita).
GRANT EXECUTE ON FUNCTION participant_session_owner_confirmed(UUID) TO service_role;

-- ============================================================
-- STORAGE RLS — bucket `files`, prefixo `resources/`
-- ============================================================
-- Admin (authenticated) pode INSERT/SELECT/DELETE objetos do bucket
-- `files` sob o prefixo resources/. O participante NÃO recebe policy:
-- a edge function usa service role e ignora RLS para gerar signed URLs.

DROP POLICY IF EXISTS "resources_storage_admin_insert" ON storage.objects;
CREATE POLICY "resources_storage_admin_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'files' AND name LIKE 'resources/%' AND is_admin());

DROP POLICY IF EXISTS "resources_storage_admin_select" ON storage.objects;
CREATE POLICY "resources_storage_admin_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'files' AND name LIKE 'resources/%' AND is_admin());

DROP POLICY IF EXISTS "resources_storage_admin_delete" ON storage.objects;
CREATE POLICY "resources_storage_admin_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'files' AND name LIKE 'resources/%' AND is_admin());
