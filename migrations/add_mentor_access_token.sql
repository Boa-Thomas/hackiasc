-- ============================================================
-- MIGRACAO: Acesso do mentor por LINK SECRETO (token na URL)
-- ============================================================
-- Aplique no Supabase SQL Editor de um banco JA POPULADO.
-- Idempotente (IF NOT EXISTS / CREATE OR REPLACE / UPDATE ... WHERE NULL).
--
-- Objetivo: permitir que o mentor acesse o painel por link secreto
-- (#mentor?t=<uuid>), igual aos jurados, SEM digitar email + codigo.
-- O fluxo existente (mentor_login email+codigo + mentor_sessions) NAO e tocado:
-- esta migracao e ADITIVA.
--
-- Estrategia: o `mentor_get_me` atual resolve o mentor_id (via session token)
-- e serializa o JSON. Extraimos a SERIALIZACAO para um helper interno que recebe
-- o mentor_id, e fazemos AMBOS os RPCs (por session token e por access_token)
-- reusarem exatamente o mesmo retorno.

-- 1) Coluna access_token em mentors -------------------------------------------
ALTER TABLE mentors
  ADD COLUMN IF NOT EXISTS access_token UUID UNIQUE DEFAULT gen_random_uuid();

-- Backfill explicito (cinto-e-suspensorio): o DEFAULT volatil ja preenche as
-- linhas existentes no ALTER, mas garantimos que nenhuma fique NULL.
UPDATE mentors SET access_token = gen_random_uuid() WHERE access_token IS NULL;

-- 2) mentor_session_owner: aceita session token (email+codigo) OU access_token --
-- Override aditivo: primeiro tenta o caminho original (mentor_sessions, com
-- refresh de last_used_at). Se nao achar, faz fallback para o access_token do
-- link secreto. Assim, mentor_save_note / mentor_delete_note (que validam via
-- mentor_session_owner) passam a funcionar tambem no modo link, SEM alterar seus
-- corpos. O contrato de erro (RAISE 'invalid_or_expired_session') e preservado.
CREATE OR REPLACE FUNCTION mentor_session_owner(p_token UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  -- 1) Sessao por email+codigo (comportamento original)
  SELECT mentor_id INTO v_id FROM mentor_sessions
  WHERE token = p_token AND expires_at > now() LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE mentor_sessions SET last_used_at = now() WHERE token = p_token;
    RETURN v_id;
  END IF;
  -- 2) Fallback: link secreto (access_token em mentors)
  SELECT id INTO v_id FROM mentors WHERE access_token = p_token LIMIT 1;
  IF v_id IS NULL THEN RAISE EXCEPTION 'invalid_or_expired_session'; END IF;
  RETURN v_id;
END; $$;

-- 3) Helper interno de serializacao: dados do mentor + equipe pareada + notas --
-- Replica EXATAMENTE o retorno do mentor_get_me original, agora parametrizado
-- pelo mentor_id (resolvido por qualquer um dos dois caminhos de auth).
CREATE OR REPLACE FUNCTION mentor_serialize_me(p_mentor_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_mentor RECORD;
  v_team JSON;
BEGIN
  SELECT id, name, email, team_id INTO v_mentor FROM mentors WHERE id = p_mentor_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_mentor.team_id IS NOT NULL THEN
    SELECT json_build_object(
      'id', t.id, 'name', t.name,
      'hypotheses_canvas', t.hypotheses_canvas,
      'slc_ia_canvas', t.slc_ia_canvas,
      'learning_diary', t.learning_diary,
      'final_deliverables', t.final_deliverables,
      'updated_at', t.updated_at,
      'updated_by_name', (SELECT full_name FROM registrations WHERE id = t.updated_by),
      'members', COALESCE((
        SELECT json_agg(json_build_object(
          'full_name', r.full_name, 'email', r.email,
          'is_team_leader', r.is_team_leader, 'occupation_type', r.occupation_type,
          'is_remote', r.is_remote
        ) ORDER BY r.is_team_leader DESC, r.created_at)
        FROM registrations r
        WHERE r.team_id = t.id AND r.payment_status <> 'cancelled'
      ), '[]'::json)
    ) INTO v_team
    FROM teams t WHERE t.id = v_mentor.team_id;
  ELSE
    v_team := NULL;
  END IF;

  RETURN json_build_object(
    'mentor', json_build_object(
      'id', v_mentor.id, 'name', v_mentor.name,
      'email', v_mentor.email, 'team_id', v_mentor.team_id
    ),
    'team', v_team,
    'notes', COALESCE((
      SELECT json_agg(json_build_object(
        'id', n.id, 'phase', n.phase, 'body', n.body,
        'is_public', n.is_public, 'updated_at', n.updated_at
      ) ORDER BY n.created_at)
      FROM mentor_notes n WHERE n.team_id = v_mentor.team_id AND n.mentor_id = p_mentor_id
    ), '[]'::json)
  );
END; $$;

-- 4) mentor_get_me (session token email+codigo) — agora delega ao serializer ---
-- Comportamento preservado: valida a sessao via mentor_session_owner (que faz
-- RAISE em token invalido/expirado) e refresca last_used_at.
CREATE OR REPLACE FUNCTION mentor_get_me(p_token UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_mentor_id UUID;
BEGIN
  v_mentor_id := mentor_session_owner(p_token);
  RETURN mentor_serialize_me(v_mentor_id);
END; $$;

GRANT EXECUTE ON FUNCTION mentor_get_me(UUID) TO anon;

-- 5) mentor_get_me_by_token (acesso por LINK secreto) --------------------------
-- Resolve o mentor pelo access_token. Para um link publico, retornamos NULL em
-- token invalido (em vez de RAISE) — evita ruido de excecao em scans e espelha
-- o padrao do juror_get_context. O frontend ja trata `rpcError || !data`.
CREATE OR REPLACE FUNCTION mentor_get_me_by_token(p_access_token UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_mentor_id UUID;
BEGIN
  IF p_access_token IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO v_mentor_id FROM mentors WHERE access_token = p_access_token LIMIT 1;
  IF v_mentor_id IS NULL THEN RETURN NULL; END IF;
  RETURN mentor_serialize_me(v_mentor_id);
END; $$;

GRANT EXECUTE ON FUNCTION mentor_get_me_by_token(UUID) TO anon;
