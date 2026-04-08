-- ============================================================
-- MP Payments Table — stores payment details + fee breakdown
-- Synced from Mercado Pago API via sync-mp-payments Edge Function
-- ============================================================

-- Main payments table
CREATE TABLE mp_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_id BIGINT UNIQUE NOT NULL,
  registration_id UUID REFERENCES registrations(id),
  status TEXT NOT NULL,
  gross_amount INTEGER NOT NULL,       -- centavos BRL
  net_amount INTEGER NOT NULL,         -- centavos BRL
  marketplace_fee INTEGER DEFAULT 0,   -- centavos BRL
  financing_fee INTEGER DEFAULT 0,     -- centavos BRL
  shipping_fee INTEGER DEFAULT 0,      -- centavos BRL
  discount_fee INTEGER DEFAULT 0,      -- centavos BRL
  payment_method TEXT,                 -- credit_card, pix, debit_card, etc
  payment_type TEXT,                   -- payment_type_id from MP
  payer_email TEXT,
  date_approved TIMESTAMPTZ,
  date_created TIMESTAMPTZ,
  synced_at TIMESTAMPTZ DEFAULT now(),
  raw_data JSONB,                      -- full MP API response for debug
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_mp_payments_status ON mp_payments(status);
CREATE INDEX idx_mp_payments_registration_id ON mp_payments(registration_id);

ALTER TABLE mp_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read mp_payments"
  ON mp_payments FOR SELECT TO authenticated
  USING (is_admin_or_viewer());

-- ============================================================
-- Sync status singleton — tracks last sync time and state
-- ============================================================

CREATE TABLE mp_sync_status (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_sync_at TIMESTAMPTZ,
  last_sync_count INTEGER DEFAULT 0,
  last_sync_error TEXT,
  is_syncing BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO mp_sync_status (id) VALUES (1);

ALTER TABLE mp_sync_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read sync_status"
  ON mp_sync_status FOR SELECT TO authenticated
  USING (is_admin_or_viewer());

-- ============================================================
-- RPC: aggregated fee summary for dashboard cards
-- Returns totals for approved payments only
-- ============================================================

CREATE OR REPLACE FUNCTION get_mp_fee_summary()
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT json_build_object(
    'total_gross', COALESCE(SUM(gross_amount), 0),
    'total_net', COALESCE(SUM(net_amount), 0),
    'total_marketplace_fee', COALESCE(SUM(marketplace_fee), 0),
    'total_financing_fee', COALESCE(SUM(financing_fee), 0),
    'total_fees', COALESCE(SUM(marketplace_fee + financing_fee + shipping_fee + discount_fee), 0),
    'payment_count', COUNT(*),
    'last_synced_at', MAX(synced_at)
  )
  FROM mp_payments
  WHERE status = 'approved';
$$;

GRANT EXECUTE ON FUNCTION get_mp_fee_summary() TO authenticated;
