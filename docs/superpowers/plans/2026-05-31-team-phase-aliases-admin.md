# Apelidos de equipe editáveis no admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o admin edite, pelo painel (sem mexer em código), o mapa de apelidos que casa as equipes externas (fase) com as equipes do HackIA — eliminando a necessidade de editar `config.js` e re-deployar quando o painel externo renomeia uma equipe.

**Architecture:** Os apelidos saem do hardcode e passam a viver numa chave JSON em `app_settings` (`team_phase_aliases`), lida/escrita por RPCs `SECURITY DEFINER` (escrita admin-only). A lógica pura de casamento (`teamPhases.js`) passa a receber o `aliasMap` como parâmetro; o hook `useTeamPhases` busca os apelidos do banco e os injeta; um editor de pares na seção "Fases das equipes" do Facilitador faz o CRUD. `config.TEAM_NAME_ALIASES` permanece como fallback offline.

**Tech Stack:** React 19 + Vite, `@supabase/supabase-js`, Postgres/Supabase (projeto `qshrzfahotmjshtjuvno`), Vitest (node env, testes de função pura).

---

## Repo gotchas (LEIA antes de editar)

- **Estilo:** aspas simples, **sem ponto-e-vírgula**, indent 2 espaços. (Alguns arquivos novos da feature anterior ficaram com aspas-duplas por causa do formatter — não copie esse estilo; siga o nativo.)
- **⚠️ Formatter PostToolUse:** edições JS via Write/Edit disparam um formatter que **reformata o arquivo inteiro** (vira churn gigante no diff) e troca aspas/`;`. Por isso, **crie/edite arquivos JS via Bash** (`cat > file <<'EOF'` para reescrever, ou `node`/`sed` para edições pontuais). Use conteúdo **ASCII** (sem acentos) em arquivos escritos via heredoc pra evitar problemas de encoding. Os blocos de código deste plano podem ter sido reformatados (aspas-duplas/`;`) pelo formatter do doc — **escreva os arquivos reais em aspas simples / sem ponto-e-vírgula**.
- **Git config global quebrado.** Commit sempre com:
  `git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' commit -m "..."`
- **Vitest:** `environment: node`, `globals: true`, testes co-localizados `*.test.js`, `import { describe, it, expect } from 'vitest'`. Rode `npm test` após cada task.
- **Migração:** aplicar no projeto **`qshrzfahotmjshtjuvno`** via MCP `mcp__plugin_supabase_supabase__apply_migration`. A mudança é **aditiva** (CREATE FUNCTION + seed `ON CONFLICT DO NOTHING`) — não altera objetos existentes; segura mesmo durante o evento.
- **Pré-requisito de contexto:** o worktree de implementação deve ser criado a partir de `origin/master` (que já tem a feature de fases: `teamPhases.js`, `useTeamPhases.js`, `PhaseBadge.jsx`, bloco `EXTERNAL_PHASE_TRACKER` em `config.js`, `TeamPhases` em `AdminFacilitator.jsx`).

## Estrutura de arquivos

| Arquivo                                 | Responsabilidade                                                                                   | Novo/Modifica |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------- |
| `migrations/add_team_phase_aliases.sql` | seed + `get_/set_team_phase_aliases`                                                               | Cria          |
| `src/lib/teamPhases.js`                 | `buildAliasMap`; `aliasMap` como parâmetro em `matchKey`/`mapExternalRows`/`findUnmatchedExternal` | Modifica      |
| `src/lib/teamPhases.test.js`            | testes de `buildAliasMap` + override                                                               | Modifica      |
| `src/hooks/useTeamPhases.js`            | busca/salva apelidos; injeta `aliasMap`; `getUnmatched`/`saveAliases`                              | Modifica      |
| `src/admin/TeamPhaseAliasesEditor.jsx`  | editor de pares (datalist)                                                                         | Cria          |
| `src/admin/AdminFacilitator.jsx`        | toggle + render do editor na seção `TeamPhases`                                                    | Modifica      |

