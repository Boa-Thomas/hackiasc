import { EVALUATION_DIMENSIONS } from '../lib/evaluationDimensions'

// Agrega linhas de event_evaluations em médias por dimensão e tipo.
// rows: [{ respondent_type, scores: { key: number } }]
// Retorna { participant: { count, dims: { key: { avg, count } } }, mentor: {...} }
export function aggregateResults(rows) {
  const init = () => ({ count: 0, dims: {} })
  const acc = { participant: init(), mentor: init() }
  for (const row of rows || []) {
    const bucket = acc[row?.respondent_type]
    if (!bucket) continue
    bucket.count += 1
    for (const d of EVALUATION_DIMENSIONS) {
      const v = row.scores?.[d.key]
      if (v == null || !Number.isFinite(Number(v))) continue
      const slot = bucket.dims[d.key] || (bucket.dims[d.key] = { sum: 0, count: 0 })
      slot.sum += Number(v)
      slot.count += 1
    }
  }
  for (const type of ['participant', 'mentor']) {
    for (const key of Object.keys(acc[type].dims)) {
      const slot = acc[type].dims[key]
      slot.avg = slot.count ? Math.round((slot.sum / slot.count) * 10) / 10 : null
      delete slot.sum
    }
  }
  return acc
}
