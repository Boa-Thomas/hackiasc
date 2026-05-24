// IA Evaluator — human-in-the-loop.
// O sistema monta um pacote de avaliação (dados da equipe + rubrica do edital +
// instruções + formato JSON). O avaliador roda esse pacote num modelo (Claude) e
// cola o JSON de volta, que é parseado e gravado em `team_evaluations`.
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
  // Extra: não soma nos 100, registrado como contexto.
  extra: { key: 'mentor', label: 'Avaliação do Mentor', describe: 'Parecer padronizado do mentor fixo (extra).' },
}

const VALID_KEYS = EDITAL_RUBRIC.criteria.map(c => c.key)

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
  // O diário é um JSONB livre (lista de ciclos BML). Serializa de forma legível.
  if (Array.isArray(diary)) {
    if (!diary.length) return '_(nenhum ciclo registrado)_'
    return diary
      .map((c, i) => `**Ciclo ${i + 1}:**\n\`\`\`json\n${JSON.stringify(c, null, 2)}\n\`\`\``)
      .join('\n')
  }
  return `\`\`\`json\n${JSON.stringify(diary, null, 2)}\n\`\`\``
}

function renderRubric() {
  const lines = EDITAL_RUBRIC.criteria
    .map(c => `- \`${c.key}\` — **${c.label}** (peso ${c.weight}%${c.eliminatory ? ', ELIMINATÓRIO' : ''}): ${c.describe}`)
    .join('\n')
  return lines
}

const OUTPUT_EXAMPLE = `{
  "scores": [
    { "criterion_key": "tecnica_ia", "score": 0, "justification": "..." },
    { "criterion_key": "validacao_problema", "score": 0, "justification": "..." },
    { "criterion_key": "escala_negocio", "score": 0, "justification": "..." },
    { "criterion_key": "pitch_equipe", "score": 0, "justification": "..." }
  ],
  "eliminated": false,
  "summary": "Parecer geral em 2-4 frases, citando evidências.",
  "model": "claude-opus-4-x"
}`

/**
 * Monta o texto completo a ser copiado e colado no Claude.
 * @param {object} params
 * @param {object} params.team  linha de `teams` (canvases JSONB + final_deliverables)
 * @param {Array}  params.members  membros confirmados [{ full_name, occupation_type, ... }]
 * @param {Array}  params.mentorNotes  notas públicas do mentor [{ phase, body }]
 * @param {string} params.pitchNotes  observações do operador sobre o pitch/demo (opcional)
 * @returns {string} pacote em markdown
 */
