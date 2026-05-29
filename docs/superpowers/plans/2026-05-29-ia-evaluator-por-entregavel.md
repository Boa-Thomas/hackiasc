# IA Evaluator por entregável — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a avaliação holística da IA por avaliações por entregável (Fase 1/2/3) que agregam (média entre fases) na nota IA da equipe, com card lateral de pendentes (equipe × entregável) para processamento rápido inline.

**Architecture:** `iaEvaluator.js` ganha `DELIVERABLE_UNITS` + 3 funções puras (build/parse/aggregate). `AdminDeliverables.jsx` passa a renderizar um avaliador por entregável (componente `DeliverableEvaluator`, reaproveitado no detalhe e no card lateral). `AdminRanking.jsx` agrega as linhas `ai` por entregável (guarda contra linhas holísticas legadas). Nota oficial dos jurados (`evaluator_type='human'`) intacta. Migration adiciona a coluna `deliverable` + índice único parcial.

**Tech Stack:** React 19, Vite 8, Supabase JS, Vitest (node env), Tailwind v4.

---

## File Structure

- `migrations/add_evaluation_deliverable.sql` — **criar**: coluna `deliverable` + índice parcial (aplicar à mão).
- `src/lib/iaEvaluator.js` — **modificar**: + `DELIVERABLE_UNITS`, `buildDeliverablePrompt`, `parseDeliverableEvaluation`, `aggregateTeamEvaluation`; remover `buildEvaluationPrompt`/`parseEvaluation`/holístico.
- `src/lib/iaEvaluator.test.js` — **criar**: testes Vitest das 3 funções novas.
- `src/admin/AdminDeliverables.jsx` — **modificar**: avaliações por entregável (detalhe) + card lateral inline (lista) + `DeliverableEvaluator`.
- `src/admin/AdminRanking.jsx` — **modificar**: menção IA agregada + guarda.
- `docs/changelog/2026-05-29-ia-evaluator-por-entregavel.md` — **criar**: registro.

---

## Task 1: Migration — coluna `deliverable` + índice parcial

**Files:**
- Create: `migrations/add_evaluation_deliverable.sql`

- [ ] **Step 1: Criar a migration**

```sql
-- ============================================================
-- MIGRACAO: IA Evaluator por entregavel
-- ============================================================
-- Aplique no Supabase SQL Editor do projeto qshrzfahotmjshtjuvno (NAO auto-aplica).
-- Idempotente (IF NOT EXISTS). Depende de: team_evaluations
-- (add_deliverable_status_and_evaluations.sql).
--
-- A IA passa a gravar 1 avaliacao por (equipe, entregavel). `deliverable` marca a
-- fase ('fase1'|'fase2'|'fase3'). NULL = avaliacao holistica/humana (jurados,
-- juror_id setado) — mantem o fluxo oficial intacto.

ALTER TABLE team_evaluations
  ADD COLUMN IF NOT EXISTS deliverable TEXT
  CHECK (deliverable IN ('fase1','fase2','fase3'));

-- 1 avaliacao IA por (equipe, entregavel); re-executavel (UPDATE da linha existente).
-- Parcial: linhas humanas/holisticas (deliverable NULL) ficam livres.
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_eval_ai_deliverable
  ON team_evaluations (team_id, deliverable)
  WHERE evaluator_type = 'ai' AND deliverable IS NOT NULL;
```

- [ ] **Step 2: Commit**

```bash
git add migrations/add_evaluation_deliverable.sql
git commit -m "feat(db): add deliverable column to team_evaluations for per-deliverable AI eval"
```

> **MANUAL:** Esta migration precisa ser aplicada à mão no SQL Editor do Supabase (projeto `qshrzfahotmjshtjuvno`) antes do recurso funcionar em produção. Sinalizar ao usuário.

---

## Task 2: `iaEvaluator.js` — unidades + build/parse/aggregate (TDD)

**Files:**
- Create: `src/lib/iaEvaluator.test.js`
- Modify: `src/lib/iaEvaluator.js`

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `src/lib/iaEvaluator.test.js`:

