-- Set admin role on existing admin user (using app_metadata, not user_metadata,
-- because users can self-modify user_metadata via supabase.auth.updateUser())
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb
WHERE email = 'admin@hackiasc.com';

-- Set admin role on thotop100 user too
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb
WHERE email = 'thotop100@gmail.com';

-- Verify roles are set:
SELECT id, email, raw_app_meta_data->>'role' as role FROM auth.users ORDER BY created_at;
