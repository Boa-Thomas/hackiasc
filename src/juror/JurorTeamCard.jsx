import { useState, useEffect } from 'react'
import { EDITAL_RUBRIC } from '../lib/iaEvaluator'

const CRITERIA = EDITAL_RUBRIC.criteria

// Faixa de desempenho por nota — cor + rótulo curtos, usados no slider, na
// contribuição ponderada e no status. Espelha a leitura usual de rubrica.
function faixaOf(raw) {
  if (raw === '' || raw == null) return { key: 'none', accent: '#3a3a4a', text: 'text-text-muted', label: '—' }
  const v = Number(raw)
  if (!Number.isFinite(v)) return { key: 'none', accent: '#3a3a4a', text: 'text-text-muted', label: '—' }
  if (v < 40) return { key: 'low', accent: '#ff006e', text: 'text-hot', label: 'Insuficiente' }
  if (v < 70) return { key: 'mid', accent: '#ffbe0b', text: 'text-gold', label: 'Mediano' }
  return { key: 'high', accent: '#06d6a0', text: 'text-cyan', label: 'Forte' }
}

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

// Quantos critérios já têm nota válida (status parcial e barra de preenchimento).
function filledCount(scores) {
  let n = 0
  for (const c of CRITERIA) {
    const raw = scores[c.key]?.score
    if (raw !== '' && raw != null && Number.isFinite(Number(raw))) n++
  }
  return n
}

const STATUS_META = {
  saved: { dot: 'bg-cyan', label: 'Avaliada', chip: 'text-cyan border-cyan/30 bg-cyan/10' },
  draft: { dot: 'bg-gold', label: 'Rascunho', chip: 'text-gold border-gold/30 bg-gold/10' },
  pending: { dot: 'bg-white/25', label: 'Pendente', chip: 'text-text-muted border-white/10 bg-white/5' },
}