```js
import { describe, it, expect } from 'vitest'
import {
  DELIVERABLE_UNITS,
  UNIT_BY_ID,
  buildDeliverablePrompt,
  parseDeliverableEvaluation,
  aggregateTeamEvaluation,
} from './iaEvaluator'

const TEAM = {
  name: 'Nimbus',
  hypotheses_canvas: { cliente_alvo: 'PMEs têxteis de Blumenau' },
  slc_ia_canvas: { camada_ia: 'GPT-4o, custo R$0,02/chamada' },
  learning_diary: [{ ciclo: 1, decisao: 'persevere' }],
  final_deliverables: { repo_url: 'https://github.com/x', deploy_url: 'https://x.app' },
}
const MEMBERS = [{ full_name: 'Ana', occupation_type: 'dev', is_team_leader: true, economic_axes: ['têxtil'], project_name: 'Nimbus AI' }]

describe('DELIVERABLE_UNITS', () => {
  it('tem 3 unidades com os critérios mapeados por fase', () => {
    expect(DELIVERABLE_UNITS.map(u => u.id)).toEqual(['fase1', 'fase2', 'fase3'])
    expect(UNIT_BY_ID.fase1.criteria).toEqual(['validacao_problema'])
    expect(UNIT_BY_ID.fase2.criteria).toEqual(['tecnica_ia', 'validacao_problema'])
    expect(UNIT_BY_ID.fase3.criteria).toEqual(['tecnica_ia', 'escala_negocio', 'pitch_equipe'])
  })
})

describe('buildDeliverablePrompt', () => {
  it('fase1: inclui só o critério Validação, campos de Hipóteses, sem pitch nem eliminatório', () => {
    const p = buildDeliverablePrompt({ unit: UNIT_BY_ID.fase1, team: TEAM, members: MEMBERS })
    expect(p).toContain('`validacao_problema`')
    expect(p).not.toContain('`tecnica_ia`')
    expect(p).toContain('Cliente-alvo')
    expect(p).not.toContain('ELIMINATÓRIO')
    expect(p).not.toContain('pitch / demo')
    expect(p).toContain('Nimbus')
  })

  it('fase3: inclui Técnica/Escala/Pitch, observações do pitch e o eliminatório', () => {
    const p = buildDeliverablePrompt({ unit: UNIT_BY_ID.fase3, team: TEAM, members: MEMBERS, pitchNotes: 'A IA rodou ao vivo' })
    expect(p).toContain('`tecnica_ia`')
    expect(p).toContain('`escala_negocio`')
    expect(p).toContain('`pitch_equipe`')
    expect(p).toContain('A IA rodou ao vivo')
    expect(p).toContain('ELIMINATÓRIO')
    expect(p).toContain('"eliminated"')
  })

  it('fase2: inclui o Diário e os 2 critérios', () => {
    const p = buildDeliverablePrompt({ unit: UNIT_BY_ID.fase2, team: TEAM, members: MEMBERS })
    expect(p).toContain('Diário de Aprendizado')
    expect(p).toContain('`tecnica_ia`')
    expect(p).toContain('`validacao_problema`')
  })
})

describe('parseDeliverableEvaluation', () => {
  it('fase2 válido: normaliza 2 notas, honra eliminated, calcula nota do entregável', () => {
    const json = JSON.stringify({
      scores: [
        { criterion_key: 'tecnica_ia', score: 60, justification: 'x' },
        { criterion_key: 'validacao_problema', score: 70 },
      ],
      eliminated: true, summary: 's', model: 'm',
    })
    const r = parseDeliverableEvaluation(json, UNIT_BY_ID.fase2)
    expect(r.scores).toHaveLength(2)
    expect(r.scores[0]).toMatchObject({ criterion_key: 'tecnica_ia', label: 'Execução Técnica e IA', weight: 30, score: 60 })
    expect(r.eliminated).toBe(true)
    expect(r.total_score).toBe(65)
    expect(r.model).toBe('m')
  })

  it('rejeita critério faltando', () => {
    const json = JSON.stringify({ scores: [{ criterion_key: 'tecnica_ia', score: 60 }] })
    expect(() => parseDeliverableEvaluation(json, UNIT_BY_ID.fase2)).toThrow(/Faltam critérios/)
  })

  it('rejeita critério fora do entregável', () => {
    const json = JSON.stringify({ scores: [
      { criterion_key: 'tecnica_ia', score: 60 },
      { criterion_key: 'validacao_problema', score: 70 },
      { criterion_key: 'escala_negocio', score: 80 },
    ] })
    expect(() => parseDeliverableEvaluation(json, UNIT_BY_ID.fase2)).toThrow(/fora deste entregável/)
  })

  it('rejeita nota fora de 0–100', () => {
    const json = JSON.stringify({ scores: [{ criterion_key: 'validacao_problema', score: 150 }] })
    expect(() => parseDeliverableEvaluation(json, UNIT_BY_ID.fase1)).toThrow(/0 a 100/)
  })

  it('fase1 ignora eliminated (não cobre o critério eliminatório)', () => {
    const json = JSON.stringify({ scores: [{ criterion_key: 'validacao_problema', score: 80 }], eliminated: true })
    const r = parseDeliverableEvaluation(json, UNIT_BY_ID.fase1)
    expect(r.eliminated).toBe(false)
    expect(r.total_score).toBe(80)
  })

  it('tolera cercas ```json```', () => {
    const json = '```json\n{ "scores": [{ "criterion_key": "validacao_problema", "score": 50 }] }\n```'
    const r = parseDeliverableEvaluation(json, UNIT_BY_ID.fase1)
    expect(r.scores[0].score).toBe(50)
  })
})

describe('aggregateTeamEvaluation', () => {
  const rows = [
    { deliverable: 'fase2', scores: [{ criterion_key: 'tecnica_ia', score: 60 }, { criterion_key: 'validacao_problema', score: 70 }], eliminated: false },
    { deliverable: 'fase3', scores: [{ criterion_key: 'tecnica_ia', score: 80 }, { criterion_key: 'escala_negocio', score: 90 }, { criterion_key: 'pitch_equipe', score: 50 }], eliminated: false },
  ]

  it('faz média entre fases e calcula o total ponderado do edital', () => {
    const agg = aggregateTeamEvaluation(rows)
    const tecnica = agg.criteria.find(c => c.key === 'tecnica_ia')
    expect(tecnica.score).toBe(70)
    expect(tecnica.contributors).toEqual(['fase2', 'fase3'])
    expect(agg.partial).toBe(false)
    expect(agg.scoredCriteria).toBe(4)
    expect(agg.total_score).toBe(71)
    expect(agg.eliminated).toBe(false)
  })

  it('marca parcial e total null quando faltam critérios', () => {
    const agg = aggregateTeamEvaluation([{ deliverable: 'fase1', scores: [{ criterion_key: 'validacao_problema', score: 90 }] }])
    expect(agg.partial).toBe(true)
    expect(agg.scoredCriteria).toBe(1)
    expect(agg.total_score).toBeNull()
  })

  it('eliminated = OR das unidades que cobrem o critério técnico', () => {
    const agg = aggregateTeamEvaluation([
      ...rows.slice(0, 1),
      { deliverable: 'fase3', scores: [{ criterion_key: 'tecnica_ia', score: 10 }, { criterion_key: 'escala_negocio', score: 90 }, { criterion_key: 'pitch_equipe', score: 50 }], eliminated: true },
    ])
    expect(agg.eliminated).toBe(true)
  })

  it('ignora linhas legadas sem deliverable', () => {
    const agg = aggregateTeamEvaluation([{ deliverable: null, scores: [{ criterion_key: 'tecnica_ia', score: 99 }] }])
    expect(agg.scoredCriteria).toBe(0)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/lib/iaEvaluator.test.js`
Expected: FAIL — `buildDeliverablePrompt`/`parseDeliverableEvaluation`/`aggregateTeamEvaluation`/`DELIVERABLE_UNITS` não exportados.

- [ ] **Step 3: Reescrever `src/lib/iaEvaluator.js`**

