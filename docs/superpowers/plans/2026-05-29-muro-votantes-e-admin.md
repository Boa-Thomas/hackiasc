# Muro de Dores — votantes + ferramentas de admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar quem votou em cada ideia no telão (nome curto) e no admin (nome + contato), e permitir que o admin cadastre uma dor em nome de um participante confirmado.

**Architecture:** Estende os RPCs existentes do muro com dois níveis de privacidade (público encurtado / admin com contato) numa migration nova; frontend lê os novos campos. Mantém as 3 fases.

**Tech Stack:** Supabase (Postgres, RPC SECURITY DEFINER), React 19 + Vite, Tailwind v4.

---

## Tooling note (IMPORTANTE)

Há um hook global de auto-format que roda Prettier (aspas duplas + `;`) a cada `Edit`/`Write` em arquivos JS/JSX — **contra** o estilo deste repo (aspas simples, sem `;`). Para arquivos **`.jsx`**, aplique as mudanças via **Bash** (script Node com replace exato, preservando CRLF/LF), não via Edit/Write, e confira com `git diff --stat` que só as linhas pretendidas mudaram. Markdown e SQL não são afetados pelo formatter.

## File Structure

- **Create** `migrations/add_wall_voters.sql` — helper `wall_display_name`, estende `wall_list` e `wall_admin_list`, cria `wall_admin_add_pain`.
- **Modify** `src/wall/WallScreen.jsx` — fileira de chips de votantes no card (só em `voting_open`).
- **Modify** `src/admin/AdminWall.jsx` — linhas expansíveis com votantes (nome + contato) + bloco "adicionar dor por participante".
- **Create** `docs/changelog/2026-05-29-muro-votantes-e-admin.md` — changelog.

Ordem obrigatória: **Task 1 (migration aplicada) antes** das tasks de frontend, senão `voters` chega `undefined` (degrada para vazio, mas não exibe nada).

---

## Task 1: Backend — migration de votantes + admin add pain

**Files:**

- Create: `migrations/add_wall_voters.sql`

- [ ] **Step 1: Criar a migration com o conteúdo completo abaixo**

