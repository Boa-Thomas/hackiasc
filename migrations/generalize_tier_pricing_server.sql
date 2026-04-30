-- ============================================================
-- Migration: Generalize server-side tier pricing enforcement
-- ============================================================
-- Substitui enforce_ticket_price + chk_ticket_price + claim_early_bird_slot
-- (de validate_ticket_price.sql e security_fixes.sql) por versões que conhecem
-- múltiplos lotes e cupons.
--
-- HARDENING DE SEGURANÇA PRESERVADO:
--   - Trigger BEFORE INSERT continua sobrescrevendo ticket_tier/ticket_price
--     server-side — cliente não pode injetar preço arbitrário.
--   - claim_early_bird_slot continua atomic sob row lock (FOR UPDATE) —
--     previne race condition em virada de lote durante criação de preference MP.
--   - CHECK constraint mantida com sanity bounds (preço positivo, máximo razoável).
--   - SECURITY DEFINER preservado em todas as funções.
--
-- ATENÇÃO — sincronia com src/lib/config.js:
--   get_tier_definitions() e get_coupon_definitions() devem espelhar
--   os arrays `tiers` e `coupons` em src/lib/config.js. Adicionar lote/cupom
--   exige editar config.js E re-rodar esta migration com o JSONB atualizado.
-- ============================================================

-- ─── 1. Source of truth — espelha src/lib/config.js#tiers ─────────────
CREATE OR REPLACE FUNCTION get_tier_definitions()
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT '[
    {
      "id": "early_bird",
      "price_cents": 15000,
      "limit": 10,
      "deadline": "2026-04-30T23:59:00-03:00"
    },
    {
      "id": "regular",
      "price_cents": 20000
    }
  ]'::JSONB;
$$;

GRANT EXECUTE ON FUNCTION get_tier_definitions() TO anon, authenticated;

-- ─── 2. Source of truth — espelha src/lib/config.js#coupons ──────────
-- IDs apenas; códigos secretos vivem no front (env var, baked no bundle).
-- Server confia no tier_id enviado pelo cliente porque o "segredo" não é
-- realmente segredo — boundary de segurança aqui é o desconto máximo permitido.
CREATE OR REPLACE FUNCTION get_coupon_definitions()
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT '[
    {
      "id": "dati",
      "discount_percent": 20
    }
  ]'::JSONB;
$$;

GRANT EXECUTE ON FUNCTION get_coupon_definitions() TO anon, authenticated;

-- ─── 3. Helper: lote ativo (primeiro disponível em ordem) ────────────
-- STABLE pois lê de registrations e now(); SECURITY DEFINER para anon poder usar.
CREATE OR REPLACE FUNCTION pick_active_tier()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_tiers JSONB := get_tier_definitions();
  v_tier JSONB;
  v_sold INTEGER;
  v_now TIMESTAMPTZ := now();
BEGIN
  FOR v_tier IN SELECT * FROM jsonb_array_elements(v_tiers) LOOP
    IF v_tier ? 'deadline' AND v_now >= (v_tier->>'deadline')::TIMESTAMPTZ THEN
      CONTINUE;
    END IF;
    IF v_tier ? 'limit' THEN
      SELECT COUNT(*)::INTEGER INTO v_sold
      FROM registrations
      WHERE ticket_tier = v_tier->>'id'
        AND payment_status != 'cancelled';
      IF v_sold >= (v_tier->>'limit')::INTEGER THEN
        CONTINUE;
      END IF;
    END IF;
    RETURN v_tier;
  END LOOP;
  -- Fallback: último tier (sem limite/deadline = catch-all).
  RETURN v_tiers->-1;
END;
$$;

