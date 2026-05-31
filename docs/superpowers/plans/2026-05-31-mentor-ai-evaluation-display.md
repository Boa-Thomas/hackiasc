# Avaliação da IA no painel do mentor — exibição mais clara · Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar a avaliação do IA Evaluator mais legível no painel do mentor (e, de quebra, na aba Entregas do admin): overview com quebra por critério, parecer da IA elevado, cor semântica e proveniência — sem mudança de backend.

**Architecture:** Um helper puro de cor semântica (`aiEvalDisplay.js`) compartilhado; um componente novo `AiAggregateView` que substitui o box-só-número triplicado (mentor + admin); e o `AiEvaluationView` (já compartilhado mentor/admin) enriquecido com barras, proveniência e o parecer como callout no rodapé. Todo o dado já vem da RPC `mentor_serialize_me` e do `aggregateTeamEvaluation` existente.

**Tech Stack:** React 19, Tailwind CSS v4 (tokens do projeto: `cyan`/`gold`/`hot`/`violet`/`text-muted`), Vitest (environment `node`, só funções puras).

**Spec:** `docs/superpowers/specs/2026-05-31-mentor-ai-evaluation-display-design.md`

---

## File Structure

- **Create** `src/lib/aiEvalDisplay.js` — helper puro: `scoreTone(score)` e `toneClasses(score)` (cor semântica 0–100). Fonte única de cor para overview e detalhe.
- **Create** `src/lib/aiEvalDisplay.test.js` — testes vitest do helper.
- **Create** `src/lib/AiAggregateView.jsx` — overview agregado (hero + 4 critérios com barra). Presentacional, sem estado/fetch.
- **Modify** `src/lib/AiEvaluationView.jsx` — barras/cor, linha de proveniência, rótulo "média do entregável", parecer elevado a callout no rodapé.
- **Modify** `src/mentor/MentorPanel.jsx` — troca o box agregado por `<AiAggregateView agg={agg} />`.
- **Modify** `src/admin/AdminDeliverables.jsx` — troca o box agregado por `<AiAggregateView agg={agg} />`.

Convenção de cor (helper): **hi** ≥ 75 → cyan · **mid** 50–74 → gold · **lo** < 50 → hot · sem nota → text-muted.

---

## Task 1: Helper de cor semântica (`aiEvalDisplay`)

**Files:**

- Create: `src/lib/aiEvalDisplay.js`
- Test: `src/lib/aiEvalDisplay.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Create `src/lib/aiEvalDisplay.test.js`:

```js
import { describe, it, expect } from "vitest";
import { scoreTone, toneClasses } from "./aiEvalDisplay";

describe("scoreTone", () => {
  it("classifica por faixa: hi >=75, mid 50-74, lo <50", () => {
    expect(scoreTone(75)).toBe("hi");
    expect(scoreTone(100)).toBe("hi");
    expect(scoreTone(74)).toBe("mid");
    expect(scoreTone(50)).toBe("mid");
    expect(scoreTone(49)).toBe("lo");
    expect(scoreTone(0)).toBe("lo");
  });

  it("aceita string numérica", () => {
    expect(scoreTone("80")).toBe("hi");
  });

  it("devolve null para ausência/valor inválido", () => {
    expect(scoreTone(null)).toBeNull();
    expect(scoreTone(undefined)).toBeNull();
    expect(scoreTone(NaN)).toBeNull();
    expect(scoreTone("abc")).toBeNull();
  });
});

