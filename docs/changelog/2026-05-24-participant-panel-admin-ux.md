# fix: participant panel + admin UX improvements

**Data:** 2026-05-24
**Branch:** fix/ux-a11y-improvements
**Arquivos alterados:** ParticipantPanel.jsx, ParticipantLogin.jsx, TeamSection.jsx, AdminMentors.jsx

## O que foi feito
- **ParticipantPanel — bug de scroll**: o link "Finalizar pagamento" zerava o
  hash antes de setá-lo (`window.location.hash = ''`), jogando o usuário ao topo.
  Agora navega corretamente para `#inscricao`.
- **ParticipantPanel — aba "Evento"**: nova aba estática para inscritos com local,
  cidade, datas, cronograma resumido, "o que levar", link do WhatsApp e e-mail de
  contato — tudo lido de `EVENT_CONFIG`. Antes o inscrito tinha que voltar à
  landing pública para ver a agenda.
- **ParticipantLogin**: link `mailto` de ajuda ("Problemas para acessar? Fale com
  a organização") na mensagem de erro de autenticação/bloqueio.
- **TeamSection**: `confirm()` nativo do browser substituído por modal custom
  glassmorphism para "sair da equipe" (consistência visual + funciona em webviews).
- **AdminMentors**: dropdowns de equipe mostram "— já tem: <mentor>" quando a
  equipe já possui mentor pareado, evitando pareamento duplicado acidental.

## Por que
Melhorar a experiência de quem já está inscrito (informação operacional no
painel) e corrigir atrito/bugs no fluxo de equipe e admin.

## Impacto
- Sem breaking change. Build e lint sem regressão.
