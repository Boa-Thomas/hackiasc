import { useState, useEffect, useRef } from 'react'

const INPUT = 'w-full bg-dark border border-dark-border rounded-xl px-4 py-2.5 text-white text-sm placeholder-text-muted focus:outline-none focus:border-electric focus:ring-1 focus:ring-electric/30 transition-colors disabled:opacity-70'
const LBL = 'block text-xs font-semibold text-white mb-1.5'
const DECISOES = ['Pivotar', 'Perseverar', 'Parar']

const FIELDS = [
  { key: 'hipotese', label: 'Hipótese', rows: 2 },
  { key: 'experimento', label: 'Experimento (build)', rows: 2 },
  { key: 'dados', label: 'Dados medidos (measure)', rows: 2 },
  { key: 'conclusao', label: 'Conclusão (learn)', rows: 2 },
]

function emptyCycle() { return { hipotese: '', experimento: '', dados: '', conclusao: '', decisao: '' } }
function valueToCycles(value) {
  const arr = value?.cycles
  return Array.isArray(arr) && arr.length ? arr.map(c => ({ ...emptyCycle(), ...c })) : [emptyCycle()]
}

// Diário de Aprendizado: lista de ciclos Build-Measure-Learn (≥2 pela metodologia).
export default function LearningDiary({ value, onSave, readOnly = false, updatedAt }) {
  const [cycles, setCycles] = useState(() => valueToCycles(value))
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const loadedAtRef = useRef(updatedAt)

  useEffect(() => {
    setCycles(valueToCycles(value))
    loadedAtRef.current = updatedAt
  }, [value, updatedAt])

  const dirty = JSON.stringify(cycles) !== JSON.stringify(valueToCycles(value))
  const setField = (i, k, v) => setCycles(cs => cs.map((c, idx) => (idx === i ? { ...c, [k]: v } : c)))
  const addCycle = () => setCycles(cs => [...cs, emptyCycle()])
  const removeCycle = (i) => setCycles(cs => (cs.length > 1 ? cs.filter((_, idx) => idx !== i) : cs))

  async function onSubmit(e) {
    e.preventDefault()
    setFeedback(null)
    if (updatedAt !== loadedAtRef.current) {
      if (!window.confirm('Outro membro salvou enquanto você editava. Suas alterações vão sobrescrever as dele. Continuar?')) return
    }
    setSaving(true)
    try {
      const clean = cycles.filter(c => Object.values(c).some(v => v && v.trim()))
      await onSave({ cycles: clean })
      setFeedback({ type: 'success', text: 'Diário salvo.' })
    } catch {
      setFeedback({ type: 'error', text: 'Erro ao salvar. Tente novamente.' })
    } finally {
      setSaving(false)
    }
  }

  const filledCount = cycles.filter(c => Object.values(c).some(v => v && v.trim())).length

  const content = (
    <>
      <div>
        <p className="text-xs font-mono text-electric uppercase tracking-wider">Fase 2 · Construção</p>
        <h3 className="text-lg font-bold text-white mt-1">Diário de Aprendizado</h3>
        <p className="text-sm text-text-muted mt-1">
          Registre cada volta do ciclo Build-Measure-Learn e a decisão Pivotar/Perseverar.
          A metodologia exige <strong className="text-white">pelo menos 2 ciclos</strong>{filledCount < 2 && !readOnly ? ` (você tem ${filledCount}).` : '.'}
        </p>
      </div>

      <div className="space-y-4">
        {cycles.map((c, i) => (
          <div key={i} className="rounded-xl border border-dark-border bg-dark/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-cyan uppercase tracking-wider">Ciclo {i + 1}</span>
              {!readOnly && cycles.length > 1 && (
                <button type="button" onClick={() => removeCycle(i)} className="text-xs text-text-muted hover:text-hot transition-colors">
                  Remover
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {FIELDS.map(f => (
                <div key={f.key}>
                  <label className={LBL}>{f.label}</label>
                  <textarea value={c[f.key]} onChange={e => setField(i, f.key, e.target.value)} disabled={readOnly} rows={f.rows} maxLength={1000} className={INPUT} />
                </div>
              ))}
            </div>
            <div>
              <label className={LBL}>Decisão</label>
              <select value={c.decisao} onChange={e => setField(i, 'decisao', e.target.value)} disabled={readOnly} className={INPUT}>
                <option value="">Selecione...</option>
                {DECISOES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>

      {!readOnly && (
        <button type="button" onClick={addCycle} className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold border border-dashed border-dark-border text-text-muted hover:text-cyan hover:border-cyan/40 transition-colors">
          + Adicionar ciclo
        </button>
      )}

      {feedback && (
        <div className={`rounded-xl px-4 py-3 text-sm border ${feedback.type === 'error' ? 'bg-hot/10 border-hot/30 text-hot' : 'bg-cyan/10 border-cyan/30 text-cyan'}`}>
          {feedback.text}
        </div>
      )}

      {!readOnly && (
        <div className="flex gap-3 flex-wrap">
          <button type="submit" disabled={saving || !dirty} className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-cyan/20 text-cyan border border-cyan/40 hover:bg-cyan/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {saving ? 'Salvando...' : 'Salvar Diário'}
          </button>
          {dirty && (
            <button type="button" onClick={() => { setCycles(valueToCycles(value)); setFeedback(null) }} className="px-5 py-2.5 rounded-xl text-sm font-semibold border border-dark-border text-text-muted hover:text-white">
              Descartar
            </button>
          )}
        </div>
      )}
    </>
  )

  if (readOnly) {
    return <div className="card-glass rounded-2xl p-6 space-y-5">{content}</div>
  }
  return (
    <form onSubmit={onSubmit} className="card-glass rounded-2xl p-6 space-y-5">{content}</form>
  )
}
