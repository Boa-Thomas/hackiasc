import { useEffect } from 'react'
import { EVENT_CONFIG } from '../lib/config'

const SPONSOR_TIERS = [
  {
    name: 'Naming',
    subtitle: 'Naming Rights',
    price: 'R$ 10.000',
    slots: '1 vaga exclusiva',
    highlight: true,
    tag: 'Máximo nível',
    benefits: [
      { title: 'Naming Rights', desc: 'O evento carrega o nome da sua empresa em todas as comunicações.' },
      { title: 'Abertura Oficial', desc: 'Fala institucional de 5 minutos na abertura do evento.' },
      { title: '5 Ingressos', desc: 'Cinco ingressos de participação inclusos para sua equipe.' },
      { title: 'Visibilidade Total', desc: 'Logo em destaque máximo no site, telões e todos os materiais. Reels fixado + posts no feed + Stories no Instagram do evento.' },
      { title: 'Comitê de Governança', desc: 'Participação no comitê de governança do evento.' },
      { title: 'Banco de Talentos', desc: 'Primeiro acesso à lista completa de participantes pós-evento.' },
      { title: 'Prêmio Próprio', desc: 'Possibilidade de ofertar premiação adicional com sua marca.' },
      { title: 'Stand Físico', desc: 'Espaço dedicado para ativação presencial da sua marca.' },
    ],
    idealFor: 'Empresas de tecnologia, cloud, IA, fintech, software houses',
  },
  {
    name: 'Co-Host',
    subtitle: 'Main Partner',
    price: 'R$ 6.000 – 8.000',
    slots: '2 vagas',
    tag: 'Protagonismo',
    benefits: [
      { title: 'Presented By', desc: 'Logo em destaque junto ao naming em todas as comunicações. Reels fixado no perfil do Instagram do evento.' },
      { title: 'Fala Institucional', desc: 'Pitch de 3–5 min na abertura ou encerramento.' },
      { title: '3 Ingressos', desc: 'Três ingressos de participação inclusos.' },
      { title: 'Prêmio Adicional', desc: 'Possibilidade de lançar premiação própria.' },
      { title: 'Indicação de Mentores', desc: 'Indique mentores técnicos da sua empresa.' },
      { title: 'Banco de Talentos', desc: 'Acesso ao banco de talentos pós-evento.' },
      { title: 'API / Ferramenta', desc: 'Inserir sua API ou ferramenta para uso pelos times durante o evento.' },
      { title: 'Stand / Ativação', desc: 'Espaço físico para ativação presencial.' },
    ],
    idealFor: 'Empresa local forte, software house relevante, posicionamento de ecossistema',
  },
  {
    name: 'Innovation Partner',
    subtitle: 'Parceiro de Inovação',
    price: 'R$ 4.500 – 5.500',
    slots: '2 vagas',
    tag: 'Mais procurada',
    benefits: [
      { title: 'Destaque Intermediário', desc: 'Logo com destaque intermediário em todos os materiais. Reels fixado no perfil do Instagram do evento.' },
      { title: '2 Ingressos', desc: 'Dois ingressos de participação inclusos.' },
      { title: 'Desafio Técnico', desc: 'Possibilidade de propor desafio técnico para os times.' },
      { title: 'API / Ferramenta', desc: 'Inserir sua API ou ferramenta para uso durante o evento.' },
      { title: 'Fala Curta / Painel', desc: 'Presença institucional com fala de 2 min ou painel.' },
      { title: 'Mentoria', desc: 'Indicação de mentor técnico da empresa.' },
      { title: 'Banco de Talentos', desc: 'Acesso ao banco de talentos pós-evento.' },
    ],
    idealFor: 'Startups maduras, SaaS, empresas de IA, fintechs',
  },
  {
    name: 'Tech Partner',
    subtitle: 'Parceiro Tecnológico',
    price: 'R$ 4.000 – 6.000',
    slots: '2 vagas',
    tag: 'Empresas de tech',
    benefits: [
      { title: 'Branding Médio', desc: 'Presença no site e materiais do evento. Reels no Instagram do evento.' },
      { title: '2 Ingressos', desc: 'Dois ingressos de participação inclusos.' },
      { title: 'API / Créditos', desc: 'Forneça API ou créditos para os participantes usarem.' },
      { title: 'Mentores', desc: 'Mentores indicados pela empresa.' },
      { title: 'Networking', desc: 'Acesso a participantes com networking direcionado.' },
      { title: 'Banco de Talentos', desc: 'Acesso ao banco de talentos pós-evento.' },
    ],
    idealFor: 'Empresas de tecnologia que amam hackathons',
  },
  {
    name: 'Startup Builder',
    subtitle: 'Parceiro Builder',
    price: 'R$ 2.000 – 3.000',
    slots: '3–4 vagas',
    tag: 'Entrada estratégica',
    benefits: [
      { title: 'Logo nos Materiais', desc: 'Presença visual em materiais e divulgação.' },
      { title: 'Divulgação', desc: 'Post no feed do Instagram do evento.' },
      { title: '1 Ingresso', desc: 'Um ingresso de participação incluso.' },
      { title: 'Presença no Evento', desc: 'Acesso ao evento e networking informal com participantes.' },
    ],
    idealFor: 'Contabilidade, jurídico, consultorias, empresas de serviços',
  },
  {
    name: 'Apoio',
    subtitle: 'Apoiador',
    price: 'R$ 500 – 1.500',
    priceNote: 'ou permuta',
    slots: 'Vagas flexíveis',
    tag: 'Permuta aceita',
    benefits: [
      { title: 'Logo', desc: 'Logo pequeno nos materiais do evento.' },
      { title: 'Citação', desc: 'Menção como apoiador nas comunicações.' },
      { title: 'Ativação Pontual', desc: 'Possível ativação como coffee, pizza, brindes.' },
    ],
    idealFor: 'Redução de custo direto: alimentação, brindes, infraestrutura',
  },
]

