CREATE SCHEMA IF NOT EXISTS extensions;
-- pg_net / supabase_vault / pg_stat_statements are Supabase-managed (pre-installed on a
-- fresh project); the IF NOT EXISTS lines are no-ops there. pgcrypto + uuid-ossp are the
-- ones our functions actually use (gen_random_bytes/digest/crypt/gen_salt, uuid).
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
