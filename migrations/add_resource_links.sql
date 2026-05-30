-- ============================================================
-- RESOURCES — recurso pode ser ARQUIVO ou LINK
-- ============================================================
-- Antes, todo recurso exigia upload de arquivo (file_path NOT NULL).
-- Agora o admin pode cadastrar um LINK: uma URL + um texto livre
-- opcional (body), sem subir arquivo. Regra: exatamente UM de
-- file_path / url por recurso.

ALTER TABLE resources ALTER COLUMN file_path DROP NOT NULL;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS url TEXT;   -- recurso do tipo link
ALTER TABLE resources ADD COLUMN IF NOT EXISTS body TEXT;  -- texto livre opcional do link

ALTER TABLE resources DROP CONSTRAINT IF EXISTS resources_file_xor_link;
ALTER TABLE resources ADD CONSTRAINT resources_file_xor_link
  CHECK ((file_path IS NOT NULL) <> (url IS NOT NULL));

-- ------------------------------------------------------------
-- RPC: agora também retorna url e body (return type mudou -> DROP antes)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS participant_list_resources(UUID);
CREATE OR REPLACE FUNCTION participant_list_resources(p_token UUID)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  url TEXT,
  body TEXT,
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
    SELECT r.id, r.title, r.description, r.url, r.body, r.file_name, r.content_type, r.size_bytes, r.created_at
    FROM resources r
    ORDER BY r.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION participant_list_resources(UUID) TO anon;
