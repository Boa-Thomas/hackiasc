-- ============================================================
-- Fix: exclude internal MP operations (piggy bank / "Cofrinho",
-- balance transfers, etc) from event-revenue accounting.
--
-- /v1/payments/search returns ALL operations on the MP account,
-- not only customer payments. A piggy bank deposit shows up as
-- operation_type = 'investment' with payment_type_id = 'account_money'
-- and the account holder as payer, inflating the financial panel.
--
-- Fix: store operation_type on mp_payments, backfill from raw_data,
-- and restrict the fee summary RPC to operation_type = 'regular_payment'.
-- ============================================================

ALTER TABLE mp_payments
  ADD COLUMN IF NOT EXISTS operation_type TEXT;

UPDATE mp_payments
SET operation_type = COALESCE(raw_data->>'operation_type', 'regular_payment')
WHERE operation_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_mp_payments_operation_type
  ON mp_payments(operation_type);

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
  WHERE status = 'approved'
    AND COALESCE(operation_type, 'regular_payment') = 'regular_payment';
$$;

GRANT EXECUTE ON FUNCTION get_mp_fee_summary() TO authenticated;