---

## Task 1: Migração — RPCs get/set + seed

**Files:**

- Create: `migrations/add_team_phase_aliases.sql`
- Apply: via MCP `apply_migration` (projeto `qshrzfahotmjshtjuvno`)

- [ ] **Step 1: Criar o arquivo de migração**

Crie `migrations/add_team_phase_aliases.sql` com EXATAMENTE:

```sql
-- Apelidos de equipe editaveis (feature de fase das equipes / Supabase externo).
-- ADITIVO: cria 2 funcoes + seed em app_settings. Nao altera objetos existentes.

INSERT INTO app_settings (key, value, updated_at)
VALUES (
  'team_phase_aliases',
  '[{"external":"byAItas","hackia":"bAItas"},{"external":"EasyAI IT Company","hackia":"EasyIA IT Company"}]',
  now()
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_team_phase_aliases()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT value::jsonb FROM app_settings WHERE key = 'team_phase_aliases'),
    '[]'::jsonb
  );
$function$;

CREATE OR REPLACE FUNCTION public.set_team_phase_aliases(p_aliases jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  el jsonb;
  ext text;
  hk text;
  cleaned jsonb := '[]'::jsonb;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF jsonb_typeof(p_aliases) <> 'array' THEN RAISE EXCEPTION 'invalid_payload'; END IF;
  IF jsonb_array_length(p_aliases) > 200 THEN RAISE EXCEPTION 'too_many'; END IF;

  FOR el IN SELECT * FROM jsonb_array_elements(p_aliases)
  LOOP
    ext := btrim(COALESCE(el->>'external', ''));
    hk  := btrim(COALESCE(el->>'hackia', ''));
    IF ext <> '' AND hk <> '' THEN
      cleaned := cleaned || jsonb_build_object('external', ext, 'hackia', hk);
    END IF;
  END LOOP;

  INSERT INTO app_settings (key, value, updated_at)
  VALUES ('team_phase_aliases', cleaned::text, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  RETURN cleaned;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_team_phase_aliases() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_team_phase_aliases(jsonb) TO authenticated;
```

- [ ] **Step 2: Aplicar a migração via MCP**

Use `mcp__plugin_supabase_supabase__apply_migration` com `project_id: "qshrzfahotmjshtjuvno"`, `name: "add_team_phase_aliases"`, e `query` = o conteúdo SQL acima.

- [ ] **Step 3: Verificar via MCP `execute_sql`**

Rode (projeto `qshrzfahotmjshtjuvno`):

```sql
SELECT public.get_team_phase_aliases() AS aliases;
SELECT proname, prosecdef, pg_get_function_identity_arguments(oid) AS args
FROM pg_proc WHERE proname IN ('get_team_phase_aliases','set_team_phase_aliases');
```

Esperado: `aliases` retorna o array com os 2 pares (`byAItas/bAItas`, `EasyAI.../EasyIA...`); ambas funções existem, `prosecdef = true`.

- [ ] **Step 4: Commit do arquivo de migração**

```bash
git -c safe.directory='*' add migrations/add_team_phase_aliases.sql
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' commit -m "feat(phases): RPCs get/set de apelidos de equipe + seed (app_settings)"
```

---

## Task 2: Lógica pura — `aliasMap` parametrizável (TDD)

**Files:**

- Modify: `src/lib/teamPhases.js`
- Test: `src/lib/teamPhases.test.js`

- [ ] **Step 1: Adicionar os testes novos (escreva ANTES da implementação)**

Acrescente ao fim de `src/lib/teamPhases.test.js` (use `node` para anexar e preservar acentos, evitando o formatter — veja a nota de gotchas). Importe `buildAliasMap` no topo junto dos demais (`import { ..., buildAliasMap } from './teamPhases'`). Conteúdo dos testes:

