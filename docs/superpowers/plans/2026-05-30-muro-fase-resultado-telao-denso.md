# Muro de Dores v2 — fase "Resultado" + telão denso — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar a 4ª fase `results` ao Muro de Dores e reescrever o telão para caber todas as dores numa tela só (cards densos só-título), revelando o ranking de votos apenas na fase de resultado.

**Architecture:** Fluxo de fases `closed → wall_open → voting_open → results`. A fase nova é liberada no banco (CHECK + `wall_set_phase`). O telão (`WallScreen`) reordena/renderiza no cliente: ordem estável por criação enquanto coleta/vota (sem números), ranking por votos só em `results`. Densidade de grid adaptativa via helper puro testável.

**Tech Stack:** React 19, Vite, Tailwind v4, Supabase (Postgres RPC SECURITY DEFINER), Vitest.

---

## File Structure

- `migrations/add_wall_results_phase.sql` (novo) — libera fase `results` no `CHECK` de `wall_state.phase` e no `wall_set_phase`. Idempotente, aplicada à mão no SQL Editor.
- `src/wall/wallLayout.js` (novo) — helper puro `densityFor(n)` e `sortPainsForPhase(pains, phase)`. Única lógica testável; isolada para vitest.
- `src/wall/wallLayout.test.js` (novo) — testes do helper.
- `src/wall/useWallSession.js` (modificar) — `PHASE_LABELS.results`.
- `src/wall/WallScreen.jsx` (reescrever layout) — telão denso + fases.
- `src/admin/AdminWall.jsx` (modificar) — 4º botão de fase.
- `src/wall/WallParticipant.jsx` (modificar) — fase `results` read-only.

> **Nota de estilo (memória `formatter-hook-conflict`):** o hook de formatação do repo briga com o padrão aspas-simples/sem-ponto-e-vírgula nos `.js/.jsx`. Edite esses arquivos via **Bash** (heredoc/`cat`), não via Edit/Write, ou confira o resultado depois. O `.sql` e o `.md` não sofrem com isso.

---

## Task 1: Migração — liberar a fase `results` no banco

**Files:**

- Create: `migrations/add_wall_results_phase.sql`

- [ ] **Step 1: Escrever a migração**

Conteúdo exato de `migrations/add_wall_results_phase.sql`:

```sql
-- ============================================================
-- MIGRACAO: Muro de Dores — 4a fase 'results' (votacao encerrada)
-- ============================================================
-- Aplique no Supabase SQL Editor (NAO e auto-aplicada).
-- Idempotente. Depende de add_pain_wall.sql + add_wall_identity.sql.
--
-- Adiciona a fase 'results' ao fluxo:
--   closed -> wall_open -> voting_open -> results
-- Em 'results' ninguem vota; o telao revela o ranking final com a contagem.
-- Nenhuma tabela nova, nenhum dado tocado.

-- 1. Libera 'results' no CHECK do singleton wall_state.phase.
ALTER TABLE wall_state DROP CONSTRAINT IF EXISTS wall_state_phase_check;
ALTER TABLE wall_state ADD CONSTRAINT wall_state_phase_check
  CHECK (phase IN ('closed','wall_open','voting_open','results'));

-- 2. Libera 'results' na validacao do wall_set_phase. Recria com a mesma
--    assinatura/grants vigentes (add_wall_identity.sql), so mudando o IN(...).
CREATE OR REPLACE FUNCTION wall_set_phase(p_phase TEXT)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF p_phase NOT IN ('closed','wall_open','voting_open','results') THEN
    RAISE EXCEPTION 'invalid_phase';
  END IF;

  UPDATE wall_state SET phase = p_phase, updated_at = now() WHERE id = true;

  RETURN json_build_object('ok', true, 'phase', p_phase);
END;
$$;

REVOKE ALL ON FUNCTION wall_set_phase(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wall_set_phase(TEXT) TO authenticated;
```

- [ ] **Step 2: Aplicar no Supabase**

Rodar o conteúdo no Supabase SQL Editor (ou via MCP `apply_migration` com name `add_wall_results_phase`). Confirmar sucesso sem erro.

Verificação rápida (SQL Editor):

```sql
SELECT wall_set_phase('results');   -- deve retornar {"ok":true,"phase":"results"}
SELECT wall_set_phase('closed');    -- volta para fechado
```

Expected: a primeira chamada NÃO levanta `invalid_phase`.

- [ ] **Step 3: Commit**

```bash
git add migrations/add_wall_results_phase.sql
git commit -m "feat(db): 4a fase 'results' no muro (votacao encerrada, dores visiveis)"
```

---

## Task 2: Helper de layout do telão (TDD)

Lógica pura isolada: quantas colunas/qual tamanho de fonte por nº de dores, e como ordenar conforme a fase. Testável com vitest (padrão de `src/lib/*.test.js`).

