import { toneClasses } from './aiEvalDisplay'
import { relativeTime } from './relativeTime'

// Render apresentacional de UMA avaliacao de entregavel do IA Evaluator: nota +
// criterios/justificativas (com barra e cor semantica) + eixos da clausula 5.3 +
// parecer da IA elevado a callout. Fonte unica usada pelo admin (aba Entregas) e
// pelo painel do mentor. Sem estado, sem fetch. Retorna null quando nao ha
// avaliacao gravada (scores vazio). `label` so e passado pelo mentor.
export default function AiEvaluationView({ evaluation, label = null }) {
  const ev = evaluation
  if (!ev || !Array.isArray(ev.scores) || ev.scores.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {label && <p className="text-sm font-semibold text-white">{label}</p>}
          {(ev.model || ev.updated_at) && (
            <p className="text-[11px] text-text-muted font-mono truncate">
              {ev.model || ''}{ev.model && ev.updated_at ? ' · ' : ''}
              {ev.updated_at ? `avaliado há ${relativeTime(ev.updated_at)}` : ''}
            </p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <span className="font-mono text-cyan text-sm">{ev.total_score != null ? ev.total_score : '—'}</span>
          <p className="text-[10px] text-text-muted">média do entregável{ev.eliminated ? ' · ⚠ eliminado' : ''}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {ev.scores.map(s => {
          const tone = toneClasses(s.score)
          return (
            <div key={s.criterion_key} className="bg-white/5 rounded-lg p-2">
              <div className="flex justify-between text-xs">
                <span className="text-white/70">{s.label} <span className="text-white/40">({s.weight}%)</span></span>
                <span className={`font-mono font-bold ${tone.text}`}>{s.score}</span>
              </div>
              <div className="mt-1 h-1 rounded-full bg-white/10 overflow-hidden">
                <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.max(0, Math.min(100, Number(s.score)))}%` }} />
              </div>
              {s.justification && <p className="text-[11px] text-text-muted mt-1.5 whitespace-pre-wrap">{s.justification}</p>}
            </div>
          )
        })}
      </div>

      {Array.isArray(ev.axes) && ev.axes.length > 0 && (
        <div className="space-y-1 pt-1">
          <p className="text-[10px] font-mono text-gold uppercase tracking-wider">Eixos da cláusula 5.3</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {ev.axes.map(a => {
              const tone = toneClasses(a.score)
              return (
                <div key={a.key} className="bg-white/5 rounded-lg p-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-white/70">{a.label}</span>
                    <span className={`font-mono font-bold ${tone.text}`}>{a.score}</span>
                  </div>
                  <div className="mt-1 h-1 rounded-full bg-white/10 overflow-hidden">
                    <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.max(0, Math.min(100, Number(a.score)))}%` }} />
                  </div>
                  {a.justification && <p className="text-[11px] text-text-muted mt-1.5 whitespace-pre-wrap">{a.justification}</p>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {ev.summary && (
        <div className="rounded-xl border border-violet/30 bg-gradient-to-b from-violet/10 to-transparent px-4 py-3">
          <p className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-violet/80 mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-violet" /> Parecer da IA · leve pro time
          </p>
          <p className="text-sm text-white/85 whitespace-pre-wrap leading-relaxed">{ev.summary}</p>
        </div>
      )}
    </div>
  )
}
