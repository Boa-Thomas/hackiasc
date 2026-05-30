// Notas da IA por fase, exibidas para a equipe quando o admin liga o switch
// global (team_scores_visible). Logica pura - sem React - para ser testavel.
// A RPC participant_get_team_scores devolve { visible, scores: [{deliverable, total_score}] }.

export const SCORE_FASES = [
  { id: 'fase1', label: 'Fase 1 · Ignição' },
  { id: 'fase2', label: 'Fase 2 · Construção' },
  { id: 'fase3', label: 'Fase 3 · Apresentação' },
]

// Junta as 3 fases fixas com as notas recebidas. Fase sem avaliação concluída
// fica com score null (renderizada como "aguardando"). A nota é arredondada e
// limitada a 0-100 para a barra de progresso.
export function buildFaseScoreRows(scores) {
  const byId = new Map(
    (Array.isArray(scores) ? scores : [])
      .filter(s => s && s.deliverable != null && s.total_score != null)
      .map(s => [s.deliverable, Math.max(0, Math.min(100, Math.round(Number(s.total_score))))])
  )
  return SCORE_FASES.map(f => ({
    id: f.id,
    label: f.label,
    score: byId.has(f.id) ? byId.get(f.id) : null,
  }))
}
