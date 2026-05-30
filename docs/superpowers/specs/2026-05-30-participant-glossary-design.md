# Glossário de termos no painel do participante

**Data:** 2026-05-30
**Branch:** `feat/participant-glossary`

## Problema

O painel de entregáveis do participante (`DeliverablesSection`) usa termos da
metodologia HackIA sem explicá-los: "Tipo de protótipo" (Concierge IA, Mágico de
Oz IA, IA-real mínima, Pré-venda + Landing), SLC-IA, Saltos de Fé, BML,
Pivotar/Perseverar, RAG, P95, fallback, inferência. Hoje essas definições só
existem no guia do mentor (`mentorGuideContent.jsx`) — o participante não tem
acesso a elas.

## Solução

Um **glossário colapsável no topo de cada fase** dos entregáveis, reaproveitando
a redação já validada no glossário do guia do mentor. Fechado por padrão (não
atrapalha quem já conhece os termos); abre sob demanda.

### Componentes

- **`src/participant/TermsGlossary.jsx`** — componente reutilizável. Um
  `<details>` discreto com título "❔ O que significam esses termos?" que recebe
  `terms` (array de `[termo, definição]`) e os renderiza como lista. Estilo
  alinhado ao painel (card-glass / cores do tema).

- **`deliverableFields.js`** — passa a exportar `GLOSSARY`, um objeto com as
  listas de termos por fase: `hypotheses`, `slc`, `diary`, `final`.

### Integração

- `DeliverablesSection.jsx`: renderiza `<TermsGlossary>` no topo de cada fase
  (Hipóteses, SLC-IA, Diário/BML, Entregas), logo abaixo da barra de abas. Todos
  os glossários do participante ficam centralizados aqui; `LearningDiary` (também
  usado pela visão do mentor) não muda.

### Conteúdo do glossário (por fase)

**Fase 1 · Hipóteses:** Saltos de Fé; Hipótese de Valor; Hipótese de
Crescimento (motor: viral, pago, pegajoso, comunidade); Hipótese Técnica de IA;
Fallback; Inferência.

**Fase 2 · SLC-IA:** SLC-IA; Concierge IA; Mágico de Oz IA; IA-real mínima;
Pré-venda + Landing; RAG; P95.

**Fase 2 · Diário (BML):** BML (Build-Measure-Learn); Pivotar; Perseverar.

**Fase 3 · Entregas:** Deploy / SLC-IA deployed; Demo ao vivo.

## Fora de escopo

- Sem mudança de schema/DB — é 100% UI estática.
- Sem tooltips por campo nem descrição dinâmica de select (descartados em favor
  do glossário único por fase).

## Riscos / notas

- Manter a redação consistente com o glossário do guia do mentor.
- Estilo do repo: aspas simples, sem ponto e vírgula.