```sql
-- ============================================================
-- add_wall_voters.sql — votantes por ideia (telao + admin) e
-- cadastro de dor por participante via admin.
-- Idempotente (CREATE OR REPLACE). NAO dropa tabelas. Aplicar via MCP.
-- ============================================================

-- Helper: nome curto para exibicao publica (telao). "Ana Maria Silva" -> "Ana S.".
-- Nome de uma palavra so -> retorna so o primeiro nome. Usado SO no nivel publico.
CREATE OR REPLACE FUNCTION wall_display_name(p_full_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_parts TEXT[];
  v_first TEXT;
  v_last  TEXT;
BEGIN
  v_parts := regexp_split_to_array(btrim(COALESCE(p_full_name, '')), '\s+');
  IF v_parts IS NULL OR array_length(v_parts, 1) IS NULL OR v_parts[1] = '' THEN
    RETURN '';
  END IF;
  v_first := v_parts[1];
  IF array_length(v_parts, 1) = 1 THEN
    RETURN v_first;
  END IF;
  v_last := v_parts[array_length(v_parts, 1)];
  RETURN v_first || ' ' || upper(left(v_last, 1)) || '.';
END;
$$;
REVOKE ALL ON FUNCTION wall_display_name(TEXT) FROM PUBLIC;

-- wall_list estendido: telao (p_registration_id IS NULL) recebe `voters`
-- (nome curto). Participante (id nao-nulo) NAO recebe voters (payload enxuto).
CREATE OR REPLACE FUNCTION wall_list(p_registration_id UUID DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_phase      TEXT;
  v_pains      JSON;
  v_my_votes   JSON;
  v_votes_used INTEGER := 0;
BEGIN
  SELECT phase INTO v_phase FROM wall_state WHERE id = true;

  SELECT json_agg(p ORDER BY p.vote_count DESC, p.created_at)
  INTO v_pains
  FROM (
    SELECT
      pn.id,
      pn.title,
      pn.description,
      pn.author_name,
      pn.axis,
      pn.created_at,
      COUNT(pv.id)::INTEGER AS vote_count,
      CASE WHEN p_registration_id IS NULL THEN (
        SELECT COALESCE(
          json_agg(
            json_build_object('display', wall_display_name(r.full_name))
            ORDER BY r.full_name
          ), '[]'::json)
        FROM pain_votes pv2
        JOIN registrations r ON r.id = pv2.registration_id
        WHERE pv2.pain_id = pn.id
      ) ELSE '[]'::json END AS voters
    FROM pains pn
    LEFT JOIN pain_votes pv ON pv.pain_id = pn.id
    WHERE pn.status = 'visible'
    GROUP BY pn.id
  ) p;

  IF p_registration_id IS NOT NULL THEN
    SELECT json_agg(pain_id), COUNT(*)::INTEGER
    INTO v_my_votes, v_votes_used
    FROM pain_votes WHERE registration_id = p_registration_id;
  END IF;

  RETURN json_build_object(
    'phase', v_phase,
    'pains', COALESCE(v_pains, '[]'::JSON),
    'my_votes', COALESCE(v_my_votes, '[]'::JSON),
    'votos_restantes', GREATEST(3 - v_votes_used, 0)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION wall_list(UUID) TO anon;

-- wall_admin_list estendido: cada pain recebe `voters` com nome + contato.
CREATE OR REPLACE FUNCTION wall_admin_list()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_phase TEXT;
  v_pains JSON;
BEGIN
  IF NOT is_admin_or_viewer() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT phase INTO v_phase FROM wall_state WHERE id = true;

  SELECT json_agg(p ORDER BY p.vote_count DESC, p.created_at)
  INTO v_pains
  FROM (
    SELECT
      pn.id, pn.title, pn.description, pn.author_name, pn.axis,
      pn.status, pn.created_at,
      COUNT(pv.id)::INTEGER AS vote_count,
      (
        SELECT COALESCE(
          json_agg(
            json_build_object(
              'full_name', r.full_name,
              'email', r.email,
              'phone', r.phone
            ) ORDER BY r.full_name
          ), '[]'::json)
        FROM pain_votes pv2
        JOIN registrations r ON r.id = pv2.registration_id
        WHERE pv2.pain_id = pn.id
      ) AS voters
    FROM pains pn
    LEFT JOIN pain_votes pv ON pv.pain_id = pn.id
    GROUP BY pn.id
  ) p;

  RETURN json_build_object(
    'phase', v_phase,
    'pains', COALESCE(v_pains, '[]'::JSON)
  );
END;
$$;
REVOKE ALL ON FUNCTION wall_admin_list() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wall_admin_list() TO authenticated;

-- Admin cadastra dor em nome de um participante confirmado. So em wall_open.
CREATE OR REPLACE FUNCTION wall_admin_add_pain(
  p_registration_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_axis TEXT
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phase TEXT;
  v_name  TEXT;
  v_title TEXT;
  v_pain  pains;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT phase INTO v_phase FROM wall_state WHERE id = true;
  IF v_phase <> 'wall_open' THEN
    RAISE EXCEPTION 'wall_not_open';
  END IF;

  v_name := wall_require_confirmed(p_registration_id);

  v_title := TRIM(COALESCE(p_title, ''));
  IF v_title = '' THEN
    RAISE EXCEPTION 'title_required';
  END IF;
  IF length(v_title) > 140 THEN
    v_title := left(v_title, 140);
  END IF;

  INSERT INTO pains (title, description, author_name, registration_id, axis)
  VALUES (
    v_title,
    NULLIF(TRIM(COALESCE(p_description, '')), ''),
    v_name,
    p_registration_id,
    NULLIF(TRIM(COALESCE(p_axis, '')), '')
  )
  RETURNING * INTO v_pain;

  RETURN json_build_object(
    'id', v_pain.id,
    'title', v_pain.title,
    'author_name', v_pain.author_name
  );
END;
$$;
REVOKE ALL ON FUNCTION wall_admin_add_pain(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wall_admin_add_pain(UUID, TEXT, TEXT, TEXT) TO authenticated;
```

