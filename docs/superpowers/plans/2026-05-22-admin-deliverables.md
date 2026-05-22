# Admin Deliverables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao admin uma aba "Entregas" para ver as entregas das equipes, ler comentários dos mentores (públicos e privados), controlar status, exportar CSV, e deixar pronta (mas não ligada) a estrutura de avaliação por IA com a rubrica do edital.

**Architecture:** Reusa a infraestrutura existente (`teams` JSONB canvases, `mentor_notes`, `DeliverableForm`/`LearningDiary` em modo leitura). Adiciona 1 migration (coluna `teams.status` + tabela `team_evaluations`), 1 componente admin novo (`AdminDeliverables.jsx`), 1 edge function stub (`evaluate-team`), e o wiring da aba no `AdminPanel`. Admin lê tudo direto via cliente autenticado (RLS já permite SELECT em `teams`/`mentor_notes`; adicionamos para `team_evaluations`).

**Tech Stack:** React 19 + Vite, Supabase (Postgres + RLS + Edge Functions Deno), Tailwind v4. **Sem test runner no projeto** — verificação por `npm run lint`, `npm run build` e checagem manual no browser.

---

## Notas de contexto (já existe, NÃO reconstruir)

- `src/participant/deliverableFields.js` exporta `PHASES`, `METHOD_PHASES`, `HYPOTHESES_FIELDS`, `SLC_IA_FIELDS`, `FINAL_FIELDS`.
- `src/participant/DeliverableForm.jsx` aceita prop `readOnly` (render só leitura: header + grid, sem form). Props usadas: `eyebrow, title, fields, value, gridClass`.
- `src/participant/LearningDiary.jsx` aceita `readOnly` + `value` (usado em `MentorPanel.jsx:88`).
- `src/lib/relativeTime.js` exporta `relativeTime(iso)` (usado em `MentorPanel.jsx:6`).
- Padrão de query admin: `import { supabase } from '../lib/supabase'` + `supabase.from('...').select(...)` (ver `src/admin/AdminMentors.jsx:18-21`).
- `teams` columns: `id, name, hypotheses_canvas, slc_ia_canvas, learning_diary, final_deliverables, updated_at, updated_by`.
- `mentor_notes` columns: `id, team_id, mentor_id, phase ('ignicao'|'construcao'|'apresentacao'), body, is_public, created_at`. FK `mentor_id → mentors.id` permite embedding PostgREST `mentors(name, email)`.
- `registrations` tem `team_id` e RLS admin/viewer SELECT.
- RLS de `teams` e `mentor_notes`: admin/viewer já podem SELECT.

---

### Task 1: Migration — `teams.status` + tabela `team_evaluations`

**Files:**
- Create: `migrations/add_deliverable_status_and_evaluations.sql`

- [ ] **Step 1: Criar a migration**

```sql
-- Admin deliverables: status da entrega em `teams` + estrutura de avaliação (stub IA).
-- Rubrica = edital (4 critérios com pesos %, Técnica eliminatória).

-- 1. Status da entrega (admin controla manualmente).
ALTER TABLE teams ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft','submitted','reviewing','evaluated'));

-- 2. Avaliações da equipe (estrutura pronta; agente de IA plugado depois).
CREATE TABLE IF NOT EXISTS team_evaluations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id        UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  evaluator_type TEXT NOT NULL DEFAULT 'ai' CHECK (evaluator_type IN ('ai','human')),
  rubric_version TEXT NOT NULL DEFAULT 'edital_v1',
  scores         JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{criterion_key,label,weight,score,justification}]
  total_score    NUMERIC,                              -- 0..100 (soma ponderada)
  eliminated     BOOLEAN NOT NULL DEFAULT false,       -- critério técnico é eliminatório
  summary        TEXT,
  model          TEXT,                                 -- qual LLM gerou (null por ora)
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','error')),
  error          TEXT,
  created_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_evaluations_team_id ON team_evaluations(team_id);

ALTER TABLE team_evaluations ENABLE ROW LEVEL SECURITY;

-- admin/viewer leem; admin escreve; service_role (edge function) bypassa RLS automaticamente.
DROP POLICY IF EXISTS "Admin viewer read team evaluations" ON team_evaluations;
CREATE POLICY "Admin viewer read team evaluations" ON team_evaluations
  FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin','viewer'));

DROP POLICY IF EXISTS "Admin write team evaluations" ON team_evaluations;
CREATE POLICY "Admin write team evaluations" ON team_evaluations
  FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
```

