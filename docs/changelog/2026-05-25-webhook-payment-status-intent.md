# fix: webhook não rebaixa inscrição paga por cobrança falha

**Data:** 2026-05-25
**Branch:** fix/webhook-payment-status
**Arquivos:** supabase/functions/mp-webhook/index.ts

## Causa raiz
O `mp-webhook` mapeava o status do Mercado Pago 1:1 para `payment_status` e
aplicava *last-event-wins*: cada notificação sobrescrevia o status da inscrição.
Como uma mesma inscrição pode ter **vários pagamentos** (mesma `external_reference`
— ex.: um QR Pix expira e o pagador gera outro, ou tenta cartão e depois Pix), uma
notificação de cobrança falha que chega **depois** do pagamento aprovado rebaixava
a inscrição já paga para `cancelled`.

Incidentes reais confirmados pelo `audit_log`:
- **Jenyfer** (08–09/05): `confirmed` pelo Pix `157629342817`; no dia seguinte o QR
  anterior `157585521511` expirou (`cancelled/expired`) → `cancelled_webhook`.
- **Jean** (22/05): `confirmed` pelo Pix `159798993837`; 24 min depois o cartão
  `160582551402` foi recusado (`rejected: cc_rejected_high_risk`) → `cancelled_webhook`.
- (**Lucas** estava cancelado, mas por `UPDATE` manual fora do webhook — não é este bug.)

## O fix
Status do MP → **intent**, não status 1:1:
- `approved` → **confirm** (passa pelo gate de valor #31, marca `confirmed`)
- `refunded` / `charged_back` → **reverse** (dinheiro devolvido: rebaixa para `cancelled`)
- demais (`cancelled`, `rejected`, `pending`, `in_process`, `in_mediation`) → **ignore**:
  registra `payment.ignored_webhook` no audit e **não altera** a inscrição.

Assim só um pagamento aprovado confirma, e só um estorno real cancela. Uma cobrança
que nunca vingou (QR expirado, cartão recusado) ou ainda em andamento não toca mais
o status. Gate de valor, lógica de time e guard `.neq('cancelled')` preservados.

## Impacto
- Edge function `mp-webhook` re-deployada (v7, `verify_jwt:false`).
- 3 inscrições pagas mas canceladas foram restauradas manualmente (`confirmed` + `pix`):
  Jenyfer, Jean, Lucas — todas com pagamento `approved` sem estorno, conferidas no
  extrato do MP.
