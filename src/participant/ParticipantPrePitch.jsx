import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import PrePitchScorecard from '../components/PrePitchScorecard'

function formatDate(iso) {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

// Converte array [{key, score, comment}] para objeto { [key]: { score, comment } }
function scoresToObj(arr) {
  if (!Array.isArray(arr)) return {}
  return arr.reduce((acc, item) => {
    acc[item.key] = { score: item.score, comment: item.comment }
    return acc
  }, {})
}

function faixaOf(total) {
  if (total == null) return { text: 'text-text-muted' }
  if (total < 40) return { text: 'text-hot' }
  if (total < 70) return { text: 'text-gold' }
  return { text: 'text-cyan' }
}

export default function ParticipantPrePitch({ token }) {
  const [data, setData] = useState(undefined) // undefined = não carregado ainda
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      if (!supabase) {
        setError('Sistema indisponível.')
        setLoading(false)
        return
      }
      const { data: result, error: rpcError } = await supabase.rpc('participant_prepitch_feedback', {
        p_token: token,
      })
      if (!active) return
      if (rpcError) {
        setError('Não foi possível carregar o feedback de pré-pitch.')
        setLoading(false)
        return
      }
      setData(result)
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [token])

  // Sem equipe vinculada: não renderiza nada
  if (!loading && !error && (data === null || data === undefined)) return null

  const rounds = data?.rounds ?? []
  const hasAnyEval = rounds.some(r => r.evaluations && r.evaluations.length > 0)

  return (
    <div className="space-y-4">
      <div className="card-glass rounded-2xl p-6">
        <p className="text-xs font-mono text-violet uppercase tracking-wider">Pré-Pitch</p>
        <h2 className="text-xl font-bold text-white mt-1">Feedback dos Mentores</h2>
        <p className="text-sm text-text-muted mt-1">
          Avaliação recebida nas bancas de pré-pitch, por rodada e por mentor.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-hot/30 bg-hot/5 px-4 py-3 text-sm text-hot">{error}</div>
      )}

      {loading && (
        <div className="card-glass rounded-2xl p-6 text-center text-text-muted text-sm animate-pulse">
          Carregando feedback...
        </div>
      )}

      {!loading && !error && !hasAnyEval && (
        <div className="card-glass rounded-2xl p-6 border border-dark-border text-center">
          <p className="text-text-muted text-sm">
            Seu feedback de pré-pitch aparecerá aqui após os mentores avaliarem.
          </p>
        </div>
      )}

      {!loading && !error && hasAnyEval && rounds.map(round => {
        if (!round.evaluations || round.evaluations.length === 0) return null
        return (
          <div key={round.round} className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-violet flex-shrink-0" />
              <h3 className="text-sm font-semibold text-white font-mono uppercase tracking-wider">
                Rodada {round.round}
              </h3>
            </div>

            {round.evaluations.map((ev, idx) => {
              const scoresObj = scoresToObj(ev.scores)
              const fa = faixaOf(ev.total_score)
              return (
                <div key={idx} className="card-glass rounded-2xl p-5 border border-violet/20 space-y-4">
                  {/* Cabeçalho do mentor */}
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-xs font-mono text-text-muted uppercase tracking-wider mb-0.5">Mentor</p>
                      <p className="text-sm font-semibold text-white">{ev.mentor_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-mono text-text-muted uppercase tracking-wider mb-0.5">Nota total</p>
                      <p className={`text-xl font-bold font-mono ${fa.text}`}>
                        {ev.total_score != null ? ev.total_score : '—'}
                        <span className="text-sm text-text-muted">/100</span>
                      </p>
                      {ev.updated_at && (
                        <p className="text-[11px] text-text-muted mt-0.5">{formatDate(ev.updated_at)}</p>
                      )}
                    </div>
                  </div>

                  {/* Scorecard readOnly */}
                  <PrePitchScorecard
                    scores={scoresObj}
                    summary={ev.summary}
                    readOnly
                  />
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
