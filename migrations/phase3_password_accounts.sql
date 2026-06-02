-- migrations/phase3_password_accounts.sql
-- Auth Phase 3 / SP1: allow password-backed grants (admin/viewer/checkin/staff
-- login accounts provisioned via the access-account edge). A password grant has
-- an email + a backing auth.users but NO token (token_hash NULL).
-- Apply to prod (project qshrzfahotmjshtjuvno) as a gated main-thread step.
-- Idempotent + atomic: safe to re-run, and the three changes commit together so
-- there is no window where 'password' is an allowed auth_kind but the shape CHECK
-- is missing (that window is the only state in which admin_regenerate_grant_token
-- could re-tokenize a password grant).
BEGIN;

-- 1. Password grants have no token.
ALTER TABLE access_grants ALTER COLUMN token_hash DROP NOT NULL;
-- access_grants_token_hash_key is a UNIQUE index; Postgres UNIQUE permits
-- multiple NULLs, so dropping NOT NULL is safe and link grants are unaffected.

-- 2. Add 'password' to the auth_kind domain (was: jwt_exchange | rpc_token).
ALTER TABLE access_grants DROP CONSTRAINT IF EXISTS access_grants_auth_kind_check;
ALTER TABLE access_grants ADD CONSTRAINT access_grants_auth_kind_check
  CHECK (auth_kind IN ('jwt_exchange','rpc_token','password'));

-- 3. Shape integrity for the new kind: a password grant must carry an email and
--    must NOT carry a token.
ALTER TABLE access_grants DROP CONSTRAINT IF EXISTS access_grants_password_shape_check;
ALTER TABLE access_grants ADD CONSTRAINT access_grants_password_shape_check
  CHECK (auth_kind <> 'password' OR (email IS NOT NULL AND token_hash IS NULL));

COMMIT;
