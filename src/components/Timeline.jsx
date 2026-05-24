const DAYS = [
  {
    day: 'Sexta',
    date: '29/05',
    time: '18:30 - 22:00',
    color: 'cyan',
    events: [
      { time: '18:30', title: 'Welcome Coffee', desc: 'Recepção e networking.' },
      { time: '19:00', title: 'Abertura', desc: 'Organização, facilitadora, patrocinadores, mentores, dinâmica do evento e critérios de avaliação.' },
      { time: '19:45', title: 'Formação de Times', desc: 'Equipes com vagas fazem pitch. Individuais se apresentam em 30s para entrar em um time.' },
      { time: '20:20', title: 'Sessão Hard 1 — Basics First', desc: 'Eixos de Governança de Blumenau, internacionalização e IA aplicada ao seu produto.' },
      { time: '21:00', title: 'Próximos Passos', desc: 'O que fazer no sábado e os pontos que você precisa trazer prontos.' },
    ],
  },
  {
    day: 'Sábado',
    date: '30/05',
    time: '09:00 - 22:00',
    color: 'electric',
    events: [
      { time: '09:00', title: 'Café da Manhã e Trabalho', desc: 'Horário de abertura a confirmar — detalhes por e-mail e WhatsApp.' },
      { time: '10:00', title: 'Sessão Hard 2 — O seu problema é real?', desc: 'Validação de problema. Se não é validado, você perde pontos.' },
      { time: '11:00', title: 'Working Time', desc: 'Continue criando a sua solução.' },
      { time: '12:00', title: 'Almoço e Trabalho', desc: 'Alimentação completa inclusa.' },
      { time: '15:00', title: 'Sessão Hard 3 — Escalabilidade e Negócio', desc: 'Modelo de negócio e como lucrar com a solução.' },
      { time: '16:00', title: 'Working Time', desc: 'Continue criando. Ideal ter um MVP até esse horário.' },
      { time: '19:00', title: 'Pitch de Guerrilha 1', desc: 'Mentores visitam outros grupos para ouvir e criticar soluções.' },
      { time: '21:00', title: 'Avisos + Jantar', desc: 'Avisos da organização seguidos de jantar.' },
    ],
  },
  {
    day: 'Domingo',
    date: '31/05',
    time: '09:00 - 20:00',
    color: 'violet',
    events: [
      { time: '09:00', title: 'Café da Manhã', desc: 'Horário de abertura a confirmar — detalhes por e-mail e WhatsApp.' },
      { time: '10:00', title: 'Sessão Hard 4 — Pitch de Alta Performance', desc: 'Construção de um pitch que impressiona.' },
      { time: '10:30', title: 'Pitch de Guerrilha 2', desc: 'Última rodada de validação cruzada entre equipes.' },
      { time: '14:00', title: 'Banca de Pré-Pitch 1', desc: 'Primeira rodada de avaliação prévia.' },
      { time: '15:30', title: 'Banca de Pré-Pitch 2', desc: 'Segunda rodada de avaliação prévia.' },
      { time: '17:30', title: 'Entrega Final', desc: 'Pitch, código e solução. Não será permitido alterações após esse horário.' },
      { time: '18:00', title: 'Pitchs Finais e Premiação', desc: '3min pitch + 1min demo + 5min Q&A + 1min jurados testam. Cerimônia de premiação.' },
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
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className={`text-xl sm:text-2xl font-bold text-${color}`}>{day}</h3>
                  <span className="font-mono text-xs sm:text-sm text-text-muted">{date}</span>
                </div>
                <p className="font-mono text-[10px] sm:text-xs text-text-muted mt-1">{time}</p>
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
          * Alimentação completa inclusa (café, almoço, jantar). Cronograma sujeito a ajustes.
        </p>
      </div>
    </section>
  )
}
