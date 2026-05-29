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
