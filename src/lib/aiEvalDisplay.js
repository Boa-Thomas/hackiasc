// Cor semântica por nota 0–100, compartilhada pelo overview agregado
// (AiAggregateView) e pelo detalhe por entregável (AiEvaluationView), usados
// tanto pelo painel do mentor quanto pela aba Entregas do admin.
// Faixas: hi >= 75 (cyan), mid 50–74 (gold), lo < 50 (hot). Funções puras.

export function scoreTone(score) {
  const s = Number(score)
  if (score == null || !Number.isFinite(s)) return null
  if (s >= 75) return 'hi'
  if (s >= 50) return 'mid'
  return 'lo'
}

const TONE = {
  hi: { text: 'text-cyan', bar: 'bg-cyan' },
  mid: { text: 'text-gold', bar: 'bg-gold' },
  lo: { text: 'text-hot', bar: 'bg-hot' },
}

export function toneClasses(score) {
  const t = scoreTone(score)
  return t ? TONE[t] : { text: 'text-text-muted', bar: 'bg-white/20' }
}