```js
describe("buildAliasMap", () => {
  it("normaliza os dois lados e ignora pares incompletos", () => {
    const m = buildAliasMap([
      { external: "Revisa.Ai", hackia: "Revisai" },
      { external: "  ", hackia: "X" },
      { external: "Y", hackia: "" },
    ]);
    expect(m).toEqual({ revisaai: "revisai" });
  });
  it("ultimo par vence em colisao de chave normalizada", () => {
    const m = buildAliasMap([
      { external: "On.Ai", hackia: "AAA" },
      { external: "on ai", hackia: "BBB" },
    ]);
    expect(m.onai).toBe("bbb");
  });
});

describe("matchKey com aliasMap", () => {
  it("usa o aliasMap passado", () => {
    const m = buildAliasMap([{ external: "Revisa.Ai", hackia: "Revisai" }]);
    expect(matchKey("Revisa.Ai", m)).toBe("revisai");
  });
  it("sem aliasMap usa o default do config (compat)", () => {
    expect(matchKey("byAItas")).toBe("baitas");
  });
});

describe("override dinamico de apelido", () => {
  const rows = [{ name: "Revisa.Ai", stage: "slc" }];
  it("com override, Revisa.Ai casa com Revisai e some das orfas", () => {
    const m = buildAliasMap([{ external: "Revisa.Ai", hackia: "Revisai" }]);
    const ext = mapExternalRows(rows, m);
    const lookup = buildPhaseLookup(ext);
    expect(lookup.get(matchKey("Revisai", m)).key).toBe("slc");
    expect(findUnmatchedExternal(["Revisai"], ext, m)).toEqual([]);
  });
  it("sem override, Revisa.Ai continua orfa", () => {
    const ext = mapExternalRows(rows);
    expect(findUnmatchedExternal(["Revisai"], ext)).toEqual(["Revisa.Ai"]);
  });
});
```

- [ ] **Step 2: Rodar — deve FALHAR**

Run: `npx vitest run src/lib/teamPhases.test.js`
Expected: FAIL — `buildAliasMap is not a function` / `is not exported`.

- [ ] **Step 3: Reescrever `src/lib/teamPhases.js` (via Bash heredoc, ASCII, estilo nativo)**

Reescreva o arquivo inteiro com `cat > src/lib/teamPhases.js <<'EOF' ... EOF`. Conteúdo (aspas simples, sem `;`, comentários ASCII):

