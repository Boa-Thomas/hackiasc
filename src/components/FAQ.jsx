import { useState } from 'react'

const QUESTIONS = [
  {
    q: 'Preciso ter uma equipe formada para me inscrever?',
    a: 'Não! Você pode se inscrever individualmente. Na noite de abertura (22/05), haverá uma dinâmica para formar ou completar equipes. Você fará um pitch de 30 segundos sobre si mesmo para entrar em um time.',
  },
  {
    q: 'Quantas pessoas pode ter em uma equipe?',
    a: 'Mínimo 3, máximo 6 participantes. A equipe pode ter apenas 1 membro remoto, mas 80%+ devem estar fisicamente presentes. Recomendamos a composição: Hacker (dev), Hustler (negócios) e Hipster (design).',
  },
  {
    q: 'O que está incluso na inscrição?',
    a: 'Alimentação completa (café, almoço, jantar) durante os 3 dias, crachá de identificação e kit do participante. Você precisa trazer seu notebook, cabos e qualquer hardware necessário.',
  },
  {
    q: 'Posso usar IA generativa (Copilot, ChatGPT, Claude)?',
    a: 'Sim! Ferramentas de IA generativa são permitidas como auxiliares. Código pré-existente também, desde que declarado antes do pitch final. A equipe deve ser capaz de explicar todo o código apresentado.',
  },
  {
    q: 'Como funciona a avaliação?',
    a: 'Banca de 3-5 jurados (empreendedores e investidores). Cada equipe faz: 3min de pitch + 1min de demo com código funcional + 5min de Q&A + 1min para jurados testarem a solução. Os pitchs também são analisados por IA.',
  },
  {
    q: 'Preciso ter vendas durante o evento?',
    a: 'Não é obrigatório, mas equipes com evidências de tração comercial (vendas, pré-vendas, LOIs, landing pages com conversão) recebem pontuação extra. Vendas para parentes diretos não contam.',
  },
  {
    q: 'Qual a política de cancelamento?',
    a: 'Reembolso integral em até 7 dias após a compra (CDC). Até 10 dias antes: reembolso de 50%. Menos de 10 dias: sem reembolso. No-show não gera devolução.',
  },
  {
    q: 'Quem fica com a propriedade intelectual?',
    a: 'Toda PI (código, designs, algoritmos, modelos de negócio) pertence exclusivamente à equipe. A organização não detém nenhum direito ou participação societária sobre as soluções.',
  },
]

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-b border-dark-border last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-start gap-4 py-5 text-left group"
      >
        <span className={`flex-shrink-0 mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center text-xs font-mono transition-all ${
          open ? 'bg-cyan/10 text-cyan rotate-45' : 'bg-dark-border text-text-muted'
        }`}>
          +
        </span>
        <span className={`text-sm font-semibold transition-colors ${open ? 'text-white' : 'text-text-muted group-hover:text-white'}`}>
          {q}
        </span>
      </button>
      {open && (
        <div className="pb-5 pl-10 pr-4">
          <p className="text-sm text-text-muted leading-relaxed">{a}</p>
        </div>
      )}
    </div>
  )
}

export default function FAQ() {
  return (
    <section id="faq" className="relative py-24 sm:py-32">
      <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <span className="font-mono text-sm text-electric tracking-wider uppercase">FAQ</span>
          <h2 className="text-3xl sm:text-4xl font-bold mt-4">
            Perguntas <span className="text-gradient-violet">Frequentes</span>
          </h2>
        </div>

        <div className="card-glass rounded-2xl p-6 sm:p-8">
          {QUESTIONS.map(({ q, a }) => (
            <FAQItem key={q} q={q} a={a} />
          ))}
        </div>
      </div>
    </section>
  )
}
