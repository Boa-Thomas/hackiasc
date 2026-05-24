-- ============================================================
-- MIGRACAO: Hardening de segurança das RPCs de jurados + muro de dores
-- ============================================================
-- Fecha warnings do advisor para as funções criadas em
-- add_jurors_scorecard.sql e add_pain_wall.sql:
--   1. SET search_path = public em todas (evita hijack de search_path em
--      funções SECURITY DEFINER).
--   2. REVOKE EXECUTE FROM PUBLIC nas funções admin e no helper interno
--      (deixam de ser executáveis por anon; admin mantém GRANT authenticated;
--      o helper só é chamado internamente por outras SECURITY DEFINER).
-- Idempotente. Não toca em funções pré-existentes do projeto.

-- 1. search_path fixo
ALTER FUNCTION juror_token_owner(UUID)                               SET search_path = public;
ALTER FUNCTION juror_get_context(UUID)                               SET search_path = public;
ALTER FUNCTION juror_submit_score(UUID, UUID, JSONB, TEXT, BOOLEAN)  SET search_path = public;
ALTER FUNCTION admin_list_jurors()                                   SET search_path = public;
ALTER FUNCTION wall_submit_pain(TEXT, TEXT, TEXT, TEXT, TEXT)         SET search_path = public;
ALTER FUNCTION wall_vote(TEXT, UUID)                                 SET search_path = public;
ALTER FUNCTION wall_unvote(TEXT, UUID)                               SET search_path = public;
ALTER FUNCTION wall_list(TEXT)                                       SET search_path = public;
ALTER FUNCTION wall_set_phase(TEXT)                                  SET search_path = public;
ALTER FUNCTION wall_hide_pain(UUID)                                  SET search_path = public;
ALTER FUNCTION wall_unhide_pain(UUID)                                SET search_path = public;
ALTER FUNCTION wall_admin_list()                                     SET search_path = public;

-- 2. Tira anon (PUBLIC) das funções admin e do helper interno.
--    As anon-by-design (wall_submit_pain/wall_vote/wall_unvote/wall_list,
--    juror_get_context/juror_submit_score) mantêm o GRANT explícito TO anon.
REVOKE EXECUTE ON FUNCTION juror_token_owner(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_list_jurors()     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION wall_set_phase(TEXT)    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION wall_hide_pain(UUID)    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION wall_unhide_pain(UUID)  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION wall_admin_list()       FROM PUBLIC;
