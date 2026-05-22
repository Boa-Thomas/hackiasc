import { useState, useEffect, useRef } from 'react'

const INPUT = 'w-full bg-dark border border-dark-border rounded-xl px-4 py-2.5 text-white text-sm placeholder-text-muted focus:outline-none focus:border-electric focus:ring-1 focus:ring-electric/30 transition-colors disabled:opacity-70'
const LBL = 'block text-sm font-semibold text-white mb-2'

function valueToForm(fields, value) {
  const v = value || {}
  return Object.fromEntries(fields.map(f => [f.key, v[f.key] || '']))
}

// Form genérico orientado por config de campos. Edição quando `onSave` é
// fornecido; modo leitura quando `readOnly` (usado pelo painel do mentor).
export default function DeliverableForm({
  eyebrow, title, description, fields, value, onSave, readOnly = false,
  updatedAt, gridClass = 'grid grid-cols-1 md:grid-cols-2 gap-4', saveLabel = 'Salvar',
}) {
  const [form, setForm] = useState(() => valueToForm(fields, value))
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const loadedAtRef = useRef(updatedAt)

  useEffect(() => {
    setForm(valueToForm(fields, value))
    loadedAtRef.current = updatedAt
  }, [value, updatedAt, fields])

  const dirty = fields.some(f => form[f.key] !== ((value || {})[f.key] || ''))
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function onSubmit(e) {
    e.preventDefault()
    setFeedback(null)
    for (const f of fields) {
      if (f.type === 'url' && form[f.key] && !/^https?:\/\/.+/i.test(form[f.key])) {
        return setFeedback({ type: 'error', text: `${f.label}: use uma URL http(s) válida.` })
      }
    }
    if (updatedAt !== loadedAtRef.current) {
      if (!window.confirm('Outro membro salvou enquanto você editava. Suas alterações vão sobrescrever as dele. Continuar?')) return
    }
    setSaving(true)
    try {
      await onSave(form)
      setFeedback({ type: 'success', text: 'Salvo.' })
    } catch {
      setFeedback({ type: 'error', text: 'Erro ao salvar. Tente novamente.' })
    } finally {
      setSaving(false)
    }
  }

  const header = (
    <div>
      {eyebrow && <p className="text-xs font-mono text-electric uppercase tracking-wider">{eyebrow}</p>}
      <h3 className="text-lg font-bold text-white mt-1">{title}</h3>
      {description && <p className="text-sm text-text-muted mt-1">{description}</p>}
    </div>
  )

  const grid = (
    <div className={gridClass}>
      {fields.map(f => (
        <div key={f.key} className={f.full ? 'col-span-full' : ''}>
          <label className={LBL} htmlFor={`fld-${f.key}`}>{f.label}</label>
          {f.type === 'select' ? (
            <select id={`fld-${f.key}`} value={form[f.key]} onChange={e => set(f.key, e.target.value)} disabled={readOnly} className={INPUT}>
              <option value="">{f.placeholder || 'Selecione...'}</option>
              {f.options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : f.type === 'textarea' ? (
            <textarea id={`fld-${f.key}`} value={form[f.key]} onChange={e => set(f.key, e.target.value)} disabled={readOnly} rows={f.rows || 4} maxLength={f.maxLength || 2000} className={INPUT} placeholder={readOnly ? '—' : f.placeholder} />
          ) : (
            <input id={`fld-${f.key}`} type={f.type === 'url' ? 'url' : 'text'} value={form[f.key]} onChange={e => set(f.key, e.target.value)} disabled={readOnly} maxLength={f.maxLength || 300} className={INPUT} placeholder={readOnly ? '—' : f.placeholder} />
          )}
        </div>
      ))}
    </div>
  )

  if (readOnly) {
    return <div className="card-glass rounded-2xl p-6 space-y-5">{header}{grid}</div>
  }

  return (
    <form onSubmit={onSubmit} className="card-glass rounded-2xl p-6 space-y-5">
      {header}
      {grid}
      {feedback && (
        <div className={`rounded-xl px-4 py-3 text-sm border ${feedback.type === 'error' ? 'bg-hot/10 border-hot/30 text-hot' : 'bg-cyan/10 border-cyan/30 text-cyan'}`}>
          {feedback.text}
        </div>
      )}
      <div className="flex gap-3 flex-wrap">
        <button type="submit" disabled={saving || !dirty} className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-cyan/20 text-cyan border border-cyan/40 hover:bg-cyan/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {saving ? 'Salvando...' : saveLabel}
        </button>
        {dirty && (
          <button type="button" onClick={() => { setForm(valueToForm(fields, value)); setFeedback(null) }} className="px-5 py-2.5 rounded-xl text-sm font-semibold border border-dark-border text-text-muted hover:text-white">
            Descartar
          </button>
        )}
      </div>
    </form>
  )
}
