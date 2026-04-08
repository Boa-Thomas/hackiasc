-- ============================================================
-- Migration: Server-side ticket_price validation
-- Fixes: Client can send arbitrary ticket_price on INSERT
-- ============================================================

-- 1. CHECK constraint — only allow valid price values
-- This rejects any INSERT/UPDATE with an invalid ticket_price
ALTER TABLE registrations
  ADD CONSTRAINT chk_ticket_price CHECK (ticket_price IN (15000, 20000));

-- 2. BEFORE INSERT trigger — enforce correct price based on early bird availability
-- Even if the client sends a valid price (e.g. 15000 when early bird is full),
-- the trigger overrides it with the server-side authoritative value.
CREATE OR REPLACE FUNCTION enforce_ticket_price()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_confirmed INTEGER;
BEGIN
  -- Count confirmed early bird registrations (same logic as claim_early_bird_slot)
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

CREATE TRIGGER trg_enforce_ticket_price
  BEFORE INSERT ON registrations
  FOR EACH ROW
  EXECUTE FUNCTION enforce_ticket_price();