const EXPERIENCES = [
  {
    title: 'Coffee Break',
    price: '~R$ 1.800 por inserção',
    desc: 'O combustível dos devs. Destaque absoluto na área de alimentação nos momentos de maior networking.',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" />
      </svg>
    ),
  },
  {
    title: 'Happy Hour do Hacka',
    price: 'Sábado · Pós 20h',
    desc: 'Assine o momento de descompressão patrocinando a rodada de chopp no sábado à noite.',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      </svg>
    ),
  },
  {
    title: 'Momento Energético',
    price: 'Ativação na madrugada',
    desc: 'Distribuição de energéticos com liberação total para entregar adesivos e folders da sua marca.',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
  },
  {
    title: 'Copos Reutilizáveis',
    price: '3 dias de exposição contínua',
    desc: 'Sua logo nos copos oficiais presentes nas mesas — e levados pelos participantes ao final.',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.25-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
      </svg>
    ),
  },
  {
    title: 'Ação de Brindes (Swag)',
    price: 'Mínimo 100 unidades',
    desc: 'Camisetas, mochilas, itens de escritório: distribuição direta para todos os participantes.',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.75v16.5M2.25 12h19.5M6.375 17.25a4.875 4.875 0 004.875-4.875H6.375a4.875 4.875 0 004.875 4.875zm0-10.5a4.875 4.875 0 014.875 4.875h-4.875A4.875 4.875 0 016.375 6.75zm11.25 10.5a4.875 4.875 0 01-4.875-4.875h4.875a4.875 4.875 0 01-4.875 4.875zm0-10.5a4.875 4.875 0 00-4.875 4.875h4.875a4.875 4.875 0 00-4.875-4.875z" />
      </svg>
    ),
  },
]

function SectionLabel({ children }) {
  return (
    <span className="font-mono text-sm text-cyan tracking-wider uppercase">
      {children}
    </span>
  )
}

