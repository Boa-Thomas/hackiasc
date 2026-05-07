const ITEMS = [
  {
    title: 'Lean Canvas',
    desc: 'Modelo guiado para você preencher antes do evento e estruturar a proposta de valor da sua solução.',
  },
  {
    title: 'SLC (Service Logic Canvas)',
    desc: 'Ferramenta para mapear a jornada e os pontos de contato do seu produto com o cliente.',
  },
  {
    title: 'Envio de Apresentação',
    desc: 'Upload do pitch deck final + envio das demais entregas exigidas no edital.',
  },
  {
    title: 'Recursos & Templates',
    desc: 'Materiais de apoio, contatos de mentores, templates de apresentação e checklist de entregas.',
  },
  {
    title: 'Avisos e Cronograma Detalhado',
    desc: 'Comunicações da organização e ajustes em tempo real durante os 3 dias de evento.',
  },
]

export default function ComingSoon() {
  return (
    <div className="card-glass rounded-2xl p-6">
      <div className="mb-6">
        <p className="text-xs font-mono text-electric uppercase tracking-wider">Em breve</p>
        <h2 className="text-xl font-bold text-white mt-1">Recursos do evento</h2>
        <p className="text-sm text-text-muted mt-1">
          Estes recursos serão liberados conforme nos aproximamos do evento (29-31/05). Você verá tudo aqui.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {ITEMS.map(({ title, desc }) => (
          <div
            key={title}
            className="p-4 rounded-xl border border-dark-border bg-dark/50 relative overflow-hidden"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <h3 className="text-sm font-semibold text-white">{title}</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-violet/10 text-violet border border-violet/20 whitespace-nowrap">
                em breve
              </span>
            </div>
            <p className="text-xs text-text-muted leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-text-muted mt-6 text-center">
        Dúvidas? Fale com a organização em{' '}
        <a href="mailto:contato@hackiasc.com" className="text-electric underline">
          contato@hackiasc.com
        </a>
      </p>
    </div>
  )
}
