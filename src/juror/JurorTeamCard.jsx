import { useState } from 'react'
import { EDITAL_RUBRIC } from '../lib/iaEvaluator'

const CRITERIA = EDITAL_RUBRIC.criteria

// Monta o estado inicial do formulário a partir do scorecard já salvo (se houver).
function buildInitial(existing) {
  const byKey = new Map((existing?.scores || []).map(s => [s.criterion_key, s]))
  const scores = {}
  for (const c of CRITERIA) {
    const prev = byKey.get(c.key)
    scores[c.key] = {
      score: prev && prev.score != null ? String(prev.score) : '',
      justification: prev?.justification || '',
    }
  }
  return {
    scores,
    summary: existing?.summary || '',
    eliminated: existing?.eliminated === true,
  }
}

// Total ponderado prévio (espelha o cálculo server-side; o servidor é a fonte da verdade).
function previewTotal(scores) {
  let total = 0
  let complete = true
  for (const c of CRITERIA) {
    const raw = scores[c.key]?.score
    const n = Number(raw)
    if (raw === '' || !Number.isFinite(n)) { complete = false; continue }
    total += (n * c.weight) / 100
  }
  return complete ? Math.round(total * 10) / 10 : null
}

export default function JurorTeamCard({ team, existing, onSubmit }) {
  const [form, setForm] = useState(() => buildInitial(existing))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)

  const savedTotal = existing?.total_score
  const preview = previewTotal(form.scores)

  function setScore(key, field, value) {
    setSaved(false)
    setForm(f => ({ ...f, scores: { ...f.scores, [key]: { ...f.scores[key], [field]: value } } }))
  }

  function validate() {
    for (const c of CRITERIA) {
      const raw = form.scores[c.key]?.score
      const n = Number(raw)
      if (raw === '' || raw == null) return `Informe a nota de "${c.label}".`
      if (!Number.isFinite(n) || n < 0 || n > 100) return `Nota inválida em "${c.label}": use 0 a 100.`
    }
    return null
  }

  async function handleSave() {
    const v = validate()
    if (v) { setError(v); return }
    setError(null); setSaving(true); setSaved(false)
    const scores = CRITERIA.map(c => ({
      criterion_key: c.key,
      score: Number(form.scores[c.key].score),
      justification: form.scores[c.key].justification.trim(),
    }))
    const res = await onSubmit({
      teamId: team.id,
      scores,
      summary: form.summary.trim(),
      eliminated: form.eliminated,
    })
    setSaving(false)
    if (!res.ok) {
      setError(res.error?.includes('invalid_token') ? 'Sua sessão expirou. Reabra o link enviado pela organização.' : `Erro ao salvar: ${res.error}`)
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className="card-glass rounded-2xl p-6 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-mono text-cyan uppercase tracking-wider">Equipe</p>
          <h2 className="text-xl font-bold mt-0.5">{team.name}</h2>
        </div>
        <div className="text-right">
          {savedTotal != null && (
            <span className="inline-block text-xs font-mono text-cyan border border-cyan/30 bg-cyan/10 rounded-full px-3 py-1">
              salvo: {savedTotal} / 100
            </span>
          )}
          {preview != null && (
            <p className="text-xs text-text-muted font-mono mt-1">prévia: {preview} / 100</p>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {CRITERIA.map(c => (
          <div key={c.key} className="border border-dark-border rounded-xl p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <span className="text-sm font-semibold text-white">{c.label}</span>
                <span className="text-xs text-white/40 ml-2 font-mono">peso {c.weight}%{c.eliminatory ? ' · eliminatório' : ''}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={0} max={100} step={1}
                  value={form.scores[c.key].score}
                  onChange={e => setScore(c.key, 'score', e.target.value)}
                  placeholder="0–100"
                  className="w-24 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm text-right font-mono focus:outline-none focus:border-cyan/50"
                />
              </div>
            </div>
            <p className="text-[11px] text-text-muted mt-2 leading-relaxed">{c.describe}</p>
            <textarea
              value={form.scores[c.key].justification}
              onChange={e => setScore(c.key, 'justification', e.target.value)}
              rows={2} maxLength={5000}
              placeholder="Justificativa (cite evidências concretas)"
              className="w-full mt-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan/50"
            />
          </div>
        ))}
      </div>

      <label className="flex items-start gap-3 cursor-pointer bg-hot/5 border border-hot/20 rounded-xl p-3">
        <input
          type="checkbox"
          checked={form.eliminated}
          onChange={e => { setSaved(false); setForm(f => ({ ...f, eliminated: e.target.checked })) }}
          className="mt-0.5 accent-hot"
        />
        <span className="text-sm text-white/80">
          Eliminar no critério técnico (Execução Técnica e IA)
          <span className="block text-xs text-text-muted">Marque apenas se não houver IA real funcional/deployed.</span>
        </span>
      </label>

      <div>
        <label className="text-xs text-text-muted">Parecer geral</label>
        <textarea
          value={form.summary}
          onChange={e => { setSaved(false); setForm(f => ({ ...f, summary: e.target.value })) }}
          rows={3} maxLength={5000}
          placeholder="Parecer geral sobre a equipe (2–4 frases)"
          className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan/50"
        />
      </div>

      {error && <div className="bg-hot/10 border border-hot/30 rounded-lg px-3 py-2 text-hot text-sm">{error}</div>}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 rounded-lg text-sm font-semibold bg-cyan/20 text-cyan border border-cyan/40 hover:bg-cyan/30 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Salvando...' : existing ? 'Atualizar notas' : 'Salvar notas'}
        </button>
        {saved && <span className="text-sm text-cyan font-mono">✓ salvo</span>}
      </div>
    </div>
  )
}