- [ ] **Step 2: Aplicar no Supabase**

Aplicar via Supabase SQL Editor (ou `supabase db push` se o fluxo do projeto usar migrations versionadas). A migration é idempotente (`IF NOT EXISTS` / `DROP POLICY IF EXISTS`).
Expected: roda sem erro; `SELECT status FROM teams LIMIT 1;` retorna `draft` para linhas existentes; `SELECT * FROM team_evaluations;` retorna vazio.

- [ ] **Step 3: Commit**

```bash
git add migrations/add_deliverable_status_and_evaluations.sql
git commit -m "feat(db): teams.status + team_evaluations table for admin deliverables"
```

---

### Task 2: Edge function stub `evaluate-team`

**Files:**
- Create: `supabase/functions/evaluate-team/index.ts`
- Modify: `supabase/config.toml` (append function block)

- [ ] **Step 1: Criar a função (retorna 501 com a rubrica do edital embutida)**

```ts
// supabase/functions/evaluate-team/index.ts
// Stub do IA Evaluator. Estrutura pronta; o agente de IA ainda não está conectado.
// A rubrica do edital fica embutida como fonte de verdade para quando o agente for plugado.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const EDITAL_RUBRIC = {
  version: 'edital_v1',
  total: 100,
  criteria: [
    { key: 'tecnica_ia', label: 'Execução Técnica e IA', weight: 30, eliminatory: true,
      describe: 'Funcionalidade do código, design da solução e profundidade da implementação de IA.' },
    { key: 'validacao_problema', label: 'Validação do Problema', weight: 25, eliminatory: false,
      describe: 'Dor real validada com dados; internacionalização; aderência aos eixos de governança (extra).' },
    { key: 'escala_negocio', label: 'Escalabilidade e Negócio', weight: 25, eliminatory: false,
      describe: 'Potencial de crescimento, evidências de tração comercial e viabilidade financeira.' },
    { key: 'pitch_equipe', label: 'Pitch e Equipe', weight: 20, eliminatory: false,
      describe: 'Clareza do problema, sinergia dos fundadores, continuidade e resposta aos jurados.' },
  ],
  extra: { key: 'mentor', label: 'Avaliação do Mentor',
    describe: 'Parecer padronizado do mentor fixo (extra, não soma nos 100).' },
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let body: { team_id?: string } = {}
  try { body = await req.json() } catch { /* ignore parse error */ }
  if (!body.team_id) return json({ error: 'team_id_required' }, 400)

  // Estrutura pronta — o agente de IA ainda não foi implementado.
  return json({
    error: 'not_implemented',
    message: 'IA Evaluator ainda não conectado.',
    team_id: body.team_id,
    rubric: EDITAL_RUBRIC,
  }, 501)
})
```

- [ ] **Step 2: Registrar no `config.toml`**

Abrir `supabase/config.toml`, localizar os blocos `[functions.<nome>]` existentes (ex.: `[functions.log-event]`) e adicionar, no mesmo formato:

```toml
[functions.evaluate-team]
verify_jwt = true
```

- [ ] **Step 3: Verificar sintaxe Deno (se a CLI estiver disponível)**

Run: `deno check supabase/functions/evaluate-team/index.ts`
Expected: sem erros. (Se `deno` não estiver instalado, pular — a verificação real é no deploy.)

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/evaluate-team/index.ts supabase/config.toml
git commit -m "feat(functions): evaluate-team stub with edital rubric (501 not implemented)"
```

---

### Task 3: Componente `AdminDeliverables.jsx`

**Files:**
- Create: `src/admin/AdminDeliverables.jsx`

- [ ] **Step 1: Criar o componente completo**

```jsx
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import DeliverableForm from '../participant/DeliverableForm'
import LearningDiary from '../participant/LearningDiary'
import { PHASES, HYPOTHESES_FIELDS, SLC_IA_FIELDS, FINAL_FIELDS } from '../participant/deliverableFields'
import { relativeTime } from '../lib/relativeTime'

