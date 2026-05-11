-- ============================================================
-- Allow re-registration after cancellation
-- ============================================================
-- Bug: o constraint UNIQUE(email) bloqueia qualquer reinserção
-- com o mesmo e-mail, mesmo quando a linha existente está com
-- payment_status = 'cancelled'. Isso quebra o fluxo do usuário
-- que teve uma inscrição cancelada e tenta se reinscrever
-- (ex: passou de individual para equipe), travando-o no erro
-- "Nenhuma inscrição pendente encontrada para esse e-mail".
--
-- Fix: substituir o constraint global por um índice único
-- parcial que só vale para inscrições ativas (não canceladas).
-- ============================================================

-- 0. Verificação de segurança — confirmar que não há duplicatas ativas.
-- Rodar manualmente antes de aplicar o resto:
--
--   SELECT LOWER(email), COUNT(*)
--   FROM registrations
--   WHERE payment_status <> 'cancelled'
--   GROUP BY LOWER(email)
--   HAVING COUNT(*) > 1;
--
-- Deve retornar 0 linhas. Se retornar duplicatas, resolver antes de continuar.

-- 1. Remove constraint estrito
ALTER TABLE registrations DROP CONSTRAINT IF EXISTS registrations_email_key;

-- 2. Substitui por índice único parcial — só inscrições ativas precisam de e-mail único
CREATE UNIQUE INDEX IF NOT EXISTS uq_registrations_email_active
  ON registrations (LOWER(email))
  WHERE payment_status <> 'cancelled';
