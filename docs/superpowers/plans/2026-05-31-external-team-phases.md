# External Team Phases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each team's current hackathon phase (EQUIPE→PROBLEMA→SLC-IA→PIVOTAR→VENDA→PITCH→HERO) — read live (read-only) from an external Supabase project — as a badge in the HackIA SC admin **Times** and **Facilitador** panels.

**Architecture:** A second, read-only Supabase client (created lazily) reads the external `teams` table (`kpcaokuqblutdkfdqwfg`). Pure functions normalize/alias team names to match HackIA's own `teams.name`, and map the external `stage` string to an ordered phase object. A `useTeamPhases` hook polls every 20s and exposes a `getPhase(name)` lookup. Two admin components render a `<PhaseBadge>`. No writes to any database, no migration.

**Tech Stack:** React 19, Vite, `@supabase/supabase-js`, Tailwind v4, Vitest (node env, pure-function tests only — no jsdom).

---

## Repo gotchas (read before editing)

- **Code style:** single quotes, **no semicolons**, 2-space indent. Match it exactly.
- **Formatter hook:** a PostToolUse formatter runs on JS edits and can fight the repo style. If Write/Edit churn appears, prefer creating/modifying JS files via the Bash tool (heredoc), then re-run lint. Either way, **verify with `npm run lint` and `npm test` after each task.**
- **⚠️ The fenced code blocks in THIS plan were auto-reformatted to double quotes + semicolons by the doc formatter.** That is wrong for this repo — when you write the real files, use **single quotes and no semicolons** (the logic is unchanged; only the style differs).
- **Git is config-broken globally.** Commit with the safe prefix:
  ```bash
  git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' commit -m "..."
  ```
- **Vitest:** `environment: 'node'`, `globals: true`, but existing tests still `import { describe, it, expect } from 'vitest'` — follow that. Test files are co-located `*.test.js`.

## File structure

| File                             | Responsibility                                                  | New/Modify |
| -------------------------------- | --------------------------------------------------------------- | ---------- |
| `src/lib/config.js`              | `EXTERNAL_PHASE_TRACKER` block (url, anon key, phases, aliases) | Modify     |
| `src/lib/teamPhases.js`          | Pure logic + lazy external client                               | Create     |
| `src/lib/teamPhases.test.js`     | Unit tests for the pure logic                                   | Create     |
| `src/hooks/useTeamPhases.js`     | Polling hook → `getPhase`, `externalList`, `lastUpdated`        | Create     |
| `src/admin/PhaseBadge.jsx`       | Visual phase pill (or "—")                                      | Create     |
| `src/admin/AdminTeams.jsx`       | Badge per team card                                             | Modify     |
| `src/admin/AdminFacilitator.jsx` | "Fases das equipes" cockpit section                             | Modify     |

---

## Task 1: Config block

**Files:**

- Modify: `src/lib/config.js` (append after `STAFF_ACCESS_EMAIL`, line 63)

- [ ] **Step 1: Append the `EXTERNAL_PHASE_TRACKER` export**

Add at the end of `src/lib/config.js`:

```js
// ============================================================
// Tracking de fase das equipes — projeto Supabase EXTERNO (read-only)
// O painel "sapinho" (outra organização) registra a fase de cada equipe na
// tabela `teams` (coluna `stage`). A anon key abaixo é PÚBLICA (já exposta no
// index.html deployado deles); aqui é usada SOMENTE para leitura.
// ============================================================
export const EXTERNAL_PHASE_TRACKER = {
  url: "https://kpcaokuqblutdkfdqwfg.supabase.co",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwY2Fva3VxYmx1dGRrZmRxd2ZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0NDM4MDksImV4cCI6MjA5MTAxOTgwOX0.Vf5pqPFersTEHmpZ3BewjWHX9nUGBm-R5iisLCvhZms",

  // Fases ordenadas (rótulo + cor reaproveitados do painel externo).
  PHASES: [
    { key: "equipe", label: "Equipe", order: 0, color: "#22c55e" },
    { key: "problema", label: "Problema", order: 1, color: "#3b82f6" },
    { key: "slc", label: "SLC-IA", order: 2, color: "#06b6d4" },
    { key: "pivotar", label: "Pivotar", order: 3, color: "#a855f7" },
    { key: "venda", label: "Venda", order: 4, color: "#f59e0b" },
    { key: "pitch", label: "Pitch", order: 5, color: "#ec4899" },
    { key: "hero", label: "Hero", order: 6, color: "#f97316" },
  ],

  // Aliases de stage usados pelo sistema externo → chave canônica.
  STAGE_ALIASES: {
    ideia: "equipe",
    mvp: "slc",
    prototipo: "slc",
    solucao: "slc",
    codigo: "pivotar",
    vendas: "venda",
  },

  // Nomes que NÃO casam por normalização → mapeia nome-externo-normalizado para
  // o nome-HackIA-normalizado. (byAItas↔bAItas, EasyAI↔EasyIA)
  TEAM_NAME_ALIASES: {
    byaitas: "baitas",
    easyaiitcompany: "easyiaitcompany",
  },
};
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git -c safe.directory='*' add src/lib/config.js
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' commit -m "feat(phases): config do tracking externo de fase das equipes"
```

