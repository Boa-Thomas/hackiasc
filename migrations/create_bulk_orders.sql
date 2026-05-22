-- ============================================================
-- Bulk Ticket Purchases — compra corporativa
--
-- Permite que o admin gere N vouchers para uma empresa pagar
-- por fora (PIX, transferência, boleto). Cada voucher = 1
-- inscrição confirmada. O participante só preenche os dados
-- pessoais e aceites de LGPD; o pagamento já está coberto.
-- ============================================================

-- 1. Tabela de pedidos em lote
CREATE TABLE IF NOT EXISTS bulk_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Dados da empresa compradora
  company_name TEXT NOT NULL,
  cnpj TEXT,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,

  -- Pedido
  total_tickets INTEGER NOT NULL CHECK (total_tickets > 0 AND total_tickets <= 100),
  ticket_price INTEGER NOT NULL CHECK (ticket_price > 0),  -- centavos por ingresso
  ticket_tier TEXT NOT NULL CHECK (ticket_tier IN ('early_bird','regular','dati','corporate')),

  -- Status do pagamento da empresa (manual — controlado pelo admin)
  payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending','confirmed','cancelled')),
  payment_method TEXT,    -- 'pix' | 'transfer' | 'boleto' | 'invoice' | etc — texto livre
  payment_notes TEXT,
  paid_at TIMESTAMPTZ,

  -- Auditoria
  created_by_email TEXT NOT NULL  -- admin que criou
);

CREATE INDEX IF NOT EXISTS idx_bulk_orders_status ON bulk_orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_bulk_orders_email ON bulk_orders(LOWER(contact_email));

ALTER TABLE bulk_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read bulk orders"
  ON bulk_orders FOR SELECT TO authenticated USING (is_admin_or_viewer());

CREATE POLICY "Admin can write bulk orders"
  ON bulk_orders FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- 2. Vouchers — um por ingresso
CREATE TABLE IF NOT EXISTS bulk_vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  bulk_order_id UUID NOT NULL REFERENCES bulk_orders(id) ON DELETE CASCADE,

  -- Código curto e amigável (12 chars). UNIQUE.
  code TEXT NOT NULL UNIQUE,

  -- Status individual do voucher
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','redeemed','cancelled')),

  -- Resgate
  redeemed_by_id UUID REFERENCES registrations(id),
  redeemed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bulk_vouchers_order ON bulk_vouchers(bulk_order_id);
CREATE INDEX IF NOT EXISTS idx_bulk_vouchers_status ON bulk_vouchers(status);
CREATE INDEX IF NOT EXISTS idx_bulk_vouchers_redeemed ON bulk_vouchers(redeemed_by_id);

ALTER TABLE bulk_vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read bulk vouchers"
  ON bulk_vouchers FOR SELECT TO authenticated USING (is_admin_or_viewer());

CREATE POLICY "Admin can write bulk vouchers"
  ON bulk_vouchers FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ============================================================