- [ ] **Step 2: Aplicar a migration via Supabase MCP**

Use a ferramenta `mcp__plugin_supabase_supabase__apply_migration` com `name: "add_wall_voters"` e o SQL acima.
Expected: sucesso, sem erro de sintaxe.

- [ ] **Step 3: Smoke test do helper e do wall_list (via MCP execute_sql)**

Run (via `mcp__plugin_supabase_supabase__execute_sql`):

```sql
SELECT public.wall_display_name('Ana Maria Silva') AS a,
       public.wall_display_name('Madonna') AS b,
       public.wall_display_name('  joão   pedro  santos ') AS c;
```

Expected: `a = 'Ana S.'`, `b = 'Madonna'`, `c = 'joão S.'`.

```sql
SELECT public.wall_list(NULL);
```

Expected: JSON com `phase`, `pains` (cada pain com chave `voters`, array possivelmente vazio), sem erro.

- [ ] **Step 4: Confirmar que as funções existem**

Run:

```sql
SELECT proname FROM pg_proc
WHERE proname IN ('wall_display_name','wall_admin_add_pain')
ORDER BY proname;
```

Expected: 2 linhas.

- [ ] **Step 5: Commit**

```bash
git add migrations/add_wall_voters.sql
git commit -m "feat(muro): RPCs de votantes (telão/admin) + admin add pain"
```

---

## Task 2: Telão — chips de votantes (`WallScreen.jsx`)

**Files:**

- Modify: `src/wall/WallScreen.jsx`

- [ ] **Step 1: Inserir a fileira de chips no card (via Bash/Node, não Edit)**

Localizar este bloco (a linha de eixo/autor dentro do card) e inserir a fileira de votantes **logo após** o `</div>` que fecha essa linha:

Âncora (texto exato atual):

```jsx
<div className="flex items-center gap-3 mt-4 text-sm font-mono text-white/40">
  {p.axis && (
    <span className="px-3 py-1 rounded-full bg-violet/15 text-violet">
      {p.axis}
    </span>
  )}
  {p.author_name && <span>{p.author_name}</span>}
  {!showVotes && <span className="text-cyan/50">#{i + 1}</span>}
</div>
```

Substituir por (mesmo bloco + a fileira de chips):

```jsx
<div className="flex items-center gap-3 mt-4 text-sm font-mono text-white/40">
  {p.axis && (
    <span className="px-3 py-1 rounded-full bg-violet/15 text-violet">
      {p.axis}
    </span>
  )}
  {p.author_name && <span>{p.author_name}</span>}
  {!showVotes && <span className="text-cyan/50">#{i + 1}</span>}
</div>;
{
  showVotes && p.voters && p.voters.length > 0 && (
    <div className="flex flex-wrap gap-2 mt-4">
      {p.voters.slice(0, 6).map((v, vi) => (
        <span
          key={vi}
          className="px-3 py-1 rounded-full bg-white/5 text-white/60 text-base font-mono"
        >
          {v.display}
        </span>
      ))}
      {p.voters.length > 6 && (
        <span className="px-3 py-1 rounded-full bg-white/5 text-white/40 text-base font-mono">
          +{p.voters.length - 6} mais
        </span>
      )}
    </div>
  );
}
```

Script Node sugerido (`/tmp/t2.mjs`): ler `src/wall/WallScreen.jsx`, detectar `nl` (CRLF/LF), `replace` exato da âncora pelo novo bloco (1 ocorrência; abortar se ≠ 1), `writeFileSync`.

- [ ] **Step 2: Confirmar diff mínimo**

Run: `git diff --stat src/wall/WallScreen.jsx`
Expected: apenas adições (~18 linhas), sem reescrita de aspas/`;`.

- [ ] **Step 3: Build + lint**

Run (PowerShell): `npm run build` e `npx eslint src/wall/WallScreen.jsx`
Expected: build `✓ built`, eslint sem erros novos.

- [ ] **Step 4: Preview visual com mock (Edge headless)**