Substituir o arquivo inteiro por (mantém `EDITAL_RUBRIC`, `section`, `renderFields`, `renderDiary`, `extractJson`; remove holístico):

```js
// IA Evaluator — human-in-the-loop, por entregável.
// O sistema monta um pacote por ENTREGÁVEL (dados daquele entregável + os
// critérios do edital que se aplicam a ele + formato JSON). O avaliador roda no
// Claude e cola o JSON de volta, que é parseado e gravado em `team_evaluations`
// (1 linha por equipe × entregável, evaluator_type='ai', deliverable setado).
// `aggregateTeamEvaluation` combina os entregáveis na nota IA da equipe.
// Nada de API key/Whisper: o input/output da informação é feito pelo operador.

import { HYPOTHESES_FIELDS, SLC_IA_FIELDS, FINAL_FIELDS } from '../participant/deliverableFields'

// Rubrica oficial = EDITAL (em caso de divergência com a metodologia, o edital vence).
// Critério técnico é ELIMINATÓRIO. Pesos somam 100.
export const EDITAL_RUBRIC = {
  version: 'edital_v1',
  total: 100,
  criteria: [
    {
      key: 'tecnica_ia', label: 'Execução Técnica e IA', weight: 30, eliminatory: true,
      describe:
        'Funcionalidade do código, design da solução e profundidade da implementação de IA. ' +
        'A IA roda de verdade (chamada real à API, output gerado dinamicamente, custo medido)? ' +
        'Há repositório público no GitHub e solução deployed em URL pública? Caráter ELIMINATÓRIO: ' +
        'se não há IA real funcional, a equipe pode ser eliminada.',
    },
    {
      key: 'validacao_problema', label: 'Validação do Problema', weight: 25, eliminatory: false,
      describe:
        'A dor é real e relevante, validada com dados verídicos e significativos (falaram com clientes, ' +
        'têm citações/números). Capacidade de internacionalização do problema. Aderência aos eixos econômicos ' +
        'de Blumenau (metalmecânico, têxtil, TIC, turismo, economia criativa, saúde) conta como reforço.',
    },
    {
      key: 'escala_negocio', label: 'Escalabilidade e Negócio', weight: 25, eliminatory: false,
      describe:
        'Potencial de crescimento, evidências de tração comercial (vendas com comprovante, pré-vendas, LOIs ' +
        'assinadas, conversões mensuráveis em landing) e viabilidade financeira. Modelo monetizável (ticket médio ' +
        'mínimo sugerido R$20) e escalável. Vendas para parentes não contam.',
    },
    {
      key: 'pitch_equipe', label: 'Pitch e Equipe', weight: 20, eliminatory: false,
      describe:
        'Clareza do problema resolvido, sinergia dos fundadores, potencial de continuidade e qualidade das ' +
        'respostas aos jurados. Demonstração da solução funcional. Leitura integral do pitch reduz a nota.',
    },
  ],
  extra: { key: 'mentor', label: 'Avaliação do Mentor', describe: 'Parecer padronizado do mentor fixo (extra).' },
}

const CRIT_BY_KEY = Object.fromEntries(EDITAL_RUBRIC.criteria.map(c => [c.key, c]))

// Unidades de avaliação por entregável. `criteria` = subconjunto do edital avaliado
// naquele entregável (um critério pode aparecer em + de uma unidade; a agregação
// faz a média entre as unidades que o pontuam).
export const DELIVERABLE_UNITS = [
  {
    id: 'fase1', label: 'Fase 1 · Hipóteses', phase: 'Ignição',
    source: 'hypotheses_canvas', fields: HYPOTHESES_FIELDS, includesDiary: false,
    showsPitchNotes: false, criteria: ['validacao_problema'],
  },
  {
    id: 'fase2', label: 'Fase 2 · SLC-IA + Diário', phase: 'Construção',
    source: 'slc_ia_canvas', fields: SLC_IA_FIELDS, includesDiary: true,
    showsPitchNotes: false, criteria: ['tecnica_ia', 'validacao_problema'],
  },
  {
    id: 'fase3', label: 'Fase 3 · Entregas + Pitch', phase: 'Apresentação',
    source: 'final_deliverables', fields: FINAL_FIELDS, includesDiary: false,
    showsPitchNotes: true, criteria: ['tecnica_ia', 'escala_negocio', 'pitch_equipe'],
  },
]
export const UNIT_BY_ID = Object.fromEntries(DELIVERABLE_UNITS.map(u => [u.id, u]))

// ---- Montagem do pacote -----------------------------------------------------

function section(title, body) {
  const content = (body == null || body === '') ? '_(não preenchido)_' : body
  return `### ${title}\n${content}\n`
}

function renderFields(fields, data) {
  const obj = data || {}
  return fields
    .map(f => `- **${f.label}:** ${obj[f.key] ? String(obj[f.key]).trim() : '_(vazio)_'}`)
    .join('\n')
}

function renderDiary(diary) {
  if (!diary) return '_(vazio)_'
  if (Array.isArray(diary)) {
    if (!diary.length) return '_(nenhum ciclo registrado)_'
    return diary
      .map((c, i) => `**Ciclo ${i + 1}:**\n\`\`\`json\n${JSON.stringify(c, null, 2)}\n\`\`\``)
      .join('\n')
  }
  return `\`\`\`json\n${JSON.stringify(diary, null, 2)}\n\`\`\``
}

function renderUnitRubric(unit) {
  return unit.criteria
    .map(k => {
      const c = CRIT_BY_KEY[k]
      return `- \`${c.key}\` — **${c.label}** (peso ${c.weight}%${c.eliminatory ? ', ELIMINATÓRIO' : ''}): ${c.describe}`
    })
    .join('\n')
}

function unitOutputExample(unit) {
  const scores = unit.criteria
    .map(k => `    { "criterion_key": "${k}", "score": 0, "justification": "..." }`)
    .join(',\n')
  const elim = unit.criteria.includes('tecnica_ia') ? '\n  "eliminated": false,' : ''
  return `{
  "scores": [
${scores}
  ],${elim}
  "summary": "Parecer do entregável em 2-4 frases, citando evidências.",
  "model": "claude-opus-4-x"
}`
}

