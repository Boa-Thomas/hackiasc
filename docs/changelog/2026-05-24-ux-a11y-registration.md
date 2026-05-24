# fix: UX and a11y improvements in registration flow + landing

**Data:** 2026-05-24
**Branch:** fix/ux-a11y-improvements
**Arquivos alterados:** Hero.jsx, RegistrationForm.jsx, CountdownFloat.jsx, FAQ.jsx, Timeline.jsx

## O que foi feito
Melhorias de acessibilidade e usabilidade no fluxo de inscrição e na landing,
derivadas de auditoria de UX (perspectiva do participante):

- **Datas centralizadas**: `Hero` e a mensagem de prazo de inscrição no
  `RegistrationForm` passaram a usar `EVENT_CONFIG` em vez de strings hardcoded
  (o evento já foi adiado uma vez — hardcode causava divergência).
- **Acessibilidade (WCAG 2.1 A)**: radio buttons customizados (perfil, nível de
  IA, modalidade, e dentro de `MemberCard`) agora têm `id`/`htmlFor` associando
  label↔controle. `CountdownFloat` ganhou `role="timer"` + `aria-live`.
- **Validação visível**: ao submeter com erro, `MemberCard` colapsado e a seção
  de termos se auto-expandem para o usuário ver o que corrigir (sem alterar a
  lógica de consentimento).
- **Restrição alimentar**: chips "Não tenho / Sim, tenho" antes do texto livre —
  reduz atrito e dados sujos ("nao", "nenhuma").
- **Performance**: `URLSearchParams` movido para `useMemo` (era recriado a cada
  render).
- **FAQ**: perguntas sobre prazo de pagamento e transferência de inscrição.
- **CountdownFloat**: preço hardcoded removido (evita exibir valor errado);
  layout mobile compacto.
- **Timeline**: removida dependência do WhatsApp para horários ("a confirmar —
  detalhes por e-mail e WhatsApp").

## Por que
Reduzir atrito e barreiras de acessibilidade na inscrição, e eliminar valores
hardcoded que divergem do `config.js` após mudanças de data.

## Impacto
- Sem breaking change. Build e lint sem regressão (1 erro a menos que baseline).
- Dados de `dietary_restrictions` mais consistentes daqui pra frente.