export function buildEvaluationPrompt({ team, members = [], mentorNotes = [], pitchNotes = '' }) {
  const memberList = members.length
    ? members.map(m => `- ${m.full_name}${m.occupation_type ? ` (${m.occupation_type})` : ''}${m.is_team_leader ? ' — líder' : ''}`).join('\n')
    : '_(sem membros confirmados registrados)_'

  const axes = Array.from(new Set(members.flatMap(m => m.economic_axes || []))).filter(Boolean)
  const project = members.map(m => m.project_name).find(Boolean)

  return `Você é um jurado experiente avaliando uma equipe do **HackIA SC — AI Hackathon Blumenau 2026**.
Avalie a equipe abaixo de forma rigorosa e justa, **estritamente pela rubrica do edital**, e responda
APENAS com o JSON no formato especificado no final (sem texto fora do bloco JSON).

Princípios do evento: a IA precisa rodar de verdade (slide/print de ChatGPT não conta); pivotar com base em
dados não é penalizado; o que pesa é o rigor da decisão e a evidência, não o caminho escolhido.

---

## Equipe: ${team.name}

${section('Membros', memberList)}
${section('Projeto declarado', project || '_(não informado)_')}
${section('Eixos econômicos de Blumenau', axes.length ? axes.join(', ') : '_(nenhum declarado)_')}

## Fase 1 — Canvas de Hipóteses
${renderFields(HYPOTHESES_FIELDS, team.hypotheses_canvas)}

## Fase 2 — Canvas SLC-IA
${renderFields(SLC_IA_FIELDS, team.slc_ia_canvas)}

## Fase 2 — Diário de Aprendizado (ciclos BML)
${renderDiary(team.learning_diary)}

## Fase 3 — Entregas finais
${renderFields(FINAL_FIELDS, team.final_deliverables)}

## Comentários públicos do mentor fixo
${mentorNotes.length ? mentorNotes.map(n => `- [${n.phase || 'geral'}] ${n.body}`).join('\n') : '_(nenhum)_'}

## Observações do operador sobre o pitch / demo ao vivo
${pitchNotes && pitchNotes.trim() ? pitchNotes.trim() : '_(o operador não registrou observações do pitch — avalie o critério "Pitch e Equipe" com cautela, sinalizando a ausência de dados na justificativa)_'}

---

## Rubrica oficial (edital) — total 100 pontos
${renderRubric()}

> A **Avaliação do Mentor** é um extra e NÃO entra nos 100 pontos.

## Como pontuar
- Dê a cada critério uma nota de **0 a 100** (qualidade dentro daquele critério).
- O sistema calcula a nota final ponderada automaticamente (não calcule o total você mesmo).
- Justifique cada nota citando **evidências concretas** dos dados acima.
- Defina \`eliminated: true\` **apenas** se o critério ELIMINATÓRIO (Execução Técnica e IA) falhar de forma
  grave — por exemplo, não há IA real funcional/deployed. Explique no \`summary\`.
- Seja honesto sobre lacunas: campos vazios indicam falta de entrega, não devem ser presumidos como prontos.

## Formato de saída (responda SOMENTE com este JSON)
\`\`\`json
${OUTPUT_EXAMPLE}
\`\`\`
`
}

// ---- Parsing do JSON colado -------------------------------------------------

function extractJson(text) {
  const trimmed = (text || '').trim()
  if (!trimmed) throw new Error('Cole o JSON da avaliação antes de gravar.')
  // Tolera ```json ... ``` ou ``` ... ```
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fence ? fence[1].trim() : trimmed
  try {
    return JSON.parse(candidate)
  } catch {
    // Tenta achar o primeiro objeto { ... } no texto
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start !== -1 && end > start) {
      try { return JSON.parse(candidate.slice(start, end + 1)) } catch { /* cai no throw abaixo */ }
    }
    throw new Error('Não consegui interpretar o JSON. Verifique se colou o bloco JSON completo do Claude.')
  }
}

/**
 * Valida e normaliza o JSON de avaliação colado. Lança Error (mensagem PT-BR) se inválido.
 * @returns {{ scores: Array, total_score: number, eliminated: boolean, summary: string, model: string|null }}
 */
export function parseEvaluation(text) {
  const raw = extractJson(text)

  if (!Array.isArray(raw.scores)) {
    throw new Error('O JSON precisa ter um array "scores".')
  }

  const byKey = new Map()
  for (const s of raw.scores) {
    if (!s || typeof s.criterion_key !== 'string') continue
    byKey.set(s.criterion_key, s)
  }

  const missing = VALID_KEYS.filter(k => !byKey.has(k))
  if (missing.length) {
    throw new Error(`Faltam critérios no JSON: ${missing.join(', ')}.`)
  }

  const scores = EDITAL_RUBRIC.criteria.map(c => {
    const s = byKey.get(c.key)
    const score = Number(s.score)
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      throw new Error(`Nota inválida em "${c.key}": deve ser número de 0 a 100.`)
    }
    return {
      criterion_key: c.key,
      label: c.label,
      weight: c.weight,
      score,
      justification: typeof s.justification === 'string' ? s.justification.trim() : '',
    }
  })

  const total = scores.reduce((sum, s) => sum + (s.score * s.weight) / 100, 0)
  const total_score = Math.round(total * 10) / 10

  return {
    scores,
    total_score,
    eliminated: raw.eliminated === true,
    summary: typeof raw.summary === 'string' ? raw.summary.trim() : '',
    model: typeof raw.model === 'string' && raw.model.trim() ? raw.model.trim() : null,
  }
}