/**
 * Monta o pacote (markdown) para avaliar UM entregável da equipe.
 * @param {object} params
 * @param {object} params.unit  entrada de DELIVERABLE_UNITS
 * @param {object} params.team  linha de `teams`
 * @param {Array}  params.members
 * @param {Array}  params.mentorNotes  notas públicas do mentor [{ phase, body }]
 * @param {string} params.pitchNotes  observações do pitch (só usado se unit.showsPitchNotes)
 * @returns {string}
 */
export function buildDeliverablePrompt({ unit, team, members = [], mentorNotes = [], pitchNotes = '' }) {
  if (!unit) throw new Error('Unidade de avaliação inválida.')
  const memberList = members.length
    ? members.map(m => `- ${m.full_name}${m.occupation_type ? ` (${m.occupation_type})` : ''}${m.is_team_leader ? ' — líder' : ''}`).join('\n')
    : '_(sem membros confirmados registrados)_'
  const axes = Array.from(new Set(members.flatMap(m => m.economic_axes || []))).filter(Boolean)
  const project = members.map(m => m.project_name).find(Boolean)

  let deliverableBlock = `## ${unit.label}\n${renderFields(unit.fields, team[unit.source])}\n`
  if (unit.includesDiary) {
    deliverableBlock += `\n### Diário de Aprendizado (ciclos BML)\n${renderDiary(team.learning_diary)}\n`
  }
  if (unit.showsPitchNotes) {
    deliverableBlock += `\n### Observações do operador sobre o pitch / demo ao vivo\n${pitchNotes && pitchNotes.trim() ? pitchNotes.trim() : '_(o operador não registrou observações do pitch — avalie o critério "Pitch e Equipe" com cautela, sinalizando a ausência de dados na justificativa)_'}\n`
  }

  const hasElim = unit.criteria.includes('tecnica_ia')

  return `Você é um jurado experiente do **HackIA SC — AI Hackathon Blumenau 2026** avaliando UM entregável de uma equipe.
Avalie **somente** este entregável (${unit.label}), de forma rigorosa e justa, **estritamente pelos critérios listados**, e responda
APENAS com o JSON no formato especificado no final (sem texto fora do bloco JSON).

Princípios do evento: a IA precisa rodar de verdade (slide/print de ChatGPT não conta); pivotar com base em
dados não é penalizado; o que pesa é o rigor da decisão e a evidência, não o caminho escolhido.

---

## Equipe: ${team.name}

${section('Membros', memberList)}
${section('Projeto declarado', project || '_(não informado)_')}
${section('Eixos econômicos de Blumenau', axes.length ? axes.join(', ') : '_(nenhum declarado)_')}

${deliverableBlock}
## Comentários públicos do mentor fixo
${mentorNotes.length ? mentorNotes.map(n => `- [${n.phase || 'geral'}] ${n.body}`).join('\n') : '_(nenhum)_'}

---

## Critérios deste entregável (rubrica do edital)
${renderUnitRubric(unit)}

## Como pontuar
- Dê a **cada critério acima** uma nota de **0 a 100** (qualidade dentro daquele critério, neste entregável).
- Avalie SOMENTE os critérios listados — não pontue critérios de outras fases.
- Justifique cada nota citando **evidências concretas** do conteúdo acima. Campos vazios indicam falta de
  entrega: trate como lacuna, não presuma que está pronto.${hasElim ? `
- O critério **Execução Técnica e IA** é ELIMINATÓRIO: defina \`eliminated: true\` apenas se a IA não roda de
  verdade / não há solução funcional e deployable. Explique no \`summary\`.` : ''}

## Formato de saída (responda SOMENTE com este JSON)
\`\`\`json
${unitOutputExample(unit)}
\`\`\`
`
}

// ---- Parsing do JSON colado -------------------------------------------------

function extractJson(text) {
  const trimmed = (text || '').trim()
  if (!trimmed) throw new Error('Cole o JSON da avaliação antes de gravar.')
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fence ? fence[1].trim() : trimmed
  try {
    return JSON.parse(candidate)
  } catch {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start !== -1 && end > start) {
      try { return JSON.parse(candidate.slice(start, end + 1)) } catch { /* cai no throw abaixo */ }
    }
    throw new Error('Não consegui interpretar o JSON. Verifique se colou o bloco JSON completo do Claude.')
  }
}

/**
 * Valida/normaliza o JSON colado para UM entregável. Lança Error (PT-BR) se inválido.
 * @param {string} text
 * @param {object} unit  entrada de DELIVERABLE_UNITS
 * @returns {{ scores: Array, total_score: number, eliminated: boolean, summary: string, model: string|null }}
 */
export function parseDeliverableEvaluation(text, unit) {
  if (!unit) throw new Error('Unidade de avaliação inválida.')
  const raw = extractJson(text)
  if (!Array.isArray(raw.scores)) throw new Error('O JSON precisa ter um array "scores".')

  const byKey = new Map()
  for (const s of raw.scores) {
    if (!s || typeof s.criterion_key !== 'string') continue
    byKey.set(s.criterion_key, s)
  }

  const expected = unit.criteria
  const missing = expected.filter(k => !byKey.has(k))
  if (missing.length) {
    const labels = missing.map(k => CRIT_BY_KEY[k].label).join(', ')
    throw new Error(`Faltam critérios no JSON deste entregável: ${labels}.`)
  }
  const extra = [...byKey.keys()].filter(k => !expected.includes(k))
  if (extra.length) {
    throw new Error(`Critérios fora deste entregável no JSON: ${extra.join(', ')}. Avalie apenas: ${expected.join(', ')}.`)
  }

  const scores = expected.map(k => {
    const c = CRIT_BY_KEY[k]
    const s = byKey.get(k)
    const score = Number(s.score)
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      throw new Error(`Nota inválida em "${k}": deve ser número de 0 a 100.`)
    }
    return {
      criterion_key: k,
      label: c.label,
      weight: c.weight,
      score,
      justification: typeof s.justification === 'string' ? s.justification.trim() : '',
    }
  })

  // Nota do entregável (display): média simples das notas da unidade. O total da
  // EQUIPE é recalculado por aggregateTeamEvaluation a partir de `scores`.
  const mean = scores.reduce((sum, s) => sum + s.score, 0) / scores.length
  const total_score = Math.round(mean * 10) / 10

  const coversElim = expected.includes('tecnica_ia')
  return {
    scores,
    total_score,
    eliminated: coversElim ? raw.eliminated === true : false,
    summary: typeof raw.summary === 'string' ? raw.summary.trim() : '',
    model: typeof raw.model === 'string' && raw.model.trim() ? raw.model.trim() : null,
  }
}

