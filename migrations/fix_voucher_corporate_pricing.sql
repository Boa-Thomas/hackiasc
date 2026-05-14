-- ============================================================
-- Migration: Fix voucher corporate pricing (Bug B8 / #56 / #29)
--
-- Problema:
--   redeem_voucher (create_bulk_orders.sql) insere registration com
--   ticket_tier = 'corporate' e ticket_price = bulk_orders.ticket_price
--   (preço pago pela empresa). Mas o trigger BEFORE INSERT
--   enforce_ticket_price (support_dati_discount_validation.sql) só
--   conhece os branches 'dati', 'early_bird' e 'regular'. Quando o
--   tier é 'corporate', cai no else e sobrescreve ticket_tier e
--   ticket_price para early_bird/15000 ou regular/20000.
--
--   Resultado: registrations originadas de voucher empresarial
--   gravam tier público e preço público, perdendo o valor real
--   pago pela empresa. Auditoria financeira corrompida.
--
--   Além disso, o CHECK constraint registrations_ticket_tier_check
--   (supabase-setup.sql) não inclui 'corporate', e chk_ticket_price
--   só aceita (15000, 16000, 20000). O trigger reescrevia antes do
--   CHECK rodar — então o INSERT até passava, mas com dados errados.
--
-- Solução:
--   1. Adicionar 'corporate' ao CHECK constraint de ticket_tier.
--   2. Substituir chk_ticket_price por um CHECK condicional que
--      aceita qualquer ticket_price > 0 quando tier='corporate'
--      (preço variável por empresa, controlado por bulk_orders), e
--      mantém a whitelist rígida (15000/16000/20000) para os demais
--      tiers públicos.
--   3. Recriar enforce_ticket_price com bloco para tier='corporate'
--      no topo: respeita o NEW.ticket_price recebido sem sobrescrever
--      (validação cross-table acontece em redeem_voucher, que copia
--      o valor diretamente de bulk_orders.ticket_price com lock).
--   4. Recriar claim_early_bird_slot para também não fazer downgrade
--      de tier 'corporate' (paridade com a lógica de 'dati').
--   5. Adicionar SET search_path = public nas funções SECURITY DEFINER
--      tocadas (mitigação do bug B7 — search_path mutável permitia
--      shadowing de objetos do schema public).
-- ============================================================

-- 1. Expandir o CHECK de ticket_tier para incluir 'corporate'
ALTER TABLE registrations DROP CONSTRAINT IF EXISTS registrations_ticket_tier_check;
ALTER TABLE registrations
  ADD CONSTRAINT registrations_ticket_tier_check
  CHECK (ticket_tier IN ('early_bird','regular','dati','corporate'));

-- 2. Substituir chk_ticket_price por uma versão condicional.
--    Para tiers públicos: whitelist exata (15000 early_bird,
--    16000 dati, 20000 regular). Para 'corporate': qualquer valor
--    positivo — o valor real é fixado por redeem_voucher a partir
--    de bulk_orders.ticket_price (com FOR UPDATE), garantindo
--    consistência cross-table sem precisar de JOIN no CHECK.
ALTER TABLE registrations DROP CONSTRAINT IF EXISTS chk_ticket_price;
ALTER TABLE registrations
  ADD CONSTRAINT chk_ticket_price CHECK (
    (ticket_tier = 'corporate' AND ticket_price > 0)
    OR (ticket_tier <> 'corporate' AND ticket_price IN (15000, 16000, 20000))
  );

-- 3. Recria enforce_ticket_price com tratamento explícito para
--    tier 'corporate'. Mantém a lógica de 'dati' e do fallback
--    early_bird/regular inalterada.
CREATE OR REPLACE FUNCTION enforce_ticket_price()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_confirmed INTEGER;
  v_dati_code TEXT;
BEGIN
  -- Corporate path: voucher empresarial. redeem_voucher já validou
  -- o voucher contra bulk_vouchers (com FOR UPDATE) e o status do
  -- bulk_order como 'confirmed', e copiou ticket_price diretamente
  -- de bulk_orders.ticket_price. Não há nada a recalcular aqui —
  -- preservar tier e price intactos é o comportamento correto.
  -- O CHECK constraint chk_ticket_price garante ticket_price > 0.
  IF NEW.ticket_tier = 'corporate' THEN
    RETURN NEW;
  END IF;

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

-- 4. Recria claim_early_bird_slot para também respeitar tier
--    'corporate'. Sem isso, a edge function create-preference (que
--    nunca é chamada no fluxo de voucher, mas defesa em profundidade)
--    poderia teoricamente regravar uma registration corporate para
--    early_bird/regular se fosse acionada por engano.
CREATE OR REPLACE FUNCTION claim_early_bird_slot(p_reg_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Tiers especiais (dati, corporate) já foram validados na
  -- origem (trigger BEFORE INSERT para dati; redeem_voucher para
  -- corporate). Não fazer downgrade.
  IF v_current_tier IN ('dati', 'corporate') THEN
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
