# feat(admin): filtro de audiência para gráficos demográficos do dashboard

**Data:** 2026-05-21
**Branch:** claude/crazy-moser-79bce5
**Arquivos alterados:** src/admin/AdminDashboard.jsx

## O que foi feito

Adicionado um filtro de audiência no admin dashboard com três opções (Confirmados / + Pendentes / Todos) que controla quais inscrições são agregadas nos gráficos demográficos e operacionais. O default agora é "Confirmados", para que dados operacionais (catering, acessibilidade) reflitam apenas quem efetivamente irá ao evento.

`computeStats()` foi dividido em duas funções:
- `computeStats(registrations)` — métricas globais (contadores, receita, capacidade, funil, timeline, pagamentos stale)
- `computeDemographics(registrations)` — agregações que dependem da audiência selecionada

A escolha do admin é persistida em `localStorage` (`admin.dashboard.audience`).

## Por que

Restrições alimentares estavam sendo contabilizadas para participantes com ingresso cancelado, contaminando a tomada de decisão operacional do catering. O mesmo valia para PCD, modalidade, perfil e eixos econômicos.

## Decisões técnicas

- **Filtro de audiência ao invés de excluir canceladas hard-coded**: dá flexibilidade caso o admin precise olhar o universo completo para previsão/análise.
- **Default = Confirmados**: resolve o problema reportado sem exigir interação. Pendentes ficam de fora porque há canceladas que passaram por pendentes — o filtro responde à pergunta "quem efetivamente vai".
- **Métricas globais não respeitam o filtro**: contadores principais, receita, capacidade, funil e timeline são informativos por natureza (precisam mostrar o panorama todo). Apenas as métricas operacionais/demográficas mudam.
- **Audience label injetado no título dos cards**: deixa explícito qual subconjunto está sendo contado, evitando ambiguidade visual.
- **Persistência em localStorage**: cada admin mantém sua preferência entre sessões; falha silenciosa se storage não disponível.

## Impacto

- Restrições alimentares, PCD, perfil (Hacker/Hustler/Hipster/Enthusiast), modalidade, tier, IA (histograma + média), eixos econômicos, "Com projeto" e "Nível IA médio" agora respeitam o filtro.
- Sem breaking change: comportamento antigo disponível em "Todos".
- Sem mudanças de schema ou dependências.

## Próximos passos

- Considerar adicionar o mesmo filtro nas páginas `AdminRegistrations.jsx` e exports CSV se aplicável.