export default function JurorTeamCard({ team, existing, expanded, onToggle, onSubmit, onStatusChange }) {
  const [form, setForm] = useState(() => buildInitial(existing))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [confirmElim, setConfirmElim] = useState(false)

  const savedTotal = existing?.total_score
  const preview = previewTotal(form.scores)
  const filled = filledCount(form.scores)

  // Status do card para a navegação no painel: rascunho > avaliada > pendente.
  const status = dirty ? 'draft' : existing ? 'saved' : filled > 0 ? 'draft' : 'pending'
  const sm = STATUS_META[status]

  useEffect(() => {
    if (onStatusChange) onStatusChange(team.id, status)
  }, [status, team.id, onStatusChange])

  function setScore(key, field, value) {
    setSaved(false); setDirty(true)
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
    setDirty(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  // Eliminar só liga após confirmação explícita; desligar é direto.
  function toggleEliminated(next) {
    if (next) { setConfirmElim(true); return }
    setSaved(false); setDirty(true)
    setForm(f => ({ ...f, eliminated: false }))
  }
  function confirmEliminate() {
    setConfirmElim(false); setSaved(false); setDirty(true)
    setForm(f => ({ ...f, eliminated: true }))
  }

  const headlineTotal = savedTotal != null ? savedTotal : preview

  return (
    <div id={`team-${team.id}`} className="card-glass rounded-2xl overflow-hidden scroll-mt-24">
      {/* Cabeçalho — sempre visível, recolhe/expande o corpo */}
      <button
        type="button"
        onClick={() => onToggle?.(team.id)}
        className="w-full flex items-center gap-3 px-5 sm:px-6 py-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${sm.dot} ${status === 'draft' ? 'animate-pulse' : ''}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base sm:text-lg font-bold truncate">{team.name}</h2>
            {form.eliminated && (
              <span className="text-[10px] font-mono uppercase tracking-wider text-hot border border-hot/40 bg-hot/10 rounded px-1.5 py-0.5 flex-shrink-0">eliminada</span>
            )}
          </div>
          {!expanded && (
            <p className="text-xs text-text-muted font-mono mt-0.5">
              <span className={sm.chip.split(' ')[0]}>{sm.label}</span>
              <span className="text-white/20 mx-1.5">·</span>
              {filled}/{CRITERIA.length} critérios
            </p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          {headlineTotal != null ? (
            <span className={`text-lg font-bold font-mono ${faixaOf(headlineTotal).text}`}>{headlineTotal}<span className="text-xs text-text-muted">/100</span></span>
          ) : (
            <span className="text-xs text-text-muted font-mono">sem nota</span>
          )}
          {savedTotal != null && dirty && (
            <p className="text-[10px] text-gold font-mono">alterações não salvas</p>
          )}
        </div>
        <svg className={`w-4 h-4 text-text-muted flex-shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Corpo — formulário de avaliação */}
      {expanded && (
        <div className="px-5 sm:px-6 pb-6 pt-1 space-y-5 border-t border-dark-border">
          <div className="space-y-4">
            {CRITERIA.map(c => {
              const raw = form.scores[c.key].score
              const fa = faixaOf(raw)
              const n = Number(raw)
              const valid = raw !== '' && Number.isFinite(n)
              const contrib = valid ? Math.round((n * c.weight) / 100 * 10) / 10 : null
              return (
                <div key={c.key} className="border border-dark-border rounded-xl p-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <span className="text-sm font-semibold text-white">{c.label}</span>
                      <span className="text-xs text-white/40 ml-2 font-mono">vale até {c.weight} pts{c.eliminatory ? ' · eliminatório' : ''}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-mono ${fa.text} w-20 text-right`}>{fa.label}</span>
                      <input
                        type="number" min={0} max={100} step={1}
                        value={raw}
                        onChange={e => setScore(c.key, 'score', e.target.value)}
                        placeholder="0–100"
                        className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm text-right font-mono focus:outline-none focus:border-cyan/50"
                      />
                    </div>
                  </div>

                  {/* Slider sincronizado, com cor por faixa */}
                  <input
                    type="range" min={0} max={100} step={1}
                    value={valid ? n : 0}
                    onChange={e => setScore(c.key, 'score', e.target.value)}
                    style={{ accentColor: fa.accent }}
                    className="w-full mt-3 h-1.5 cursor-pointer"
                  />

                  {/* Contribuição ponderada ao vivo */}
                  <div className="flex items-center justify-between mt-1.5">
                    <p className="text-[11px] text-text-muted leading-relaxed pr-3">{c.describe}</p>
                    <span className={`text-[11px] font-mono whitespace-nowrap ${fa.text}`}>
                      {contrib != null ? `+${contrib}` : '—'} / {c.weight} pts
                    </span>
                  </div>

                  <textarea
                    value={form.scores[c.key].justification}
                    onChange={e => setScore(c.key, 'justification', e.target.value)}
                    rows={2} maxLength={5000}
                    placeholder="Justificativa (cite evidências concretas)"
                    className="w-full mt-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan/50"
                  />
                </div>
              )
            })}
          </div>

          {/* Total ponderado da prévia */}
          <div className="flex items-center justify-between bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3">
            <span className="text-xs font-mono text-text-muted uppercase tracking-wider">Total ponderado{preview == null ? ' (parcial)' : ''}</span>
            <span className={`text-xl font-bold font-mono ${preview != null ? faixaOf(preview).text : 'text-text-muted'}`}>
              {preview != null ? preview : '—'}<span className="text-sm text-text-muted">/100</span>
            </span>
          </div>

          {/* Eliminação — exige confirmação para ligar */}
          {form.eliminated ? (
            <div className="flex items-center justify-between gap-3 bg-hot/10 border border-hot/30 rounded-xl p-3">
              <span className="text-sm text-hot">
                Marcada como eliminada no critério técnico (sem IA real funcional/deployed).
              </span>
              <button type="button" onClick={() => toggleEliminated(false)} className="text-xs font-mono text-white/60 hover:text-white underline flex-shrink-0">desfazer</button>
            </div>
          ) : confirmElim ? (
            <div className="bg-hot/5 border border-hot/30 rounded-xl p-3 space-y-2">
              <p className="text-sm text-white/80">Confirmar eliminação no critério técnico? Use apenas se <strong>não houver IA real funcional/deployed</strong>.</p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={confirmEliminate} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-hot/20 text-hot border border-hot/40 hover:bg-hot/30">Confirmar eliminação</button>
                <button type="button" onClick={() => setConfirmElim(false)} className="px-3 py-1.5 rounded-lg text-xs font-mono text-white/60 hover:text-white">cancelar</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => toggleEliminated(true)} className="flex items-center gap-2 text-xs font-mono text-text-muted hover:text-hot transition-colors">
              <span className="w-4 h-4 rounded border border-white/20 inline-flex items-center justify-center">×</span>
              Eliminar no critério técnico (Execução Técnica e IA)
            </button>
          )}

          <div>
            <label className="text-xs text-text-muted">Parecer geral</label>
            <textarea
              value={form.summary}
              onChange={e => { setSaved(false); setDirty(true); setForm(f => ({ ...f, summary: e.target.value })) }}
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
            {!saved && dirty && <span className="text-sm text-gold font-mono">alterações não salvas</span>}
          </div>
        </div>
      )}
    </div>
  )
}