const STATUS = [
  { id: 'draft', label: 'Rascunho', cls: 'bg-white/5 text-white/50 border-white/10' },
  { id: 'submitted', label: 'Enviada', cls: 'bg-electric/10 text-electric border-electric/30' },
  { id: 'reviewing', label: 'Em análise', cls: 'bg-gold/10 text-gold border-gold/30' },
  { id: 'evaluated', label: 'Avaliada', cls: 'bg-cyan/10 text-cyan border-cyan/30' },
]
const statusMeta = (id) => STATUS.find(s => s.id === id) || STATUS[0]
const PHASE_LABEL = { ignicao: 'Fase 1 · Ignição', construcao: 'Fase 2 · Construção', apresentacao: 'Fase 3 · Apresentação' }

export default function AdminDeliverables({ readOnly = false }) {
  const [teams, setTeams] = useState([])
  const [members, setMembers] = useState([])
  const [notes, setNotes] = useState([])
  const [evals, setEvals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [sub, setSub] = useState('hypotheses')

  async function fetchData() {
    if (!supabase) { setError('Supabase não configurado.'); setLoading(false); return }
    setError(null)
    const [t, r, n, e] = await Promise.all([
      supabase.from('teams').select('id, name, status, hypotheses_canvas, slc_ia_canvas, learning_diary, final_deliverables, updated_at, updated_by').order('name', { ascending: true }),
      supabase.from('registrations').select('team_id, full_name, is_team_leader, payment_status'),
      supabase.from('mentor_notes').select('id, team_id, phase, body, is_public, created_at, mentors(name, email)').order('created_at', { ascending: false }),
      supabase.from('team_evaluations').select('id, team_id, evaluator_type, rubric_version, total_score, eliminated, summary, status, created_at').order('created_at', { ascending: false }),
    ])
    const firstErr = [t, r, n, e].find(x => x.error)
    if (firstErr) { setError(firstErr.error.message); setLoading(false); return }
    setTeams(t.data ?? []); setMembers(r.data ?? []); setNotes(n.data ?? []); setEvals(e.data ?? [])
    setLoading(false)
  }
  useEffect(() => { fetchData() }, []) // eslint-disable-line react-hooks/set-state-in-effect

  const memberCount = (teamId) => members.filter(m => m.team_id === teamId).length
  const notesFor = (teamId) => notes.filter(n => n.team_id === teamId)
  const evalsFor = (teamId) => evals.filter(ev => ev.team_id === teamId)
  const selected = teams.find(t => t.id === selectedId) || null

  async function changeStatus(teamId, status) {
    if (!supabase) return
    const { error: err } = await supabase.from('teams').update({ status }).eq('id', teamId)
    if (err) { alert(`Erro: ${err.message}`); return }
    setTeams(ts => ts.map(t => t.id === teamId ? { ...t, status } : t))
  }

  function exportCSV() {
    const flat = [
      ...HYPOTHESES_FIELDS.map(f => ({ field: 'hypotheses_canvas', key: f.key, label: `Hipóteses · ${f.label}` })),
      ...SLC_IA_FIELDS.map(f => ({ field: 'slc_ia_canvas', key: f.key, label: `SLC-IA · ${f.label}` })),
      ...FINAL_FIELDS.map(f => ({ field: 'final_deliverables', key: f.key, label: `Final · ${f.label}` })),
    ]
    const headers = ['Equipe', 'Status', 'Membros', 'Atualizado em', ...flat.map(c => c.label)]
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const rows = teams.map(t => {
      const cells = [t.name, statusMeta(t.status).label, memberCount(t.id), t.updated_at || '']
      for (const c of flat) cells.push((t[c.field] || {})[c.key] || '')
      return cells.map(esc).join(',')
    })
    const csv = '﻿' + [headers.map(esc).join(','), ...rows].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `entregas-hackia-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <p className="text-white/60 font-mono">Carregando...</p>

  if (selected) {
    const tnotes = notesFor(selected.id)
    const tevals = evalsFor(selected.id)
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <button onClick={() => setSelectedId(null)} className="text-sm text-white/60 hover:text-white">← Todas as equipes</button>
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/50">Status:</span>
            {readOnly ? (
              <span className={`px-3 py-1 rounded-full text-xs border ${statusMeta(selected.status).cls}`}>{statusMeta(selected.status).label}</span>
            ) : (
              <select value={selected.status} onChange={e => changeStatus(selected.id, e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-cyan/50">
                {STATUS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            )}
          </div>
        </div>

        <div className="card-glass rounded-2xl p-6">
          <p className="text-xs font-mono text-cyan uppercase tracking-wider">Equipe</p>
          <h1 className="text-2xl font-bold mt-1">{selected.name}</h1>
          <p className="text-xs text-text-muted mt-2">{memberCount(selected.id)} membros · última edição {selected.updated_at ? `há ${relativeTime(selected.updated_at)}` : '—'}</p>
        </div>

        <div className="card-glass rounded-2xl p-4">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {PHASES.map(p => (
              <button key={p.id} onClick={() => setSub(p.id)} className={`flex flex-col items-start px-4 py-2 rounded-xl border transition-all whitespace-nowrap ${sub === p.id ? 'border-cyan/40 bg-cyan/10 text-cyan' : 'border-dark-border bg-dark text-text-muted hover:text-white hover:border-text-muted'}`}>
                <span className="text-[10px] font-mono uppercase opacity-70">{p.phase}</span>
                <span className="text-sm font-semibold">{p.label}</span>
              </button>
            ))}
          </div>
        </div>

        {sub === 'hypotheses' && <DeliverableForm readOnly eyebrow="Fase 1 · Ignição" title="Canvas de Hipóteses" fields={HYPOTHESES_FIELDS} value={selected.hypotheses_canvas} />}
        {sub === 'slc' && <DeliverableForm readOnly eyebrow="Fase 2 · Construção" title="Canvas SLC-IA" fields={SLC_IA_FIELDS} value={selected.slc_ia_canvas} />}
        {sub === 'diary' && <LearningDiary readOnly value={selected.learning_diary} />}
        {sub === 'final' && <DeliverableForm readOnly eyebrow="Fase 3 · Apresentação" title="Entregas finais" fields={FINAL_FIELDS} value={selected.final_deliverables} gridClass="grid grid-cols-1 sm:grid-cols-2 gap-4" />}

        <div className="card-glass rounded-2xl p-6 space-y-4">
          <div>
            <p className="text-xs font-mono text-violet uppercase tracking-wider">Comentários dos mentores</p>
            <h3 className="text-lg font-bold text-white mt-1">{tnotes.length} {tnotes.length === 1 ? 'comentário' : 'comentários'}</h3>
          </div>
          {!tnotes.length && <p className="text-sm text-text-muted">Nenhum comentário de mentor ainda.</p>}
          {tnotes.map(n => (
            <div key={n.id} className="border border-dark-border rounded-xl p-4">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                <span className="text-sm font-semibold text-white">{n.mentors?.name || n.mentors?.email || 'Mentor'}</span>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-white/5 text-white/60 border border-white/10">{PHASE_LABEL[n.phase] || n.phase}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase border ${n.is_public ? 'bg-cyan/10 text-cyan border-cyan/30' : 'bg-hot/10 text-hot border-hot/30'}`}>{n.is_public ? 'pública' : 'privada'}</span>
                </div>
              </div>
              <p className="text-sm text-white/80 whitespace-pre-wrap">{n.body}</p>
              <p className="text-xs text-text-muted mt-2">há {relativeTime(n.created_at)}</p>
            </div>
          ))}
        </div>

        <div className="card-glass rounded-2xl p-6 space-y-3">
          <p className="text-xs font-mono text-gold uppercase tracking-wider">Avaliação por IA</p>
          {!tevals.length ? (
            <p className="text-sm text-text-muted">Estrutura pronta — agente de avaliação ainda não conectado. As avaliações aparecerão aqui (rubrica do edital: Técnica 30% · Validação 25% · Escala 25% · Pitch 20%).</p>
          ) : (
            tevals.map(ev => (
              <div key={ev.id} className="border border-dark-border rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">{ev.evaluator_type === 'ai' ? 'IA' : 'Humano'} · {ev.rubric_version}</span>
                  <span className="text-sm font-mono text-gold">{ev.total_score != null ? `${ev.total_score} pts` : ev.status}</span>
                </div>
                {ev.eliminated && <span className="text-xs text-hot">Eliminado (critério técnico)</span>}
                {ev.summary && <p className="text-sm text-white/80 mt-2 whitespace-pre-wrap">{ev.summary}</p>}
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && <div className="bg-hot/10 border border-hot/30 rounded-lg px-4 py-2.5 text-hot text-sm">{error}</div>}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-white/60">{teams.length} equipes</p>
        <button onClick={exportCSV} className="px-4 py-2 rounded-lg text-sm font-semibold bg-electric/20 text-electric border border-electric/40 hover:bg-electric/30">Exportar CSV</button>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-white/60 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Equipe</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-right px-4 py-2">Membros</th>
              <th className="text-right px-4 py-2">Comentários</th>
              <th className="text-left px-4 py-2">Atualizado</th>
              <th className="text-right px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {teams.map(t => (
              <tr key={t.id} className="border-t border-white/5 hover:bg-white/5 cursor-pointer" onClick={() => { setSelectedId(t.id); setSub('hypotheses') }}>
                <td className="px-4 py-2 text-white font-medium">{t.name}</td>
                <td className="px-4 py-2"><span className={`px-2.5 py-0.5 rounded-full text-xs border ${statusMeta(t.status).cls}`}>{statusMeta(t.status).label}</span></td>
                <td className="px-4 py-2 text-right text-white/70">{memberCount(t.id)}</td>
                <td className="px-4 py-2 text-right text-white/70">{notesFor(t.id).length}</td>
                <td className="px-4 py-2 text-white/50 text-xs">{t.updated_at ? relativeTime(t.updated_at) : '—'}</td>
                <td className="px-4 py-2 text-right"><span className="text-xs text-electric">ver →</span></td>
              </tr>
            ))}
            {!teams.length && <tr><td colSpan={6} className="px-4 py-6 text-center text-white/40">Nenhuma equipe ainda.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar que `relativeTime` e `LearningDiary` exportam o esperado**

Run: `node -e "console.log(require('fs').readFileSync('src/lib/relativeTime.js','utf8').includes('export') )"`
Expected: confirmar `export function relativeTime` em `src/lib/relativeTime.js` e `readOnly`/`value` em `src/participant/LearningDiary.jsx` (já usados por `MentorPanel.jsx`). Se a assinatura de `LearningDiary` divergir, ajustar a chamada no Step 1.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: sem novos erros referentes a `AdminDeliverables.jsx`.

- [ ] **Step 4: Commit**

```bash
git add src/admin/AdminDeliverables.jsx
git commit -m "feat(admin): AdminDeliverables — view canvases, mentor notes, status, CSV, eval panel"
```

---

### Task 4: Wiring da aba no `AdminPanel.jsx`

**Files:**
- Modify: `src/admin/AdminPanel.jsx`

- [ ] **Step 1: Importar o componente**

Adicionar após a linha `import AdminMentors from './AdminMentors'`:

```jsx
import AdminDeliverables from './AdminDeliverables'
```

- [ ] **Step 2: Adicionar a aba** (visível a admin E viewer — sem `adminOnly`)

No array `ALL_TABS`, inserir logo após a entrada `{ id: 'teams', ... }`:

```jsx
  { id: 'deliverables', label: 'Entregas', icon: '📦' },
```

- [ ] **Step 3: Renderizar o conteúdo**

Após a linha `{activeTab === 'teams' && <AdminTeams readOnly={readOnly} />}`, inserir:

```jsx
        {activeTab === 'deliverables' && <AdminDeliverables readOnly={readOnly} />}
```

- [ ] **Step 4: Build + lint**

Run: `npm run lint && npm run build`
Expected: build conclui sem erro; sem erros de lint.

- [ ] **Step 5: Commit**

```bash
git add src/admin/AdminPanel.jsx
git commit -m "feat(admin): wire Entregas tab into AdminPanel"
```

---

### Task 5: Verificação manual + changelog

**Files:**
- Create: `docs/changelog/2026-05-22-admin-deliverables.md`

- [ ] **Step 1: Verificação manual no browser** (`npm run dev`, entrar em `/#admin` como admin)

Checklist:
- Aba "Entregas" aparece; lista as equipes com status, membros, nº de comentários.
- Clicar numa equipe abre o detalhe; as 4 abas (Hipóteses, SLC-IA, Diário BML, Entregas) mostram os dados read-only de uma equipe que preencheu via painel do participante.
- Comentários de mentor aparecem com nome, fase e badge pública/privada (criar uma nota privada e uma pública via painel do mentor para conferir que **ambas** aparecem).
- Trocar o status persiste (recarregar a página mantém).
- "Exportar CSV" baixa arquivo com 1 linha por equipe, abre no Excel com acentuação correta.
- Logar como `viewer`: a aba aparece, mas o seletor de status vira badge (sem edição).

- [ ] **Step 2: Verificar a edge function** (se `supabase` CLI disponível)

Run: `curl -s -X POST "$SUPABASE_URL/functions/v1/evaluate-team" -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" -d '{"team_id":"00000000-0000-0000-0000-000000000000"}'`
Expected: HTTP 501, JSON com `error: "not_implemented"` e `rubric.version: "edital_v1"`. (Se não houver CLI/deploy local, marcar para validar no deploy.)

- [ ] **Step 3: Escrever o changelog** (formato de `.claude/rules/commit-docs.md`)

```markdown
# feat: admin deliverables view, mentor comments, status, CSV, eval structure

**Data:** 2026-05-22
**Branch:** feat/admin-deliverables
**Arquivos alterados:** migrations/add_deliverable_status_and_evaluations.sql, supabase/functions/evaluate-team/index.ts, supabase/config.toml, src/admin/AdminDeliverables.jsx, src/admin/AdminPanel.jsx

## O que foi feito
Aba "Entregas" no painel admin: lista equipes com status; detalhe mostra os 4 canvases read-only (reuso do DeliverableForm/LearningDiary), comentários dos mentores (públicos+privados) e painel de avaliação IA. Export CSV (1 linha/equipe). Migration adiciona teams.status e a tabela team_evaluations. Edge function evaluate-team é stub (501) com a rubrica do edital embutida.

## Por que
O participante já submetia entregas e o mentor já comentava, mas o admin não conseguia ver nada disso nem controlar status — gap do lado admin.

## Decisões técnicas
- Rubrica do edital (4 critérios, pesos %, Técnica eliminatória) — escolha do organizador.
- Nova aba em vez de inchar AdminTeams (1556 linhas).
- Reuso de DeliverableForm/LearningDiary read-only.
- Avaliação IA: só estrutura (tabela + stub), agente pendente.

## Impacto
- Sem breaking changes. RLS já permitia leitura admin de teams/mentor_notes; adicionada RLS para team_evaluations.
```

- [ ] **Step 4: Commit**

```bash
git add docs/changelog/2026-05-22-admin-deliverables.md
git commit -m "docs(changelog): admin deliverables feature"
```

---

## Self-review (preenchido pelo autor do plano)

- **Cobertura do spec:** (A) admin ver entregas → Task 3 detalhe + reuso DeliverableForm. (B) comentários de mentor → Task 3 seção notes. (C) CSV → Task 3 exportCSV. (D) status → Task 1 coluna + Task 3 seletor. (E) estrutura avaliação IA → Task 1 tabela + Task 2 edge function + Task 3 painel. ✔ Tudo coberto.
- **Placeholders:** nenhum — todo código está inline.
- **Consistência de tipos:** `status` valores `draft|submitted|reviewing|evaluated` iguais em migration, `STATUS` e CSV. `mentor_notes` embedding `mentors(name,email)` consistente com leitura `n.mentors?.name`. Campos dos canvases vêm de `deliverableFields.js` (fonte única).
- **Risco conhecido:** o embedding PostgREST `mentors(name, email)` depende da FK `mentor_notes.mentor_id → mentors.id`. Se o nome do relacionamento divergir, usar `mentors!mentor_notes_mentor_id_fkey(name,email)`. Verificar no Step 1/3 da Task 3.