function TierCard({ tier, index }) {
  const headerStyles = [
    'bg-gradient-to-r from-cyan/20 to-electric/20 border-b border-cyan/30',
    'bg-electric/15 border-b border-electric/20',
    'bg-violet/15 border-b border-violet/20',
    'bg-cyan/10 border-b border-cyan/15',
    'bg-surface border-b border-dark-border',
    'bg-dark-card border-b border-dark-border',
  ]

  const accentColors = [
    'text-cyan',
    'text-electric',
    'text-violet',
    'text-cyan',
    'text-text-muted',
    'text-text-muted',
  ]

  const dotColors = [
    'bg-cyan',
    'bg-electric',
    'bg-violet',
    'bg-cyan',
    'bg-electric',
    'bg-text-muted',
  ]

  return (
    <div className={`card-glass rounded-2xl overflow-hidden ${index === 0 ? 'glow-cyan' : ''}`}>
      <div className={`p-6 sm:p-8 ${headerStyles[index]}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className={`inline-block text-[10px] font-bold uppercase tracking-widest ${accentColors[index]} mb-1`}>
              {tier.tag}
            </span>
            <h3 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
              {tier.name}
              <span className="text-text-muted text-lg font-normal ml-3">{tier.subtitle}</span>
            </h3>
          </div>
          <div className="text-right">
            <div className={`font-mono text-xl sm:text-2xl font-bold ${accentColors[index]}`}>
              {tier.price}
            </div>
            {tier.priceNote && (
              <div className="text-xs text-text-muted">{tier.priceNote}</div>
            )}
            <div className="text-xs text-text-muted mt-1">{tier.slots}</div>
          </div>
        </div>
      </div>

      <div className="p-6 sm:p-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 mb-6">
          {tier.benefits.map((b, i) => (
            <div key={i} className="flex gap-3">
              <div className={`w-1.5 h-1.5 rounded-full ${dotColors[index]} mt-2 flex-shrink-0`} />
              <div>
                <div className="text-sm font-semibold text-white">{b.title}</div>
                <p className="text-sm text-text-muted">{b.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-dark-border pt-4">
          <span className="text-xs font-mono text-text-muted uppercase tracking-wider">Perfil ideal: </span>
          <span className="text-xs text-white/80">{tier.idealFor}</span>
        </div>
      </div>
    </div>
  )
}

export default function SponsorshipPage({ onBack }) {
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  return (
    <div className="min-h-screen bg-dark text-white">
      {/* Decorative orbs */}
      <div className="orb w-96 h-96 bg-cyan/5 -top-48 -left-48" />
      <div className="orb w-80 h-80 bg-violet/5 top-96 -right-40" />

      {/* Back button */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Voltar ao site
        </button>
      </div>

      {/* Header */}
      <header className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-12 pb-16 border-b border-dark-border">
        <div className="bg-grid absolute inset-0 pointer-events-none" />
        <div className="relative">
          <SectionLabel>Proposta de Patrocínio · 2026</SectionLabel>

          <h1 className="font-display text-5xl sm:text-7xl md:text-8xl font-bold leading-[0.9] tracking-tighter mt-4 mb-6">
            AI HACKATHON{' '}
            <span className="text-gradient-cyan">BLUMENAU</span>
          </h1>

          <p className="text-lg sm:text-xl text-text-muted font-light max-w-2xl mb-8 leading-relaxed">
            Isso não é evento de branding. É um pipeline direto de inovação, recrutamento e validação técnica. 3 dias, código real, startups nascendo.
          </p>

          <div className="flex flex-wrap gap-6">
            {[
              { text: '29–31 de Maio de 2026' },
              { text: 'Centro de Inovação de Blumenau' },
              { text: '3 dias de imersão' },
            ].map((badge, i) => (
              <div key={i} className="flex items-center gap-2 text-xs sm:text-sm font-medium uppercase tracking-widest text-white/70">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan" />
                {badge.text}
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-24 space-y-24">
        {/* Why Invest */}
        <section>
          <SectionLabel>Por que investir</SectionLabel>
          <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold mt-3 mb-6">
            UM PIPELINE DIRETO DE{' '}
            <span className="text-gradient-cyan">INOVAÇÃO E TALENTO</span>
          </h2>
          <p className="text-text-muted text-base sm:text-lg font-light max-w-2xl mb-10 leading-relaxed">
            Durante 3 dias, os melhores desenvolvedores, designers e gestores da região estarão criando soluções reais baseadas em IA. Ao patrocinar, sua empresa se posiciona no centro do ecossistema de tecnologia regional.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                title: 'Employer Branding',
                desc: 'Conecte-se com os melhores talentos de tecnologia da região em um ambiente de alta intensidade.',
              },
              {
                title: 'Acesso Antecipado',
                desc: 'Banco de dados exclusivo de todos os participantes entregue ao patrocinador no pós-evento.',
              },
              {
                title: 'Sem Burocracia',
                desc: 'Formatos simples, focados em visibilidade e resultado real para sua marca.',
              },
            ].map((card, i) => (
              <div key={i} className="card-glass rounded-xl p-6">
                <div className="text-xs font-bold uppercase tracking-widest text-cyan mb-3">{card.title}</div>
                <p className="text-sm text-text-muted leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 card-glass rounded-xl p-6 border-l-4 border-l-cyan">
            <p className="text-sm text-text-muted leading-relaxed">
              <strong className="text-white font-semibold">Flexibilidade de investimento:</strong>{' '}
              Aceitamos cotas em <strong className="text-cyan">patrocínio financeiro ou permuta</strong> — produtos, serviços ou infraestrutura que agreguem valor direto à experiência dos participantes.
            </p>
          </div>
        </section>

        {/* Sponsor Tiers */}
        <section>
          <SectionLabel>Cotas de Patrocínio</SectionLabel>
          <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold mt-3 mb-10">
            ESCOLHA SEU NÍVEL DE{' '}
            <span className="text-gradient-violet">PRESENÇA</span>
          </h2>

          <div className="space-y-6">
            {SPONSOR_TIERS.map((tier, i) => (
              <TierCard key={tier.name} tier={tier} index={i} />
            ))}
          </div>
        </section>

        {/* Brand Experiences */}
        <section>
          <SectionLabel>Ativações À La Carte</SectionLabel>
          <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold mt-3 mb-6">
            EXPERIÊNCIAS DE{' '}
            <span className="text-gradient-fire">MARCA</span>
          </h2>
          <p className="text-text-muted text-base sm:text-lg font-light max-w-2xl mb-10 leading-relaxed">
            Crie momentos de utilidade real para os participantes. A logo da Cota Naming acompanhará os materiais junto com a sua marca.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {EXPERIENCES.map((exp, i) => (
              <div key={i} className="card-glass rounded-xl p-6 group">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-bold uppercase tracking-widest text-white group-hover:text-cyan transition-colors">
                    {exp.title}
                  </div>
                  <span className="text-cyan/50 group-hover:text-cyan/100 transition-opacity">
                    {exp.icon}
                  </span>
                </div>
                <div className="text-xs font-mono text-cyan uppercase tracking-widest mb-3">{exp.price}</div>
                <p className="text-sm text-text-muted leading-relaxed">{exp.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <footer className="pt-16 border-t border-dark-border">
          <div className="flex flex-col md:flex-row justify-between gap-12">
            <div className="max-w-md">
              <h2 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold leading-[0.9] mb-4">
                VAMOS FECHAR{' '}
                <span className="text-gradient-cyan">ESSA PARCERIA?</span>
              </h2>
              <p className="text-text-muted text-sm font-light mt-4">
                Personalizamos sua cota. Sem complicação.
              </p>
              <a
                href={EVENT_CONFIG.sponsorship.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-6 px-6 py-3 bg-cyan text-dark font-bold rounded-lg hover:bg-cyan/90 transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                Fale conosco no WhatsApp
              </a>
            </div>

            <div className="space-y-6">
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-cyan mb-1">
                  {EVENT_CONFIG.sponsorship.coordinator}
                </div>
                <div className="text-sm text-text-muted">{EVENT_CONFIG.sponsorship.role}</div>
              </div>

              <div className="space-y-4">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-cyan/60">Email</span>
                  <a href={`mailto:${EVENT_CONFIG.organizer.email}`} className="text-sm text-white hover:text-cyan transition-colors">
                    {EVENT_CONFIG.organizer.email}
                  </a>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-cyan/60">WhatsApp</span>
                  <a href={EVENT_CONFIG.sponsorship.whatsappUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-white hover:text-cyan transition-colors">
                    {EVENT_CONFIG.sponsorship.whatsapp}
                  </a>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-cyan/60">Site</span>
                  <a href="https://hackiasc.com" target="_blank" rel="noopener noreferrer" className="text-sm text-white hover:text-cyan transition-colors">
                    hackiasc.com
                  </a>
                </div>
              </div>
            </div>
          </div>
        </footer>
      </main>
    </div>
  )
}
