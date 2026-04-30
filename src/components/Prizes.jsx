const PRIZES = [
  {
    place: '1o',
    value: 'R$ 6.000',
    desc: 'Capital semente para reinvestir na sua startup.',
    color: 'gold',
    featured: true,
  },
  {
    place: '2o',
    value: 'R$ 3.000',
    desc: 'Capital semente para reinvestir na sua startup.',
    color: 'text-muted',
    featured: false,
  },
  {
    place: '3o',
    value: 'Benefícios',
    desc: 'Consultorias e benefícios exclusivos (a divulgar).',
    color: 'hot',
    featured: false,
  },
]

const CRITERIA = [
  { name: 'Execução Técnica e IA', weight: '30%', hex: '#06d6a0' },
  { name: 'Validação do Problema', weight: '25%', hex: '#3a86ff' },
  { name: 'Escalabilidade e Negócio', weight: '25%', hex: '#8338ec' },
  { name: 'Pitch e Equipe', weight: '20%', hex: '#ff006e' },
]

export default function Prizes() {
  return (
    <section id="premios" className="relative py-24 sm:py-32">
      <div className="orb w-[350px] h-[350px] bg-gold/10 top-20 -left-40 animate-pulse-glow" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-16">
          <span className="font-mono text-sm text-gold tracking-wider uppercase">Premiação</span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mt-4">
            <span className="text-gradient-fire">R$ 9.000+</span> em prêmios
          </h2>
        </div>

        {/* Prize cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {PRIZES.map(({ place, value, desc, color, featured }) => (
            <div
              key={place}
              className={`card-glass rounded-2xl p-8 text-center transition-transform hover:scale-[1.02] ${
                featured ? `border-${color}/30 ring-1 ring-${color}/10` : ''
              }`}
            >
              {featured && (
                <span className="inline-block px-3 py-1 rounded-full text-xs font-mono bg-gold/10 text-gold border border-gold/20 mb-4">
                  VENCEDOR
                </span>
              )}
              <div className={`text-5xl sm:text-6xl font-extrabold font-mono text-${color} mb-2`}>
                {place}
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-white mb-3">{value}</div>
              <p className="text-sm text-text-muted">{desc}</p>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-text-muted mt-4 mb-8">
          As equipes vencedoras ganham um ingresso para o <strong className="text-white">TSW Blumenau Healthtech 2026</strong>.
        </p>

        {/* Evaluation criteria */}
        <div className="card-glass rounded-2xl p-6 sm:p-8">
          <h3 className="text-lg font-bold text-white mb-5 text-center">Critérios de Avaliação</h3>

          {/* Mobile: stacked list */}
          <div className="sm:hidden space-y-3">
            {CRITERIA.map(({ name, weight, hex }) => (
              <div key={name} className="flex items-center gap-3">
                <div className="w-2 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: hex }} />
                <div className="flex-1">
                  <span className="text-sm font-semibold text-white">{name}</span>
                </div>
                <span className="font-mono text-lg font-bold flex-shrink-0" style={{ color: hex }}>{weight}</span>
              </div>
            ))}
          </div>

          {/* Desktop: bar chart */}
          <div className="hidden sm:block">
            <div className="flex mb-2">
              {CRITERIA.map(({ name, weight, hex }) => (
                <div key={name} className="text-center" style={{ width: weight }}>
                  <span className="block font-mono text-base sm:text-lg font-bold" style={{ color: hex }}>
                    {weight}
                  </span>
                  <span className="block text-[10px] sm:text-xs text-text-muted leading-tight">
                    {name}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
              {CRITERIA.map(({ name, weight, hex }) => (
                <div key={name} className="rounded-sm" style={{ width: weight, backgroundColor: hex }} />
              ))}
            </div>
          </div>

          <p className="text-[10px] sm:text-xs text-text-muted text-center mt-4 font-mono">
            + Bônus: Avaliação do Mentor Fixo | Vendas comprovadas | Internacionalização | Eixos de Governança
          </p>
        </div>
      </div>
    </section>
  )
}
