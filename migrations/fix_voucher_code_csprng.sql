-- LOW (sweep "F"): generate_voucher_code() used random() (non-CSPRNG); each code
-- redeems a fully-paid ticket. Rewrite with pgcrypto extensions.gen_random_bytes
-- + rejection sampling (no modulo bias). Same charset/length. Not SECURITY DEFINER
-- (called only by admin_create_bulk_order, already admin-gated). Applied to prod.
CREATE OR REPLACE FUNCTION public.generate_voucher_code()
  RETURNS text
  LANGUAGE plpgsql
AS $$
DECLARE
  chars CONSTANT TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- 31 chars, no 0/O/1/I/L
  result TEXT := '';
  raw    BYTEA;
  b      INTEGER;
  i      INTEGER := 0;
  pos    INTEGER := 0;
BEGIN
  raw := extensions.gen_random_bytes(32);
  WHILE i < 10 LOOP
    IF pos >= octet_length(raw) THEN
      raw := extensions.gen_random_bytes(32);
      pos := 0;
    END IF;
    b := get_byte(raw, pos);
    pos := pos + 1;
    IF b < 248 THEN  -- 256 = 8*31 + 8; reject top 8 to avoid modulo bias
      result := result || substr(chars, 1 + (b % 31), 1);
      i := i + 1;
    END IF;
  END LOOP;
  RETURN result;
END;
$$;