-- Helper: gera um código aleatório de 10 caracteres alfanuméricos
-- ============================================================
CREATE OR REPLACE FUNCTION generate_voucher_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  -- Sem 0/O/1/I/L para reduzir confusão na hora de digitar
  chars CONSTANT TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..10 LOOP
    result := result || substr(chars, 1 + floor(random() * length(chars))::int, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- ============================================================
-- RPC: Admin cria um bulk order + N vouchers atomicamente
-- ============================================================
CREATE OR REPLACE FUNCTION admin_create_bulk_order(
  p_company_name TEXT,
  p_cnpj TEXT,
  p_contact_name TEXT,
  p_contact_email TEXT,
  p_contact_phone TEXT,
  p_total_tickets INTEGER,
  p_ticket_price INTEGER,
  p_ticket_tier TEXT DEFAULT 'corporate',
  p_payment_method TEXT DEFAULT NULL,
  p_payment_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_order_id UUID;
  v_admin_email TEXT;
  v_actor_id UUID := auth.uid();
  v_code TEXT;
  v_codes TEXT[] := '{}';
  i INTEGER;
  v_attempts INTEGER;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF p_total_tickets IS NULL OR p_total_tickets < 1 OR p_total_tickets > 100 THEN
    RAISE EXCEPTION 'total_tickets must be between 1 and 100';
  END IF;

  IF p_ticket_price IS NULL OR p_ticket_price <= 0 THEN
    RAISE EXCEPTION 'ticket_price must be positive';
  END IF;

  IF p_company_name IS NULL OR length(TRIM(p_company_name)) = 0 THEN
    RAISE EXCEPTION 'company_name required';
  END IF;

  IF p_contact_email IS NULL OR length(TRIM(p_contact_email)) = 0 THEN
    RAISE EXCEPTION 'contact_email required';
  END IF;

  v_admin_email := COALESCE(
    (auth.jwt() ->> 'email'),
    (SELECT email FROM auth.users WHERE id = v_actor_id),
    'unknown'
  );

  INSERT INTO bulk_orders (
    company_name, cnpj, contact_name, contact_email, contact_phone,
    total_tickets, ticket_price, ticket_tier,
    payment_method, payment_notes, created_by_email
  ) VALUES (
    TRIM(p_company_name),
    NULLIF(TRIM(COALESCE(p_cnpj, '')), ''),
    TRIM(p_contact_name),
    LOWER(TRIM(p_contact_email)),
    NULLIF(TRIM(COALESCE(p_contact_phone, '')), ''),
    p_total_tickets,
    p_ticket_price,
    p_ticket_tier,
    NULLIF(TRIM(COALESCE(p_payment_method, '')), ''),
    NULLIF(TRIM(COALESCE(p_payment_notes, '')), ''),
    v_admin_email
  ) RETURNING id INTO v_order_id;

  -- Gera vouchers únicos. Em caso raro de colisão, tenta de novo.
  FOR i IN 1..p_total_tickets LOOP
    v_attempts := 0;
    LOOP
      v_attempts := v_attempts + 1;
      v_code := generate_voucher_code();
      BEGIN
        INSERT INTO bulk_vouchers (bulk_order_id, code) VALUES (v_order_id, v_code);
        v_codes := array_append(v_codes, v_code);
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        IF v_attempts > 10 THEN
          RAISE EXCEPTION 'failed to generate unique voucher code after 10 attempts';
        END IF;
      END;
    END LOOP;
  END LOOP;

  RETURN json_build_object(
    'order_id', v_order_id,
    'codes', v_codes,
    'total_tickets', p_total_tickets,
    'ticket_price', p_ticket_price
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_create_bulk_order(
  TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT
) TO authenticated;

-- ============================================================
-- RPC: Admin confirma pagamento do bulk order
-- ============================================================
CREATE OR REPLACE FUNCTION admin_confirm_bulk_order(
  p_order_id UUID,
  p_payment_method TEXT DEFAULT NULL,
  p_payment_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_status TEXT;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT payment_status INTO v_status FROM bulk_orders WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found';
  END IF;

  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'order is cancelled';
  END IF;

  UPDATE bulk_orders
  SET payment_status = 'confirmed',
      paid_at = COALESCE(paid_at, now()),
      payment_method = COALESCE(NULLIF(TRIM(COALESCE(p_payment_method, '')), ''), payment_method),
      payment_notes = COALESCE(NULLIF(TRIM(COALESCE(p_payment_notes, '')), ''), payment_notes)
  WHERE id = p_order_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_confirm_bulk_order(UUID, TEXT, TEXT) TO authenticated;

-- ============================================================
-- RPC: Admin cancela um bulk order (e todos os vouchers ativos)
-- Vouchers já resgatados continuam válidos (não dá pra "des-inscrever").
-- ============================================================
CREATE OR REPLACE FUNCTION admin_cancel_bulk_order(p_order_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM bulk_orders WHERE id = p_order_id) THEN
    RAISE EXCEPTION 'order not found';
  END IF;

  UPDATE bulk_orders SET payment_status = 'cancelled' WHERE id = p_order_id;

  UPDATE bulk_vouchers
  SET status = 'cancelled'
  WHERE bulk_order_id = p_order_id AND status = 'active';

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_cancel_bulk_order(UUID) TO authenticated;

-- ============================================================
-- RPC: Admin cancela um voucher individual (não consumido ainda)
-- ============================================================
CREATE OR REPLACE FUNCTION admin_cancel_voucher(p_voucher_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_status TEXT;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT status INTO v_status FROM bulk_vouchers WHERE id = p_voucher_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'voucher not found';
  END IF;

  IF v_status = 'redeemed' THEN
    RAISE EXCEPTION 'voucher already redeemed';
  END IF;

  UPDATE bulk_vouchers SET status = 'cancelled' WHERE id = p_voucher_id;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_cancel_voucher(UUID) TO authenticated;

-- ============================================================
-- RPC público: lookup voucher (chamado quando o participante abre o link)
-- Retorna info pra UI (nome da empresa) sem expor outros vouchers do pedido.
-- ============================================================
CREATE OR REPLACE FUNCTION lookup_voucher(p_code TEXT)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_voucher RECORD;
  v_order RECORD;
BEGIN
  IF p_code IS NULL OR length(TRIM(p_code)) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT v.id, v.status, v.bulk_order_id, v.redeemed_at
  INTO v_voucher
  FROM bulk_vouchers v
  WHERE UPPER(v.code) = UPPER(TRIM(p_code))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('valid', false, 'reason', 'not_found');
  END IF;

  SELECT id, company_name, payment_status, ticket_price, ticket_tier
  INTO v_order
  FROM bulk_orders WHERE id = v_voucher.bulk_order_id;

  IF v_voucher.status = 'redeemed' THEN
    RETURN json_build_object('valid', false, 'reason', 'redeemed');
  END IF;

  IF v_voucher.status = 'cancelled' THEN
    RETURN json_build_object('valid', false, 'reason', 'cancelled');
  END IF;

  IF v_order.payment_status <> 'confirmed' THEN
    RETURN json_build_object('valid', false, 'reason', 'order_not_paid');
  END IF;

  RETURN json_build_object(
    'valid', true,
    'company_name', v_order.company_name,
    'ticket_price', v_order.ticket_price,
    'ticket_tier', v_order.ticket_tier
  );
END;
$$;

GRANT EXECUTE ON FUNCTION lookup_voucher(TEXT) TO anon;

-- ============================================================
-- RPC público: resgata voucher e cria registration
--
-- Chamado pelo formulário público quando o participante envia
-- com ?voucher=CODE. Insere a registration com payment_status =
-- 'confirmed', ticket_tier herdado do bulk order, e marca o
-- voucher como 'redeemed' atomicamente.
--
-- p_data deve ser um JSON com os campos do participante (mesmos
-- que o RegistrationForm envia em modo individual). Validação
-- de email único, CPF, etc. continua vindo das constraints da tabela.
-- ============================================================
CREATE OR REPLACE FUNCTION redeem_voucher(p_code TEXT, p_data JSONB)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_voucher RECORD;
  v_order RECORD;
  v_reg_id UUID;
  v_clean_code TEXT;
  v_email TEXT;
BEGIN
  v_clean_code := UPPER(TRIM(COALESCE(p_code, '')));
  IF v_clean_code = '' THEN
    RAISE EXCEPTION 'voucher_code_required';
  END IF;

  -- Lock the voucher row so two participants can't claim it simultaneously
  SELECT id, status, bulk_order_id INTO v_voucher
  FROM bulk_vouchers
  WHERE UPPER(code) = v_clean_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'voucher_not_found';
  END IF;

  IF v_voucher.status = 'redeemed' THEN
    RAISE EXCEPTION 'voucher_already_redeemed';
  END IF;

  IF v_voucher.status = 'cancelled' THEN
    RAISE EXCEPTION 'voucher_cancelled';
  END IF;

  SELECT id, company_name, payment_status, ticket_price, ticket_tier
  INTO v_order
  FROM bulk_orders WHERE id = v_voucher.bulk_order_id;

  IF v_order.payment_status <> 'confirmed' THEN
    RAISE EXCEPTION 'order_not_paid';
  END IF;

  v_email := LOWER(TRIM(COALESCE(p_data->>'email', '')));
  IF v_email = '' OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'invalid_email';
  END IF;

  -- LGPD and code-IP consent are mandatory (#109)
  IF NOT COALESCE((p_data->>'accept_lgpd')::BOOLEAN, false) THEN
    RAISE EXCEPTION 'lgpd_consent_required';
  END IF;
  IF NOT COALESCE((p_data->>'accept_code_ip')::BOOLEAN, false) THEN
    RAISE EXCEPTION 'code_ip_consent_required';
  END IF;

  -- Insere registration
  INSERT INTO registrations (
    full_name, email, phone, birth_date, linkedin_url, cpf,
    occupation_type, ai_experience_level,
    dietary_restrictions, is_pcd, pcd_type,
    has_project, project_name, economic_axes,
    inscription_modality, team_name, is_team_leader, is_remote,
    payment_method, ticket_tier, ticket_price, payment_status,
    payment_confirmed_at, payment_notes,
    accept_lgpd, accept_code_ip
  ) VALUES (
    TRIM(p_data->>'full_name'),
    v_email,
    TRIM(p_data->>'phone'),
    (p_data->>'birth_date')::DATE,
    NULLIF(TRIM(COALESCE(p_data->>'linkedin_url', '')), ''),
    TRIM(COALESCE(p_data->>'cpf', '')),
    p_data->>'occupation_type',
    (p_data->>'ai_experience_level')::INTEGER,
    TRIM(COALESCE(p_data->>'dietary_restrictions', '')),
    COALESCE((p_data->>'is_pcd')::BOOLEAN, false),
    NULLIF(TRIM(COALESCE(p_data->>'pcd_type', '')), ''),
    COALESCE((p_data->>'has_project')::BOOLEAN, false),
    NULLIF(TRIM(COALESCE(p_data->>'project_name', '')), ''),
    CASE
      WHEN p_data ? 'economic_axes' AND jsonb_typeof(p_data->'economic_axes') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_data->'economic_axes'))
      ELSE ARRAY[]::TEXT[]
    END,
    'individual_form_team',  -- voucher = sempre individual; participante pode formar/entrar em time depois
    NULL,
    false,
    COALESCE((p_data->>'is_remote')::BOOLEAN, false),
    'card',  -- placeholder; pagamento foi feito pela empresa por fora
    v_order.ticket_tier,
    v_order.ticket_price,
    'confirmed',
    now(),
    'Voucher empresarial: ' || v_order.company_name || ' (' || v_clean_code || ')',
    COALESCE((p_data->>'accept_lgpd')::BOOLEAN, false),
    COALESCE((p_data->>'accept_code_ip')::BOOLEAN, false)
  ) RETURNING id INTO v_reg_id;

  -- Marca voucher como resgatado
  UPDATE bulk_vouchers
  SET status = 'redeemed',
      redeemed_by_id = v_reg_id,
      redeemed_at = now()
  WHERE id = v_voucher.id;

  RETURN json_build_object(
    'registration_id', v_reg_id,
    'company_name', v_order.company_name,
    'ticket_tier', v_order.ticket_tier,
    'ticket_price', v_order.ticket_price
  );
END;
$$;

GRANT EXECUTE ON FUNCTION redeem_voucher(TEXT, JSONB) TO anon;

-- ============================================================
-- RPC: lista bulk orders (com contagem de vouchers usados/totais)
-- ============================================================
CREATE OR REPLACE FUNCTION admin_list_bulk_orders()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE v_result JSON;
BEGIN
  IF NOT is_admin_or_viewer() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT json_agg(o ORDER BY o.created_at DESC)
  INTO v_result
  FROM (
    SELECT
      bo.id,
      bo.created_at,
      bo.company_name,
      bo.cnpj,
      bo.contact_name,
      bo.contact_email,
      bo.contact_phone,
      bo.total_tickets,
      bo.ticket_price,
      bo.ticket_tier,
      bo.payment_status,
      bo.payment_method,
      bo.payment_notes,
      bo.paid_at,
      bo.created_by_email,
      (SELECT COUNT(*)::INTEGER FROM bulk_vouchers v WHERE v.bulk_order_id = bo.id AND v.status = 'redeemed') AS redeemed_count,
      (SELECT COUNT(*)::INTEGER FROM bulk_vouchers v WHERE v.bulk_order_id = bo.id AND v.status = 'active') AS active_count,
      (SELECT COUNT(*)::INTEGER FROM bulk_vouchers v WHERE v.bulk_order_id = bo.id AND v.status = 'cancelled') AS cancelled_count
    FROM bulk_orders bo
  ) o;

  RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_list_bulk_orders() TO authenticated;

-- ============================================================
-- RPC: detalhes do bulk order + lista completa de vouchers
-- ============================================================
CREATE OR REPLACE FUNCTION admin_get_bulk_order(p_order_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_order JSON;
  v_vouchers JSON;
BEGIN
  IF NOT is_admin_or_viewer() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT row_to_json(bo) INTO v_order FROM bulk_orders bo WHERE id = p_order_id;
  IF v_order IS NULL THEN
    RAISE EXCEPTION 'order not found';
  END IF;

  SELECT json_agg(v ORDER BY v.created_at)
  INTO v_vouchers
  FROM (
    SELECT
      bv.id,
      CASE WHEN is_admin() THEN bv.code ELSE NULL END AS code,
      bv.status,
      bv.created_at,
      bv.redeemed_at,
      bv.redeemed_by_id,
      r.full_name AS redeemed_by_name,
      r.email AS redeemed_by_email
    FROM bulk_vouchers bv
    LEFT JOIN registrations r ON r.id = bv.redeemed_by_id
    WHERE bv.bulk_order_id = p_order_id
  ) v;

  RETURN json_build_object(
    'order', v_order,
    'vouchers', COALESCE(v_vouchers, '[]'::JSON)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_bulk_order(UUID) TO authenticated;
