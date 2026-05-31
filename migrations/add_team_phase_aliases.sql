-- Apelidos de equipe editaveis (feature de fase das equipes / Supabase externo).
-- ADITIVO: cria 2 funcoes + seed em app_settings. Nao altera objetos existentes.

INSERT INTO app_settings (key, value, updated_at)
VALUES (
  'team_phase_aliases',
  '[{"external":"byAItas","hackia":"bAItas"},{"external":"EasyAI IT Company","hackia":"EasyIA IT Company"}]',
  now()
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_team_phase_aliases()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT value::jsonb FROM app_settings WHERE key = 'team_phase_aliases'),
    '[]'::jsonb
  );
$function$;

CREATE OR REPLACE FUNCTION public.set_team_phase_aliases(p_aliases jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  el jsonb;
  ext text;
  hk text;
  cleaned jsonb := '[]'::jsonb;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF jsonb_typeof(p_aliases) <> 'array' THEN RAISE EXCEPTION 'invalid_payload'; END IF;
  IF jsonb_array_length(p_aliases) > 200 THEN RAISE EXCEPTION 'too_many'; END IF;

  FOR el IN SELECT * FROM jsonb_array_elements(p_aliases)
  LOOP
    ext := btrim(COALESCE(el->>'external', ''));
    hk  := btrim(COALESCE(el->>'hackia', ''));
    IF ext <> '' AND hk <> '' THEN
      cleaned := cleaned || jsonb_build_object('external', ext, 'hackia', hk);
    END IF;
  END LOOP;

  INSERT INTO app_settings (key, value, updated_at)
  VALUES ('team_phase_aliases', cleaned::text, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  RETURN cleaned;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_team_phase_aliases() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_team_phase_aliases(jsonb) TO authenticated;
