-- ============================================================
-- Migration: Support DATI discount tier in server-side validation
--
-- Background: validate_ticket_price.sql introduced a BEFORE INSERT
-- trigger and a CHECK constraint that always coerce ticket_tier and
-- ticket_price to early_bird/15000 or regular/20000. That migration
-- predates the DATI 20% off coupon (?dati=CODE), so registrations
-- coming from a DATI link were silently rewritten to regular pricing
-- before insert. The frontend kept showing R$160 (the discounted
-- price held in React state) but Mercado Pago received R$200 because
-- create-preference reads the authoritative ticket_price from the
-- database — which the trigger had just overwritten.
--
-- Fix: validate the DATI code server-side against a value stored in
-- a private app_settings table. When the user-supplied code matches,
-- the trigger keeps ticket_tier='dati' and locks ticket_price=16000;
-- otherwise it falls through to the original early_bird/regular
-- logic. The price cannot be manipulated from the client because the
-- secret still has to match a value that only admins/service_role
-- can read or write.
-- ============================================================

-- 1. Private settings table — server-side store for secrets/config
--    that triggers and other SECURITY DEFINER functions need to read.
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can read app settings" ON app_settings;
CREATE POLICY "Admin can read app settings"
  ON app_settings FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "Admin can write app settings" ON app_settings;
CREATE POLICY "Admin can write app settings"
  ON app_settings FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- 2. SECURITY DEFINER reader so trigger functions can fetch settings
--    without granting anon access to the table itself.
CREATE OR REPLACE FUNCTION get_app_setting(p_key TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT value FROM app_settings WHERE key = p_key LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION get_app_setting(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_app_setting(TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION get_app_setting(TEXT) FROM authenticated;

-- 3. Column to carry the user-supplied discount code into the trigger.
--    Cleared by the trigger when validation fails so junk codes are
--    not persisted.
ALTER TABLE registrations
  ADD COLUMN IF NOT EXISTS applied_discount_code TEXT;

-- 4. Allow the DATI price (16000 = R$160) under the CHECK constraint.
ALTER TABLE registrations DROP CONSTRAINT IF EXISTS chk_ticket_price;
ALTER TABLE registrations
  ADD CONSTRAINT chk_ticket_price CHECK (ticket_price IN (15000, 16000, 20000));

-- 5. Replace the BEFORE INSERT trigger so it accepts the DATI tier
--    when the user-supplied code matches the stored secret.
CREATE OR REPLACE FUNCTION enforce_ticket_price()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_confirmed INTEGER;
  v_dati_code TEXT;
BEGIN
  -- DATI 20% off path: keep the tier only when the user-supplied
  -- code matches the server-side secret. Locking the price to 16000
  -- here means the client cannot smuggle in an arbitrary value.
  IF NEW.ticket_tier = 'dati' THEN
    v_dati_code := get_app_setting('dati_discount_code');
    IF v_dati_code IS NOT NULL
       AND v_dati_code <> ''
       AND NEW.applied_discount_code IS NOT NULL
       AND NEW.applied_discount_code = v_dati_code THEN
      NEW.ticket_tier := 'dati';
      NEW.ticket_price := 16000;
      RETURN NEW;
    END IF;
    -- Invalid or missing code — drop it and fall through to the
    -- standard pricing logic below.
    NEW.applied_discount_code := NULL;
  END IF;

  -- Standard pricing: early bird while spots remain, otherwise
  -- regular. Mirrors claim_early_bird_slot to keep both paths
  -- aligned.
  SELECT COUNT(*)::INTEGER INTO v_confirmed
  FROM registrations
  WHERE payment_status = 'confirmed' AND ticket_tier = 'early_bird';

  IF v_confirmed < 10 THEN
    NEW.ticket_tier := 'early_bird';
    NEW.ticket_price := 15000;
  ELSE
    NEW.ticket_tier := 'regular';
    NEW.ticket_price := 20000;
  END IF;

  RETURN NEW;
END;
$$;

-- 6. Update claim_early_bird_slot so it never downgrades a DATI
--    ticket back to early_bird/regular when create-preference
--    reconciles the price right before redirecting to Mercado Pago.
CREATE OR REPLACE FUNCTION claim_early_bird_slot(p_reg_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_confirmed INTEGER;
  v_current_tier TEXT;
BEGIN
  SELECT ticket_tier INTO v_current_tier
  FROM registrations
  WHERE id = p_reg_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- DATI tier was already validated against the server-side secret
  -- at INSERT time. Don't touch the price here.
  IF v_current_tier = 'dati' THEN
    RETURN FALSE;
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_confirmed
  FROM registrations
  WHERE payment_status = 'confirmed' AND ticket_tier = 'early_bird';

  IF v_confirmed < 10 THEN
    UPDATE registrations
    SET ticket_tier = 'early_bird', ticket_price = 15000
    WHERE id = p_reg_id;
    RETURN TRUE;
  ELSE
    UPDATE registrations
    SET ticket_tier = 'regular', ticket_price = 20000
    WHERE id = p_reg_id;
    RETURN FALSE;
  END IF;
END;
$$;

-- ============================================================
-- Setup: after applying this migration, store the DATI discount
-- code in app_settings using the SAME value as the build-time
-- secret VITE_DATI_DISCOUNT_CODE (GitHub secret DATI_20_HACKAI):
--
--   INSERT INTO app_settings (key, value)
--   VALUES ('dati_discount_code', 'YOUR_DATI_CODE_HERE')
--   ON CONFLICT (key) DO UPDATE
--     SET value = EXCLUDED.value, updated_at = now();
--
-- Without this row, the trigger refuses every DATI tier insert and
-- silently falls back to early_bird/regular pricing.
-- ============================================================
