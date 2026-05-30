# Muro de Dores v2 — fase "Resultado" + telão denso

**Data:** 2026-05-30
**Status:** aprovado, pronto para plano

## Problema

No telão (`/#telao`) o muro renderiza cards com título + descrição que
**transbordam verticalmente** quando há muitas dores. O scroll prejudicou a
dinâmica: não ficou claro para a sala que existiam mais ideias abaixo da dobra.

Além disso, falta uma etapa no fluxo: depois da votação não há um estado em que
a votação está **encerrada** mas as dores (e o resultado) continuam **visíveis**
no telão para a revelação dos vencedores.

## Objetivo

1. **Telão que cabe numa tela só**, sem scroll: cards densos só com o título; a
   descrição fica para cada participante ler no celular.
2. **Nova 4ª fase `results`**: votação encerrada, dores visíveis, telão revela o
   ranking final com a contagem de votos.
3. **Sem efeito manada durante a votação**: o telão esconde os números enquanto
   a votação está aberta; só revela na fase `results`.

Fluxo final: `closed → wall_open → voting_open → results`.

## Fora de escopo

- Esconder a contagem de votos no **celular** do participante durante a votação.
  Decisão registrada: no celular os números continuam aparecendo (faz parte do
  ato de votar e ver o próprio voto). O suspense/reveal é coisa do telão, onde a
  sala olha junto. Pode ser revisto depois, mas não agora.
- Auto-rotação/paginação do telão. A abordagem é caber tudo numa tela só.

## Design

### A. Banco — nova fase `results`

Migração nova, idempotente: `migrations/add_wall_results_phase.sql`.

- `ALTER TABLE wall_state` — troca o `CHECK` de `phase` para incluir `'results'`
  (drop da constraint `wall_state_phase_check` se existir + add nova).
- `CREATE OR REPLACE FUNCTION wall_set_phase` — o `IF p_phase NOT IN (...)` passa
  a aceitar `'results'`. Recriada com a mesma assinatura/grants do
  `add_wall_identity.sql` (a definição vigente vem de lá).

Nenhuma tabela nova, nenhum dado tocado. `wall_list` **não muda** — já devolve
`vote_count` e `voters`; quem decide exibir é o frontend.

### B. Telão (`src/wall/WallScreen.jsx`) — reescrita do layout

- **Cards densos só com título** + eixo e autor em fonte pequena. **Sem
  descrição** (`p.description` deixa de ser renderado).
- **Densidade adaptativa** por quantidade de dores visíveis, para caber tudo sem
  scroll (`overflow-hidden` mantido). Faixas:
  - ≤ 12 dores → 3 colunas, fonte grande
  - ≤ 24 → 4 colunas
  - ≤ 40 → 5 colunas
  - \> 40 → 6 colunas, fonte menor
  - (helper puro `densityFor(n)` → `{ cols, titleClass }`, fácil de testar)
- **Por fase:**
  - `wall_open`: contador grande de dores; cards título-only; ordem **estável**
    por `created_at` (ascendente) — cards não pulam de lugar.
  - `voting_open`: mesmos cards, **sem número de voto** e sem badge de top;
    chamada _"Votação aberta — vote no celular"_. Ordem estável por `created_at`.
  - `results`: ordena por `vote_count` ↓ (desempate `created_at`); mostra a
    contagem por card; **destaca o pódio** (a(s) dor(es) com `vote_count` máximo
    com glow/borda dourada); cabeçalho "Resultado" com total de votos.
  - `closed`: inalterado ("Aguardando abertura...").
- **Ordenação no cliente**: o telão recebe a lista do `wall_list` (que vem
  ordenada por voto ↓) e **reordena por `created_at`** quando a fase não é
  `results`, para estabilidade visual. Em `results` mantém por voto.
- `showVotes` passa a ser `phase === 'results'` (antes era `voting_open`).

### C. Admin (`src/admin/AdminWall.jsx`)

- `PHASES` ganha 4ª entrada: `{ id: 'results', label: 'Resultado', help:
'Votação encerrada. Telão revela o ranking. Ninguém vota.' }`.
- Grid de botões de fase: `sm:grid-cols-3` → `sm:grid-cols-2 lg:grid-cols-4`.

### D. Participante (`src/wall/WallParticipant.jsx`)

- Bloco da lista de dores passa a renderizar também em `results`
  (`wall_open || voting_open || results`), **sem** botões de votar (`canVote`
  continua `phase === 'voting_open'`).
- Mensagem/badge para `results`: "Votação encerrada".
- `PhaseBadge` ganha estilo para `results`.

### E. Labels (`src/wall/useWallSession.js`)

- `PHASE_LABELS.results = 'Resultado'`.

## Arquivos tocados

- `migrations/add_wall_results_phase.sql` (novo)
- `src/wall/WallScreen.jsx` (reescrita do layout)
- `src/wall/useWallSession.js` (label)
- `src/admin/AdminWall.jsx` (4º botão)
- `src/wall/WallParticipant.jsx` (fase results read-only)

## Riscos / notas

- **Constraint name**: o `CHECK` de `wall_state.phase` tem nome auto-gerado
  (`wall_state_phase_check`). A migração faz `DROP CONSTRAINT IF EXISTS` por esse
  nome antes de recriar; se o nome divergir num ambiente, ajustar.
- **Densidade**: as faixas cobrem o caso realista (~20–50 dores para ~100
  participantes). Acima de ~60 dores a 6 colunas, fonte pequena, ainda pode
  apertar em telas 1080p — aceitável para o evento; não vamos paginar.
- **Estilo do código**: hook de formatação do repo briga com o padrão
  aspas-simples/sem-ponto-e-vírgula — editar os `.jsx` via Bash, não Edit/Write
  (ver memória `formatter-hook-conflict`).
- A migração **não é auto-aplicada**: rodar no Supabase SQL Editor (padrão das
  outras migrações do muro).
