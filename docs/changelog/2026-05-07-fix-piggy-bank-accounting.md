## fix: exclude Mercado Pago piggy bank ("Cofrinho") from event revenue

**Data:** 2026-05-07
**Branch:** claude/fix-piggy-bank-accounting-gcYWi
**Arquivos alterados:**
- migrations/filter_mp_internal_ops.sql (novo)
- supabase/functions/sync-mp-payments/index.ts (modificado)
- src/admin/AdminFinanceiro.jsx (modificado)

## O que foi feito
- Nova coluna `mp_payments.operation_type` populada via sync e backfill a partir de `raw_data->>'operation_type'`.
- `get_mp_fee_summary()` agora soma apenas linhas com `operation_type = 'regular_payment'`.
- `sync-mp-payments` grava `operation_type` em cada upsert e ignora operações internas no audit log.
- Aba "Financeiro" do admin filtra a tabela e o breakdown (status / método) para exibir somente pagamentos reais; nota informa que cofrinho/transferências internas estão ocultos.

## Por que
A `/v1/payments/search` da Mercado Pago retorna todas as operações da conta, incluindo depósitos no Cofrinho (rendimento), que chegam como `operation_type = 'investment'` + `payment_type_id = 'account_money'`. Sem filtro, esses depósitos estavam aparecendo no painel `Financeiro` como entrada de receita do evento (ex.: R$ 4.666,25 em 07/05/2026 → contato@morph3d.com.br).

## Decisões técnicas
- Linhas internas continuam sendo persistidas em `mp_payments` para manter o histórico completo do que veio da API; a filtragem é apenas em consulta/agregação.
- Filtro centralizado por `operation_type = 'regular_payment'` em vez de heurísticas por `payer_email == owner` ou `payment_method`, pois é o campo oficial da MP que distingue pagamentos de clientes de operações internas (`investment`, `money_transfer`, etc).
- `COALESCE(operation_type, 'regular_payment')` na RPC garante compatibilidade com qualquer linha que entrar antes do backfill.

## Próximos passos
- Rodar `migrations/filter_mp_internal_ops.sql` no Supabase SQL Editor.
- Redeploy: `supabase functions deploy sync-mp-payments`.
- Após o próximo sync, conferir o card "Total bruto" no dashboard — deve cair para o valor real de inscrições confirmadas.
