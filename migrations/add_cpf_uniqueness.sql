-- ============================================================
-- Bloqueia inscrições duplicadas pelo mesmo CPF
--
-- A coluna `email` já era UNIQUE desde a v1; `cpf` não era. Resultado:
-- a mesma pessoa podia se inscrever 2x com e-mails diferentes (pessoal
-- + corporativo), pagar a preferência de uma e deixar a outra "pending"
-- pra sempre — bagunça reconciliação financeira e confunde o usuário.
--
-- Solução: índice UNIQUE parcial sobre o CPF canonizado (só dígitos),
-- ignorando linhas com payment_status = 'cancelled' — assim quem teve
-- a inscrição anterior cancelada / reembolsada pode se reinscrever.
-- ============================================================

-- ⚠ Antes de aplicar este índice, rode a query abaixo no SQL Editor pra
-- detectar duplicatas existentes. Se aparecer alguém, cancele as linhas
-- excedentes pelo painel admin e só depois rode esta migração.
--
-- SELECT REGEXP_REPLACE(cpf, '\D', '', 'g') AS cpf_clean,
--        COUNT(*) AS dup_count,
--        array_agg(json_build_object(
--          'id', id, 'email', email, 'full_name', full_name,
--          'payment_status', payment_status, 'created_at', created_at
--        ) ORDER BY created_at) AS rows
-- FROM registrations
-- WHERE payment_status <> 'cancelled'
-- GROUP BY REGEXP_REPLACE(cpf, '\D', '', 'g')
-- HAVING COUNT(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_reg_cpf_active
  ON registrations (REGEXP_REPLACE(cpf, '\D', '', 'g'))
  WHERE payment_status <> 'cancelled';

-- ============================================================
-- RPC: check_cpf_registered
--
-- Consulta pública (anon) usada pelo formulário para avisar o usuário
-- ANTES dele preencher o form inteiro de novo. Devolve só `exists` +
-- `status` — sem nome, e-mail ou qualquer PII além do fato (binário)
-- de que o CPF está ocupado, fato esse que o índice UNIQUE já revela
-- na hora do INSERT.
-- ============================================================

CREATE OR REPLACE FUNCTION check_cpf_registered(p_cpf TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_clean TEXT;
  v_status TEXT;
BEGIN
  v_clean := REGEXP_REPLACE(COALESCE(p_cpf, ''), '\D', '', 'g');

  IF length(v_clean) <> 11 THEN
    RETURN json_build_object('exists', false);
  END IF;

  -- Rate limit por CPF para desencorajar enumeração: 10 consultas / 5min.
  -- Tolerante a uso legítimo (1 líder + 5 membros + retries).
  IF NOT check_rate_limit('cpf_check:' || v_clean, 10, 5) THEN
    PERFORM pg_sleep(0.1 + random() * 0.2);
    RETURN json_build_object('exists', false);
  END IF;

  SELECT payment_status INTO v_status
  FROM registrations
  WHERE REGEXP_REPLACE(cpf, '\D', '', 'g') = v_clean
    AND payment_status <> 'cancelled'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_status IS NULL THEN
    RETURN json_build_object('exists', false);
  END IF;

  RETURN json_build_object('exists', true, 'status', v_status);
END;
$$;

GRANT EXECUTE ON FUNCTION check_cpf_registered(TEXT) TO anon, authenticated;