// ---- Agregação por equipe ---------------------------------------------------

/**
 * Agrega as avaliações por entregável de UMA equipe na nota IA da equipe.
 * Cada critério do edital recebe a média das notas das unidades que o pontuaram.
 * total_score só é definido quando os 4 critérios têm nota (senão `partial`).
 * @param {Array} rows  linhas `team_evaluations` da equipe (evaluator_type='ai', deliverable != null)
 * @returns {{ criteria, scoredCriteria, partial, total_score, eliminated, evaluatedUnits }}
 */
export function aggregateTeamEvaluation(rows = []) {
  const valid = (rows || []).filter(r => r && r.deliverable && Array.isArray(r.scores))

  const criteria = EDITAL_RUBRIC.criteria.map(c => {
    const vals = []
    const contributors = []
    for (const r of valid) {
      const s = r.scores.find(x => x && x.criterion_key === c.key)
      if (s && Number.isFinite(Number(s.score))) {
        vals.push(Number(s.score))
        contributors.push(r.deliverable)
      }
    }
    const score = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null
    return { key: c.key, label: c.label, weight: c.weight, score, contributors }
  })

  const scoredCriteria = criteria.filter(c => c.score != null).length
  const partial = scoredCriteria < EDITAL_RUBRIC.criteria.length
  const total_score = partial
    ? null
    : Math.round(criteria.reduce((sum, c) => sum + (c.score * c.weight) / 100, 0) * 10) / 10

  const eliminated = valid.some(r => {
    const coversElim = Array.isArray(r.scores) && r.scores.some(s => s && s.criterion_key === 'tecnica_ia')
    return coversElim && r.eliminated === true
  })

  return { criteria, scoredCriteria, partial, total_score, eliminated, evaluatedUnits: valid.map(r => r.deliverable) }
}
```

- [ ] **Step 4: Rodar os testes (passando)**

Run: `npx vitest run src/lib/iaEvaluator.test.js`
Expected: PASS (todos os testes verdes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/iaEvaluator.js src/lib/iaEvaluator.test.js
git commit -m "feat(ia-evaluator): per-deliverable prompt/parse + team aggregation"
```

---

## Task 3: `AdminDeliverables.jsx` — avaliador por entregável + card lateral

**Files:**
- Modify: `src/admin/AdminDeliverables.jsx`

- [ ] **Step 1: Atualizar imports**

Substituir a linha 8 (`import { buildEvaluationPrompt, parseEvaluation, EDITAL_RUBRIC } ...`) por:

```jsx
import { buildDeliverablePrompt, parseDeliverableEvaluation, aggregateTeamEvaluation, EDITAL_RUBRIC, DELIVERABLE_UNITS } from '../lib/iaEvaluator'
```

- [ ] **Step 2: Adicionar `deliverable` ao select de `team_evaluations`**

No `fetchData`, na query de `team_evaluations` (linha ~59), adicionar `deliverable` à lista de colunas:

```jsx
supabase.from('team_evaluations').select('id, team_id, evaluator_type, deliverable, rubric_version, total_score, eliminated, summary, scores, model, status, created_at, updated_at').order('created_at', { ascending: false }),
```

- [ ] **Step 3: Remover o estado e as funções holísticas do componente**

Remover do corpo de `AdminDeliverables` (não são mais usados — o estado de avaliação migra para `DeliverableEvaluator`):
- as linhas de estado do IA Evaluator: `pitchNotes`, `jsonInput`, `packageText`, `evalError`, `evalSaving`, `copied` (linhas ~43-48) e o `useEffect` de reset por `selectedId` (linha ~50);
- as funções `copyPackage` (linhas ~120-134) e `saveEvaluation` (linhas ~136-161).

Manter: `changeStatus`, `saveDeadline`, `clearDeadline`, `exportCSV`, `AdminSlidesDownload`.

- [ ] **Step 4: Adicionar helpers de "preenchido" e "stale" + agregação (antes do `if (loading)`)**

Adicionar dentro do componente, junto dos outros helpers (`memberCount`, `notesFor`, ...):

```jsx
  const aiEvalsFor = (teamId) => evals.filter(ev => ev.team_id === teamId && ev.evaluator_type === 'ai' && ev.deliverable != null)
  const aiEvalFor = (teamId, unitId) => evals.find(ev => ev.team_id === teamId && ev.evaluator_type === 'ai' && ev.deliverable === unitId) || null

  const UNIT_FIELDS = { fase1: ['hypotheses_canvas'], fase2: ['slc_ia_canvas', 'learning_diary'], fase3: ['final_deliverables'] }
  function unitFilled(team, unit) {
    if (unit.id === 'fase2') {
      const slc = team.slc_ia_canvas || {}
      const diary = team.learning_diary
      const slcFilled = Object.values(slc).some(v => v != null && String(v).trim() !== '')
      const diaryFilled = Array.isArray(diary) ? diary.length > 0 : (diary != null && Object.keys(diary || {}).length > 0)
      return slcFilled || diaryFilled
    }
    const obj = team[unit.source] || {}
    return Object.values(obj).some(v => v != null && String(v).trim() !== '')
  }
  function unitStale(team, unit, evalRow) {
    if (!evalRow) return false
    const fields = UNIT_FIELDS[unit.id]
    const evalAt = new Date(evalRow.updated_at || evalRow.created_at).getTime()
    const metaTimes = deliverableMeta
      .filter(m => m.team_id === team.id && fields.includes(m.field) && m.updated_at)
      .map(m => new Date(m.updated_at).getTime())
    return metaTimes.length ? Math.max(...metaTimes) > evalAt : false
  }
  // Fila de pendentes (equipe × entregável): preenchido e (sem avaliação OU editado depois).
  const pendingItems = teams.flatMap(t =>
    DELIVERABLE_UNITS.filter(u => unitFilled(t, u)).map(u => {
      const evalRow = aiEvalFor(t.id, u.id)
      if (!evalRow) return { team: t, unit: u, stale: false }
      return unitStale(t, u, evalRow) ? { team: t, unit: u, stale: true, existing: evalRow } : null
    }).filter(Boolean)
  )
```

