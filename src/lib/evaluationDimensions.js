// Dimensões da avaliação do evento. Fonte única usada pelo formulário
// (participante/mentor) e pelo dashboard do admin.
export const EVAL_MIN = 0
export const EVAL_MAX = 10
export const EVAL_STEP = 0.5

// 'participantOnly' marca dimensões que só o participante avalia (mentor não
// se auto-avalia em mentoria).
export const EVALUATION_DIMENSIONS = [
  { key: 'venue', label: 'Local / estrutura física' },
  { key: 'methodology', label: 'Metodologia / dinâmica' },
  { key: 'facilitation', label: 'Facilitação' },
  { key: 'food', label: 'Comida / coffee' },
  { key: 'platform', label: 'Plataforma (app/site)' },
  { key: 'organization', label: 'Organização e comunicação' },
  { key: 'mentorship', label: 'Mentoria', participantOnly: true },
  { key: 'criteria', label: 'Critérios e premiação' },
  { key: 'networking', label: 'Networking / clima' },
  { key: 'talks', label: 'Palestras / conteúdos' },
  { key: 'nps', label: 'Recomendaria o evento a um colega?' },
]

// Dimensões válidas para um tipo de respondente.
export function dimensionsFor(type) {
  return EVALUATION_DIMENSIONS.filter(d => type === 'participant' || !d.participantOnly)
}

// Valida/limpa o objeto de notas vindo do formulário. Mantém só as dimensões
// permitidas para o tipo; cada nota precisa ser número em [0,10] múltiplo de 0,5.
// Notas ausentes/vazias são omitidas — não viram 0.
export function validateScores(scores, type) {
  const allowed = new Set(dimensionsFor(type).map(d => d.key))
  const out = {}
  for (const [key, raw] of Object.entries(scores || {})) {
    if (!allowed.has(key)) continue
    if (raw == null || raw === '') continue
    const n = Number(raw)
    if (!Number.isFinite(n)) return { value: null, error: 'invalid_score' }
    if (n < EVAL_MIN || n > EVAL_MAX) return { value: null, error: 'score_out_of_range' }
    if (Math.round(n * 2) !== n * 2) return { value: null, error: 'invalid_step' }
    out[key] = n
  }
  return { value: out, error: null }
}
