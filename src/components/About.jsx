const PILLARS = [
  {
    icon: '{ }',
    title: 'Hacker',
    desc: 'Desenvolvedor. Transforma ideias em codigo funcional com IA no centro.',
    color: 'cyan',
  },
  {
    icon: '$',
    title: 'Hustler',
    desc: 'Negocios e vendas. Valida o problema, acha o cliente, fecha a venda.',
    color: 'electric',
  },
  {
    icon: '*',
    title: 'Hipster',
    desc: 'Design e UX. Cria experiencias que as pessoas querem usar.',
    color: 'violet',
  },
]

const AXES = [
  'Metalmecanico', 'Textil', 'TIC', 'Turismo', 'Economia Criativa', 'Saude'
]

export default function About() {
  return (
    <section id="sobre" className="relative py-24 sm:py-32">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Section header */}
        <div className="text-center mb-16">
          <span className="font-mono text-sm text-electric tracking-wider uppercase">Sobre o Evento</span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mt-4 mb-6">
            Nao e so um hackathon.
            <br />
            <span className="text-gradient-cyan">E o inicio da sua startup.</span>
          </h2>
          <p className="text-text-muted text-lg max-w-2xl mx-auto">
            O foco e gerar negocios que lucram, sao escalaveis, resolvem problemas reais
            e podem ser internacionalizados. Uso de IA e obrigatorio.
          </p>
        </div>

        {/* Founder profiles */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {PILLARS.map(({ icon, title, desc, color }) => (
            <div key={title} className="card-glass rounded-2xl p-8 text-center group">
              <div className={`inline-flex items-center justify-center w-16 h-16 rounded-xl bg-${color}/10 border border-${color}/20 mb-6 font-mono text-2xl text-${color} group-hover:scale-110 transition-transform`}>
                {icon}
              </div>
              <h3 className="text-xl font-bold text-white mb-3">{title}</h3>
              <p className="text-text-muted text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        {/* Governance axes */}
        <div className="card-glass rounded-2xl p-8 sm:p-10">
          <h3 className="text-lg font-bold text-white mb-2">Pontuacao Extra</h3>
          <p className="text-text-muted text-sm mb-6">
            Projetos que atacam dores dentro dos eixos de governanca de Blumenau
            recebem bonificacao na nota final:
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            {AXES.map((axis) => (
              <span
                key={axis}
                className="px-4 py-2 rounded-full text-sm font-mono border border-gold/20 bg-gold/5 text-gold"
              >
                {axis}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
