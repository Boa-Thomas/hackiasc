import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { buildFaseScoreRows } from './aiScores'

// Card "Notas da IA" no topo da aba Entregáveis. So aparece quando o admin liga
// o switch global (team_scores_visible) - o gate real e no servidor: a RPC
// participant_get_team_scores devolve visible=false e lista vazia se desligado.
// Mostra apenas a nota agregada (0-100) por fase; sem justificativas.
export default function AiScoresCard({ token }) {
  const [state, setState] = useState({ loading: true, visible: false, scores: [] })

  useEffect(() => {
    let active = true
    if (!token || !supabase) return
    supabase.rpc('participant_get_team_scores', { p_token: token }).then(({ data, error }) => {
      if (!active) return
      if (error || !data) {
        setState({ loading: false, visible: false, scores: [] })
        return
      }
      setState({ loading: false, visible: !!data.visible, scores: data.scores || [] })
    })
    return () => { active = false }
  }, [token])

  if (state.loading || !state.visible) return null

  const rows = buildFaseScoreRows(state.scores)

  return (
    <div className="card-glass rounded-2xl p-6">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <p className="text-xs font-mono text-gold uppercase tracking-wider">Notas da IA</p>
        <span className="text-[10px] text-text-muted font-mono">avaliação automática · 0–100 por fase</span>
      </div>
      <div className="space-y-3">
        {rows.map(r => (
          <div key={r.id} className="flex items-center gap-3">
            <span className="text-sm text-white/80 w-32 sm:w-44 flex-shrink-0 truncate">{r.label}</span>
            <div className="flex-1 min-w-0 h-2 rounded-full bg-white/10 overflow-hidden">
              {r.score != null && (
                <div className="h-full rounded-full bg-cyan" style={{ width: `${r.score}%` }} />
              )}
            </div>
            <span className="font-mono text-sm w-24 text-right flex-shrink-0">
              {r.score != null
                ? <span className="text-gold">{r.score}/100</span>
                : <span className="text-text-muted">aguardando</span>}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-text-muted mt-4 leading-relaxed">
        Nota orientativa gerada por IA com base nos seus entregáveis. A avaliação oficial é feita pelos jurados.
      </p>
    </div>
  )
}
