# feat: guia do mentor como página de consulta no painel do mentor

**Data:** 2026-05-29
**Branch:** feat/guia-mentor
**Arquivos alterados:**
- `src/mentor/mentorGuideContent.jsx` (novo)
- `src/mentor/MentorGuide.jsx` (novo)
- `src/mentor/MentorPanel.jsx` (botão de acesso no header)
- `src/App.jsx` (rota gated `#mentor-guia`)

## O que foi feito
Adicionada uma página "Guia do Mentor" para consulta livre durante o evento, acessível por um
botão no header do `MentorPanel`. O guia tem navegação por abas (9 seções): Visão Geral, Metodologia,
Papel do Mentor, Cronograma, Avaliação, Ferramentas, Checklist, Glossário e Equipe. O conteúdo foi
adaptado do guia publicado em https://v0-guia-para-mentores.vercel.app/.

A rota é `#mentor-guia` e fica **dentro do gate de autenticação do mentor** já existente em `App.jsx`
(`if (page.startsWith('#mentor'))`): só mentores autenticados (login ou link secreto `?t=`) acessam;
um visitante sem sessão cai no `MentorLogin`. O botão "voltar ao painel" retorna para `#mentor`, e como
o token persiste em `sessionStorage`, não há re-login.

## Por que
Os mentores precisam de um material de referência único, acessível a qualquer momento durante as 54h,
sem depender do link da Vercel. Colocar dentro do painel do mentor (já protegido) mantém a rubrica e a
mecânica de julgamento longe do público participante.

## Decisões técnicas
- **Sem react-router:** o app usa roteamento manual por hash; a rota nova reaproveita esse padrão e o
  gate de auth do mentor — nenhuma dependência nova.
- **Reconciliação com o edital/site:** cronograma, formato de pitch e prêmios do guia divergem
  do que está publicado (`Timeline.jsx`/`Prizes.jsx`, que seguem o edital — ver
  `docs/metodologia/DIVERGENCIAS-CRONOGRAMA.md`). Para não exibir informação conflitante ao vivo:
  - Cronograma: **não transcreve** horários; traz só a "lente do mentor" por fase e linka para a
    seção oficial (`/#cronograma`).
  - Avaliação: lista os 4 critérios oficiais com pesos (os mesmos do site) + orientação conceitual
    sobre a demo ao vivo, sem transcrever o formato/tempo de pitch divergente.
  - Prêmios: seção **removida** (a pedido do usuário). Para não levar o mentor à tela de prêmios,
    a Avaliação não linka para `/#premios`.
- **Datas/contato vêm de `EVENT_CONFIG`** (config.js), fonte única — não hardcoded.
- **Classes de cor estáticas:** o conteúdo usa um mapa `TONE` com class strings literais em vez de
  interpolação (`bg-${tone}`), porque o Tailwind v4 só extrai classes literais. Confirmado no CSS
  compilado que todas as variantes (`bg-gold/5`, `border-violet/40`, etc.) foram geradas.
- **Lint react-refresh:** `mentorGuideContent.jsx` exporta só componentes (cada seção nomeada); a lista
  `{id,label}` vive como `const` local não-exportado no `MentorGuide.jsx`, satisfazendo a regra
  `react-refresh/only-export-components`.

## Impacto
- Afeta apenas a área do mentor. Landing pública inalterada (sem link novo no Navbar).
- Sem breaking changes, sem novas dependências.

## Verificação
- `npm run lint` limpo nos arquivos alterados; `npm run build` passa.
- Variantes de cor confirmadas no CSS compilado.
- Pendente (requer token de mentor real do Supabase): conferência visual da página autenticada.
