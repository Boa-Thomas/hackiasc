-- SP2/B2: mentor/juror now use real jwt_exchange sessions. Flip grant_auth_kind
-- so NEW mentor/juror grants are jwt_exchange, and migrate the existing 17 in
-- place. Backing users are provisioned lazily on first #acesso exchange, so the
-- 17 keep supabase_user_id=NULL until each is re-onboarded; the B1 dual-mode RPCs
-- + legacy access_token columns keep them working until then.
-- APPLY ATOMIC WITH THE B2 FRONTEND DEPLOY: a flipped grant mints a jwt session
-- that only the B2 frontend can consume. Do NOT apply before the frontend ships.
CREATE OR REPLACE FUNCTION public.grant_auth_kind(p_role text)
RETURNS text LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, public
AS $$ SELECT 'jwt_exchange' $$;  -- every role uses jwt_exchange now (mentor/juror included)

UPDATE access_grants SET auth_kind = 'jwt_exchange'
WHERE role IN ('mentor','juror') AND auth_kind = 'rpc_token';
