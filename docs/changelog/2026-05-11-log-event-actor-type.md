# fix: corrige actor_type em audit_log (log-event + refund-payment)

**Data:** 2026-05-11
**Branch:** fix/log-event-actor-type
**Arquivos alterados:** supabase/functions/log-event/index.ts, supabase/functions/refund-payment/index.ts

## O que foi feito

- `log-event/index.ts`: `actor_type: 'anon'` → `'public'`. Aceita `ticket_price=16000` (DATI) na validação.
- `refund-payment/index.ts`: `actor_type: 'user'` → `'admin'`.

## Por que

`audit_log.actor_type` tem CHECK constraint `IN ('public','admin','system')`. As edge functions enviavam `'anon'` e `'user'` (inválidos), e o INSERT do audit log falhava silenciosamente (Supabase JS devolve `{error}` sem throw, então a edge function só logava no console e retornava 500 ao client).

Sintoma observado em produção durante teste E2E com Playwright após o merge do PR #48: `POST /functions/v1/log-event` → `500 {"error":"Failed to write audit log"}` em cada submissão de inscrição. A inscrição em si era criada (INSERT 201), mas o audit ficava sem registro.

## Decisões técnicas

- Mesmo fix do PR #28 (já aberto). Extraí só o pedaço dos edge functions porque é o que estava produzindo 500 hoje; o resto do PR #28 (testes vitest pra `useTicketPrice`, UI de retry de MP refund) sai em separado.
- 16000 entra na allowlist de `ticket_price` porque é o valor DATI (regular 20000 − 20% desconto), já em uso pelo front via `EVENT_CONFIG.datiDiscountPercent`.

## Impacto

- `log-event` passa a retornar 200; audit_log finalmente recebe linhas com `actor_type='public'`.
- `refund-payment` passa a logar refunds corretamente em audit_log.
- Sem mudança de schema, sem migration.

## Próximos passos

- Deploy manual via `supabase functions deploy log-event` + `supabase functions deploy refund-payment`.
- Re-validar em prod com Playwright (submit de equipe → log-event = 200).
- PR #28 pode ser rebased após o merge; o conflito é só nas duas linhas que já estão aqui.
