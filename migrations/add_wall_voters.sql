-- ============================================================
-- add_wall_voters.sql — votantes por ideia (telao + admin) e
-- cadastro de dor por participante via admin.
-- Idempotente (CREATE OR REPLACE). NAO dropa tabelas. Aplicar via MCP.
-- ============================================================

-- Helper: nome curto para exibicao publica (telao). "Ana Maria Silva" -> "Ana S.".
-- Nome de uma palavra so -> retorna so o primeiro nome. Usado SO no nivel publico.
CREATE OR REPLACE FUNCTION wall_display_name(p_full_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
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
$$;
REVOKE ALL ON FUNCTION wall_display_name(TEXT) FROM PUBLIC;

-- wall_list estendido: telao (p_registration_id IS NULL) recebe `voters`
-- (nome curto). Participante (id nao-nulo) NAO recebe voters (payload enxuto).
CREATE OR REPLACE FUNCTION wall_list(p_registration_id UUID DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_phase      TEXT;
  v_pains      JSON;
  v_my_votes   JSON;
  v_votes_used INTEGER := 0;
BEGIN
  SELECT phase INTO v_phase FROM wall_state WHERE id = true;

  SELECT json_agg(p ORDER BY p.vote_count DESC, p.created_at)
  INTO v_pains
  FROM (
    SELECT
      pn.id,
      pn.title,
      pn.description,
      pn.author_name,
      pn.axis,
      pn.created_at,
      COUNT(pv.id)::INTEGER AS vote_count,
      CASE WHEN p_registration_id IS NULL THEN (
        SELECT COALESCE(
          json_agg(
            json_build_object('display', wall_display_name(r.full_name))
            ORDER BY r.full_name
          ), '[]'::json)
        FROM pain_votes pv2
        JOIN registrations r ON r.id = pv2.registration_id
        WHERE pv2.pain_id = pn.id
      ) ELSE '[]'::json END AS voters
    FROM pains pn
    LEFT JOIN pain_votes pv ON pv.pain_id = pn.id
    WHERE pn.status = 'visible'
    GROUP BY pn.id
  ) p;

  IF p_registration_id IS NOT NULL THEN
    SELECT json_agg(pain_id), COUNT(*)::INTEGER
    INTO v_my_votes, v_votes_used
    FROM pain_votes WHERE registration_id = p_registration_id;
  END IF;

  RETURN json_build_object(
    'phase', v_phase,
    'pains', COALESCE(v_pains, '[]'::JSON),
    'my_votes', COALESCE(v_my_votes, '[]'::JSON),
    'votos_restantes', GREATEST(3 - v_votes_used, 0)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION wall_list(UUID) TO anon;

-- wall_admin_list estendido: cada pain recebe `voters` com nome + contato.
CREATE OR REPLACE FUNCTION wall_admin_list()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_phase TEXT;
  v_pains JSON;
BEGIN
  IF NOT is_admin_or_viewer() THEN
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
$$;
REVOKE ALL ON FUNCTION wall_admin_list() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wall_admin_list() TO authenticated;

-- Admin cadastra dor em nome de um participante confirmado. So em wall_open.
-- Sem o cap de 5 dores/throttle do fluxo publico: e ajuda manual da organizacao.
CREATE OR REPLACE FUNCTION wall_admin_add_pain(
  p_registration_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_axis TEXT
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phase TEXT;
  v_name  TEXT;
  v_title TEXT;
  v_pain  pains;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

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
$$;
REVOKE ALL ON FUNCTION wall_admin_add_pain(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wall_admin_add_pain(UUID, TEXT, TEXT, TEXT) TO authenticated;
