import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { dimensionsFor, validateScores, EVAL_MIN, EVAL_MAX, EVAL_STEP } from './evaluationDimensions'

// Cor do slider por faixa de nota (0–10), espelhando o padrão do JurorTeamCard.
function accentFor(v) {
  if (v == null) return '#3a86ff'
  if (v >= 8) return '#06d6a0'
  if (v >= 5) return '#ffbe0b'
  return '#ff006e'
}

function Shell({ children }) {
  return (
    <section className="card-glass rounded-2xl p-6 border border-cyan/20">
      <p className="text-xs font-mono text-cyan uppercase tracking-wider mb-1">Avaliação do evento</p>
      {children}
    </section>
  )
}

export default function EventEvaluationForm({ respondentType, token }) {
  const dims = dimensionsFor(respondentType)
  const [state, setState] = useState('loading') // loading | unauthorized | closed | form | done
  const [scores, setScores] = useState({})
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(null)

  useEffect(() => {
    if (!supabase || !token) { setState('closed'); return } // eslint-disable-line react-hooks/set-state-in-effect
    let active = true
    supabase.rpc('get_my_event_evaluation', { p_token: token, p_type: respondentType })
      .then(({ data, error: e }) => {
        if (!active) return
        if (e || !data || !data.authorized) { setState('unauthorized'); return }
        if (data.submitted) { setSaved(data); setState('done'); return }
        setState(data.open ? 'form' : 'closed')
      })
    return () => { active = false }
  }, [token, respondentType])

  function setScore(key, value) {
    setScores(prev => ({ ...prev, [key]: value === '' ? undefined : Number(value) }))
  }

  async function handleSubmit() {
    setError(null)
    const { value, error: vErr } = validateScores(scores, respondentType)
    if (vErr) { setError('Há uma nota inválida. Use valores de 0 a 10.'); return }
    if (Object.keys(value).length === 0 && !comment.trim()) {
      setError('Dê pelo menos uma nota ou escreva um comentário.')
      return
    }
    setSubmitting(true)
    const { error: e } = await supabase.rpc('submit_event_evaluation', {
      p_token: token,
      p_type: respondentType,
      p_scores: value,
      p_comment: comment.trim() || null,
    })
    setSubmitting(false)
    if (e) {
      if (e.message?.includes('already_submitted')) { setSaved({ scores: value, comment: comment.trim() || null }); setState('done') }
      else if (e.message?.includes('evaluation_closed')) { setState('closed') }
      else setError('Não foi possível enviar. Tente novamente.')
      return
    }
    setSaved({ scores: value, comment: comment.trim() || null })
    setState('done')
  }

  if (state === 'loading') {
    return <Shell><p className="text-sm text-text-muted mt-2">Carregando…</p></Shell>
  }

  if (state === 'unauthorized') {
    return <Shell><p className="text-sm text-text-muted mt-2">Não foi possível identificar seu acesso para avaliar.</p></Shell>
  }

  if (state === 'closed') {
    return (
      <Shell>
        <h2 className="text-lg font-bold mt-1">Avaliação indisponível</h2>
        <p className="text-sm text-text-muted mt-2 leading-relaxed">
          A avaliação do evento ainda não foi liberada ou já foi encerrada. Fique de olho nos avisos da organização.
        </p>
      </Shell>
    )
  }

  if (state === 'done') {
    return (
      <Shell>
        <h2 className="text-lg font-bold mt-1">Obrigado pela sua avaliação! 🎉</h2>
        <p className="text-sm text-text-muted mt-2 mb-4">Sua resposta foi registrada. Veja o que você enviou:</p>
        <ul className="space-y-2">
          {dims.map(d => {
            const v = saved?.scores?.[d.key]
            return (
              <li key={d.key} className="flex items-center justify-between gap-3 text-sm border border-dark-border rounded-lg px-3 py-2 bg-dark/40">
                <span className="text-white/80">{d.label}</span>
                <span className="font-mono" style={{ color: accentFor(v) }}>{v != null ? v : '—'}</span>
              </li>
            )
          })}
        </ul>
        {saved?.comment && (
          <div className="mt-4 rounded-xl border border-dark-border bg-dark/40 px-4 py-3">
            <p className="text-[10px] font-mono uppercase tracking-wider text-text-muted mb-1">Seu comentário</p>
            <p className="text-sm text-white/80 whitespace-pre-wrap">{saved.comment}</p>
          </div>
        )}
      </Shell>
    )
  }

  // state === 'form'
  return (
    <Shell>
      <h2 className="text-lg font-bold mt-1">Conta pra gente como foi</h2>
      <p className="text-sm text-text-muted mt-1 mb-5 leading-relaxed">
        Dê uma nota de 0 a 10 para cada item (arraste o slider). Você envia uma vez — depois não dá pra editar.
      </p>

      <div className="space-y-5">
        {dims.map(d => {
          const v = scores[d.key]
          const accent = accentFor(v)
          return (
            <div key={d.key} className="border border-dark-border rounded-xl p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-white">{d.label}</span>
                <span className="font-mono text-xl tabular-nums" style={{ color: accent }}>
                  {v != null ? v.toFixed(1) : '—'}
                </span>
              </div>
              <input
                type="range"
                min={EVAL_MIN}
                max={EVAL_MAX}
                step={EVAL_STEP}
                value={v != null ? v : EVAL_MIN}
                onChange={e => setScore(d.key, e.target.value)}
                style={{ accentColor: accent, opacity: v != null ? 1 : 0.45 }}
                className="w-full mt-3 h-1.5 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-text-muted mt-1">
                <span>0</span><span>5</span><span>10</span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-5">
        <label className="text-xs font-mono text-text-muted uppercase tracking-wider">Comentário (opcional)</label>
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          rows={4}
          maxLength={5000}
          placeholder="O que funcionou bem? O que dá pra melhorar?"
          className="w-full mt-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan/50"
        />
      </div>

      {error && <p className="text-sm text-hot mt-3">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="mt-4 w-full sm:w-auto px-6 py-2.5 rounded-xl bg-cyan/15 border border-cyan/40 text-cyan font-semibold hover:bg-cyan/25 transition-colors disabled:opacity-50"
      >
        {submitting ? 'Enviando…' : 'Enviar avaliação'}
      </button>
    </Shell>
  )
}