Subir `npm run dev` (background), injetar mock temporário no `load()` do `WallScreen` (phase `voting_open`, 2-3 pains com `voters: [{display:'Ana S.'},...]` e um com >6), screenshot com Edge headless de `http://localhost:5173/#telao`, **olhar** o PNG (chips aparecem, cap "+N mais" funciona), depois `git checkout -- src/wall/WallScreen.jsx`... **NÃO** — o checkout apagaria o Step 1. Em vez disso: reverter **apenas** o trecho de mock. Recomendado: fazer o mock num branch/stash ou reaplicar o Step 1 após o checkout. Parar o dev server e apagar o PNG ao fim.

- [ ] **Step 5: Commit**

```bash
git add src/wall/WallScreen.jsx
git commit -m "feat(telao): chips com quem votou em cada ideia"
```

---

## Task 3: Admin — votantes expansíveis + adicionar dor por participante (`AdminWall.jsx`)

**Files:**

- Modify: `src/admin/AdminWall.jsx` (substituição completa do arquivo)

- [ ] **Step 1: Substituir o conteúdo de `AdminWall.jsx` (via Bash/Node — escrever o arquivo todo)**

Conteúdo completo novo:

```jsx
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { ECONOMIC_AXES } from "../wall/useWallSession";

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
];

// Painel de moderacao do Muro de Dores. Alterna a fase global, lista dores
// (inclui ocultas), oculta/reexibe, mostra ranking + quem votou, e permite
// cadastrar uma dor em nome de um participante confirmado.
export default function AdminWall() {
  const [phase, setPhase] = useState(null);
  const [pains, setPains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    if (!supabase) {
      setError("Supabase não configurado.");
      setLoading(false);
      return;
    }
    const { data, error: err } = await supabase.rpc("wall_admin_list");
    if (err) setError(err.message);
    else if (data) {
      setError(null);
      setPhase(data.phase);
      setPains(data.pains || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load(); // eslint-disable-line react-hooks/set-state-in-effect
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  async function setWallPhase(p) {
    if (!supabase || busy || p === phase) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc("wall_set_phase", { p_phase: p });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setPhase(p);
    await load();
  }

  async function hide(id) {
    if (!supabase || !window.confirm("Ocultar essa dor do telão?")) return;
    const { error: err } = await supabase.rpc("wall_hide_pain", { p_id: id });
    if (err) {
      alert(`Erro: ${err.message}`);
      return;
    }
    await load();
  }

  async function unhide(id) {
    if (!supabase) return;
    const { error: err } = await supabase.rpc("wall_unhide_pain", { p_id: id });
    if (err) {
      alert(`Erro: ${err.message}`);
      return;
    }
    await load();
  }

  if (loading) return <p className="text-white/60 font-mono">Carregando...</p>;

  const visible = pains.filter((p) => p.status === "visible");
  const hidden = pains.filter((p) => p.status === "hidden");

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-hot/10 border border-hot/30 rounded-lg px-4 py-2.5 text-hot text-sm">
          {error}
        </div>
      )}

      {/* Controle de fase */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h3 className="text-white font-semibold mb-1">Fase do muro</h3>
        <p className="text-white/50 text-xs mb-4">
          Controla o que os participantes podem fazer em{" "}
          <span className="font-mono">/#muro</span> e o que o telão (
          <span className="font-mono">/#telao</span>) exibe.
        </p>
        <div className="grid sm:grid-cols-3 gap-3">
          {PHASES.map((p) => (
            <button
              key={p.id}
              onClick={() => setWallPhase(p.id)}
              disabled={busy}
              className={`text-left rounded-xl border px-4 py-3 transition-colors disabled:opacity-50 ${
                phase === p.id
                  ? "bg-cyan/20 text-cyan border-cyan/40"
                  : "bg-white/5 text-white/70 border-white/10 hover:bg-white/10"
              }`}
            >
              <div className="font-semibold flex items-center gap-2">
                {phase === p.id && <span>●</span>}
                {p.label}
              </div>
              <div className="text-xs text-white/40 mt-1">{p.help}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Cadastrar dor em nome de um participante */}
      <AddPainForm phase={phase} onAdded={load} />

      {/* Ranking / dores visiveis */}
      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-white/5 text-white/60 text-xs uppercase font-mono flex justify-between">
          <span>Dores visíveis ({visible.length})</span>
          <span>ordenadas por votos</span>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {visible.map((p, i) => (
              <PainRow
                key={p.id}
                pain={p}
                index={i}
                expanded={expanded === p.id}
                onToggle={() => setExpanded(expanded === p.id ? null : p.id)}
                onHide={() => hide(p.id)}
              />
            ))}
            {!visible.length && (
              <tr>
                <td className="px-4 py-6 text-center text-white/40">
                  Nenhuma dor registrada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Dores ocultas */}
      {hidden.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-white/5 text-white/60 text-xs uppercase font-mono">
            Ocultas ({hidden.length})
          </div>
          <table className="w-full text-sm">
            <tbody>
              {hidden.map((p) => (
                <tr key={p.id} className="border-t border-white/5 opacity-60">
                  <td className="px-2 py-3 w-16 text-center font-mono text-white/40">
                    {p.vote_count}
                  </td>
                  <td className="px-4 py-3 text-white/70 line-through">
                    {p.title}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => unhide(p.id)}
                      className="text-xs text-cyan hover:underline"
                    >
                      reexibir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Linha de uma dor visivel + (quando expandida) a lista de votantes.
function PainRow({ pain, index, expanded, onToggle, onHide }) {
  const hasVoters = pain.voters && pain.voters.length > 0;
  return (
    <>
      <tr className="border-t border-white/5">
        <td className="px-4 py-3 w-12 text-center font-mono text-white/40">
          #{index + 1}
        </td>
        <td className="px-2 py-3 w-16 text-center">
          <span className="font-mono text-xl text-gold">{pain.vote_count}</span>
        </td>
        <td className="px-4 py-3">
          <div className="text-white">{pain.title}</div>
          {pain.description && (
            <div className="text-white/50 text-xs mt-0.5">
              {pain.description}
            </div>
          )}
          <div className="flex gap-2 mt-1 text-xs text-white/40 font-mono items-center flex-wrap">
            {pain.axis && (
              <span className="px-2 py-0.5 rounded-full bg-violet/15 text-violet">
                {pain.axis}
              </span>
            )}
            {pain.author_name && <span>por {pain.author_name}</span>}
            {hasVoters && (
              <button onClick={onToggle} className="text-cyan hover:underline">
                {expanded
                  ? "ocultar votantes"
                  : `ver votantes (${pain.voters.length})`}
              </button>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-right whitespace-nowrap">
          <button onClick={onHide} className="text-xs text-hot hover:underline">
            ocultar
          </button>
        </td>
      </tr>
      {expanded && hasVoters && (
        <tr className="border-t border-white/5 bg-white/5">
          <td colSpan={4} className="px-4 py-3">
            <VotersList voters={pain.voters} />
          </td>
        </tr>
      )}
    </>
  );
}

// Lista de votantes com nome + contato e botao de copiar.
function VotersList({ voters }) {
  function copyAll() {
    const text = voters
      .map((v) => `${v.full_name}\t${v.email}\t${v.phone}`)
      .join("\n");
    navigator.clipboard?.writeText(text);
  }
  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <span className="text-white/60 text-xs uppercase font-mono">
          {voters.length} votante(s)
        </span>
        <button onClick={copyAll} className="text-xs text-cyan hover:underline">
          copiar todos
        </button>
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        {voters.map((v, i) => (
          <div
            key={i}
            className="bg-dark/40 border border-white/5 rounded-lg px-3 py-2"
          >
            <div className="text-white text-sm">{v.full_name}</div>
            <div className="text-white/50 text-xs font-mono">{v.email}</div>
            <div className="text-white/50 text-xs font-mono">{v.phone}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Formulario: busca um inscrito confirmado e cadastra uma dor em nome dele.
function AddPainForm({ phase, onAdded }) {
  const enabled = phase === "wall_open";
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [axis, setAxis] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  async function search(e) {
    e.preventDefault();
    if (!supabase || !query.trim()) return;
    setSearching(true);
    setError(null);
    const q = query.trim();
    const digits = q.replace(/\D/g, "");
    const ors = [`full_name.ilike.%${q}%`, `email.ilike.%${q}%`];
    if (digits) ors.push(`cpf.ilike.%${digits}%`);
    const { data, error: err } = await supabase
      .from("registrations")
      .select("id, full_name, email, cpf, payment_status")
      .eq("payment_status", "confirmed")
      .or(ors.join(","))
      .limit(8);
    setSearching(false);
    if (err) {
      setError(err.message);
      return;
    }
    setResults(data || []);
  }

  async function submit() {
    if (!supabase || !selected || !title.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase.rpc("wall_admin_add_pain", {
      p_registration_id: selected.id,
      p_title: title.trim(),
      p_description: description.trim() || null,
      p_axis: axis || null,
    });
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    setNotice(`Dor adicionada em nome de ${selected.full_name}.`);
    setTitle("");
    setDescription("");
    setAxis("");
    setSelected(null);
    setResults([]);
    setQuery("");
    await onAdded();
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
      <h3 className="text-white font-semibold mb-1">
        Adicionar dor por participante
      </h3>
      <p className="text-white/50 text-xs mb-4">
        A dor é registrada em nome do participante selecionado. Disponível
        apenas com o muro aberto.
      </p>

      {!enabled && (
        <div className="bg-gold/10 border border-gold/30 rounded-lg px-4 py-2.5 text-gold text-sm">
          Disponível apenas na fase{" "}
          <span className="font-mono">Muro aberto</span>.
        </div>
      )}

      {enabled && (
        <div className="space-y-3">
          {error && (
            <div className="bg-hot/10 border border-hot/30 rounded-lg px-4 py-2 text-hot text-sm">
              {error}
            </div>
          )}
          {notice && (
            <div className="bg-cyan/10 border border-cyan/30 rounded-lg px-4 py-2 text-cyan text-sm">
              {notice}
            </div>
          )}

          {!selected ? (
            <form onSubmit={search} className="space-y-2">
              <div className="flex gap-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar inscrito confirmado (nome, email ou CPF)"
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan/50"
                />
                <button
                  type="submit"
                  disabled={searching || !query.trim()}
                  className="px-4 py-2.5 rounded-lg bg-cyan/20 text-cyan border border-cyan/40 text-sm disabled:opacity-50"
                >
                  {searching ? "..." : "Buscar"}
                </button>
              </div>
              {results.length > 0 && (
                <div className="border border-white/10 rounded-lg divide-y divide-white/5">
                  {results.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setSelected(r);
                        setResults([]);
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-white/5 transition-colors"
                    >
                      <div className="text-white text-sm">{r.full_name}</div>
                      <div className="text-white/40 text-xs font-mono">
                        {r.email}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </form>
          ) : (
            <div className="flex items-center justify-between bg-cyan/10 border border-cyan/30 rounded-lg px-4 py-2.5">
              <div>
                <div className="text-white text-sm">{selected.full_name}</div>
                <div className="text-white/40 text-xs font-mono">
                  {selected.email}
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-xs text-white/50 hover:text-white underline"
              >
                trocar
              </button>
            </div>
          )}

          {selected && (
            <div className="space-y-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="A dor em uma frase"
                maxLength={140}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan/50"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detalhe (opcional)"
                rows={2}
                maxLength={500}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan/50 resize-none"
              />
              <select
                value={axis}
                onChange={(e) => setAxis(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan/50"
              >
                <option value="">Eixo econômico (opcional)</option>
                {ECONOMIC_AXES.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <button
                onClick={submit}
                disabled={!title.trim() || submitting}
                className="w-full px-4 py-2.5 rounded-lg font-semibold bg-hot/20 text-hot border border-hot/40 hover:bg-hot/30 disabled:opacity-50 transition-colors"
              >
                {submitting
                  ? "Adicionando..."
                  : `Adicionar em nome de ${selected.full_name}`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Confirmar que o arquivo está no estilo do repo**

Run: `git diff src/admin/AdminWall.jsx` e conferir aspas simples / sem `;` (não deixar o formatter reescrever — se escreveu via Write e o hook reformatou, reaplicar via Bash).

- [ ] **Step 3: Build + lint**

Run (PowerShell): `npm run build` e `npx eslint src/admin/AdminWall.jsx`
Expected: build `✓ built`, eslint sem erros. (Atenção ao `react-hooks/set-state-in-effect` — a linha do `load()` no effect já tem o `eslint-disable-line`.)

- [ ] **Step 4: Commit**

```bash
git add src/admin/AdminWall.jsx
git commit -m "feat(admin): votantes por ideia + cadastrar dor por participante"
```

---

## Task 4: Changelog + deploy + verificação real

**Files:**

- Create: `docs/changelog/2026-05-29-muro-votantes-e-admin.md`

- [ ] **Step 1: Criar o changelog**

```markdown
# feat: Muro de Dores — votantes (telão/admin) + admin add pain

