# feat: extras do evento (export de notas, QR no check-in, rate-limit do muro)

**Data:** 2026-05-24
**Branch:** feat/event-extras

## #8 — Export de notas (CSV)
`AdminRanking.jsx`: botão "Exportar notas (CSV)" gera uma linha por equipe com
posição, nota oficial (média dos jurados), nota por critério, votos de eliminado e
nota da IA. Para o feedback por critério às equipes (edital 5.2.1, 10 dias úteis).

## #9 — QR no credenciamento
- `PaymentReturn.jsx`: exibe um QR com o `registration_id` (lido do `external_reference`
  da URL de retorno do MP) na tela de sucesso — para o participante apresentar no check-in.
- `AdminCheckin.jsx`: botão "Escanear QR" abre a câmera (`html5-qrcode`), lê o UUID e
  abre o **mesmo** fluxo de confirmação de identidade (CPF + nascimento) — sem bypass.
- Libs: `qrcode.react`, `html5-qrcode` (compatíveis com React 19).
- **Limitação conhecida:** o QR no PaymentReturn só aparece em pagamento por cartão
  (o `external_reference` vem na URL). Para PIX/confirmados via webhook, seria preciso
  expor o QR também no `ParticipantPanel` (follow-up). Câmera exige HTTPS/localhost.

## #10 — Rate-limit do muro
`migrations/add_wall_rate_limit.sql` (já aplicada em produção): recria `wall_submit_pain`
(máx 5 dores/device + throttle 5s) e `wall_vote` (throttle 2s), preservando toda a
lógica original e o `search_path` fixo.

## Impacto
Build e ESLint OK. Tudo aditivo. O QR no ParticipantPanel fica como follow-up para
cobrir participantes que pagaram via PIX.