**Files:**

- Create: `src/wall/wallLayout.js`
- Test: `src/wall/wallLayout.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Conteúdo de `src/wall/wallLayout.test.js`:

```js
import { describe, it, expect } from "vitest";
import { densityFor, sortPainsForPhase } from "./wallLayout";

describe("densityFor", () => {
  it("usa 3 colunas e fonte grande para poucas dores", () => {
    expect(densityFor(1).cols).toBe(3);
    expect(densityFor(12).cols).toBe(3);
  });
  it("escala colunas conforme a quantidade", () => {
    expect(densityFor(13).cols).toBe(4);
    expect(densityFor(24).cols).toBe(4);
    expect(densityFor(25).cols).toBe(5);
    expect(densityFor(40).cols).toBe(5);
    expect(densityFor(41).cols).toBe(6);
    expect(densityFor(200).cols).toBe(6);
  });
  it("devolve uma classe de titulo (string nao vazia) em cada faixa", () => {
    for (const n of [1, 13, 25, 41]) {
      expect(typeof densityFor(n).titleClass).toBe("string");
      expect(densityFor(n).titleClass.length).toBeGreaterThan(0);
    }
  });
});

describe("sortPainsForPhase", () => {
  const pains = [
    { id: "a", created_at: "2026-05-30T10:00:00Z", vote_count: 1 },
    { id: "b", created_at: "2026-05-30T10:01:00Z", vote_count: 5 },
    { id: "c", created_at: "2026-05-30T10:02:00Z", vote_count: 3 },
  ];
  it("ordena por criacao (estavel) fora de results", () => {
    expect(sortPainsForPhase(pains, "wall_open").map((p) => p.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(sortPainsForPhase(pains, "voting_open").map((p) => p.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
  it("ordena por votos desc (desempate por criacao) em results", () => {
    expect(sortPainsForPhase(pains, "results").map((p) => p.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });
  it("nao muta o array recebido", () => {
    const copy = [...pains];
    sortPainsForPhase(pains, "results");
    expect(pains).toEqual(copy);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- wallLayout`
Expected: FAIL — `Cannot find module './wallLayout'` / `densityFor is not a function`.

- [ ] **Step 3: Implementar o helper**

Conteúdo de `src/wall/wallLayout.js`:

```js
// Layout do telao do Muro de Dores. Logica pura (sem React) para caber em teste.

// Densidade do grid por quantidade de dores visiveis: telao tem que caber numa
// tela so (sem scroll). Faixas calibradas para ~20-50 dores num projetor 1080p.
export function densityFor(n) {
  if (n <= 12) return { cols: 3, titleClass: "text-3xl xl:text-4xl" };
  if (n <= 24) return { cols: 4, titleClass: "text-2xl xl:text-3xl" };
  if (n <= 40) return { cols: 5, titleClass: "text-xl xl:text-2xl" };
  return { cols: 6, titleClass: "text-lg xl:text-xl" };
}

// Mapa cols -> classe Tailwind ESTATICA (Tailwind nao gera classe dinamica).
const COL_CLASS = {
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
};

export function gridColsClass(cols) {
  return COL_CLASS[cols] || "grid-cols-4";
}

// Ordena para exibicao. Fora de 'results': estavel por criacao (cards nao pulam
// e nao vazam o placar). Em 'results': ranking por votos, desempate por criacao.
export function sortPainsForPhase(pains, phase) {
  const arr = [...(pains || [])];
  if (phase === "results") {
    return arr.sort(
      (a, b) =>
        (b.vote_count || 0) - (a.vote_count || 0) ||
        String(a.created_at).localeCompare(String(b.created_at)),
    );
  }
  return arr.sort((a, b) =>
    String(a.created_at).localeCompare(String(b.created_at)),
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- wallLayout`
Expected: PASS (todos os testes verdes).

- [ ] **Step 5: Commit**

```bash
git add src/wall/wallLayout.js src/wall/wallLayout.test.js
git commit -m "feat(wall): helper de densidade e ordenacao do telao (TDD)"
```

---

## Task 3: Label da fase `results`

**Files:**

- Modify: `src/wall/useWallSession.js` (objeto `PHASE_LABELS`, ~linha 88-92)

- [ ] **Step 1: Adicionar o label**

Em `src/wall/useWallSession.js`, o objeto `PHASE_LABELS` deve ficar:

```js
export const PHASE_LABELS = {
  closed: "Fechado",
  wall_open: "Muro aberto",
  voting_open: "Votação aberta",
  results: "Resultado",
};
```

- [ ] **Step 2: Verificar build/lint**

Run: `npm run lint`
Expected: sem novos erros.

- [ ] **Step 3: Commit**

```bash
git add src/wall/useWallSession.js
git commit -m "feat(wall): label 'Resultado' para a fase results"
```

---

## Task 4: Admin — 4º botão de fase

**Files:**

- Modify: `src/admin/AdminWall.jsx` (array `PHASES` ~linha 5-9; grid ~linha 77)

- [ ] **Step 1: Adicionar a fase ao array `PHASES`**

O array passa a ser:

```jsx
const PHASES = [
  { id: "closed", label: "Fechado", help: "Ninguém registra nem vota." },
  {
    id: "wall_open",
    label: "Muro aberto",
    help: "Participantes registram dores.",
  },
  {
    id: "voting_open",
    label: "Votação aberta",
    help: "Participantes votam (até 3).",
  },
  {
    id: "results",
    label: "Resultado",
    help: "Votação encerrada. Telão revela o ranking. Ninguém vota.",
  },
];
```

- [ ] **Step 2: Ajustar o grid de botões para caber 4**

Trocar a classe do container dos botões de fase (atual `grid sm:grid-cols-3 gap-3`) por:

```jsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
```

- [ ] **Step 3: Verificar build**

Run: `npm run build`
Expected: build OK.

Verificação manual: abrir o painel admin → aba do Muro → ver 4 botões; clicar "Resultado" não deve dar erro (RPC aceita após Task 1).

- [ ] **Step 4: Commit**

```bash
git add src/admin/AdminWall.jsx
git commit -m "feat(admin): botao da fase Resultado no painel do muro"
```

---

## Task 5: Participante — fase `results` read-only

**Files:**

- Modify: `src/wall/WallParticipant.jsx` (bloco da lista ~linha 262; `PhaseBadge` ~linha 377-388)

- [ ] **Step 1: Renderizar a lista também em `results`**

A condição que envolve a lista de dores (atual `{(phase === 'wall_open' || phase === 'voting_open') && (`) passa a incluir `results`:

```jsx
{(phase === 'wall_open' || phase === 'voting_open' || phase === 'results') && (
```

`canVote` continua `phase === 'voting_open'` (já é assim na linha ~270), então em `results` os cards aparecem **sem** botão votar. Nenhuma outra mudança nesse bloco.

- [ ] **Step 2: Aviso de votação encerrada em `results`**

Logo após o bloco do contador de votos (`{phase === 'voting_open' && (...)}`, termina ~linha 259), adicionar:

```jsx
{
  phase === "results" && (
    <div className="card-glass rounded-2xl p-4 text-center">
      <span className="text-white/70 text-sm">
        Votação encerrada. Veja o resultado no telão. 🏆
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Estilo do `PhaseBadge` para `results`**

No componente `PhaseBadge`, o objeto `styles` passa a ter:

```jsx
const styles = {
  closed: "text-white/50 border-white/20",
  wall_open: "text-hot border-hot/40 bg-hot/10",
  voting_open: "text-gold border-gold/40 bg-gold/10",
  results: "text-cyan border-cyan/40 bg-cyan/10",
};
```

- [ ] **Step 4: Verificar build**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 5: Commit**

```bash
git add src/wall/WallParticipant.jsx
git commit -m "feat(wall): fase results read-only no #muro do participante"
```

---

## Task 6: Telão denso (reescrita do `WallScreen`)

Reescreve o `<main>` do telão: cards densos só-título, densidade adaptativa, votos só em `results`. Usa os helpers da Task 2.

**Files:**

- Modify: `src/wall/WallScreen.jsx` (imports ~linha 1-3; cálculo de derivados ~linha 37-39; `<main>` ~linha 88-158)

- [ ] **Step 1: Importar os helpers**

No topo, junto do import de `PHASE_LABELS`:

```jsx
import { PHASE_LABELS } from "./useWallSession";
import { densityFor, gridColsClass, sortPainsForPhase } from "./wallLayout";
```

- [ ] **Step 2: Trocar os derivados de voto/ordem**

Substituir o bloco atual:

```jsx
const maxVotes = pains.reduce((m, p) => Math.max(m, p.vote_count || 0), 0);
const totalVotes = pains.reduce((s, p) => s + (p.vote_count || 0), 0);
const showVotes = phase === "voting_open";
```

por:

```jsx
const showVotes = phase === "results";
const ordered = sortPainsForPhase(pains, phase);
const maxVotes = pains.reduce((m, p) => Math.max(m, p.vote_count || 0), 0);
const totalVotes = pains.reduce((s, p) => s + (p.vote_count || 0), 0);
const density = densityFor(ordered.length);
```

> O contador de votos no cabeçalho (`{showVotes && (...totalVotes...)}`) e a linha "Votação aberta — 3 votos por pessoa" passam automaticamente a aparecer só em `results` por causa do novo `showVotes`. Trocar essa frase: onde está `Votação aberta — 3 votos por pessoa`, ela fica sob `showVotes` (results) — substituir o texto por `Resultado final da votação`.

- [ ] **Step 3: Mensagem do cabeçalho da votação aberta**

No `<header>`, dentro do `{showVotes && (...)}` que renderiza a legenda à direita (atual texto `Votação aberta — 3 votos por pessoa`), trocar por:

```jsx
{
  showVotes && (
    <p className="text-white/50 font-mono text-lg mt-2">
      Resultado final da votação
    </p>
  );
}
```

E logo abaixo do badge de fase, adicionar a chamada para a votação aberta (fora do `showVotes`):

```jsx
{
  phase === "voting_open" && (
    <p className="text-gold/80 font-mono text-lg mt-2">
      Vote no celular · 3 votos por pessoa
    </p>
  );
}
```

- [ ] **Step 4: Reescrever o `<main>` (grid denso título-only)**

Substituir todo o bloco `{!error && phase !== 'closed' && pains.length > 0 && (...)}` (o grid atual, ~linha 109-157) por:

```jsx
{
  !error && phase !== "closed" && ordered.length > 0 && (
    <div className={`grid ${gridColsClass(density.cols)} gap-4 auto-rows-max`}>
      {ordered.map((p, i) => {
        const isTop = showVotes && p.vote_count === maxVotes && maxVotes > 0;
        return (
          <div
            key={p.id}
            className={`card-glass rounded-2xl p-5 relative ${isTop ? "border-gold/60 glow-cyan" : ""}`}
          >
            {showVotes && (
              <div className="absolute -top-3 -right-3 flex items-center justify-center min-w-11 h-11 px-3 rounded-full bg-gold/20 border border-gold/50">
                <span className="font-mono text-2xl font-bold text-gold">
                  {p.vote_count}
                </span>
              </div>
            )}
            <p
              className={`${density.titleClass} font-display font-semibold text-white leading-tight`}
            >
              {p.title}
            </p>
            <div className="flex items-center gap-2 mt-3 text-sm font-mono text-white/40">
              {p.axis && (
                <span className="px-2.5 py-0.5 rounded-full bg-violet/15 text-violet">
                  {p.axis}
                </span>
              )}
              {p.author_name && (
                <span className="truncate">{p.author_name}</span>
              )}
              {showVotes && isTop && <span className="text-gold">🏆</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

> Mudanças-chave vs. o atual: sem `p.description`, sem `line-clamp`, sem lista de `voters`, sem `#{i+1}`; colunas vêm de `gridColsClass(density.cols)` (não mais `md:grid-cols-2 xl:grid-cols-3`); título usa `density.titleClass`. O `i` não é mais usado para numeração — pode remover do `.map` se o lint reclamar de variável não usada (`ordered.map((p) => {`).

- [ ] **Step 5: Ajustar a condição de "lista vazia"**

A condição do estado vazio usa `!pains.length`; manter, mas garantir consistência com `ordered`. Trocar `!pains.length` por `!ordered.length` nas duas condições (estado vazio e o grid já feito no Step 4).

- [ ] **Step 6: Verificar build e testes**

Run: `npm run build`
Expected: build OK, sem warning de classe Tailwind dinâmica.

Run: `npm test -- wallLayout`
Expected: PASS.

- [ ] **Step 7: Verificação manual (dev server)**

Run: `npm run dev`, abrir `/#telao` em outra aba e, no admin, alternar as fases:

- `wall_open`: cards só-título, contador de dores no topo, sem números nos cards.
- `voting_open`: igual, legenda "Vote no celular", **sem** números nos cards, cards não pulam de posição ao votar.
- `results`: cards reordenam por voto, número no canto, pódio (top) com borda dourada + 🏆, cabeçalho "Resultado final da votação".
- Com muitas dores (registrar ~25-45 via #muro ou admin add): grid adensa para 5/6 colunas e cabe sem scroll.

- [ ] **Step 8: Commit**

```bash
git add src/wall/WallScreen.jsx
git commit -m "feat(wall): telao denso so-titulo + reveal de ranking so em results"
```

---

## Self-Review (já aplicado)

- **Cobertura do spec:** A=Task 1; B(telão)=Task 6 + helper Task 2; C(admin)=Task 4; D(participante)=Task 5; E(label)=Task 3. ✅
- **`showVotes`** muda de `voting_open` → `results` (Task 6 Step 2) — alinhado ao spec "esconder números na votação". ✅
- **Ordenação estável** evita o vazamento do placar e cards saltando na votação (Task 2 + Task 6). ✅
- **Tailwind dinâmico:** `gridColsClass` usa classes estáticas (`grid-cols-3..6`) — não quebra o JIT. ✅
- **Sem placeholders:** todo passo tem código/comando concreto. ✅
- **Nomes consistentes:** `densityFor`, `gridColsClass`, `sortPainsForPhase` usados iguais em teste e telão. ✅
