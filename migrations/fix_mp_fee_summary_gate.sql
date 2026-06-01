-- MEDIUM (security sweep): get_mp_fee_summary() (financial totals) was SECURITY
-- DEFINER with no role gate AND granted to anon — anyone with the anon key could
-- read total revenue/fees. Convert to plpgsql with an is_admin_or_viewer() gate,
-- pin search_path, and revoke from anon/PUBLIC (admin panel calls it as an
-- authenticated admin/viewer JWT).
CREATE OR REPLACE FUNCTION public.get_mp_fee_summary()
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  IF NOT is_admin_or_viewer() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN (
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
      AND COALESCE(operation_type, 'regular_payment') = 'regular_payment'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_mp_fee_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_mp_fee_summary() TO authenticated;