```js
import { createClient } from "@supabase/supabase-js";
import { EXTERNAL_PHASE_TRACKER } from "./config";

const { url, anonKey, PHASES, STAGE_ALIASES, TEAM_NAME_ALIASES } =
  EXTERNAL_PHASE_TRACKER;

const PHASE_BY_KEY = Object.fromEntries(PHASES.map((p) => [p.key, p]));

// Mapa de apelidos default (do config), ja em chaves normalizadas. Fallback offline.
const DEFAULT_ALIAS_MAP = TEAM_NAME_ALIASES;

// Cliente Supabase EXTERNO, lazy e somente-leitura. null se nao configurado.
let _client;
export function getExternalClient() {
  if (!url || !anonKey) return null;
  if (!_client) {
    _client = createClient(url, anonKey, { auth: { persistSession: false } });
  }
  return _client;
}

// Minusculas; remove acentos, emoji, espacos e pontuacao.
export function normalizeTeamName(name) {
  return (name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Pares crus [{external, hackia}] -> { normExternal: normHackia } (ignora lado vazio).
export function buildAliasMap(rawPairs) {
  const map = {};
  for (const p of rawPairs || []) {
    const ext = normalizeTeamName(p && p.external);
    const hk = normalizeTeamName(p && p.hackia);
    if (ext && hk) map[ext] = hk;
  }
  return map;
}

// stage (string do banco externo) -> objeto de fase ou null.
export function stageToPhase(stage) {
  if (!stage) return null;
  const raw = String(stage).trim().toLowerCase();
  const key = STAGE_ALIASES[raw] || raw;
  return PHASE_BY_KEY[key] || null;
}

// Chave canonica de casamento (aplica o aliasMap; default = config).
export function matchKey(name, aliasMap = DEFAULT_ALIAS_MAP) {
  const norm = normalizeTeamName(name);
  return aliasMap[norm] || norm;
}

// Linhas externas [{name, stage}] -> [{name, key, phase}].
export function mapExternalRows(rows, aliasMap = DEFAULT_ALIAS_MAP) {
  return (rows || []).map((r) => ({
    name: r.name,
    key: matchKey(r.name, aliasMap),
    phase: stageToPhase(r.stage),
  }));
}

// Map chave->fase (primeira fase valida vence; null nao sobrescreve fase boa).
export function buildPhaseLookup(externalList) {
  const map = new Map();
  for (const e of externalList) {
    if (!map.has(e.key) || map.get(e.key) === null) map.set(e.key, e.phase);
  }
  return map;
}

// Nomes externos que nao tem par entre os nomes HackIA (usando o mesmo aliasMap).
export function findUnmatchedExternal(
  hackiaNames,
  externalList,
  aliasMap = DEFAULT_ALIAS_MAP,
) {
  const hackiaKeys = new Set(hackiaNames.map((n) => matchKey(n, aliasMap)));
  return externalList.filter((e) => !hackiaKeys.has(e.key)).map((e) => e.name);
}
```

> Nota: o regex `/[̀-ͯ]/g` usa marcas combinantes (U+0300–U+036F) — é o que já está no master e passa nos testes. Mantenha como está.

- [ ] **Step 4: Rodar — deve PASSAR**

Run: `npx vitest run src/lib/teamPhases.test.js`
Expected: PASS (testes antigos + novos). Depois `npx eslint src/lib/teamPhases.js src/lib/teamPhases.test.js` → limpo.

- [ ] **Step 5: Commit**

```bash
git -c safe.directory='*' add src/lib/teamPhases.js src/lib/teamPhases.test.js
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' commit -m "feat(phases): aliasMap parametrizavel em teamPhases + buildAliasMap + testes"
```

---

## Task 3: Hook — busca/salva apelidos e injeta o `aliasMap`

**Files:**

- Modify (rewrite): `src/hooks/useTeamPhases.js`

Sem teste unitário (React + rede; node env sem DOM). Verificação via lint + build.

- [ ] **Step 1: Reescrever `src/hooks/useTeamPhases.js` (via Bash heredoc, ASCII, estilo nativo)**

```js
import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabase";
import {
  getExternalClient,
  mapExternalRows,
  buildPhaseLookup,
  matchKey,
  buildAliasMap,
  findUnmatchedExternal,
} from "../lib/teamPhases";

const POLL_MS = 20000;

// Le a fase das equipes do projeto externo (read-only) + os apelidos editaveis
// do nosso banco. Re-le a cada 20s. Em erro mantem o ultimo valor.
export function useTeamPhases() {
  const [externalRows, setExternalRows] = useState([]);
  const [aliases, setAliases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = useCallback(async () => {
    if (supabase) {
      const { data: aliasData, error: aliasErr } = await supabase.rpc(
        "get_team_phase_aliases",
      );
      if (!aliasErr && Array.isArray(aliasData)) setAliases(aliasData);
    }
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
    setExternalRows(data || []);
    setLastUpdated(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    load(); // eslint-disable-line react-hooks/set-state-in-effect
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const aliasMap = useMemo(() => buildAliasMap(aliases), [aliases]);
  const externalList = useMemo(
    () => mapExternalRows(externalRows, aliasMap),
    [externalRows, aliasMap],
  );
  const lookup = useMemo(() => buildPhaseLookup(externalList), [externalList]);
  const getPhase = useCallback(
    (name) => lookup.get(matchKey(name, aliasMap)) ?? null,
    [lookup, aliasMap],
  );
  const getUnmatched = useCallback(
    (hackiaNames) => findUnmatchedExternal(hackiaNames, externalList, aliasMap),
    [externalList, aliasMap],
  );

  const saveAliases = useCallback(async (pairs) => {
    if (!supabase) return { error: "supabase-indisponivel" };
    const { data, error: err } = await supabase.rpc("set_team_phase_aliases", {
      p_aliases: pairs,
    });
    if (err) return { error: err.message };
    if (Array.isArray(data)) setAliases(data);
    return { data };
  }, []);

  return {
    getPhase,
    getUnmatched,
    externalList,
    aliases,
    saveAliases,
    loading,
    error,
    lastUpdated,
  };
}
```

