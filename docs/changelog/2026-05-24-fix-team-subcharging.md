# fix: team subcharging in create-preference (issue #33)

**Data:** 2026-05-24
**Branch:** fix/team-subcharging
**Arquivos alterados:** supabase/functions/create-preference/index.ts

## O que foi feito
`create-preference` passou a cobrar o valor total da equipe (soma de `ticket_price`
de todos os membros ativos do `team_name`) em vez de um único ingresso. Inscrições
individuais permanecem inalteradas (cobram o próprio `ticket_price`).

## Por que
A edge function gerava a preferência do Mercado Pago com `quantity: 1` e
`unit_price = ticket_price` de uma única inscrição, mesmo para equipes de 2-6
pessoas. O frontend (`PaymentInfo.jsx`) já exibia o total correto (`preço × membros`),
mas o link de pagamento cobrava menos.

Efeito de segundo nível descoberto: o `mp-webhook` valida o pagamento contra
`SUM(ticket_price)` dos membros ativos e **recusa confirmar** se o valor não bater
(`payment.amount_mismatch`). Ou seja, equipes pagavam o valor menor e ficavam
`pending` para sempre, exigindo confirmação manual no admin.

## Decisões técnicas
- O valor cobrado **espelha exatamente** o gate do `mp-webhook` (soma de
  `ticket_price` dos membros não-cancelados, por `team_name`). Isso garante que o
  pagamento passe na validação em vez de cair em mismatch — robusto mesmo se os
  membros tiverem preços diferentes (líder early-bird + membro regular).
- Mantido `quantity: 1` com `unit_price` = total somado (preços podem variar entre
  membros, então não dá para usar `quantity: N × preço unitário`).
- Preço continua 100% server-side; o `amount` do cliente segue ignorado (mantém a
  defesa C4 contra manipulação de preço).
- `member_count` e `inscription_modality` adicionados ao audit log
  `payment.preference_created` para rastreabilidade.

## Impacto
- Equipes passam a receber link de pagamento com o valor correto e a confirmação
  automática volta a funcionar para times.
- Sem breaking change para inscrições individuais.
- Requer **deploy da edge function** (não é auto-aplicada).

## Próximos passos
- Deploy via MCP Supabase / dashboard.
- Verificar no admin se há equipes que pagaram a menor e ficaram pending (issue #33
  retroativo) — podem precisar de cobrança da diferença ou confirmação manual.
