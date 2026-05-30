// IA Evaluator — human-in-the-loop, por entregável.
// O sistema monta um pacote por ENTREGÁVEL (dados daquele entregável + os
// critérios do edital que se aplicam a ele + formato JSON). O avaliador roda no
// Claude e cola o JSON de volta, que é parseado e gravado em `team_evaluations`
// (1 linha por equipe × entregável, evaluator_type='ai', deliverable setado).
// `aggregateTeamEvaluation` combina os entregáveis na nota IA da equipe.
// A Fase 3 incorpora a transcrição do pitch (gravada pela edge fn transcribe-pitch)
// e os 3 eixos da cláusula 5.3. Este módulo não faz chamadas de API: o I/O é do operador.

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

// Eixos nomeados na cláusula 5.3 do edital, avaliados a partir da transcrição do
// pitch. São análise/feedback — NÃO entram na soma ponderada (cl. 6 segue sendo o
// total da menção IA). Consistência técnica e viabilidade mercadológica dialogam com
// tecnica_ia/escala_negocio; tom de voz é a dimensão de entrega que só o pitch revela.
export const PITCH_AXES = [
  { key: 'consistencia_tecnica', label: 'Consistência técnica',
    describe: 'O discurso é tecnicamente coerente e condizente com a solução construída? A IA descrita bate com o que foi entregue? Sem contradições nem exageros não sustentados.' },
  { key: 'tom_de_voz', label: 'Tom de voz',
    describe: 'Clareza, confiança e ritmo da fala; segurança nas respostas; ausência de leitura robótica ou excesso de muletas. Avaliado pela transcrição + métricas de fala; sem áudio, sinalize a limitação na justificativa.' },
  { key: 'viabilidade_mercadologica', label: 'Viabilidade mercadológica',
    describe: 'O pitch convence que há mercado, modelo de receita e caminho de tração? Tese de negócio crível e vendável.' },
]

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
    showsPitchNotes: true, hasAxes: true, criteria: ['tecnica_ia', 'escala_negocio', 'pitch_equipe'],
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

// Métricas de fala derivadas dos segments do Whisper — proxy honesto para "tom de
// voz" (a transcrição perde prosódia). Função pura; retorna null sem segments.
const PT_FILLERS = new Set(['né', 'tipo', 'então', 'assim', 'hum', 'aí', 'sabe'])
export function pitchSpeechMetrics(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return null
  const tokens = segments.flatMap(s => String(s.text || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])
  const words = tokens.length
  const first = segments[0]
  const last = segments[segments.length - 1]
  const durationSec = Math.max(0, Math.round((Number(last.end) || 0) - (Number(first.start) || 0)))
  const wordsPerMin = durationSec > 0 ? Math.round((words / durationSec) * 60) : 0
  let pauseSum = 0
  let pauseN = 0
  for (let i = 1; i < segments.length; i++) {
    const gap = (Number(segments[i].start) || 0) - (Number(segments[i - 1].end) || 0)
    if (gap >= 0) { pauseSum += gap; pauseN++ }
  }
  const avgPauseSec = pauseN ? Math.round((pauseSum / pauseN) * 10) / 10 : 0
  const fillerCount = tokens.filter(t => PT_FILLERS.has(t)).length
  const fillerRate = words ? Math.round((fillerCount / words) * 1000) / 10 : 0
  return { words, durationSec, wordsPerMin, avgPauseSec, fillerCount, fillerRate }
}

function renderSpeechMetrics(m) {
  if (!m) return '_(sem métricas de fala — transcrição sem segmentos)_'
  return [
    `- Ritmo: ${m.wordsPerMin} palavras/min (${m.words} palavras em ${m.durationSec}s)`,
    `- Pausa média entre trechos: ${m.avgPauseSec}s`,
    `- Muletas linguísticas: ${m.fillerCount} (${m.fillerRate}% das palavras)`,
  ].join('\n')
}

function renderAxesRubric() {
  return PITCH_AXES.map(a => `- \`${a.key}\` — **${a.label}**: ${a.describe}`).join('\n')
}

