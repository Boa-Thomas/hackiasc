import { EDITAL_RUBRIC } from '../lib/iaEvaluator'

// Faixa de desempenho por nota — espelha JurorTeamCard.
function faixaOf(raw) {
  if (raw === '' || raw == null) return { key: 'none', accent: '#3a3a4a', text: 'text-text-muted', label: '—' }
  const v = Number(raw)
  if (!Number.isFinite(v)) return { key: 'none', accent: '#3a3a4a', text: 'text-text-muted', label: '—' }
  if (v < 40) return { key: 'low', accent: '#ff006e', text: 'text-hot', label: 'Insuficiente' }
  if (v < 70) return { key: 'mid', accent: '#ffbe0b', text: 'text-gold', label: 'Mediano' }
  return { key: 'high', accent: '#06d6a0', text: 'text-cyan', label: 'Forte' }
}

// Σ(score × weight / 100) arredondado a 1 casa; ignora score vazio/NaN.
// eslint-disable-next-line react-refresh/only-export-components
export function prePitchTotal(scores, criteria = EDITAL_RUBRIC.criteria) {
  let sum = 0
  let hasAny = false
  for (const c of criteria) {
    const raw = scores?.[c.key]?.score
    if (raw === '' || raw == null) continue
    const v = Number(raw)
    if (!Number.isFinite(v)) continue
    sum += (v * c.weight) / 100
    hasAny = true
  }
  if (!hasAny) return null
  return Math.round(sum * 10) / 10
}

export default function PrePitchScorecard({
  scores,
  summary,
  onScoreChange,
  onSummaryChange,
  readOnly = false,
  criteria = EDITAL_RUBRIC.criteria,
}) {
  const total = prePitchTotal(scores, criteria)
  const totalFa = faixaOf(total)

  if (readOnly) {
    return (
      <div className="space-y-4">
        <div className="space-y-3">
          {criteria.map(c => {
            const entry = scores?.[c.key] || {}
            const raw = entry.score
            const fa = faixaOf(raw)
            const comment = entry.comment || ''
            return (
              <div key={c.key} className="border border-dark-border rounded-xl p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-sm font-semibold text-white">{c.label}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-mono ${fa.text}`}>{fa.label}</span>
                    <span className={`text-base font-bold font-mono ${fa.text}`}>
                      {raw !== '' && raw != null ? `${raw}/100` : '—'}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-text-muted mt-2 leading-relaxed">
                  {comment || '—'}
                </p>
              </div>
            )
          })}
        </div>

        {/* Total ponderado */}
        <div className="flex items-center justify-between bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3">
          <span className="text-xs font-mono text-text-muted uppercase tracking-wider">Total ponderado</span>
          <span className={`text-xl font-bold font-mono ${total != null ? totalFa.text : 'text-text-muted'}`}>
            {total != null ? total : '—'}<span className="text-sm text-text-muted">/100</span>
          </span>
        </div>

        {/* Parecer geral */}
        {summary && (
          <div className="border border-dark-border rounded-xl p-4">
            <p className="text-xs font-mono text-text-muted mb-1.5 uppercase tracking-wider">Parecer geral</p>
            <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">{summary}</p>
          </div>
        )}
      </div>
    )
  }

  // Modo edição
  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {criteria.map(c => {
          const entry = scores?.[c.key] || {}
          const raw = entry.score ?? ''
          const comment = entry.comment ?? ''
          const fa = faixaOf(raw)
          const n = Number(raw)
          const valid = raw !== '' && Number.isFinite(n)
          const contrib = valid ? Math.round((n * c.weight) / 100 * 10) / 10 : null

          return (
            <div key={c.key} className="border border-dark-border rounded-xl p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <span className="text-sm font-semibold text-white">{c.label}</span>
                  <span className="text-xs text-white/40 ml-2 font-mono">vale até {c.weight} pts</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-mono ${fa.text} w-20 text-right`}>{fa.label}</span>
                  <input
                    type="number" min={0} max={100} step={1}
                    value={raw}
                    onChange={e => onScoreChange?.(c.key, 'score', e.target.value)}
                    placeholder="0–100"
                    className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm text-right font-mono focus:outline-none focus:border-cyan/50"
                  />
                </div>
              </div>

              {/* Slider sincronizado, com cor por faixa. Fica DESABILITADO
                  enquanto o critério não tem nota: um range nativo "salta" para
                  a posição do clique, então um toque acidental na trilha de um
                  critério sem nota registraria uma nota alta (até 100) sem o
                  mentor perceber. Digite a nota no campo acima para liberar o
                  ajuste fino aqui. */}
              <input
                type="range" min={0} max={100} step={1}
                value={valid ? n : 0}
                disabled={!valid}
                onChange={e => onScoreChange?.(c.key, 'score', e.target.value)}
                style={{ accentColor: fa.accent }}
                aria-label={`Ajustar nota de ${c.label}`}
                title={valid ? undefined : 'Digite a nota no campo acima para habilitar o slider'}
                className={`w-full mt-3 h-1.5 ${valid ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}`}
              />

              {/* Contribuição ponderada ao vivo */}
              <div className="flex items-center justify-between mt-1.5">
                <p className="text-[11px] text-text-muted leading-relaxed pr-3">{c.describe}</p>
                <span className={`text-[11px] font-mono whitespace-nowrap ${fa.text}`}>
                  {contrib != null ? `+${contrib}` : '—'} / {c.weight} pts
                </span>
              </div>

              <textarea
                value={comment}
                onChange={e => onScoreChange?.(c.key, 'comment', e.target.value)}
                rows={2} maxLength={5000}
                placeholder="Comentário — cite evidências concretas"
                className="w-full mt-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan/50"
              />
            </div>
          )
        })}
      </div>

      {/* Total ponderado */}
      <div className="flex items-center justify-between bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3">
        <span className="text-xs font-mono text-text-muted uppercase tracking-wider">
          Total ponderado{total == null ? ' (parcial)' : ''}
        </span>
        <span className={`text-xl font-bold font-mono ${total != null ? totalFa.text : 'text-text-muted'}`}>
          {total != null ? total : '—'}<span className="text-sm text-text-muted">/100</span>
        </span>
      </div>

      {/* Parecer geral */}
      <div>
        <label className="text-xs text-text-muted">Parecer geral</label>
        <textarea
          value={summary ?? ''}
          onChange={e => onSummaryChange?.(e.target.value)}
          rows={3} maxLength={5000}
          placeholder="Parecer geral do pré-pitch (2–4 frases)"
          className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan/50"
        />
      </div>
    </div>
  )
}