- [ ] **Step 2: Verificar**

Run: `npx eslint src/hooks/useTeamPhases.js` → limpo. `npm run build` → sucesso.

- [ ] **Step 3: Commit**

```bash
git -c safe.directory='*' add src/hooks/useTeamPhases.js
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' commit -m "feat(phases): hook busca/salva apelidos do banco e injeta aliasMap"
```

---

## Task 4: Componente editor de apelidos

**Files:**

- Create: `src/admin/TeamPhaseAliasesEditor.jsx`

- [ ] **Step 1: Criar `src/admin/TeamPhaseAliasesEditor.jsx` (via Bash heredoc, ASCII, estilo nativo)**

```jsx
import { useState } from "react";

function toRows(aliases) {
  return (aliases || []).map((a, i) => ({
    id: `r${i}`,
    external: a.external || "",
    hackia: a.hackia || "",
  }));
}

// Editor de pares de apelido (nome externo -> nome HackIA), com datalist de sugestoes.
// Estado de rascunho local; Salvar entrega os pares limpos via onSave.
export default function TeamPhaseAliasesEditor({
  aliases,
  externalNames,
  hackiaNames,
  onSave,
}) {
  const [rows, setRows] = useState(() => toRows(aliases));
  const [seq, setSeq] = useState(() => toRows(aliases).length);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  function update(id, field, value) {
    setRows((rs) =>
      rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    );
    setMsg(null);
  }
  function removeRow(id) {
    setRows((rs) => rs.filter((r) => r.id !== id));
    setMsg(null);
  }
  function addRow() {
    setRows((rs) => [...rs, { id: `n${seq}`, external: "", hackia: "" }]);
    setSeq((s) => s + 1);
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const pairs = rows
      .map((r) => ({ external: r.external.trim(), hackia: r.hackia.trim() }))
      .filter((p) => p.external && p.hackia);
    const res = await onSave(pairs);
    setBusy(false);
    setMsg(
      res && res.error
        ? { type: "err", text: `Erro ao salvar: ${res.error}` }
        : { type: "ok", text: "Apelidos salvos." },
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
      <datalist id="tpa-ext-names">
        {(externalNames || []).map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <datalist id="tpa-hk-names">
        {(hackiaNames || []).map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      <p className="text-[10px] font-mono text-white/40">
        Vincule o nome da equipe no painel externo ao nome dela aqui. Use as
        sugestoes.
      </p>

      {rows.length === 0 && (
        <p className="text-xs text-white/30 font-mono">Nenhum apelido.</p>
      )}

      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-2">
          <input
            list="tpa-ext-names"
            value={r.external}
            onChange={(e) => update(r.id, "external", e.target.value)}
            placeholder="nome externo"
            className="flex-1 min-w-0 bg-dark/60 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-cyan/40"
          />
          <span className="text-white/30 text-xs">→</span>
          <input
            list="tpa-hk-names"
            value={r.hackia}
            onChange={(e) => update(r.id, "hackia", e.target.value)}
            placeholder="nome aqui (HackIA)"
            className="flex-1 min-w-0 bg-dark/60 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-cyan/40"
          />
          <button
            type="button"
            onClick={() => removeRow(r.id)}
            className="flex-shrink-0 w-6 h-6 rounded text-white/30 hover:text-hot hover:bg-hot/10 transition-colors"
            title="Remover par"
          >
            ✕
          </button>
        </div>
      ))}

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={addRow}
          className="text-xs font-mono text-cyan/70 hover:text-cyan transition-colors"
        >
          + adicionar par
        </button>
        <div className="flex items-center gap-3">
          {msg && (
            <span
              className={`text-[10px] font-mono ${msg.type === "err" ? "text-hot" : "text-cyan"}`}
            >
              {msg.text}
            </span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded-lg border border-cyan/40 bg-cyan/15 text-cyan text-xs font-semibold px-4 py-1.5 hover:bg-cyan/25 transition-colors disabled:opacity-50"
          >
            {busy ? "Salvando..." : "Salvar apelidos"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar + commit**

Run: `npx eslint src/admin/TeamPhaseAliasesEditor.jsx` → limpo. `npm run build` → sucesso.

```bash
git -c safe.directory='*' add src/admin/TeamPhaseAliasesEditor.jsx
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' commit -m "feat(phases): componente TeamPhaseAliasesEditor (editor de pares)"
```

---

## Task 5: Fiar o editor na seção `TeamPhases` (Facilitador)

**Files:**

- Modify: `src/admin/AdminFacilitator.jsx`

> **Aplique via `node`/`sed` (NÃO via Edit/Write)** para não disparar o churn do formatter no arquivo inteiro. **Leia o arquivo primeiro** para conferir as âncoras (o componente `TeamPhases` foi adicionado pela feature anterior). As âncoras abaixo são o estado atual em `master`.

- [ ] **Step 1: Adicionar/ajustar imports**

`findUnmatchedExternal` deixa de ser importado direto aqui (passa a vir do hook via `getUnmatched`) e entra o import do editor. Troque o bloco de imports da feature:

```js
import { useTeamPhases } from "../hooks/useTeamPhases";
import { findUnmatchedExternal } from "../lib/teamPhases";
import PhaseBadge from "./PhaseBadge";
```

por:

```js
import { useTeamPhases } from "../hooks/useTeamPhases";
import PhaseBadge from "./PhaseBadge";
import TeamPhaseAliasesEditor from "./TeamPhaseAliasesEditor";
```

- [ ] **Step 2: Atualizar o componente `TeamPhases`**

No `function TeamPhases() {`:

(a) Destructure `getUnmatched`, `aliases`, `saveAliases` do hook e adicione um estado de toggle. Troque:

```js
const { getPhase, externalList, loading, error, lastUpdated } = useTeamPhases();
const [names, setNames] = useState([]);
```

por:

```js
const {
  getPhase,
  getUnmatched,
  externalList,
  aliases,
  saveAliases,
  loading,
  error,
  lastUpdated,
} = useTeamPhases();
const [names, setNames] = useState([]);
const [editing, setEditing] = useState(false);
```

(b) Troque o cálculo de `orphans` (que usava `findUnmatchedExternal`) por `getUnmatched`:

```js
const orphans = useMemo(
  () => findUnmatchedExternal(names, externalList),
  [names, externalList],
);
```

por:

```js
const orphans = useMemo(() => getUnmatched(names), [getUnmatched, names]);
```

(c) Logo após o bloco do rodapé de órfãs (o `{orphans.length > 0 && (...)}`), adicione o toggle + editor, ANTES do fechamento `</div>` final do card. Insira:

```jsx
<div className="mt-3 flex justify-end">
  <button
    type="button"
    onClick={() => setEditing((v) => !v)}
    className="text-[10px] font-mono text-white/40 hover:text-cyan transition-colors"
  >
    {editing ? "fechar" : "✎ ajustar apelidos"}
  </button>
</div>;
{
  editing && (
    <TeamPhaseAliasesEditor
      aliases={aliases}
      externalNames={externalList.map((e) => e.name)}
      hackiaNames={names}
      onSave={saveAliases}
    />
  );
}
```

- [ ] **Step 3: Verificar**

Confirme que o diff toca SÓ `src/admin/AdminFacilitator.jsx` e é mínimo (imports + ~poucas linhas no `TeamPhases`), sem reformatação do arquivo inteiro:
`git -c safe.directory='*' diff --stat -- src/admin/AdminFacilitator.jsx`
`npx eslint src/admin/AdminFacilitator.jsx` → limpo. `npm run build` → sucesso.

- [ ] **Step 4: Commit**

```bash
git -c safe.directory='*' add src/admin/AdminFacilitator.jsx
git -c safe.directory='*' -c user.name='Thomas Topfstedt' -c user.email='thotop100@gmail.com' commit -m "feat(phases): editor de apelidos na secao Fases das equipes (Facilitador)"
```

---

## Task 6: Verificação final

**Files:** nenhum (verificação)

- [ ] **Step 1: Suíte completa**

Run: `npm test` → todos verdes (baseline 125 + novos de `buildAliasMap`/override).

- [ ] **Step 2: Build**

Run: `npm run build` → sucesso, sem erros.

- [ ] **Step 3: Lint dos arquivos da feature**

Run: `npx eslint src/lib/teamPhases.js src/lib/teamPhases.test.js src/hooks/useTeamPhases.js src/admin/TeamPhaseAliasesEditor.jsx src/admin/AdminFacilitator.jsx` → limpo.

- [ ] **Step 4: Smoke manual (dev)**

`npm run dev`, abrir admin → Facilitador → "Fases das equipes":

- Toggle "✎ ajustar apelidos" abre o editor com os 2 pares seedados.
- Adicionar um par (ex.: externo "Revisa.Ai" → daqui "Revisai"), Salvar → some do rodapé de órfãs e o badge resolve.
- Remover um par e salvar → volta a aparecer como órfã / "—".
- Sem rede no projeto externo → badges "—", painel funciona.

- [ ] **Step 5: Gate de pré-deploy (antes de merge em master)**

Rode `/pre-deploy-verify`. Como esta mudança altera o Supabase (2 RPCs + seed), o agente de **verificação de banco** confirma: funções `ACTIVE`/existentes, `prosecdef`, `is_admin()` na escrita, `search_path`, grants, e um smoke get/set seguro. Não fazer push enquanto houver Critical/High.

---

## Self-review (autor)

- **Cobertura do spec:** migração+RPCs (T1) ✓; `buildAliasMap`+`aliasMap` param+fallback config (T2) ✓; hook busca/salva+`getUnmatched`/`saveAliases` (T3) ✓; editor com datalist (T4) ✓; fiação no Facilitador com toggle (T5) ✓; verificação+pré-deploy (T6) ✓. Fallback offline e bordas cobertos.
- **Consistência de tipos:** `aliases` = array de `{external, hackia}` (crus) em todo lugar; `aliasMap` = `{normExt: normHk}` produzido por `buildAliasMap`; `getPhase(name)`, `getUnmatched(hackiaNames)`, `saveAliases(pairs) -> {data|error}`; `matchKey(name, aliasMap)`, `mapExternalRows(rows, aliasMap)`, `findUnmatchedExternal(hackiaNames, externalList, aliasMap)` batem entre lib, hook, testes e componentes.
- **Desvio consciente do spec:** o hook expõe `getUnmatched(hackiaNames)` (em vez de o componente chamar `findUnmatchedExternal` direto) para encapsular o `aliasMap` vivo — necessário pra correção das órfãs com apelidos do banco.
- **Sem placeholders:** todos os steps têm código/comandos completos.