**Data:** 2026-05-29

## O que foi feito

- Telão (`#telao`): cada ideia mostra quem votou (chips "primeiro nome + inicial",
  6 + "+N mais"), só na fase `voting_open`.
- Admin (`AdminWall`): cada ideia expande mostrando os votantes com nome + email +
  phone (botão "copiar todos") para direcionar a formação dos grupos.
- Admin pode cadastrar uma dor em nome de um participante confirmado (busca por
  nome/email/CPF), só na fase `wall_open`.

## Backend (`migrations/add_wall_voters.sql`)

- `wall_display_name(full_name)` — nome curto para o nível público.
- `wall_list` estendido: telão (registration_id NULL) recebe `voters` curtos;
  participante não recebe (payload enxuto).
- `wall_admin_list` estendido: `voters` com nome + contato (gated admin).
- `wall_admin_add_pain` — novo, `is_admin()`, só em `wall_open`.

## Decisões

- Mantidas as 3 fases. Telão expõe nome curto publicamente; contato só no admin.
- Migration aplicada via MCP (não auto-aplica).
```

- [ ] **Step 2: Commit do changelog**

```bash
git add docs/changelog/2026-05-29-muro-votantes-e-admin.md
git commit -m "docs(muro): changelog votantes + admin add pain"
```

- [ ] **Step 3: Build final + push (deploy autorizado)**

Run (PowerShell): `npm run build` → `✓ built`.

```bash
git push origin master
```

- [ ] **Step 4: Acompanhar o deploy**

Run: `gh run list --workflow=deploy.yml --limit 1` e `gh run watch <id> --exit-status`
Expected: `success`.

- [ ] **Step 5: Verificação real (manual, com a migration já aplicada)**

- Admin `#admin` → aba "Muro de Dores": com `phase=wall_open`, usar "Adicionar dor por participante" (buscar um confirmado, cadastrar) → a dor aparece na lista.
- Mudar para `voting_open`, dar alguns votos via `#muro` (ou dados reais), confirmar:
  - no admin, "ver votantes" expande com nome + email + phone e "copiar todos" funciona;
  - no telão `#telao`, os chips de votantes aparecem (cap "+N mais" se > 6).

---

## Self-Review (preenchido)

- **Cobertura do spec:** votantes no telão (Task 2), resultado/votantes no admin (Task 3 — PainRow/VotersList), admin add pain só em wall_open (Task 1 RPC + Task 3 AddPainForm), 2 níveis de privacidade (Task 1: wall_list curto / wall_admin_list contato), changelog (Task 4). ✔
- **Placeholders:** nenhum TODO/TBD; todo código presente. ✔
- **Consistência de tipos/nomes:** `voters` é `[{display}]` no público e `[{full_name,email,phone}]` no admin; `PainRow`/`VotersList`/`AddPainForm` definidos e usados; `ECONOMIC_AXES` importado de `../wall/useWallSession`. ✔
- **Risco conhecido:** Step 2.4 (preview) reverte só o mock, não o Step 2.1 — atenção ao reaplicar.
