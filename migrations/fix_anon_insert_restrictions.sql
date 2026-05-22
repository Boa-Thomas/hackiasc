-- ============================================================
-- Migration: Restrict anon INSERT on registrations (issue #30)
--
-- BUG: A policy "Allow public registration insert" foi criada
--      com `WITH CHECK (true)`, ou seja, qualquer cliente com a
--      anon key (pública por design em qualquer build do front)
--      podia chamar:
--
--          supabase.from('registrations').insert({
--            ...,
--            payment_status: 'confirmed',
--            payment_confirmed_at: '<now>',
--            checked_in_at: '<now>',
--            transferred_to_id: '<id_de_vítima>',
--          })
--
--      O trigger `enforce_ticket_price` só coerce o tier/preço;
--      tudo o mais passava. Resultado: bypass total do fluxo de
--      pagamento, sequestro de inscrição alheia via transfer,
--      self check-in antes do evento.
--
-- FIX (defesa em profundidade):
--   1. Recriar a policy de INSERT do role anon com `WITH CHECK`
--      que valida explicitamente:
--        - payment_status = 'pending'
--        - payment_confirmed_at IS NULL
--        - ticket_tier dentro do conjunto válido (ou NULL — o
--          trigger enforce_ticket_price coerce em seguida)
--        - checked_in_at IS NULL
--        - transferred_to_id / transferred_from_id / transferred_at
--          todos NULL (transferência só via RPC transfer_ticket,
--          SECURITY DEFINER + is_admin())
--        - failed_login_count = 0 / failed_login_until IS NULL
--          (anti-bypass do lockout anti-brute-force do participant
--          login)
--
--   2. Trigger BEFORE INSERT redundante que força os mesmos
--      valores quando `auth.role() = 'anon'`. Se uma futura
--      mudança remover ou reabrir a policy, o trigger ainda
--      barra. É barato — uma checagem de role e zeragem de
--      campos.
--
-- FLUXOS LEGÍTIMOS PRESERVADOS:
--   - Autoinscrição individual (anon): client não seta nenhum dos
--     campos restritos; payment_status fica em 'pending' pelo
--     DEFAULT da coluna.
--   - Batch insert de time (anon, leader + N membros): nenhum
--     dos rows sobe campos restritos. is_team_leader continua
--     liberado para anon — é necessário no batch.
--   - redeem_voucher (SECURITY DEFINER): bypassa RLS por design,
--     então insere `payment_status='confirmed'` normalmente.
--     Tampouco passa pelo trigger BEFORE INSERT do anon (a role
--     dentro do SECURITY DEFINER é o owner da função, não anon).
--   - Admin updates (checked_in_at, transferred_*, payment_status
--     -> confirmed): policy de UPDATE checa is_admin(), trigger
--     novo só roda em INSERT.
--   - transfer_ticket / claim_early_bird_slot / participant_*:
--     todas SECURITY DEFINER, não afetadas.
-- ============================================================

-- 1. Recriar a policy de INSERT do anon com WITH CHECK restritivo.
DROP POLICY IF EXISTS "Allow public registration insert" ON registrations;

CREATE POLICY "Allow public registration insert"
  ON registrations
  FOR INSERT
  TO anon
  WITH CHECK (
    -- Pagamento começa sempre como pendente. Admin confirma via UPDATE.
    payment_status = 'pending'
    AND payment_confirmed_at IS NULL

    -- Tier dentro do set válido (NULL é aceito porque enforce_ticket_price
    -- BEFORE INSERT vai sobrescrever; mas o NOT NULL da coluna garante que
    -- o trigger preencha antes do commit).
    AND (ticket_tier IS NULL OR ticket_tier IN ('early_bird', 'regular', 'dati'))

    -- Check-in só no dia do evento, via admin.
    AND checked_in_at IS NULL

    -- Transferência só via RPC transfer_ticket (SECURITY DEFINER + is_admin).
    AND transferred_to_id IS NULL
    AND transferred_from_id IS NULL
    AND transferred_at IS NULL

    -- Lockout anti-brute-force do participant_login não pode ser zerado
    -- por reinscrição com mesmo email (na prática o índice único parcial
    -- de email ativo já bloquearia, mas defesa extra não custa).
    AND (failed_login_count IS NULL OR failed_login_count = 0)
    AND failed_login_until IS NULL
  );

-- 2. Trigger BEFORE INSERT redundante.
--
-- Roda apenas para inserts vindos do role anon. Para qualquer outra role
-- (authenticated/admin via dashboard, service_role via edge functions,
-- ou contexto de SECURITY DEFINER cujo owner é o postgres role) o trigger
-- é no-op.
--
-- Critério: `auth.role()` retorna o JWT role do PostgREST. Em SECURITY
-- DEFINER chamado a partir de uma requisição anon, `auth.role()` continua
-- sendo 'anon', então precisamos checar também o `current_user` do
-- Postgres para distinguir. Na prática, redeem_voucher é definida pelo
-- postgres role (owner padrão) e roda como ele — então `current_user`
-- dentro dela é 'postgres'. Para anon direto via PostgREST, current_user
-- é 'anon'. Usar current_user é o caminho mais robusto aqui.
CREATE OR REPLACE FUNCTION enforce_anon_insert_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Só age para inserts originados como role 'anon'.
  -- SECURITY DEFINER functions (redeem_voucher etc.) rodam como o owner
  -- da função (postgres), então não caem aqui.
  IF current_user <> 'anon' THEN
    RETURN NEW;
  END IF;

  -- Força os campos sensíveis para valores seguros. Mesmo que a policy
  -- WITH CHECK seja removida no futuro, o trigger continua barrando.
  NEW.payment_status        := 'pending';
  NEW.payment_confirmed_at  := NULL;
  NEW.checked_in_at         := NULL;
  NEW.transferred_to_id     := NULL;
  NEW.transferred_from_id   := NULL;
  NEW.transferred_at        := NULL;
  NEW.failed_login_count    := 0;
  NEW.failed_login_until    := NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_anon_insert_defaults ON registrations;

-- Roda ANTES de enforce_ticket_price (que também é BEFORE INSERT). A ordem
-- entre triggers BEFORE com mesmo evento é alfabética pelo nome do trigger
-- no Postgres, mas neste caso não importa: enforce_ticket_price mexe em
-- ticket_tier/ticket_price, e este aqui mexe em campos diferentes. Sem
-- conflito.
CREATE TRIGGER trg_enforce_anon_insert_defaults
  BEFORE INSERT ON registrations
  FOR EACH ROW
  EXECUTE FUNCTION enforce_anon_insert_defaults();
