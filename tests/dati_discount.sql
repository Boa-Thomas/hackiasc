-- ============================================================
-- Manual SQL test suite — DATI discount tier validation
--
-- HOW TO RUN
--   1. Apply migrations/validate_ticket_price.sql and
--      migrations/support_dati_discount_validation.sql first.
--   2. Open the Supabase Dashboard > SQL Editor and paste the
--      ENTIRE contents of this file in one go.
--   3. Click "Run". Watch the "Messages" tab for `PASS:` notices.
--      Any `FAIL:` aborts the transaction immediately.
--   4. The trailing ROLLBACK guarantees nothing is committed,
--      so this is safe to run against staging or production —
--      it cannot mutate the database or pollute it with rows.
--
-- Notes:
--   * Every row uses gen_random_uuid() for email / cpf so the
--     UNIQUE constraints never collide with real data.
--   * Scenario 7 needs an actual reg row to call
--     claim_early_bird_slot(), so we INSERT one first and let
--     the trigger lock it as 'dati' before invoking the RPC.
--   * Scenarios that need "early bird sold out" insert 10 rows
--     with payment_status='confirmed' inside the same TX so the
--     enforce_ticket_price() count query sees them.
-- ============================================================

BEGIN;

-- ---- shared helpers --------------------------------------------------
-- Wipe app_settings inside the TX so we have a known starting state.
DELETE FROM app_settings WHERE key = 'dati_discount_code';

-- ============================================================
-- Scenario 1: Setup — seed the secret
-- ============================================================
DO $$
BEGIN
  INSERT INTO app_settings (key, value)
  VALUES ('dati_discount_code', 'TEST_SECRET_123');

  IF get_app_setting('dati_discount_code') <> 'TEST_SECRET_123' THEN
    RAISE EXCEPTION 'FAIL: scenario 1 — get_app_setting did not return the seeded value';
  END IF;

  RAISE NOTICE 'PASS: scenario 1 — app_settings seeded with DATI secret';
END $$;

-- ============================================================
-- Scenario 2: Valid DATI code keeps tier='dati' / price=16000
-- ============================================================
DO $$
DECLARE
  v_id UUID := gen_random_uuid();
  v_tier TEXT;
  v_price INTEGER;
BEGIN
  INSERT INTO registrations (
    id, full_name, email, phone, birth_date, cpf,
    occupation_type, ai_experience_level, dietary_restrictions,
    inscription_modality, payment_method,
    ticket_tier, ticket_price, applied_discount_code,
    accept_lgpd, accept_code_ip
  ) VALUES (
    v_id, 'DATI Valido', 's2-' || v_id || '@test.local', '+5547999999999',
    '1990-01-01', replace(v_id::text, '-', ''),
    'hacker', 5, 'none',
    'individual_own', 'pix',
    'dati', 16000, 'TEST_SECRET_123',
    true, true
  );

  SELECT ticket_tier, ticket_price INTO v_tier, v_price
  FROM registrations WHERE id = v_id;

  IF v_tier <> 'dati' THEN
    RAISE EXCEPTION 'FAIL: scenario 2 — expected tier=dati, got %', v_tier;
  END IF;
  IF v_price <> 16000 THEN
    RAISE EXCEPTION 'FAIL: scenario 2 — expected price=16000, got %', v_price;
  END IF;

  RAISE NOTICE 'PASS: scenario 2 — valid DATI code locks tier=dati / price=16000';
END $$;

-- ============================================================
-- Scenario 3: Invalid DATI code falls back to early_bird/regular
-- ============================================================
DO $$
DECLARE
  v_id UUID := gen_random_uuid();
  v_tier TEXT;
  v_price INTEGER;
  v_code TEXT;