describe("toneClasses", () => {
  it("mapeia a nota para classes Tailwind de texto e barra", () => {
    expect(toneClasses(90)).toEqual({ text: "text-cyan", bar: "bg-cyan" });
    expect(toneClasses(60)).toEqual({ text: "text-gold", bar: "bg-gold" });
    expect(toneClasses(30)).toEqual({ text: "text-hot", bar: "bg-hot" });
  });

  it("usa fallback neutro quando não há nota", () => {
    expect(toneClasses(null)).toEqual({
      text: "text-text-muted",
      bar: "bg-white/20",
    });
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/aiEvalDisplay.test.js`
Expected: FAIL — "Failed to resolve import './aiEvalDisplay'" (módulo ainda não existe).

- [ ] **Step 3: Implementar o helper**

Create `src/lib/aiEvalDisplay.js`:

```js
// Cor semântica por nota 0–100, compartilhada pelo overview agregado
// (AiAggregateView) e pelo detalhe por entregável (AiEvaluationView), usados
// tanto pelo painel do mentor quanto pela aba Entregas do admin.
// Faixas: hi >= 75 (cyan), mid 50–74 (gold), lo < 50 (hot). Funções puras.

export function scoreTone(score) {
  const s = Number(score);
  if (score == null || !Number.isFinite(s)) return null;
  if (s >= 75) return "hi";
  if (s >= 50) return "mid";
  return "lo";
}

const TONE = {
  hi: { text: "text-cyan", bar: "bg-cyan" },
  mid: { text: "text-gold", bar: "bg-gold" },
  lo: { text: "text-hot", bar: "bg-hot" },
};

export function toneClasses(score) {
  const t = scoreTone(score);
  return t ? TONE[t] : { text: "text-text-muted", bar: "bg-white/20" };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/lib/aiEvalDisplay.test.js`
Expected: PASS (2 describes, todos verdes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/aiEvalDisplay.js src/lib/aiEvalDisplay.test.js
git commit -m "feat(ia): helper de cor semântica por nota (scoreTone/toneClasses)"
```

---

## Task 2: Componente `AiAggregateView` (overview agregado)

Componente presentacional. Sem teste de unidade (projeto não tem jsdom/RTL); verificado por `npm run build` + checagem visual nas tarefas de integração. Recebe a saída de `aggregateTeamEvaluation`.

**Files:**

- Create: `src/lib/AiAggregateView.jsx`

- [ ] **Step 1: Criar o componente**

Create `src/lib/AiAggregateView.jsx`:

```jsx
import { toneClasses } from "./aiEvalDisplay";

// Overview da nota IA agregada da equipe: hero (nota ponderada quando os 4
// critérios têm nota; senão "parcial n/4") + os 4 critérios oficiais com barra
// e cor semântica. Recebe a saída de aggregateTeamEvaluation (iaEvaluator.js).
// Fonte única usada pelo painel do mentor e pela aba Entregas do admin.
// Sem estado, sem fetch.
export default function AiAggregateView({ agg }) {
  if (!agg) return null;
  const complete = agg.total_score != null;

  return (
    <div className="flex flex-col sm:flex-row gap-4">
      <div className="sm:w-40 flex-shrink-0 rounded-xl border border-gold/25 bg-gradient-to-b from-gold/10 to-transparent p-4 flex flex-col justify-center">
        {complete ? (
          <>
            <span className="font-mono text-3xl font-bold text-gold leading-none">
              {agg.total_score}
            </span>
            <span className="text-xs text-text-muted mt-1">/ 100 agregada</span>
          </>
        ) : (
          <>
            <span className="font-mono text-lg font-bold text-gold leading-tight">
              parcial · {agg.scoredCriteria}/4
            </span>
            <span className="text-xs text-text-muted mt-1">
              critérios com nota
            </span>
          </>
        )}
        {agg.eliminated && (
          <span className="text-xs text-hot mt-2">⚠ eliminado</span>
        )}
        <span className="text-[10px] text-text-muted mt-2 leading-snug">
          Ponderada (cláusula 6) só fecha com os 4 critérios.
        </span>
      </div>

      <div className="flex-1 flex flex-col justify-center gap-2.5">
        {agg.criteria.map((c) => {
          const tone = toneClasses(c.score);
          const has = c.score != null;
          return (
            <div key={c.key}>
              <div className="flex justify-between items-center text-xs gap-2">
                <span className="text-white/80">
                  {c.label} <span className="text-white/40">{c.weight}%</span>
                  {c.key === "tecnica_ia" && (
                    <span className="ml-1.5 text-[9px] font-mono text-hot border border-hot/35 rounded px-1 align-middle">
                      ELIM
                    </span>
                  )}
                </span>
                <span
                  className={`font-mono font-bold ${has ? tone.text : "text-text-muted"}`}
                >
                  {has ? c.score : "aguardando"}
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                {has && (
                  <div
                    className={`h-full rounded-full ${tone.bar}`}
                    style={{ width: `${Math.max(0, Math.min(100, c.score))}%` }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar build**

Run: `npm run build`
Expected: build conclui sem erro (`dist/` gerado). O componente ainda não está referenciado em nenhuma tela — só garante que compila.

- [ ] **Step 3: Commit**

```bash
git add src/lib/AiAggregateView.jsx
git commit -m "feat(ia): AiAggregateView (overview agregado com quebra por critério)"
```

---

## Task 3: Enriquecer `AiEvaluationView` (detalhe por entregável)

Substitui o conteúdo do componente compartilhado: barras + cor nos critérios e eixos, linha de proveniência, rótulo "média do entregável" e o parecer (`summary`) elevado a callout violeta no **rodapé**. Mantém a assinatura `{ evaluation, label }` e o `return null` quando vazio.

**Files:**

- Modify: `src/lib/AiEvaluationView.jsx` (reescrita completa do arquivo)

- [ ] **Step 1: Reescrever o componente**

Replace o conteúdo INTEIRO de `src/lib/AiEvaluationView.jsx` por:

```jsx
import { toneClasses } from "./aiEvalDisplay";
import { relativeTime } from "./relativeTime";

// Render apresentacional de UMA avaliacao de entregavel do IA Evaluator: nota +
// criterios/justificativas (com barra e cor semantica) + eixos da clausula 5.3 +
// parecer da IA elevado a callout. Fonte unica usada pelo admin (aba Entregas) e
// pelo painel do mentor. Sem estado, sem fetch. Retorna null quando nao ha
// avaliacao gravada (scores vazio). `label` so e passado pelo mentor.
export default function AiEvaluationView({ evaluation, label = null }) {
  const ev = evaluation;
  if (!ev || !Array.isArray(ev.scores) || ev.scores.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {label && <p className="text-sm font-semibold text-white">{label}</p>}
          {(ev.model || ev.updated_at) && (
            <p className="text-[11px] text-text-muted font-mono truncate">
              {ev.model || ""}
              {ev.model && ev.updated_at ? " · " : ""}
              {ev.updated_at
                ? `avaliado há ${relativeTime(ev.updated_at)}`
                : ""}
            </p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <span className="font-mono text-cyan text-sm">
            {ev.total_score != null ? ev.total_score : "—"}
          </span>
          <p className="text-[10px] text-text-muted">
            média do entregável{ev.eliminated ? " · ⚠ eliminado" : ""}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {ev.scores.map((s) => {
          const tone = toneClasses(s.score);
          return (
            <div key={s.criterion_key} className="bg-white/5 rounded-lg p-2">
              <div className="flex justify-between text-xs">
                <span className="text-white/70">
                  {s.label} <span className="text-white/40">({s.weight}%)</span>
                </span>
                <span className={`font-mono font-bold ${tone.text}`}>
                  {s.score}
                </span>
              </div>
              <div className="mt-1 h-1 rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full ${tone.bar}`}
                  style={{
                    width: `${Math.max(0, Math.min(100, Number(s.score)))}%`,
                  }}
                />
              </div>
              {s.justification && (
                <p className="text-[11px] text-text-muted mt-1.5 whitespace-pre-wrap">
                  {s.justification}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {Array.isArray(ev.axes) && ev.axes.length > 0 && (
        <div className="space-y-1 pt-1">
          <p className="text-[10px] font-mono text-gold uppercase tracking-wider">
            Eixos da cláusula 5.3
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {ev.axes.map((a) => {
              const tone = toneClasses(a.score);
              return (
                <div key={a.key} className="bg-white/5 rounded-lg p-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-white/70">{a.label}</span>
                    <span className={`font-mono font-bold ${tone.text}`}>
                      {a.score}
                    </span>
                  </div>
                  <div className="mt-1 h-1 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${tone.bar}`}
                      style={{
                        width: `${Math.max(0, Math.min(100, Number(a.score)))}%`,
                      }}
                    />
                  </div>
                  {a.justification && (
                    <p className="text-[11px] text-text-muted mt-1.5 whitespace-pre-wrap">
                      {a.justification}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {ev.summary && (
        <div className="rounded-xl border border-violet/30 bg-gradient-to-b from-violet/10 to-transparent px-4 py-3">
          <p className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-violet/80 mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-violet" /> Parecer da
            IA · leve pro time
          </p>
          <p className="text-sm text-white/85 whitespace-pre-wrap leading-relaxed">
            {ev.summary}
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar build**

Run: `npm run build`
Expected: build conclui sem erro. (MentorPanel e AdminDeliverables já importam este componente; a mudança é só de markup interno.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/AiEvaluationView.jsx
git commit -m "feat(ia): AiEvaluationView com barras, proveniência e parecer elevado"
```

---

## Task 4: Integrar overview no painel do mentor

Substitui o box-só-número (`MentorPanel.jsx`, atualmente linhas ~158–168) por `<AiAggregateView agg={agg} />`. O `agg` já é calculado na linha 27.

**Files:**

- Modify: `src/mentor/MentorPanel.jsx`

- [ ] **Step 1: Adicionar o import**

No topo de `src/mentor/MentorPanel.jsx`, logo após a linha `import AiEvaluationView from '../lib/AiEvaluationView'` (linha 9), adicionar:

```jsx
import AiAggregateView from "../lib/AiAggregateView";
```

- [ ] **Step 2: Trocar o box agregado pelo componente**

Em `src/mentor/MentorPanel.jsx`, localizar este bloco (dentro do ramo `teamEvals.length === 0 ? ... : (<>`):

```jsx
<div className="flex items-center justify-between flex-wrap gap-2 bg-white/5 rounded-xl px-4 py-3">
  <span className="text-sm text-white/70">Nota IA agregada</span>
  <span className="font-mono text-gold text-sm">
    {agg.total_score != null
      ? `${agg.total_score} / 100`
      : agg.scoredCriteria > 0
        ? `parcial (${agg.scoredCriteria}/4 critérios)`
        : "—"}
    {agg.eliminated && <span className="ml-2 text-hot">⚠ eliminado</span>}
  </span>
</div>
```

E substituir por:

```jsx
<AiAggregateView agg={agg} />
```

- [ ] **Step 3: Verificar build**

Run: `npm run build`
Expected: build sem erro.

- [ ] **Step 4: Checagem visual manual**

Run: `npm run dev` e abrir o painel do mentor (`#mentor`). Conferir:

- Equipe com avaliação parcial → hero mostra "parcial · n/4" e critérios sem nota aparecem como "aguardando" com barra vazia.
- Equipe com os 4 critérios → hero mostra a nota ponderada `XX`; barras com cor (cyan/gold/hot) conforme a faixa.
- Critério "Execução Técnica e IA" mostra o selo ELIM.

(Se não houver dados de teste à mão, validar pelo menos que a seção renderiza sem erro de console; a checagem de estados completa fica na Task 6.)

- [ ] **Step 5: Commit**

```bash
git add src/mentor/MentorPanel.jsx
git commit -m "feat(mentor): overview agregado com quebra por critério (AiAggregateView)"
```

---

## Task 5: Integrar overview na aba Entregas do admin

Substitui o box-só-número idêntico (`AdminDeliverables.jsx`, linhas ~276–286) por `<AiAggregateView agg={agg} />`. O `agg` já é calculado na linha 266.

**Files:**

- Modify: `src/admin/AdminDeliverables.jsx`

- [ ] **Step 1: Adicionar o import**

No topo de `src/admin/AdminDeliverables.jsx`, logo após `import AiEvaluationView from '../lib/AiEvaluationView'` (linha 9), adicionar:

```jsx
import AiAggregateView from "../lib/AiAggregateView";
```

- [ ] **Step 2: Trocar o box agregado pelo componente**

Em `src/admin/AdminDeliverables.jsx`, localizar:

```jsx
{
  /* Nota IA agregada da equipe */
}
<div className="flex items-center justify-between flex-wrap gap-2 bg-white/5 rounded-xl px-4 py-3">
  <span className="text-sm text-white/70">Nota IA agregada</span>
  <span className="font-mono text-gold text-sm">
    {agg.total_score != null
      ? `${agg.total_score} / 100`
      : agg.scoredCriteria > 0
        ? `parcial (${agg.scoredCriteria}/4 critérios)`
        : "—"}
    {agg.eliminated && <span className="ml-2 text-hot">⚠ eliminado</span>}
  </span>
</div>;
```

E substituir por:

```jsx
{
  /* Nota IA agregada da equipe */
}
<AiAggregateView agg={agg} />;
```

- [ ] **Step 3: Verificar build**

Run: `npm run build`
Expected: build sem erro.

- [ ] **Step 4: Checagem visual manual**

Run: `npm run dev`, abrir o admin → aba Entregas, selecionar uma equipe. Conferir que o overview agregado aparece igual ao do mentor e que os cards `DeliverableEvaluator` abaixo continuam com os controles "1. Copiar pacote / 3. Gravar" intactos, agora com o `AiEvaluationView` enriquecido (barras + parecer no rodapé) na avaliação já gravada.

- [ ] **Step 5: Commit**

```bash
git add src/admin/AdminDeliverables.jsx
git commit -m "feat(admin): overview agregado por critério na aba Entregas (AiAggregateView)"
```

---

## Task 6: Verificação final

**Files:** nenhum (só verificação).

- [ ] **Step 1: Suíte de testes**

Run: `npx vitest run`
Expected: PASS — inclui `aiEvalDisplay.test.js` (novo) + `aiScores`/`iaEvaluator` existentes, todos verdes.

- [ ] **Step 2: Build de produção**

Run: `npm run build`
Expected: build conclui e gera `dist/`.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: sem novos erros nos arquivos tocados.

- [ ] **Step 4: Checagem manual dos estados (mentor)**

Com `npm run dev`, no painel do mentor, percorrer os estados:

- Sem avaliação ("A organização ainda não rodou a avaliação…") — inalterado.
- Parcial (1–3 critérios com nota) — hero "parcial · n/4", critérios faltantes "aguardando".
- Completo (4 critérios) — hero com nota ponderada e cores.
- Eliminado — `⚠ eliminado` no hero e no cabeçalho do entregável.
- Fase 1/2 (sem eixos) vs Fase 3 (com os 3 eixos da 5.3).
- Bloco com `summary` → callout violeta "Parecer da IA · leve pro time" no rodapé; sem `summary` → sem callout.
- Proveniência: bloco com `model` mostra "modelo · avaliado há Xh"; sem `model` mostra só "avaliado há Xh".

- [ ] **Step 5: Pre-deploy (antes de push pra master)**

Quando for integrar na master, rodar `/pre-deploy-verify` sobre o diff da branch (regra do projeto em CLAUDE.md). Não fazer push com pendência Critical/High em aberto.
