import { useState } from 'react'
import { EDITAL_RUBRIC } from '../lib/iaEvaluator'

const COLORS = [
  { hex: '#06d6a0', text: 'text-cyan', border: 'border-cyan/30' },
  { hex: '#3a86ff', text: 'text-electric', border: 'border-electric/30' },
  { hex: '#8338ec', text: 'text-violet', border: 'border-violet/30' },
  { hex: '#ff006e', text: 'text-hot', border: 'border-hot/30' },
]

const STORE_KEY = 'criteriaHighlightOpen'

export default function CriteriaHighlight() {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(STORE_KEY) !== 'false'
    } catch {
      return true
    }
  })

  const toggle = () => {
    setOpen(prev => {
      const next = !prev
      try { localStorage.setItem(STORE_KEY, String(next)) } catch { /* ignore */ }
      return next
    })
  }

  return (
    <section className="card-glass rounded-2xl mb-6 overflow-hidden border border-gold/20">
      <button
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-4 p-5 text-left hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="shrink-0 w-10 h-10 rounded-xl bg-gold/10 border border-gold/30 flex items-center justify-center">
            <svg className="w-5 h-5 text-gold" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM12 14v7m-4 0h8M5 4h14M7 4v3a5 5 0 0 0 10 0V4" />
            </svg>
          </div>
          <div>
            <p className="text-xs font-mono text-gold uppercase tracking-wider">Como você será avaliado</p>
            <h2 className="text-lg sm:text-xl font-bold mt-0.5">Critérios de Avaliação Final</h2>
          </div>
        </div>
        <svg
          className={`w-5 h-5 text-text-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-5 pb-5">
          <p className="text-sm text-text-muted mb-5">
            É exatamente assim que os jurados vão pontuar seu projeto no pitch. Os mesmos critérios guiam
            seus entregáveis — prepare-se desde já.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {EDITAL_RUBRIC.criteria.map((c, i) => {
              const color = COLORS[i % COLORS.length]
              return (
                <div key={c.key} className={`relative rounded-xl border ${color.border} bg-dark/40 p-4 pt-5 overflow-hidden`}>
                  <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: color.hex }} />
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h3 className="font-bold text-white leading-tight">{c.label}</h3>
                    <span className={`shrink-0 font-mono font-bold text-2xl leading-none ${color.text}`}>{c.weight}%</span>
                  </div>
                  {c.eliminatory && (
                    <span className="inline-block mb-2 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-hot/15 text-hot border border-hot/30">
                      Eliminatório
                    </span>
                  )}
                  <p className="text-xs text-text-muted leading-relaxed">{c.describe}</p>
                </div>
              )
            })}
          </div>

          {EDITAL_RUBRIC.extra && (
            <div className="mt-3 rounded-xl border border-dark-border bg-dark/40 p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-[10px] uppercase tracking-wider text-gold">+ Extra</span>
                <h3 className="font-bold text-white text-sm">{EDITAL_RUBRIC.extra.label}</h3>
              </div>
              <p className="text-xs text-text-muted leading-relaxed">{EDITAL_RUBRIC.extra.describe}</p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