BEGIN
  INSERT INTO registrations (
    id, full_name, email, phone, birth_date, cpf,
    occupation_type, ai_experience_level, dietary_restrictions,
    inscription_modality, payment_method,
    ticket_tier, ticket_price, applied_discount_code,
    accept_lgpd, accept_code_ip
  ) VALUES (
    v_id, 'DATI Invalido', 's3-' || v_id || '@test.local', '+5547999999999',
    '1990-01-01', replace(v_id::text, '-', ''),
    'hacker', 5, 'none',
    'individual_own', 'pix',
    'dati', 16000, 'WRONG',
    true, true
  );

  SELECT ticket_tier, ticket_price, applied_discount_code
    INTO v_tier, v_price, v_code
  FROM registrations WHERE id = v_id;

  IF v_tier = 'dati' OR v_price = 16000 THEN
    RAISE EXCEPTION 'FAIL: scenario 3 — invalid code accepted, tier=% price=%', v_tier, v_price;
  END IF;
  IF v_tier NOT IN ('early_bird', 'regular') THEN
    RAISE EXCEPTION 'FAIL: scenario 3 — unexpected tier %', v_tier;
  END IF;
  IF v_price NOT IN (15000, 20000) THEN
    RAISE EXCEPTION 'FAIL: scenario 3 — unexpected price %', v_price;
  END IF;
  IF v_code IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: scenario 3 — junk code was persisted (%)', v_code;
  END IF;

  RAISE NOTICE 'PASS: scenario 3 — invalid DATI code fell back to %/% and was cleared', v_tier, v_price;
END $$;

-- ============================================================
-- Scenario 4: tier='dati' but applied_discount_code IS NULL → fallback
-- ============================================================
DO $$
DECLARE
  v_id UUID := gen_random_uuid();
  v_tier TEXT;
  v_price INTEGER;
BEGIN
  INSERT INTO registrations (
    id, full_name, email, phone, birth_date, cpf,
    occupation_type, ai_experience_level, dietary_restrictions,
    inscription_modality, payment_method,
    ticket_tier, ticket_price, applied_discount_code,
    accept_lgpd, accept_code_ip
  ) VALUES (
    v_id, 'DATI Sem Codigo', 's4-' || v_id || '@test.local', '+5547999999999',
    '1990-01-01', replace(v_id::text, '-', ''),
    'hacker', 5, 'none',
    'individual_own', 'pix',
    'dati', 16000, NULL,
    true, true
  );

  SELECT ticket_tier, ticket_price INTO v_tier, v_price
  FROM registrations WHERE id = v_id;

  IF v_tier = 'dati' OR v_price = 16000 THEN
    RAISE EXCEPTION 'FAIL: scenario 4 — dati tier without code accepted (tier=% price=%)', v_tier, v_price;
  END IF;

  RAISE NOTICE 'PASS: scenario 4 — dati tier without code fell back to %/%', v_tier, v_price;
END $$;

-- ============================================================
-- Scenario 5: applied_discount_code provided BUT tier='regular' →
-- code is ignored, regular pricing wins. (Confirmed early_bird=0
-- so far → enforce_ticket_price() will actually pick early_bird
-- by the count rule; that is the SAME server-side decision the
-- trigger should make, so we assert "not dati / not 16000" here
-- and verify the strict bypass rule in scenario 6.)
-- ============================================================
DO $$
DECLARE
  v_id UUID := gen_random_uuid();
  v_tier TEXT;
  v_price INTEGER;
  v_code TEXT;
BEGIN
  INSERT INTO registrations (
    id, full_name, email, phone, birth_date, cpf,
    occupation_type, ai_experience_level, dietary_restrictions,
    inscription_modality, payment_method,
    ticket_tier, ticket_price, applied_discount_code,
    accept_lgpd, accept_code_ip
  ) VALUES (
    v_id, 'Regular Com Codigo', 's5-' || v_id || '@test.local', '+5547999999999',
    '1990-01-01', replace(v_id::text, '-', ''),
    'hacker', 5, 'none',
    'individual_own', 'pix',
    'regular', 20000, 'TEST_SECRET_123',
    true, true
  );

  SELECT ticket_tier, ticket_price, applied_discount_code
    INTO v_tier, v_price, v_code
  FROM registrations WHERE id = v_id;

  IF v_tier = 'dati' OR v_price = 16000 THEN
    RAISE EXCEPTION 'FAIL: scenario 5 — code applied even though tier was regular (tier=% price=%)', v_tier, v_price;
  END IF;
  IF v_tier NOT IN ('early_bird', 'regular') OR v_price NOT IN (15000, 20000) THEN
    RAISE EXCEPTION 'FAIL: scenario 5 — unexpected tier/price (%, %)', v_tier, v_price;
  END IF;

  RAISE NOTICE 'PASS: scenario 5 — code ignored when tier=regular (got %/%, persisted_code=%)', v_tier, v_price, v_code;
END $$;

-- ============================================================
-- Scenario 6: Bypass attempt — client sends ticket_price=16000
-- with tier='regular' or 'early_bird'. The trigger MUST overwrite
-- the price to 15000 or 20000 (never let 16000 leak through with
-- a non-dati tier).
-- ============================================================
DO $$
DECLARE
  v_id_a UUID := gen_random_uuid();
  v_id_b UUID := gen_random_uuid();
  v_price_a INTEGER;
  v_price_b INTEGER;
  v_tier_a TEXT;
  v_tier_b TEXT;
