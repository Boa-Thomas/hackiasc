-- Create viewer user via auth.users direct insert
-- SECURITY: Do NOT hardcode passwords here. Create the viewer user via Supabase Dashboard instead.
-- Steps: Authentication > Users > Add User > email: viewer@hackiasc.com, set a strong password
-- Then set app_metadata: {"role": "viewer"} via SQL Editor:
--   UPDATE auth.users SET raw_app_meta_data = '{"role": "viewer"}'::jsonb WHERE email = 'viewer@hackiasc.com';
--
-- The original INSERT is kept as a template but with placeholder password:
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_user_meta_data, raw_app_meta_data,
  created_at, updated_at, confirmation_token, recovery_token
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'viewer@hackiasc.com',
  crypt(current_setting('app.viewer_password', true), gen_salt('bf')),
  now(),
  '{"email_verified": true}'::jsonb,
  '{"role": "viewer"}'::jsonb,
  now(),
  now(),
  '',
  ''
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users WHERE email = 'viewer@hackiasc.com'
);

-- Also create identity for the viewer
INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
SELECT
  gen_random_uuid(),
  u.id,
  json_build_object('sub', u.id::text, 'email', u.email)::jsonb,
  'email',
  u.id::text,
  now(),
  now(),
  now()
FROM auth.users u
WHERE u.email = 'viewer@hackiasc.com'
  AND NOT EXISTS (
    SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'email'
  );

SELECT id, email, raw_app_meta_data->>'role' as role FROM auth.users ORDER BY created_at;