- [ ] **Step 5: Substituir o card "Avaliação — IA Evaluator" no detalhe**

No bloco `if (selected) { ... }`, substituir TODO o card de avaliação (de `<div className="card-glass rounded-2xl p-6 space-y-4">` que contém `Avaliação — IA Evaluator`, linhas ~261-324) por:

```jsx
        {(() => {
          const teamAi = aiEvalsFor(selected.id)
          const agg = aggregateTeamEvaluation(teamAi)
          const humanEvals = tevals.filter(ev => ev.evaluator_type === 'human')
          return (
            <div className="card-glass rounded-2xl p-6 space-y-5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-xs font-mono text-gold uppercase tracking-wider">Avaliações por entregável — IA Evaluator</p>
                <span className="text-[10px] text-text-muted font-mono">{EDITAL_RUBRIC.version} · Técnica 30% (elim.) · Validação 25% · Escala 25% · Pitch 20%</span>
              </div>

              {/* Nota IA agregada da equipe */}
              <div className="flex items-center justify-between flex-wrap gap-2 bg-white/5 rounded-xl px-4 py-3">
                <span className="text-sm text-white/70">Nota IA agregada</span>
                <span className="font-mono text-gold text-sm">
                  {agg.total_score != null
                    ? `${agg.total_score} / 100`
                    : agg.scoredCriteria > 0
                      ? `parcial (${agg.scoredCriteria}/4 critérios)`
                      : '—'}
                  {agg.eliminated && <span className="ml-2 text-hot">⚠ eliminado</span>}
                </span>
              </div>

              {DELIVERABLE_UNITS.map(unit => (
                <DeliverableEvaluator
                  key={unit.id}
                  unit={unit}
                  team={selected}
                  members={members}
                  notes={notes}
                  existing={aiEvalFor(selected.id, unit.id)}
                  onSaved={fetchData}
                  readOnly={readOnly}
                />
              ))}

              {/* Notas dos jurados (holístico, leitura) */}
              {humanEvals.length > 0 && (
                <div className="border-t border-dark-border pt-4 space-y-2">
                  <p className="text-xs font-mono text-electric uppercase tracking-wider">Notas dos jurados (oficial)</p>
                  {humanEvals.map(ev => (
                    <div key={ev.id} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-1.5 text-sm">
                      <span className="text-white/70">Jurado</span>
                      <span className="font-mono text-cyan">{ev.total_score != null ? `${ev.total_score} / 100` : ev.status}{ev.eliminated ? ' · ⚠' : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })()}
```

- [ ] **Step 6: Reestruturar a vista de lista para incluir o card lateral**

Na vista de lista (o `return (<div className="space-y-6">...`), manter o card de prazo de slides como está. Depois dele, **envolver** a linha "N equipes / Exportar CSV" + a tabela num grid de 2 colunas com a fila à direita. Substituir o bloco que vai de `<div className="flex items-center justify-between flex-wrap gap-3">` (linha ~368, "N equipes"/Exportar) até o fechamento da `</div>` da tabela (linha ~399) por:

```jsx
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
        <div className="space-y-4">
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

        {!readOnly && (
          <PendingQueue
            items={pendingItems}
            members={members}
            notes={notes}
            onSaved={fetchData}
          />
        )}
      </div>
```

- [ ] **Step 7: Adicionar os componentes `DeliverableEvaluator` e `PendingQueue` ao fim do arquivo**

Após o componente `AdminSlidesDownload` (fim do arquivo), acrescentar:

