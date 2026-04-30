-- ============================================================
-- Migration: Generalize tier pricing — RPC genérica por tier
-- ============================================================
-- Frontend agora consome tiers definidos em src/lib/config.js (campo `tiers`)
-- e cupons em `coupons`. Esta migração adiciona a RPC genérica que substitui
-- o get_early_bird_sold() hardcoded.
--
-- ATENÇÃO — pendência de generalização server-side (NÃO inclusa nesta migration):
--   - chk_ticket_price (validate_ticket_price.sql) hardcoda 15000/20000;
--     adicionar lote intermediário exigirá ampliar o IN (...).
--   - enforce_ticket_price() hardcoda early_bird/regular;
--     adicionar lote intermediário exigirá generalizar a lógica.
--   - claim_early_bird_slot (security_fixes.sql) só conhece early_bird;
--     se o front passar a reivindicar slot por tier qualquer, será preciso generalizar.
-- Enquanto essas três funções não forem generalizadas, novos lotes adicionados
-- ao config.js (ex.: lote_2, lote_3) serão sobrescritos pelo trigger ao gravar.
-- ============================================================

CREATE OR REPLACE FUNCTION get_tier_sold(p_tier TEXT)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COUNT(*)::INTEGER
  FROM registrations
  WHERE ticket_tier = p_tier
    AND payment_status != 'cancelled';
$$;

GRANT EXECUTE ON FUNCTION get_tier_sold(TEXT) TO anon;

-- get_early_bird_sold mantido como wrapper (back-compat para integrações externas).
CREATE OR REPLACE FUNCTION get_early_bird_sold()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT get_tier_sold('early_bird');
$$;

GRANT EXECUTE ON FUNCTION get_early_bird_sold() TO anon;
