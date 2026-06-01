-- HIGH (security sweep): is_admin()/is_admin_or_viewer() were SECURITY DEFINER
-- without SET search_path — they gate EVERY RLS policy. Their bodies only
-- reference the schema-qualified auth.jwt(), so pinning search_path is safe and
-- preserves all signatures/grants/policy references (ALTER, not DROP/CREATE).
ALTER FUNCTION public.is_admin() SET search_path = 'public';
ALTER FUNCTION public.is_admin_or_viewer() SET search_path = 'public';