function unitOutputExample(unit) {
  const scores = unit.criteria
    .map(k => `    { "criterion_key": "${k}", "score": 0, "justification": "..." }`)
    .join(',\n')
  const elim = unit.criteria.includes('tecnica_ia') ? '\n  "eliminated": false,' : ''
  const axes = unit.hasAxes
    ? `\n  "axes": {\n${PITCH_AXES.map(a => `    "${a.key}": { "score": 0, "justification": "..." }`).join(',\n')}\n  },`
    : ''
  return `{
  "scores": [
${scores}
  ],${elim}${axes}
  "summary": "Parecer do entregável em 2-4 frases, citando evidências.",
  "model": "claude-opus-4-x"
}`
}

/**
 * Monta o pacote (markdown) para avaliar UM entregável da equipe.
 * @param {object} params
 * @param {object} params.unit  entrada de DELIVERABLE_UNITS
 * @param {object} params.team  linha de `teams` (na fase3 lê pitch_transcript/pitch_segments)
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
  if (unit.hasAxes) {
    const transcript = (team.pitch_transcript || '').trim()
    const metrics = pitchSpeechMetrics(team.pitch_segments)
    deliverableBlock += `\n### Transcrição do pitch (Whisper)\n${transcript || '_(sem transcrição do pitch — avalie "tom de voz" com cautela e sinalize a ausência na justificativa)_'}\n`
    deliverableBlock += `\n### Métricas de fala (derivadas da transcrição)\n${renderSpeechMetrics(metrics)}\n`
  }
  if (unit.showsPitchNotes) {
    deliverableBlock += `\n### Observações do operador sobre o pitch / demo ao vivo (complemento)\n${pitchNotes && pitchNotes.trim() ? pitchNotes.trim() : '_(sem observações do operador)_'}\n`
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
${unit.hasAxes ? `
## Eixos da cláusula 5.3 (analisados a partir do pitch)
${renderAxesRubric()}
` : ''}
## Como pontuar
- Dê a **cada critério acima** uma nota de **0 a 100** (qualidade dentro daquele critério, neste entregável).
- Avalie SOMENTE os critérios listados — não pontue critérios de outras fases.
- Justifique cada nota citando **evidências concretas** do conteúdo acima. Campos vazios indicam falta de
  entrega: trate como lacuna, não presuma que está pronto.${hasElim ? `
- O critério **Execução Técnica e IA** é ELIMINATÓRIO: defina \`eliminated: true\` apenas se a IA não roda de
  verdade / não há solução funcional e deployable. Explique no \`summary\`.` : ''}${unit.hasAxes ? `
- Pontue também os **3 eixos da cláusula 5.3** (0–100 cada) a partir da transcrição e das métricas de fala. Para "tom de voz", se não houver transcrição, sinalize a limitação.` : ''}

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
 * @returns {{ scores: Array, axes: Array|undefined, total_score: number, eliminated: boolean, summary: string, model: string|null }}
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

  // Eixos da cláusula 5.3 (só em unidades com hasAxes — fase3). São feedback; não
  // entram na soma ponderada (cl. 6 segue sendo o total).
  let axesScores
  if (unit.hasAxes) {
    const rawAxes = raw.axes
    if (!rawAxes || typeof rawAxes !== 'object' || Array.isArray(rawAxes)) {
      throw new Error('O JSON deste entregável precisa de um objeto "axes" com os 3 eixos da cláusula 5.3.')
    }
    axesScores = PITCH_AXES.map(a => {
      const v = rawAxes[a.key]
      if (!v || typeof v !== 'object') throw new Error(`Falta o eixo "${a.label}" em "axes".`)
      const score = Number(v.score)
      if (!Number.isFinite(score) || score < 0 || score > 100) {
        throw new Error(`Nota inválida no eixo "${a.label}": deve ser número de 0 a 100.`)
      }
      return { key: a.key, label: a.label, score, justification: typeof v.justification === 'string' ? v.justification.trim() : '' }
    })
  }

  return {
    scores,
    axes: axesScores,
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