---

## Task 2: Pure logic + tests (`teamPhases.js`)

**Files:**

- Create: `src/lib/teamPhases.js`
- Test: `src/lib/teamPhases.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/lib/teamPhases.test.js`:

```js
import { describe, it, expect } from "vitest";
import {
  normalizeTeamName,
  stageToPhase,
  matchKey,
  mapExternalRows,
  buildPhaseLookup,
  findUnmatchedExternal,
} from "./teamPhases";

describe("normalizeTeamName", () => {
  it("remove acentos, emoji, espaços e pontuação; minúsculas", () => {
    expect(normalizeTeamName("Odonto Guard 🦷✨")).toBe("odontoguard");
    expect(normalizeTeamName("Combinado não sai caro")).toBe(
      "combinadonaosaicaro",
    );
    expect(normalizeTeamName("On.Ai")).toBe("onai");
    expect(normalizeTeamName("  ALLias ")).toBe("allias");
  });
  it("lida com vazio/nulo", () => {
    expect(normalizeTeamName("")).toBe("");
    expect(normalizeTeamName(null)).toBe("");
    expect(normalizeTeamName(undefined)).toBe("");
  });
});

describe("stageToPhase", () => {
  it("mapeia stage direto", () => {
    expect(stageToPhase("slc")).toMatchObject({
      key: "slc",
      order: 2,
      label: "SLC-IA",
    });
    expect(stageToPhase("equipe")).toMatchObject({ key: "equipe", order: 0 });
    expect(stageToPhase("hero")).toMatchObject({ key: "hero", order: 6 });
  });
  it("aplica aliases", () => {
    expect(stageToPhase("ideia").key).toBe("equipe");
    expect(stageToPhase("mvp").key).toBe("slc");
    expect(stageToPhase("prototipo").key).toBe("slc");
    expect(stageToPhase("solucao").key).toBe("slc");
    expect(stageToPhase("codigo").key).toBe("pivotar");
    expect(stageToPhase("vendas").key).toBe("venda");
  });
  it("é tolerante a caixa/espaços e devolve null no desconhecido", () => {
    expect(stageToPhase("  SLC ").key).toBe("slc");
    expect(stageToPhase("xyz")).toBeNull();
    expect(stageToPhase(null)).toBeNull();
    expect(stageToPhase("")).toBeNull();
  });
});

describe("matchKey", () => {
  it("casa pares problemáticos via alias", () => {
    expect(matchKey("byAItas")).toBe("baitas");
    expect(matchKey("bAItas")).toBe("baitas");
    expect(matchKey("EasyAI IT Company")).toBe("easyiaitcompany");
    expect(matchKey("EasyIA IT Company")).toBe("easyiaitcompany");
  });
  it("para nomes normais é só a normalização", () => {
    expect(matchKey("On.AI")).toBe("onai");
    expect(matchKey("On.Ai")).toBe("onai");
  });
});

describe("lookup + getPhase (via buildPhaseLookup)", () => {
  const rows = [
    { name: "byAItas", stage: "slc" },
    { name: "On.Ai", stage: "problema" },
    { name: "EasyAI IT Company", stage: "pitch" },
  ];
  it("resolve a fase a partir do nome HackIA", () => {
    const lookup = buildPhaseLookup(mapExternalRows(rows));
    expect(lookup.get(matchKey("bAItas")).key).toBe("slc");
    expect(lookup.get(matchKey("On.AI")).key).toBe("problema");
    expect(lookup.get(matchKey("EasyIA IT Company")).key).toBe("pitch");
    expect(lookup.get(matchKey("MindRift"))).toBeUndefined();
  });
});

describe("findUnmatchedExternal", () => {
  it("lista equipes externas sem par no HackIA", () => {
    const hackiaNames = ["bAItas", "On.AI", "EasyIA IT Company"];
    const external = mapExternalRows([
      { name: "byAItas", stage: "slc" },
      { name: "On.Ai", stage: "slc" },
      { name: "EasyAI IT Company", stage: "slc" },
      { name: "Revisa.Ai", stage: "slc" },
    ]);
    expect(findUnmatchedExternal(hackiaNames, external)).toEqual(["Revisa.Ai"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/teamPhases.test.js`
