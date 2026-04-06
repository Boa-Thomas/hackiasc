const DAYS = [
  {
    day: 'Sexta',
    date: '22/05',
    time: '18:30 - 22:00',
    color: 'cyan',
    events: [
      { time: '18:30', title: 'Abertura', desc: 'Apresentacao da organizacao, mentores, patrocinadores e dinamica do evento.' },
      { time: '19:30', title: 'Formacao de Times', desc: 'Equipes com vagas fazem pitch. Individuais se apresentam em 30s.' },
      { time: '20:30', title: 'Sessao Hard 1', desc: 'Eixos de Governanca de Blumenau, internacionalizacao e IA aplicada.' },
    ],
  },
  {
    day: 'Sabado',
    date: '23/05',
    time: '09:00 - 22:00',
    color: 'electric',
    events: [
      { time: '10:00', title: 'Sessao Hard 2', desc: 'Validacao de problema real. Se nao e validado, voce perde pontos.' },
      { time: '15:00', title: 'Sessao Hard 3', desc: 'Escalabilidade e Modelo de Negocio.' },
      { time: '19:00', title: 'Pitch de Guerrilha 1', desc: 'Mentores visitam outros grupos para ouvir e criticar solucoes.' },
    ],
  },
  {
    day: 'Domingo',
    date: '24/05',
    time: '09:00 - 20:00',
    color: 'violet',
    events: [
      { time: '10:00', title: 'Sessao Hard 4', desc: 'Construcao de Pitch de Alta Performance.' },
      { time: '14:00', title: 'Pitch de Guerrilha 2', desc: 'Ultima rodada de validacao cruzada entre equipes.' },
      { time: '17:30', title: 'Entrega Final', desc: 'Pitch, codigo e solucao. Nao sera permitido alteracoes apos esse horario.' },
      { time: '18:00', title: 'Pitchs Finais', desc: '3min pitch + 1min demo + 5min Q&A + 1min jurados testam.' },
    ],
  },
]

export default function Timeline() {
  return (
    <section id="cronograma" className="relative py-24 sm:py-32 bg-grid">
      <div className="orb w-[400px] h-[400px] bg-electric/10 top-0 right-0 animate-pulse-glow" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-16">
          <span className="font-mono text-sm text-electric tracking-wider uppercase">Cronograma</span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mt-4">
            <span className="text-gradient-violet">3 dias</span> para criar o futuro
          </h2>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {DAYS.map(({ day, date, time, color, events }) => (
            <div key={day} className="card-glass rounded-2xl overflow-hidden">
              {/* Day header */}
              <div className={`px-6 py-5 border-b border-dark-border bg-${color}/5`}>
                <div className="flex items-baseline justify-between">
                  <h3 className={`text-2xl font-bold text-${color}`}>{day}</h3>
                  <span className="font-mono text-sm text-text-muted">{date}</span>
                </div>
                <p className="font-mono text-xs text-text-muted mt-1">{time}</p>
              </div>

              {/* Events */}
              <div className="p-6 space-y-5">
                {events.map(({ time: t, title, desc }) => (
                  <div key={title} className="flex gap-4">
                    <div className="flex-shrink-0">
                      <span className={`font-mono text-xs text-${color} bg-${color}/10 px-2 py-1 rounded`}>
                        {t}
                      </span>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white mb-1">{title}</h4>
                      <p className="text-xs text-text-muted leading-relaxed">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-text-muted mt-8 font-mono">
          * Alimentacao completa inclusa (cafe, almoco, jantar). Cronograma sujeito a ajustes.
        </p>
      </div>
    </section>
  )
}
