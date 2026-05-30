// Render apresentacional de UMA avaliacao de entregavel do IA Evaluator: nota +
// criterios/justificativas + eixos da clausula 5.3 + parecer. Fonte unica de
// verdade usada pelo admin (aba Entregas) e pelo painel do mentor. Sem estado,
// sem fetch. Retorna null quando nao ha avaliacao gravada (scores vazio).
export default function AiEvaluationView({ evaluation, label = null }) {
  const ev = evaluation
  if (!ev || !Array.isArray(ev.scores) || ev.scores.length === 0) return null

  return (
    <div className="space-y-2">
      {label && <p className="text-sm font-semibold text-white">{label}</p>}
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted">Nota do entregável</span>
        <span className="font-mono text-cyan text-sm">{ev.total_score != null ? ev.total_score : '—'}{ev.eliminated ? ' · ⚠ eliminado' : ''}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {ev.scores.map(s => (
          <div key={s.criterion_key} className="bg-white/5 rounded-lg p-2">
            <div className="flex justify-between text-xs">
              <span className="text-white/70">{s.label} <span className="text-white/40">({s.weight}%)</span></span>
              <span className="font-mono text-cyan">{s.score}</span>
            </div>
            {s.justification && <p className="text-[11px] text-text-muted mt-1 whitespace-pre-wrap">{s.justification}</p>}
          </div>
        ))}
      </div>
      {Array.isArray(ev.axes) && ev.axes.length > 0 && (
        <div className="space-y-1 pt-1">
          <p className="text-[10px] font-mono text-gold uppercase tracking-wider">Eixos da cláusula 5.3</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {ev.axes.map(a => (
              <div key={a.key} className="bg-white/5 rounded-lg p-2">
                <div className="flex justify-between text-xs">
                  <span className="text-white/70">{a.label}</span>
                  <span className="font-mono text-gold">{a.score}</span>
                </div>
                {a.justification && <p className="text-[11px] text-text-muted mt-1 whitespace-pre-wrap">{a.justification}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
      {ev.summary && <p className="text-sm text-white/80 whitespace-pre-wrap">{ev.summary}</p>}
    </div>
  )
}
