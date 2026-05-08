## fix: bloqueia inscrições duplicadas pelo mesmo CPF

**Data:** 2026-05-08
**Branch:** claude/investigate-payment-detection-u5DZL
**Arquivos alterados:**
- migrations/add_cpf_uniqueness.sql (novo)
- src/components/RegistrationForm.jsx (modificado)

## O que foi feito

- Novo índice UNIQUE parcial `uq_reg_cpf_active` em `REGEXP_REPLACE(cpf, '\D', '', 'g')` ignorando linhas `payment_status = 'cancelled'`.
- Nova RPC pública `check_cpf_registered(p_cpf)` que devolve `{ exists, status }` sem PII, com rate-limit de 10 consultas / 5min por CPF.
- `RegistrationForm` faz pré-check assíncrono dos CPFs (líder + cada membro) antes do INSERT, exibindo erro amigável e botão **"Ir para o painel do participante"** quando há conflito.
- Pré-check também detecta CPFs repetidos dentro da mesma submissão (evita 2 membros com o mesmo CPF).
- Fallback de race-condition: se o INSERT falha com `23505` no índice `uq_reg_cpf_active`, o form trata o erro especificamente em vez de cair no recovery por e-mail.
- Fluxo voucher (`redeem_voucher`) também passa pelo pré-check e trata o mesmo `23505`.

## Por que

A coluna `email` já era UNIQUE, mas `cpf` não. Resultado real (08/05/2026): a participante Jenyfer (CPF 134.036.799-85) se inscreveu duas vezes com e-mails diferentes (pessoal + corporativo da escola). Pagou a 1ª preferência, ficou com a 2ª "pending" — confundindo reconciliação financeira e o suporte. O webhook do MP funcionou, só associou ao `external_reference` da preferência paga, não da duplicata.

## Decisões técnicas

- **Índice parcial** (não constraint) porque permite re-inscrição após cancelamento/reembolso, alinhado com o comportamento atual de `participant_login` (que ignora cancelados).
- **Canonização via REGEXP_REPLACE** dentro do índice — funciona com qualquer formatação de CPF salva (com/sem pontuação) sem precisar normalizar a coluna.
- **RPC com SECURITY DEFINER + rate-limit** porque dados de `registrations` não são acessíveis ao `anon` via SELECT direto. A RPC vaza apenas o binário "CPF está em uso" — fato que o erro `23505` no INSERT já revelaria.
- **Pré-check + DB UNIQUE em camadas**: o pré-check é UX (mostra erro antes do submit), o índice é a fonte de verdade contra race conditions e bypass do client.

## Próximos passos

1. Detectar duplicatas existentes (query comentada no topo da migration). A Jenyfer já tem inscrição duplicada; cancelar a `a690b2ff-...` pelo painel admin antes de aplicar o índice.
2. Rodar `migrations/add_cpf_uniqueness.sql` no Supabase SQL Editor.
3. Deploy do front (push pra `main`/`master` dispara GitHub Actions).
4. Testar fluxo: tentar inscrever 2x com mesmo CPF e e-mails diferentes → deve mostrar erro amigável com botão pro painel.
