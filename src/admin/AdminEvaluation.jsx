import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { EVALUATION_DIMENSIONS } from '../lib/evaluationDimensions'
import { aggregateResults } from './evaluationResults'

function barColor(v) {
  if (v == null) return '#3a86ff'
  if (v >= 8) return '#06d6a0'
  if (v >= 5) return '#ffbe0b'
  return '#ff006e'
}

function Bar({ label, value, count }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-white/60">{label}</span>
        <span className="font-mono" style={{ color: barColor(value) }}>
          {value != null ? value.toFixed(1) : '—'}{count != null && <span className="text-white/30"> · {count}</span>}
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
        {value != null && (
          <div className="h-full rounded-full" style={{ width: `${(value / 10) * 100}%`, backgroundColor: barColor(value) }} />
        )}
      </div>
    </div>
  )
}

export default function AdminEvaluation({ readOnly }) {
  const [open, setOpen] = useState(false)
  const [agg, setAgg] = useState(null)
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

  const load = useCallback(() => {
    if (!supabase) { setLoading(false); return }
    setLoading(true)
    supabase.rpc('get_event_evaluation_results').then(({ data, error }) => {
      if (error || !data) { setErr('Não foi possível carregar os resultados.'); setLoading(false); return }
      setOpen(!!data.open)
      setAgg(aggregateResults(data.rows || []))
      setComments(data.comments || [])
      setLoading(false)
    })
  }, [])

  useEffect(() => { load() }, [load]) // eslint-disable-line react-hooks/set-state-in-effect

  async function toggle() {
    const next = !open
    setOpen(next)
    const { error } = await supabase.rpc('set_evaluation_open', { p_open: next })
    if (error) { setOpen(!next); setErr('Não foi possível alterar o status.') }
  }

  if (loading) return <p className="text-white/50 text-sm">Carregando…</p>

  const pCount = agg?.participant.count ?? 0
  const mCount = agg?.mentor.count ?? 0

  return (
    <div className="space-y-6">
      <div className="card-glass rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-mono text-cyan uppercase tracking-wider">Avaliação do evento</p>
          <h2 className="text-xl font-bold mt-1 text-white">{pCount + mCount} respostas</h2>
          <p className="text-sm text-white/50 mt-1">{pCount} participantes · {mCount} mentores</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={load} className="text-xs font-mono px-3 py-1.5 rounded-lg border border-white/10 text-white/60 hover:text-white">
            Atualizar
          </button>
          {!readOnly && (
            <button
              onClick={toggle}
              className={`flex items-center gap-2 text-sm font-mono px-3 py-1.5 rounded-full border transition-colors ${
                open ? 'bg-cyan/15 text-cyan border-cyan/30' : 'bg-white/5 text-white/50 border-white/10 hover:text-white/70'
              }`}
            >
              <span className={`inline-block w-2 h-2 rounded-full ${open ? 'bg-cyan' : 'bg-white/30'}`} />
              {open ? 'Avaliação aberta' : 'Avaliação fechada'}
            </button>
          )}
        </div>
      </div>

      {err && <p className="text-sm text-hot">{err}</p>}

      <div className="card-glass rounded-2xl p-5">
        <p className="text-xs font-mono text-electric uppercase tracking-wider mb-4">Médias por dimensão</p>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-4">
            <p className="text-sm font-semibold text-white/70">Participantes</p>
            {EVALUATION_DIMENSIONS.map(d => {
              const slot = agg?.participant.dims[d.key]
              return <Bar key={d.key} label={d.label} value={slot?.avg ?? null} count={slot?.count ?? 0} />
            })}
          </div>
          <div className="space-y-4">
            <p className="text-sm font-semibold text-white/70">Mentores</p>
            {EVALUATION_DIMENSIONS.filter(d => !d.participantOnly).map(d => {
              const slot = agg?.mentor.dims[d.key]
              return <Bar key={d.key} label={d.label} value={slot?.avg ?? null} count={slot?.count ?? 0} />
            })}
          </div>
        </div>
      </div>

      <div className="card-glass rounded-2xl p-5">
        <p className="text-xs font-mono text-gold uppercase tracking-wider mb-4">Comentários ({comments.length})</p>
        {comments.length === 0 ? (
          <p className="text-sm text-white/50">Nenhum comentário ainda.</p>
        ) : (
          <ul className="space-y-3">
            {comments.map((c, i) => (
              <li key={i} className="border border-dark-border rounded-xl p-4 bg-dark/40">
                <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  c.respondent_type === 'mentor' ? 'bg-violet/10 text-violet' : 'bg-cyan/10 text-cyan'
                }`}>
                  {c.respondent_type === 'mentor' ? 'Mentor' : 'Participante'}
                </span>
                <p className="text-sm text-white/80 whitespace-pre-wrap mt-2">{c.comment}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
