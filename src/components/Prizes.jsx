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
    value: 'Beneficios',
    desc: 'Consultorias e beneficios exclusivos (a divulgar).',
    color: 'hot',
    featured: false,
  },
]

const CRITERIA = [
  { name: 'Execucao Tecnica e IA', weight: '30%', color: 'cyan' },
  { name: 'Validacao do Problema', weight: '25%', color: 'electric' },
  { name: 'Escalabilidade e Negocio', weight: '25%', color: 'violet' },
  { name: 'Pitch e Equipe', weight: '20%', color: 'hot' },
]

export default function Prizes() {
  return (
    <section id="premios" className="relative py-24 sm:py-32">
      <div className="orb w-[350px] h-[350px] bg-gold/10 top-20 -left-40 animate-pulse-glow" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-16">
          <span className="font-mono text-sm text-gold tracking-wider uppercase">Premiacao</span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mt-4">
            <span className="text-gradient-fire">R$ 9.000+</span> em premios
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

        {/* Evaluation criteria */}
        <div className="card-glass rounded-2xl p-8 sm:p-10">
          <h3 className="text-xl font-bold text-white mb-6 text-center">Criterios de Avaliacao</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            {CRITERIA.map(({ name, weight, color }) => (
              <div key={name} className="flex items-center gap-4 p-4 rounded-xl bg-dark/50">
                <span className={`font-mono text-2xl font-bold text-${color} w-16 text-right`}>
                  {weight}
                </span>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-white">{name}</div>
                  <div className={`mt-2 h-1.5 rounded-full bg-dark-border overflow-hidden`}>
                    <div
                      className={`h-full rounded-full bg-${color}`}
                      style={{ width: weight }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-text-muted text-center mt-6 font-mono">
            + Bonus: Avaliacao do Mentor Fixo | Vendas comprovadas | Internacionalizacao | Eixos de Governanca
          </p>
        </div>
      </div>
    </section>
  )
}
