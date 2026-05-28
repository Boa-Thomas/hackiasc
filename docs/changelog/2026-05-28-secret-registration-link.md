# feat: secret registration link (early access bypasses closed window)

**Data:** 2026-05-28
**Branch:** feat/secret-registration-link
**Arquivos alterados:** src/components/RegistrationForm.jsx

## O que foi feito
O parâmetro de URL `?early=CODE` (acesso antecipado) agora também ignora o
encerramento da janela de inscrição e o limite de capacidade, virando um
"passe livre" — espelhando o comportamento já existente do modo voucher.

- `effectiveEnd = hasEarlyAccess ? null : regEnd` — quem entra pelo link
  consegue se inscrever mesmo após `registrationEnd`.
- Gate de capacidade (`capacityFull`) passa a ter `&& !hasEarlyAccess`, então
  o link fura o limite de 100 vagas.
- `hasEarlyAccess` ganhou guard de código vazio
  (`!!EVENT_CONFIG.earlyAccessCode && ...`), espelhando `hasDatiDiscount`.

## Por que
As inscrições encerraram em 27/05, mas a organização precisava permitir que
algumas pessoas específicas ainda se inscrevessem via link secreto.

## Decisões técnicas
- Reusar o `earlyAccessCode` existente (já em env var `VITE_EARLY_ACCESS_CODE`)
  em vez de criar uma nova env var — deploy imediato, sem mexer no workflow.
- Preço mantido na lógica normal: como o early bird esgotou, cobra o lote
  regular (R$ 200). Não force-aplicamos early bird.
- Guard de código vazio é essencial: sem ele, um `VITE_EARLY_ACCESS_CODE`
  vazio + `/?early=` abriria acesso universal após esta mudança.

## Impacto
- Link: `https://hackiasc.com/?early=<código>`.
- O gate de inscrição é puramente client-side (RLS permite `anon` INSERT) —
  não é uma trava à prova de quem conhece a API.
- O código atual (`whatsapp2026`) já foi divulgado na comunidade WhatsApp;
  rotacionar o secret se for preciso exclusividade real.

## Próximos passos
- Se necessário exclusividade, rotacionar `VITE_EARLY_ACCESS_CODE`
  (`.env.local` + GitHub Secret) para um valor novo.