BEGIN
  -- Attempt A: tier='regular', smuggled price=16000
  INSERT INTO registrations (
    id, full_name, email, phone, birth_date, cpf,
    occupation_type, ai_experience_level, dietary_restrictions,
    inscription_modality, payment_method,
    ticket_tier, ticket_price,
    accept_lgpd, accept_code_ip
  ) VALUES (
    v_id_a, 'Bypass Regular', 's6a-' || v_id_a || '@test.local', '+5547999999999',
    '1990-01-01', replace(v_id_a::text, '-', ''),
    'hacker', 5, 'none',
    'individual_own', 'pix',
    'regular', 16000,
    true, true
  );

  -- Attempt B: tier='early_bird', smuggled price=16000
  INSERT INTO registrations (
    id, full_name, email, phone, birth_date, cpf,
    occupation_type, ai_experience_level, dietary_restrictions,
    inscription_modality, payment_method,
    ticket_tier, ticket_price,
    accept_lgpd, accept_code_ip
  ) VALUES (
    v_id_b, 'Bypass EarlyBird', 's6b-' || v_id_b || '@test.local', '+5547999999999',
    '1990-01-01', replace(v_id_b::text, '-', ''),
    'hacker', 5, 'none',
    'individual_own', 'pix',
    'early_bird', 16000,
    true, true
  );

  SELECT ticket_tier, ticket_price INTO v_tier_a, v_price_a FROM registrations WHERE id = v_id_a;
  SELECT ticket_tier, ticket_price INTO v_tier_b, v_price_b FROM registrations WHERE id = v_id_b;

  IF v_price_a = 16000 OR v_tier_a = 'dati' THEN
    RAISE EXCEPTION 'FAIL: scenario 6A — 16000 leaked through with tier % (price=%)', v_tier_a, v_price_a;
  END IF;
  IF v_price_a NOT IN (15000, 20000) THEN
    RAISE EXCEPTION 'FAIL: scenario 6A — unexpected price %', v_price_a;
  END IF;

  IF v_price_b = 16000 OR v_tier_b = 'dati' THEN
    RAISE EXCEPTION 'FAIL: scenario 6B — 16000 leaked through with tier % (price=%)', v_tier_b, v_price_b;
  END IF;
  IF v_price_b NOT IN (15000, 20000) THEN
    RAISE EXCEPTION 'FAIL: scenario 6B — unexpected price %', v_price_b;
  END IF;

  RAISE NOTICE 'PASS: scenario 6 — bypass attempts rewritten to %/% and %/%', v_tier_a, v_price_a, v_tier_b, v_price_b;
END $$;

-- ============================================================
-- Scenario 7: claim_early_bird_slot must NOT touch a DATI ticket
-- ============================================================
DO $$
DECLARE
  v_id UUID := gen_random_uuid();
  v_result BOOLEAN;
  v_tier TEXT;
  v_price INTEGER;
BEGIN
  INSERT INTO registrations (
    id, full_name, email, phone, birth_date, cpf,
    occupation_type, ai_experience_level, dietary_restrictions,
    inscription_modality, payment_method,
    ticket_tier, ticket_price, applied_discount_code,
    accept_lgpd, accept_code_ip
  ) VALUES (
    v_id, 'DATI Claim', 's7-' || v_id || '@test.local', '+5547999999999',
    '1990-01-01', replace(v_id::text, '-', ''),
    'hacker', 5, 'none',
    'individual_own', 'pix',
    'dati', 16000, 'TEST_SECRET_123',
    true, true
  );

  -- sanity: trigger should already have kept this as dati/16000
  SELECT ticket_tier, ticket_price INTO v_tier, v_price FROM registrations WHERE id = v_id;
  IF v_tier <> 'dati' OR v_price <> 16000 THEN
    RAISE EXCEPTION 'FAIL: scenario 7 — pre-claim row was not dati/16000 (got %/%)', v_tier, v_price;
  END IF;

  v_result := claim_early_bird_slot(v_id);

  SELECT ticket_tier, ticket_price INTO v_tier, v_price FROM registrations WHERE id = v_id;

  IF v_result <> FALSE THEN
    RAISE EXCEPTION 'FAIL: scenario 7 — claim returned %, expected FALSE for dati ticket', v_result;
  END IF;
  IF v_tier <> 'dati' OR v_price <> 16000 THEN
    RAISE EXCEPTION 'FAIL: scenario 7 — claim mutated a dati ticket to %/%', v_tier, v_price;
  END IF;

  RAISE NOTICE 'PASS: scenario 7 — claim_early_bird_slot left dati ticket untouched';
