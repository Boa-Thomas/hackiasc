-- One rpc_token grant per existing mentor / active juror, ref_id = their id.
-- Tokens are random (hash only, not recoverable) — the admin uses "novo link"
-- (regenerate) in Acessos to mint a usable link per person. Legacy
-- #mentor?t=/#jurado?t= links keep working meanwhile. Idempotent on (ref_id, role).

INSERT INTO access_grants (label, role, auth_kind, ref_id, token_hash)
SELECT 'Mentor: ' || m.name, 'mentor', 'rpc_token', m.id,
       encode(extensions.digest(encode(extensions.gen_random_bytes(32),'hex'), 'sha256'), 'hex')
FROM mentors m
WHERE NOT EXISTS (SELECT 1 FROM access_grants g WHERE g.ref_id = m.id AND g.role = 'mentor');

INSERT INTO access_grants (label, role, auth_kind, ref_id, token_hash)
SELECT 'Jurado: ' || j.name, 'juror', 'rpc_token', j.id,
       encode(extensions.digest(encode(extensions.gen_random_bytes(32),'hex'), 'sha256'), 'hex')
FROM jurors j
WHERE j.active = true
  AND NOT EXISTS (SELECT 1 FROM access_grants g WHERE g.ref_id = j.id AND g.role = 'juror');