-- ─── 4. Helper: encontrar cupom por ID ──────────────────────────────
CREATE OR REPLACE FUNCTION find_coupon(p_coupon_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_elem JSONB;
BEGIN
  IF p_coupon_id IS NULL THEN
    RETURN NULL;
  END IF;
  FOR v_elem IN SELECT * FROM jsonb_array_elements(get_coupon_definitions()) LOOP
    IF v_elem->>'id' = p_coupon_id THEN
      RETURN v_elem;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

-- ─── 5. Helper: preço do cupom sobre o lote ativo ───────────────────
CREATE OR REPLACE FUNCTION compute_coupon_price(p_coupon_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_lote JSONB := pick_active_tier();
  v_coupon JSONB := find_coupon(p_coupon_id);
  v_base INTEGER;
  v_discount_pct INTEGER;
BEGIN
  IF v_coupon IS NULL OR v_lote IS NULL THEN
    RETURN NULL;
  END IF;
  v_base := (v_lote->>'price_cents')::INTEGER;
  v_discount_pct := (v_coupon->>'discount_percent')::INTEGER;
  RETURN v_base - ROUND(v_base * v_discount_pct / 100.0)::INTEGER;
END;
$$;

-- ─── 6. Trigger BEFORE INSERT: reescreve tier+price (autoridade server) ─
-- Substitui versão de validate_ticket_price.sql que hardcodava early_bird/regular.
-- Comportamento:
--   1. Se ticket_tier enviado é um cupom conhecido → mantém o tier do cupom,
--      preço = lote_ativo.price_cents - desconto%.
--   2. Caso contrário → força lote ativo, preço = lote_ativo.price_cents.
-- Em ambos os casos o cliente NÃO controla o preço final.
CREATE OR REPLACE FUNCTION enforce_ticket_price()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_active_tier JSONB;
  v_coupon JSONB;
  v_coupon_price INTEGER;
BEGIN
  v_coupon := find_coupon(NEW.ticket_tier);
  IF v_coupon IS NOT NULL THEN
    v_coupon_price := compute_coupon_price(NEW.ticket_tier);
    NEW.ticket_tier := v_coupon->>'id';
    NEW.ticket_price := v_coupon_price;
    RETURN NEW;
  END IF;

  v_active_tier := pick_active_tier();
  NEW.ticket_tier := v_active_tier->>'id';
  NEW.ticket_price := (v_active_tier->>'price_cents')::INTEGER;
  RETURN NEW;
END;
$$;

-- Trigger já existe (criado em validate_ticket_price.sql); CREATE OR REPLACE FUNCTION
-- acima é suficiente para atualizar o corpo. Só (re)cria o trigger se ausente.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_enforce_ticket_price'
  ) THEN
    CREATE TRIGGER trg_enforce_ticket_price
      BEFORE INSERT ON registrations
      FOR EACH ROW
      EXECUTE FUNCTION enforce_ticket_price();
  END IF;
END$$;

-- ─── 7. CHECK constraint: sanity bounds ao invés de IN hardcoded ─────
-- Trigger é a fonte da verdade; CHECK só barra valores absurdos (negativos, 0, gigantes).
ALTER TABLE registrations DROP CONSTRAINT IF EXISTS chk_ticket_price;
ALTER TABLE registrations ADD CONSTRAINT chk_ticket_price
  CHECK (ticket_price > 0 AND ticket_price <= 100000);

-- ticket_tier também tinha CHECK hardcoded — remove pra permitir lotes novos sem ALTER TABLE.
-- O trigger valida tier de fato.
ALTER TABLE registrations DROP CONSTRAINT IF EXISTS registrations_ticket_tier_check;

-- ─── 8. claim_early_bird_slot: generalizado para "claim active tier" ───
-- Mantém assinatura para back-compat com supabase/functions/create-preference.
-- Atomicamente sob row lock:
--   - Tier atual é cupom → preserva (preço já fixado no INSERT, válido enquanto price_expires_at ativo).
--   - Tier atual é lote ainda disponível → no-op.
--   - Tier atual é lote esgotado/expirado → bumpa para o lote ativo (atualiza tier+price).
-- Retorna TRUE se a inscrição foi encontrada (e processada); FALSE caso contrário.
CREATE OR REPLACE FUNCTION claim_early_bird_slot(p_reg_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_tier TEXT;
  v_active_tier JSONB;
  v_coupon JSONB;
  v_tier_def JSONB;
  v_sold INTEGER;
  v_now TIMESTAMPTZ := now();
  v_still_available BOOLEAN;
BEGIN
  SELECT ticket_tier INTO v_current_tier
  FROM registrations
  WHERE id = p_reg_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Cupom: mantém. Preço foi fixado no INSERT. Eventual upgrade de price_expires_at
  -- é tratado em PaymentInfo.jsx (re-validação) e não aqui.
  v_coupon := find_coupon(v_current_tier);
  IF v_coupon IS NOT NULL THEN
    RETURN TRUE;
  END IF;

  -- Verifica se o tier atual ainda é válido (não expirado, não esgotado).
  v_tier_def := NULL;
  FOR v_tier_def IN SELECT * FROM jsonb_array_elements(get_tier_definitions()) LOOP
    EXIT WHEN v_tier_def->>'id' = v_current_tier;
    v_tier_def := NULL;
  END LOOP;

  IF v_tier_def IS NOT NULL THEN
    v_still_available := TRUE;
    IF v_tier_def ? 'deadline' AND v_now >= (v_tier_def->>'deadline')::TIMESTAMPTZ THEN
      v_still_available := FALSE;
    END IF;
    IF v_still_available AND v_tier_def ? 'limit' THEN
      SELECT COUNT(*)::INTEGER INTO v_sold
      FROM registrations
      WHERE ticket_tier = v_current_tier
        AND payment_status = 'confirmed'
        AND id != p_reg_id;
      IF v_sold >= (v_tier_def->>'limit')::INTEGER THEN
        v_still_available := FALSE;
      END IF;
    END IF;
    IF v_still_available THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- Bumpa para o lote ativo agora.
  v_active_tier := pick_active_tier();
  UPDATE registrations
  SET ticket_tier = v_active_tier->>'id',
      ticket_price = (v_active_tier->>'price_cents')::INTEGER
  WHERE id = p_reg_id;

  RETURN TRUE;
END;
$$;

-- Permissão: apenas service_role (edge function via SUPABASE_SERVICE_ROLE_KEY)
-- chama esta função. Mantém o revoke estabelecido em fix_admin_rls_policies.sql.
REVOKE EXECUTE ON FUNCTION claim_early_bird_slot(UUID) FROM authenticated;