END $$;

-- ============================================================
-- Scenario 8: claim_early_bird_slot on a regular ticket — should
-- assign early_bird when slots are free, and regular once 10
-- confirmed early_bird rows exist.
-- ============================================================
DO $$
DECLARE
  v_id UUID := gen_random_uuid();
  v_result BOOLEAN;
  v_tier TEXT;
  v_price INTEGER;
  i INTEGER;
  v_filler_id UUID;
BEGIN
  -- Phase A: with 0 confirmed early_bird rows, claim should grant early_bird
  INSERT INTO registrations (
    id, full_name, email, phone, birth_date, cpf,
    occupation_type, ai_experience_level, dietary_restrictions,
    inscription_modality, payment_method,
    ticket_tier, ticket_price,
    accept_lgpd, accept_code_ip
  ) VALUES (
    v_id, 'Claim Phase A', 's8a-' || v_id || '@test.local', '+5547999999999',
    '1990-01-01', replace(v_id::text, '-', ''),
    'hacker', 5, 'none',
    'individual_own', 'pix',
    'regular', 20000,
    true, true
  );

  v_result := claim_early_bird_slot(v_id);
  SELECT ticket_tier, ticket_price INTO v_tier, v_price FROM registrations WHERE id = v_id;

  IF v_result <> TRUE OR v_tier <> 'early_bird' OR v_price <> 15000 THEN
    RAISE EXCEPTION 'FAIL: scenario 8A — expected TRUE / early_bird / 15000, got %/% / %', v_result, v_tier, v_price;
  END IF;

  -- Phase B: fill 10 confirmed early_bird rows, then claim should
  -- downgrade a new ticket to regular.
  FOR i IN 1..10 LOOP
    v_filler_id := gen_random_uuid();
    INSERT INTO registrations (
      id, full_name, email, phone, birth_date, cpf,
      occupation_type, ai_experience_level, dietary_restrictions,
      inscription_modality, payment_method,
      ticket_tier, ticket_price, payment_status,
      accept_lgpd, accept_code_ip
    ) VALUES (
      v_filler_id, 'Filler ' || i, 's8b-fill' || i || '-' || v_filler_id || '@test.local',
      '+5547999999999', '1990-01-01', replace(v_filler_id::text, '-', ''),
      'hacker', 5, 'none',
      'individual_own', 'pix',
      'early_bird', 15000, 'pending',
      true, true
    );
    -- Trigger fires only on INSERT, so payment_status='confirmed' must
    -- be set via UPDATE after the row exists.
    UPDATE registrations SET payment_status = 'confirmed' WHERE id = v_filler_id;
  END LOOP;

  v_id := gen_random_uuid();
  INSERT INTO registrations (
    id, full_name, email, phone, birth_date, cpf,
    occupation_type, ai_experience_level, dietary_restrictions,
    inscription_modality, payment_method,
    ticket_tier, ticket_price,
    accept_lgpd, accept_code_ip
  ) VALUES (
    v_id, 'Claim Phase B', 's8b-' || v_id || '@test.local', '+5547999999999',
    '1990-01-01', replace(v_id::text, '-', ''),
    'hacker', 5, 'none',
    'individual_own', 'pix',
    'regular', 20000,
    true, true
  );

  v_result := claim_early_bird_slot(v_id);
  SELECT ticket_tier, ticket_price INTO v_tier, v_price FROM registrations WHERE id = v_id;

  IF v_result <> FALSE OR v_tier <> 'regular' OR v_price <> 20000 THEN
    RAISE EXCEPTION 'FAIL: scenario 8B — expected FALSE / regular / 20000, got %/% / %', v_result, v_tier, v_price;
  END IF;

  RAISE NOTICE 'PASS: scenario 8 — claim_early_bird_slot grants early_bird then regular as slots fill';
END $$;

