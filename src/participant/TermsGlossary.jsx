// Glossário colapsável de termos da metodologia HackIA, por fase.
// Reaproveita a redação do glossário do guia do mentor (mentorGuideContent),
// para o participante ter as mesmas definições à mão dentro dos entregáveis.
// `terms`: array de [termo, definição]. Renderiza nada quando vazio.
export default function TermsGlossary({ terms }) {
  if (!terms || !terms.length) return null
  return (
    <details className="card-glass rounded-2xl px-5 py-3 group">
      <summary className="flex items-center gap-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden text-sm font-semibold text-text-muted hover:text-white transition-colors">
        <span className="text-electric">❔</span>
        O que significam esses termos?
        <span className="ml-auto text-xs group-open:rotate-180 transition-transform">▾</span>
      </summary>
      <dl className="mt-3 space-y-2.5 border-t border-dark-border pt-3">
        {terms.map(([term, def]) => (
          <div key={term}>
            <dt className="text-sm font-semibold text-white">{term}</dt>
            <dd className="text-sm text-text-muted mt-0.5">{def}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}