```jsx
// Avaliador de UM entregável (copiar pacote → colar JSON → gravar). Reutilizado no
// detalhe da equipe e no card lateral de pendentes. SELECT-then-UPDATE/INSERT
// (índice parcial não é conflict target confiável no PostgREST).
function DeliverableEvaluator({ unit, team, members, notes, existing, onSaved, readOnly, compact = false }) {
  const [pitchNotes, setPitchNotes] = useState('')
  const [jsonInput, setJsonInput] = useState('')
  const [packageText, setPackageText] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const teamMembers = members.filter(m => m.team_id === team.id && m.payment_status === 'confirmed')
  const teamNotes = notes.filter(n => n.team_id === team.id && n.is_public)

  async function copyPackage() {
    setError(null)
    const pkg = buildDeliverablePrompt({ unit, team, members: teamMembers, mentorNotes: teamNotes, pitchNotes })
    try {
      await navigator.clipboard.writeText(pkg)
      setCopied(true); setPackageText(''); setTimeout(() => setCopied(false), 2500)
    } catch {
      setPackageText(pkg)
    }
  }

  async function save() {
    setError(null)
    let parsed
    try { parsed = parseDeliverableEvaluation(jsonInput, unit) }
    catch (e) { setError(e.message); return }
    if (!supabase) { setError('Supabase não configurado.'); return }
    setSaving(true)
    const payload = {
      team_id: team.id, evaluator_type: 'ai', deliverable: unit.id,
      rubric_version: EDITAL_RUBRIC.version, scores: parsed.scores,
      total_score: parsed.total_score, eliminated: parsed.eliminated,
      summary: parsed.summary, model: parsed.model, status: 'done',
      updated_at: new Date().toISOString(),
    }
    const { error: err } = existing
      ? await supabase.from('team_evaluations').update(payload).eq('id', existing.id)
      : await supabase.from('team_evaluations').insert(payload)
    setSaving(false)
    if (err) { setError(`Erro ao gravar: ${err.message}`); return }
    setJsonInput(''); setPitchNotes(''); setPackageText('')
    onSaved?.()
  }

  return (
    <div className="border border-dark-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-sm font-semibold text-white">{unit.label}</span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {unit.criteria.map(k => {
            const c = EDITAL_RUBRIC.criteria.find(x => x.key === k)
            return <span key={k} className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/5 text-white/60 border border-white/10">{c.label} {c.weight}%</span>
          })}
        </div>
      </div>

      {/* Avaliação gravada */}
      {existing && Array.isArray(existing.scores) && existing.scores.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">Nota do entregável</span>
            <span className="font-mono text-cyan text-sm">{existing.total_score != null ? existing.total_score : '—'}{existing.eliminated ? ' · ⚠ eliminado' : ''}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {existing.scores.map(s => (
              <div key={s.criterion_key} className="bg-white/5 rounded-lg p-2">
                <div className="flex justify-between text-xs">
                  <span className="text-white/70">{s.label} <span className="text-white/40">({s.weight}%)</span></span>
                  <span className="font-mono text-cyan">{s.score}</span>
                </div>
                {s.justification && <p className="text-[11px] text-text-muted mt-1 whitespace-pre-wrap">{s.justification}</p>}
              </div>
            ))}
          </div>
          {existing.summary && <p className="text-sm text-white/80 whitespace-pre-wrap">{existing.summary}</p>}
        </div>
      )}

      {/* Controles (copiar → colar → gravar) */}
      {!readOnly && (
        <div className="space-y-2 pt-1">
          {unit.showsPitchNotes && (
            <textarea value={pitchNotes} onChange={e => setPitchNotes(e.target.value)} rows={compact ? 2 : 3}
              placeholder="Observações do pitch / demo ao vivo (entram no pacote): a IA rodou? evidências de tração? respostas aos jurados?"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan/50" />
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={copyPackage} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-electric/20 text-electric border border-electric/40 hover:bg-electric/30">
              {copied ? '✓ copiado' : '1. Copiar pacote'}
            </button>
            <button onClick={save} disabled={saving || !jsonInput.trim()}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan/20 text-cyan border border-cyan/40 hover:bg-cyan/30 disabled:opacity-40 disabled:cursor-not-allowed">
              {saving ? 'Gravando...' : existing ? '3. Regravar' : '3. Gravar'}
            </button>
          </div>
          {packageText && (
            <textarea readOnly value={packageText} rows={4} onFocus={e => e.target.select()}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/70 text-xs font-mono" />
          )}
          <textarea value={jsonInput} onChange={e => setJsonInput(e.target.value)} rows={compact ? 3 : 5}
            placeholder='2. Cole o JSON do Claude: { "scores": [...], "summary": "...", "model": "..." }'
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-cyan/50" />
          {error && <div className="bg-hot/10 border border-hot/30 rounded-lg px-3 py-2 text-hot text-sm">{error}</div>}
        </div>
      )}
    </div>
  )
}

// Card lateral: fila de (equipe × entregável) pendentes. Expande 1 por vez.
function PendingQueue({ items, members, notes, onSaved }) {
  const [activeKey, setActiveKey] = useState(null)
  return (
    <aside className="card-glass rounded-2xl p-4 lg:sticky lg:top-20 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-mono text-gold uppercase tracking-wider">Pendentes</p>
        <span className="text-xs font-mono text-white/50">{items.length}</span>
      </div>
      {!items.length && <p className="text-sm text-text-muted">Nada pendente — tudo avaliado. 🎉</p>}
      <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
        {items.map(({ team, unit, stale, existing }) => {
          const key = `${team.id}:${unit.id}`
          const open = activeKey === key
          return (
            <div key={key} className="border border-dark-border rounded-xl">
              <button onClick={() => setActiveKey(open ? null : key)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-white/5 rounded-xl">
                <span className="text-sm text-white truncate">▸ {team.name} <span className="text-white/40">· {unit.label.split(' · ')[0]}</span></span>
                {stale && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-gold/10 text-gold border border-gold/30 whitespace-nowrap">atualizado</span>}
              </button>
              {open && (
                <div className="p-2 pt-0">
                  <DeliverableEvaluator
                    unit={unit}
                    team={team}
                    members={members}
                    notes={notes}
                    existing={existing || null}
                    onSaved={onSaved}
                    compact
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
}
```

- [ ] **Step 8: Lint + build**

Run: `npm run lint`
Expected: sem erros novos (atenção a `useState` já importado no topo do arquivo — está).

Run: `npm run build`
Expected: build OK (`dist/` gerado).

- [ ] **Step 9: Commit**

```bash
git add src/admin/AdminDeliverables.jsx
git commit -m "feat(ia-evaluator): per-deliverable UI + pending side queue in admin deliverables"
```

---

## Task 4: `AdminRanking.jsx` — menção IA agregada + guarda

**Files:**
- Modify: `src/admin/AdminRanking.jsx`

- [ ] **Step 1: Importar a agregação**

Substituir a linha 3 (`import { EDITAL_RUBRIC } from '../lib/iaEvaluator'`) por:

```jsx
import { EDITAL_RUBRIC, aggregateTeamEvaluation } from '../lib/iaEvaluator'
```

- [ ] **Step 2: Incluir `deliverable` no select**

Na query de `team_evaluations` (linha ~54), adicionar `deliverable`:

```jsx
supabase.from('team_evaluations').select('team_id, evaluator_type, deliverable, total_score, scores, eliminated, summary, model, created_at'),
```

- [ ] **Step 3: Trocar a seleção "última linha ai" pela agregação**

No `rows = teams.map(t => { ... })`, substituir o bloco que calcula `ai` (linhas ~71-73) e os campos `aiScore`/`aiModel` (linhas ~86-87) por:

