-- Set admin role on existing admin user
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"role": "admin"}'::jsonb
WHERE email = 'admin@hackiasc.com';

-- Set admin role on thotop100 user too
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"role": "admin"}'::jsonb
WHERE email = 'thotop100@gmail.com';

-- Create viewer user (if not exists)
-- Note: We'll use Supabase Auth admin API via edge function for this
-- For now, verify roles are set:
SELECT id, email, raw_user_meta_data->>'role' as role FROM auth.users ORDER BY created_at;
