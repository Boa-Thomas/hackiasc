# feat: integrate Mercado Pago fee data into admin dashboard

**Data:** 2026-04-08
**Branch:** feat/mp-fees-integration
**Arquivos alterados:**
- migrations/create_mp_payments.sql (novo)
- migrations/setup_mp_sync_cron.sql (novo)
- supabase/functions/sync-mp-payments/index.ts (novo)
- src/admin/AdminFinanceiro.jsx (novo)
- src/admin/AdminDashboard.jsx (modificado)
- src/admin/AdminPanel.jsx (modificado)
- src/admin/AdminAuditLog.jsx (modificado)

## O que foi feito
Integração completa com a API do Mercado Pago para importar dados reais de pagamento e fees. Inclui:
- Tabela `mp_payments` para armazenar pagamentos com breakdown de taxas
- Edge Function `sync-mp-payments` com fetch paginado da API do MP
- Dashboard com receita bruta vs líquida vs taxas
- Nova aba "Financeiro" com tabela detalhada por transação
- Cron job (pg_cron) para sync automático a cada 15 min

## Por que
A "receita projetada" no dashboard era apenas a soma dos ticket_price, sem considerar as taxas do Mercado Pago (~4.99% + R$0.49 por cartão). O admin precisava ver o valor líquido real que cai na conta.

## Decisões técnicas
- Valores em centavos (integer) para evitar floating point
- `raw_data JSONB` para backup completo da resposta do MP
- Dual-auth na Edge Function: service_role key (pg_cron) + JWT (admin button)
- Staleness guard: se sync travar por >5min, permite novo sync
- RPC `get_mp_fee_summary()` para agregação server-side (evita fetch de todas as rows)
- `mp_sync_status` singleton para tracking de estado de sync
- RLS com `is_admin_or_viewer()` seguindo padrão pós-security-hardening

## Impacto
- Admin dashboard: revenue cards mudaram de confirmada/pendente/ticket/projetada para bruta/líquida/taxas/pendente
- Nova aba "Financeiro" no admin (adminOnly)
- Audit log: novas actions `mp_payments.sync` e `mp_payments.manual_sync`
- pg_cron requer Supabase Pro; sync manual funciona em qualquer plano

## Próximos passos
- Rodar migration `create_mp_payments.sql` no Supabase SQL Editor
- Deploy Edge Function: `supabase functions deploy sync-mp-payments`
- (Se Pro) Rodar migration `setup_mp_sync_cron.sql` com URLs reais