-- ============================================================
-- Scenario 9: CHECK constraint — bogus prices must be rejected.
-- We try 17000 (allowed by the trigger fallback? no — trigger sets
-- 15000/20000, so a value of 17000 *could* slip past trigger only
-- if tier=dati and the code matches; we send tier='regular' so the
-- trigger rewrites to 15000/20000 before the constraint check, and
-- the trigger output is what's evaluated. To actually exercise the
-- CHECK we need to pin a value the trigger keeps but the constraint
-- rejects — which means *temporarily* disabling the trigger. We
-- can't, so we use ALTER TABLE ... DISABLE TRIGGER in this TX to
-- prove the constraint also blocks junk on its own.
-- ============================================================
DO $$
DECLARE
  v_id UUID := gen_random_uuid();
  v_err_state TEXT;
  v_caught BOOLEAN := FALSE;
BEGIN
  -- Disable the BEFORE INSERT trigger inside the TX so the trigger
  -- cannot "fix" our payload before the CHECK fires.
  EXECUTE 'ALTER TABLE registrations DISABLE TRIGGER trg_enforce_ticket_price';

  BEGIN
    INSERT INTO registrations (
      id, full_name, email, phone, birth_date, cpf,
      occupation_type, ai_experience_level, dietary_restrictions,
      inscription_modality, payment_method,
      ticket_tier, ticket_price,
      accept_lgpd, accept_code_ip
    ) VALUES (
      v_id, 'Bad Price', 's9-' || v_id || '@test.local', '+5547999999999',
      '1990-01-01', replace(v_id::text, '-', ''),
      'hacker', 5, 'none',
      'individual_own', 'pix',
      'regular', 17000,
      true, true
    );
  EXCEPTION
    WHEN check_violation THEN
      v_caught := TRUE;
      GET STACKED DIAGNOSTICS v_err_state = RETURNED_SQLSTATE;
  END;

  EXECUTE 'ALTER TABLE registrations ENABLE TRIGGER trg_enforce_ticket_price';

  IF NOT v_caught THEN
    RAISE EXCEPTION 'FAIL: scenario 9 — CHECK constraint did not reject ticket_price=17000';
  END IF;

  RAISE NOTICE 'PASS: scenario 9 — CHECK constraint rejected 17000 (SQLSTATE %)', v_err_state;
END $$;

-- ============================================================
-- Scenario 10: app_settings RLS / get_app_setting visibility.
--   - The trigger (SECURITY DEFINER) uses get_app_setting() and
--     it must work end-to-end (already exercised by scenario 2).
--   - anon must NOT be able to execute the function directly:
--     REVOKE EXECUTE was applied in the migration.
-- ============================================================
DO $$
DECLARE
  v_has_anon_priv BOOLEAN;
  v_has_authd_priv BOOLEAN;
  v_has_public_priv BOOLEAN;
BEGIN
  SELECT has_function_privilege('anon', 'get_app_setting(text)', 'EXECUTE') INTO v_has_anon_priv;
  SELECT has_function_privilege('authenticated', 'get_app_setting(text)', 'EXECUTE') INTO v_has_authd_priv;
  SELECT has_function_privilege('public', 'get_app_setting(text)', 'EXECUTE') INTO v_has_public_priv;

  IF v_has_anon_priv THEN
    RAISE EXCEPTION 'FAIL: scenario 10 — anon still has EXECUTE on get_app_setting';
  END IF;
  IF v_has_authd_priv THEN
    RAISE EXCEPTION 'FAIL: scenario 10 — authenticated still has EXECUTE on get_app_setting';
  END IF;
  IF v_has_public_priv THEN
    RAISE EXCEPTION 'FAIL: scenario 10 — PUBLIC still has EXECUTE on get_app_setting';
  END IF;

  -- And the trigger still works (proxy: scenario 2 already inserted
  -- a dati/16000 row using the secret, which is impossible unless
  -- the SECURITY DEFINER call inside the trigger could read it).
  IF NOT EXISTS (
    SELECT 1 FROM registrations
    WHERE ticket_tier = 'dati' AND ticket_price = 16000
      AND applied_discount_code = 'TEST_SECRET_123'
  ) THEN
    RAISE EXCEPTION 'FAIL: scenario 10 — no dati row exists; trigger could not read the secret';
  END IF;

  RAISE NOTICE 'PASS: scenario 10 — get_app_setting locked down for anon/authenticated/PUBLIC but works via trigger';
END $$;

-- ============================================================
-- Scenario 11: Cleanup
-- Roll the whole TX back so neither registrations nor app_settings
-- carry test data forward. Nothing else to do — ROLLBACK below is
-- the actual cleanup; this block just announces it.
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE 'PASS: scenario 11 — about to ROLLBACK; database will be untouched';
END $$;

ROLLBACK;