Expected: FAIL — `Failed to resolve import "./teamPhases"` / functions not defined.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/teamPhases.js`:

```js
import { createClient } from "@supabase/supabase-js";
import { EXTERNAL_PHASE_TRACKER } from "./config";

const { url, anonKey, PHASES, STAGE_ALIASES, TEAM_NAME_ALIASES } =
  EXTERNAL_PHASE_TRACKER;

const PHASE_BY_KEY = Object.fromEntries(PHASES.map((p) => [p.key, p]));

// Cliente Supabase EXTERNO, lazy e somente-leitura. null se não configurado.
let _client;
export function getExternalClient() {
  if (!url || !anonKey) return null;
  if (!_client) {
    _client = createClient(url, anonKey, { auth: { persistSession: false } });
  }
  return _client;
}

// Minúsculas; remove acentos, emoji, espaços e pontuação.
export function normalizeTeamName(name) {
  return (name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// stage (string do banco externo) → objeto de fase ou null.
export function stageToPhase(stage) {
  if (!stage) return null;
  const raw = String(stage).trim().toLowerCase();
  const key = STAGE_ALIASES[raw] || raw;
  return PHASE_BY_KEY[key] || null;
}

// Chave canônica de casamento de um nome (aplica o mapa de apelidos).
export function matchKey(name) {
  const norm = normalizeTeamName(name);
  return TEAM_NAME_ALIASES[norm] || norm;
}

// Linhas externas [{ name, stage }] → [{ name, key, phase }].
export function mapExternalRows(rows) {
  return (rows || []).map((r) => ({
    name: r.name,
    key: matchKey(r.name),
    phase: stageToPhase(r.stage),
  }));
}

// Map chave→fase (primeira ocorrência vence).
export function buildPhaseLookup(externalList) {
  const map = new Map();
  for (const e of externalList) {
    if (!map.has(e.key)) map.set(e.key, e.phase);
  }
  return map;
}

// Nomes externos que não têm par entre os nomes HackIA.
export function findUnmatchedExternal(hackiaNames, externalList) {
  const hackiaKeys = new Set(hackiaNames.map(matchKey));
  return externalList.filter((e) => !hackiaKeys.has(e.key)).map((e) => e.name);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/teamPhases.test.js`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Lint + commit**

```bash
npm run lint
git -c safe.directory='*' add src/lib/teamPhases.js src/lib/teamPhases.test.js
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' commit -m "feat(phases): lógica pura de normalização/match/stage + testes"
```

---

## Task 3: Polling hook (`useTeamPhases.js`)

**Files:**

- Create: `src/hooks/useTeamPhases.js`

No unit test (depends on React + network; `environment: 'node'` has no DOM). Verified via lint + build + manual check in Task 7.

- [ ] **Step 1: Create the hook**

Create `src/hooks/useTeamPhases.js`:

```js
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  getExternalClient,
  mapExternalRows,
  buildPhaseLookup,
  matchKey,
} from "../lib/teamPhases";

const POLL_MS = 20000;

// Lê a fase das equipes do projeto externo (read-only) e re-lê a cada 20s.
// Em erro de rede mantém o último valor conhecido e sinaliza `error`.
export function useTeamPhases() {
  const [externalList, setExternalList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = useCallback(async () => {
    const client = getExternalClient();
    if (!client) {
      setLoading(false);
      return;
    }
    const { data, error: err } = await client
      .from("teams")
      .select("name, stage");
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    setError(null);
    setExternalList(mapExternalRows(data));
    setLastUpdated(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    load(); // eslint-disable-line react-hooks/set-state-in-effect
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const lookup = useMemo(() => buildPhaseLookup(externalList), [externalList]);
  const getPhase = useCallback(
    (name) => lookup.get(matchKey(name)) ?? null,
    [lookup],
  );

  return { getPhase, externalList, loading, error, lastUpdated };
}
```

- [ ] **Step 2: Lint + commit**

```bash
npm run lint
git -c safe.directory='*' add src/hooks/useTeamPhases.js
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' commit -m "feat(phases): hook useTeamPhases com polling de 20s"
```

---

## Task 4: `PhaseBadge` component

**Files:**

- Create: `src/admin/PhaseBadge.jsx`

- [ ] **Step 1: Create the component**

Create `src/admin/PhaseBadge.jsx`:

```jsx
import { EXTERNAL_PHASE_TRACKER } from "../lib/config";

const TOTAL = EXTERNAL_PHASE_TRACKER.PHASES.length;
const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦"];

// Pílula colorida com a fase atual da equipe (ou "—" quando sem par no tracking).
export default function PhaseBadge({ phase }) {
  if (!phase) {
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono border bg-white/5 text-white/30 border-white/10"
        title="Sem fase no tracking externo"
      >
        —
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono border"
      style={{
        color: phase.color,
        background: `${phase.color}20`,
        borderColor: `${phase.color}50`,
      }}
      title={`Fase ${phase.order + 1}/${TOTAL}: ${phase.label}`}
    >
      {CIRCLED[phase.order] || phase.order + 1} {phase.label}
    </span>
  );
}
```

- [ ] **Step 2: Lint + commit**

```bash
npm run lint
git -c safe.directory='*' add src/admin/PhaseBadge.jsx
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' commit -m "feat(phases): componente PhaseBadge"
```

---

## Task 5: Wire into AdminTeams

**Files:**

- Modify: `src/admin/AdminTeams.jsx` (imports top; `TeamCard` signature line 828; header render ~line 858–861; `AdminTeams` component hook + `<TeamCard>` props line 1731–1744)

- [ ] **Step 1: Add imports**

At the top of `src/admin/AdminTeams.jsx`, after line 5 (`import { cleanIdeaDescription, IDEA_MAX_LENGTH } from './teamIdea'`), add:

```js
import { useTeamPhases } from "../hooks/useTeamPhases";
import PhaseBadge from "./PhaseBadge";
```

- [ ] **Step 2: Add `phase` prop to `TeamCard` and render the badge**

Change the `TeamCard` signature (line 828) from:

```jsx
function TeamCard({ team, idea, lunchAt, mentors, allTeamNames, expanded, onToggle, actions, readOnly, requests }) {
```

to:

```jsx
function TeamCard({ team, idea, lunchAt, mentors, phase, allTeamNames, expanded, onToggle, actions, readOnly, requests }) {
```

Then in the header (right after the team-name span, currently lines 858–861), insert `<PhaseBadge>` so the block reads:

```jsx
            <span className="font-display font-semibold text-white truncate">{name}</span>
            <PhaseBadge phase={phase} />
            <span className="text-white/40 text-sm font-mono">
              {members.length}/6 membros
            </span>
```

- [ ] **Step 3: Call the hook in `AdminTeams` and pass `phase` to each card**

In the `AdminTeams` component, after the `const [mentorLinks, setMentorLinks] = useState([])` line (line 1190), add:

```js
const { getPhase } = useTeamPhases();
```

Then in the `filteredTeamNames.map(...)` render (line 1731), add the `phase` prop to `<TeamCard>`:

```jsx
{
  filteredTeamNames.map((name) => (
    <TeamCard
      key={name}
      team={{ name, members: teamsMap[name] }}
      idea={(teamsMeta.find((t) => t.name === name) || {}).idea_description}
      lunchAt={(teamsMeta.find((t) => t.name === name) || {}).lunch_at}
      mentors={mentorsByTeamId.get(teamsMap[name]?.[0]?.team_id) || []}
      phase={getPhase(name)}
      allTeamNames={sortedTeamNames}
      expanded={expandedTeam === name}
      onToggle={() => toggleTeam(name)}
      actions={actions}
      requests={requestsByTeam[name]}
      readOnly={readOnly}
    />
  ));
}
```

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory='*' add src/admin/AdminTeams.jsx
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' commit -m "feat(phases): badge de fase em cada card da aba Times"
```

---

## Task 6: Wire into AdminFacilitator (cockpit section)

**Files:**

- Modify: `src/admin/AdminFacilitator.jsx` (imports lines 1–7; render after `<Pulse>` line 128; new `TeamPhases` component)

- [ ] **Step 1: Update imports**

Change line 1 from:

```jsx
import { useState, useEffect, useCallback } from "react";
```

to:

```jsx
import { useState, useEffect, useCallback, useMemo } from "react";
```

After line 8 (`import { CSS } from '@dnd-kit/utilities'`), add:

```jsx
import { useTeamPhases } from "../hooks/useTeamPhases";
import { findUnmatchedExternal } from "../lib/teamPhases";
import PhaseBadge from "./PhaseBadge";
```

- [ ] **Step 2: Render `<TeamPhases />` in the cockpit**

In the main `return` of `AdminFacilitator`, add `<TeamPhases />` right after `<Pulse pulse={pulse} />` (line 128):

```jsx
      <NowNext days={days} items={items} onError={setError} onChanged={loadSchedule} />
      <Pulse pulse={pulse} />
      <TeamPhases />
      <SessionTimer />
```

- [ ] **Step 3: Add the `TeamPhases` component**

Append this component to `src/admin/AdminFacilitator.jsx` (e.g. right after the `Pulse`/`PulseStat` functions, before `TIMER_PRESETS`):

```jsx
// Fase atual de cada equipe, lida (read-only) do painel externo. Atualiza ~20s.
function TeamPhases() {
  const { getPhase, externalList, loading, error, lastUpdated } =
    useTeamPhases();
  const [names, setNames] = useState([]);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("teams")
      .select("name")
      .order("name")
      .then(({ data }) => {
        if (data) setNames(data.map((t) => t.name));
      });
  }, []);

  const orphans = useMemo(
    () => findUnmatchedExternal(names, externalList),
    [names, externalList],
  );
  const updatedLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

  return (
    <div className="card-glass rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-mono text-cyan uppercase tracking-wider">
          Fases das equipes
        </p>
        <span className="text-[10px] font-mono text-white/30">
          {error
            ? "offline — último valor"
            : updatedLabel
              ? `atualizado ${updatedLabel}`
              : ""}
        </span>
      </div>

      {loading && names.length === 0 ? (
        <p className="text-white/40 text-sm font-mono">Carregando fases...</p>
      ) : names.length === 0 ? (
        <p className="text-white/40 text-sm font-mono">
          Nenhuma equipe cadastrada.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {names.map((name) => (
            <div
              key={name}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5"
            >
              <span className="text-sm text-white/80 truncate">{name}</span>
              <PhaseBadge phase={getPhase(name)} />
            </div>
          ))}
        </div>
      )}

      {orphans.length > 0 && (
        <p className="mt-3 text-[10px] font-mono text-white/30">
          No tracking externo sem par aqui: {orphans.join(", ")}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory='*' add src/admin/AdminFacilitator.jsx
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' commit -m "feat(phases): seção \"Fases das equipes\" no cockpit do Facilitador"
```

---

## Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS, including the new `src/lib/teamPhases.test.js`.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: build succeeds, `dist/` produced, no errors.

- [ ] **Step 3: Manual smoke (dev server)**

Run: `npm run dev`, open the admin panel.
Expected:

- **Times** tab: each team card shows a colored phase pill (current event data → "③ SLC-IA" for the matched 12; "—" for MindRift/ZapFin AI).
- **Facilitador** tab: "Fases das equipes" section lists all HackIA teams with badges; footnote shows `Revisa.Ai` as the external orphan; "atualizado HH:MM:SS" updates over time.
- Kill network / wrong key → panels still render, badges show "—", header shows "offline — último valor".

- [ ] **Step 4: Pre-deploy gate (before any push to master)**

Per `CLAUDE.md`, run `/pre-deploy-verify` over the branch diff. Do not push while any Critical/High finding is open. (This integration is read-only and admin-only; expect no schema/RLS impact on the HackIA project.)

---

## Self-review notes (author)

- **Spec coverage:** config block (Task 1) ✓; pure logic + tests incl. all messy names/orphans (Task 2) ✓; hook w/ 20s polling + keep-last-on-error (Task 3) ✓; PhaseBadge incl. "—" (Task 4) ✓; AdminTeams badge (Task 5) ✓; AdminFacilitator section + orphan note (Task 6) ✓; verification (Task 7) ✓. No writes/migration/realtime/public surfaces — matches YAGNI scope.
- **Type consistency:** `getPhase(name) → phase|null`; `phase` = `{ key, label, order, color }`; `PhaseBadge` consumes `phase`; `findUnmatchedExternal(names, externalList)` and `mapExternalRows`/`buildPhaseLookup`/`matchKey` names match across hook, tests, and components.
- **No placeholders:** every step has full code/commands.
