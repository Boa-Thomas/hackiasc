import { toneClasses } from './aiEvalDisplay'

// Overview da nota IA agregada da equipe: hero (nota ponderada quando os 4
// critérios têm nota; senão "parcial n/4") + os 4 critérios oficiais com barra
// e cor semântica. Recebe a saída de aggregateTeamEvaluation (iaEvaluator.js).
// Fonte única usada pelo painel do mentor e pela aba Entregas do admin.
// Sem estado, sem fetch.
export default function AiAggregateView({ agg }) {
  if (!agg) return null
  const complete = agg.total_score != null

  return (
    <div className="flex flex-col sm:flex-row gap-4">
      <div className="sm:w-40 flex-shrink-0 rounded-xl border border-gold/25 bg-gradient-to-b from-gold/10 to-transparent p-4 flex flex-col justify-center">
        {complete ? (
          <>
            <span className="font-mono text-3xl font-bold text-gold leading-none">{agg.total_score}</span>
            <span className="text-xs text-text-muted mt-1">/ 100 agregada</span>
          </>
        ) : (
          <>
            <span className="font-mono text-lg font-bold text-gold leading-tight">parcial · {agg.scoredCriteria}/4</span>
            <span className="text-xs text-text-muted mt-1">critérios com nota</span>
          </>
        )}
        {agg.eliminated && <span className="text-xs text-hot mt-2">⚠ eliminado</span>}
        <span className="text-[10px] text-text-muted mt-2 leading-snug">Ponderada (cláusula 6) só fecha com os 4 critérios.</span>
      </div>

      <div className="flex-1 flex flex-col justify-center gap-2.5">
        {agg.criteria.map(c => {
          const tone = toneClasses(c.score)
          const has = c.score != null
          return (
            <div key={c.key}>
              <div className="flex justify-between items-center text-xs gap-2">
                <span className="text-white/80">
                  {c.label} <span className="text-white/40">{c.weight}%</span>
                  {c.key === 'tecnica_ia' && (
                    <span className="ml-1.5 text-[9px] font-mono text-hot border border-hot/35 rounded px-1 align-middle">ELIM</span>
                  )}
                </span>
                <span className={`font-mono font-bold ${has ? tone.text : 'text-text-muted'}`}>
                  {has ? c.score : 'aguardando'}
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                {has && (
                  <div
                    className={`h-full rounded-full ${tone.bar}`}
                    style={{ width: `${Math.max(0, Math.min(100, c.score))}%` }}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