```jsx
    const aiRows = teamEvals.filter(ev => ev.evaluator_type === 'ai' && ev.deliverable != null)
    const aiAgg = aggregateTeamEvaluation(aiRows)
```

E no objeto retornado, trocar:

```jsx
      aiScore: aiAgg.total_score,
      aiPartial: aiAgg.partial && aiAgg.scoredCriteria > 0,
      aiUnits: aiAgg.evaluatedUnits.length,
```

(remover `aiModel`).

- [ ] **Step 4: Atualizar a seção "Menção do IA Evaluator"**

Na seção da menção IA (linhas ~209-225), substituir o parágrafo do topo (que usava `aiTop.aiModel`) e a listagem para refletir a agregação:

```jsx
        {showAi && (
          aiTop ? (
            <>
              <p className="text-sm text-white">
                🏅 Melhor avaliada pela IA: <strong>{aiTop.team.name}</strong> — <span className="font-mono text-violet">{aiTop.aiScore}/100</span>
                <span className="text-text-muted text-xs"> ({aiTop.aiUnits}/3 entregáveis)</span>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[...rows].filter(r => r.aiScore != null).sort((a, b) => b.aiScore - a.aiScore).map(r => (
                  <div key={r.team.id} className="flex justify-between bg-white/5 rounded-lg px-3 py-1.5 text-sm">
                    <span className="text-white/80">{r.team.name}</span>
                    <span className="font-mono text-violet">{r.aiScore}</span>
                  </div>
                ))}
              </div>
              {rows.some(r => r.aiPartial) && (
                <p className="text-xs text-text-muted">
                  Parciais (entregáveis incompletos, fora do ranking IA): {rows.filter(r => r.aiPartial).map(r => r.team.name).join(', ')}
                </p>
              )}
            </>
          ) : <p className="text-sm text-text-muted">Nenhuma avaliação da IA registrada ainda.</p>
        )}
```

> Nota: `aiTop` (linha ~106) já usa `rows.filter(r => r.aiScore != null)` — continua válido, agora `aiScore` vem da agregação. Linhas `ai` legadas (`deliverable == null`) são ignoradas pelo filtro `deliverable != null` no Step 3 (guarda exigida).

- [ ] **Step 5: Lint + build**

Run: `npm run lint`
Expected: sem erros novos.

Run: `npm run build`
Expected: build OK.

- [ ] **Step 6: Commit**

```bash
git add src/admin/AdminRanking.jsx
git commit -m "feat(ranking): aggregate per-deliverable AI evals into the AI mention"
```

---

## Task 5: Changelog + verificação final

**Files:**
- Create: `docs/changelog/2026-05-29-ia-evaluator-por-entregavel.md`

- [ ] **Step 1: Escrever o changelog**

```markdown
# feat: IA Evaluator por entregável

**Data:** 2026-05-29
**Branch:** feat/ia-evaluator-por-entregavel
**Arquivos:** src/lib/iaEvaluator.js, src/lib/iaEvaluator.test.js, src/admin/AdminDeliverables.jsx, src/admin/AdminRanking.jsx, migrations/add_evaluation_deliverable.sql

## O que foi feito
A IA Evaluator deixou de produzir 1 avaliação holística por equipe e passou a
avaliar cada entregável (Fase 1 Hipóteses / Fase 2 SLC-IA+Diário / Fase 3
Entregas+Pitch) pelos critérios do edital que se aplicam a ele. As avaliações por
entregável agregam (média entre fases) na nota IA da equipe, que substitui a
menção IA holística no ranking. Card lateral na vista de Entregas lista pendentes
por (equipe × entregável) com copiar/colar/gravar inline.

## Por que
Pós-evento, o operador precisa avaliar muitas equipes em sequência; o pacote único
era um blob difuso e exigia abrir cada equipe. Separar por entregável dá avaliações
focadas e a fila lateral agiliza o processamento.

## Decisões técnicas
- Mapeamento critério→fase: Validação (Fase1+Fase2), Técnica (Fase2+Fase3),
  Escala/Pitch (Fase3). Agregação por média; total só fecha com os 4 critérios.
- Eliminatório (Técnica): OR entre Fase 2 e Fase 3.
- Coluna `deliverable` + índice único parcial em team_evaluations (1 ai por
  equipe×entregável, re-executável via UPDATE). Linhas humanas (jurados) ficam com
  deliverable NULL — nota oficial intacta.
- Ranking agrega as linhas ai por entregável e ignora linhas ai legadas (NULL).
- Funções holísticas (buildEvaluationPrompt/parseEvaluation) removidas.

## Impacto
- Migration `add_evaluation_deliverable.sql` precisa ser aplicada à mão no Supabase.
- Testes Vitest novos em iaEvaluator.test.js; lint e build OK.

## Próximos passos
- Limpeza opcional das linhas ai holísticas legadas de teste.
```

- [ ] **Step 2: Rodar a suíte completa**

Run: `npm test`
Expected: PASS (iaEvaluator.test.js + registrationErrors.test.js verdes).

Run: `npm run lint`
Expected: sem erros novos.

Run: `npm run build`
Expected: build OK.

- [ ] **Step 3: Commit**

```bash
git add docs/changelog/2026-05-29-ia-evaluator-por-entregavel.md
git commit -m "docs(changelog): IA Evaluator por entregável"
```

---

## Verificação manual (após merge / em ambiente com Supabase)

1. **Aplicar a migration** `add_evaluation_deliverable.sql` no SQL Editor do projeto `qshrzfahotmjshtjuvno`.
2. Admin → Entregas: o card lateral "Pendentes" lista (equipe × entregável) preenchidos e sem avaliação.
3. Expandir um item → Copiar pacote → rodar no Claude → colar JSON → Gravar; o item sai da fila.
4. Abrir uma equipe: a seção "Avaliações por entregável" mostra as 3 unidades, a nota agregada e (parcial/total).
5. Ranking → Revelar IA: a menção usa a nota agregada; equipes incompletas aparecem como "parciais".
6. Confirmar que as notas dos jurados (oficial) seguem inalteradas.
```
