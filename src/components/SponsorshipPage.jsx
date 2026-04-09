import { useEffect } from 'react'
import { EVENT_CONFIG } from '../lib/config'
import { sponsorshipStrings } from '../lib/sponsorship-i18n'

const EXPERIENCE_ICONS = [
  <svg key="coffee" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" />
  </svg>,
  <svg key="happy" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
  </svg>,
  <svg key="energy" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
  </svg>,
  <svg key="cups" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.25-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
  </svg>,
  <svg key="swag" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.75v16.5M2.25 12h19.5M6.375 17.25a4.875 4.875 0 004.875-4.875H6.375a4.875 4.875 0 004.875 4.875zm0-10.5a4.875 4.875 0 014.875 4.875h-4.875A4.875 4.875 0 016.375 6.75zm11.25 10.5a4.875 4.875 0 01-4.875-4.875h4.875a4.875 4.875 0 01-4.875 4.875zm0-10.5a4.875 4.875 0 00-4.875 4.875h4.875a4.875 4.875 0 00-4.875-4.875z" />
  </svg>,
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
    'bg-surface border-b border-dark-border',
    'bg-dark-card border-b border-dark-border',
  ]

  const accentColors = [
    'text-cyan',
    'text-electric',
    'text-violet',
    'text-text-muted',
    'text-text-muted',
  ]

  const dotColors = [
    'bg-cyan',
    'bg-electric',
    'bg-violet',
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

      </div>
    </div>
  )
}

export default function SponsorshipPage({ onBack, lang = 'pt-BR' }) {
  const t = sponsorshipStrings[lang]
  const langToggleHash = lang === 'pt-BR' ? '#sponsorship' : '#patrocinio'

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  const experiences = t.experiences.map((exp, i) => ({ ...exp, icon: EXPERIENCE_ICONS[i] }))

  return (
    <div className="min-h-screen bg-dark text-white">
      {/* Decorative orbs */}
      <div className="orb w-96 h-96 bg-cyan/5 -top-48 -left-48" />
      <div className="orb w-80 h-80 bg-violet/5 top-96 -right-40" />

      {/* Back button + language toggle */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          {t.ui.backToSite}
        </button>
        <a
          href={langToggleHash}
          className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
          </svg>
          {t.ui.langToggle}
        </a>
      </div>

      {/* Header */}
      <header className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-12 pb-16 border-b border-dark-border">
        <div className="bg-grid absolute inset-0 pointer-events-none" />
        <div className="relative">
          <SectionLabel>{t.ui.proposalLabel}</SectionLabel>

          <h1 className="font-display text-5xl sm:text-7xl md:text-8xl font-bold leading-[0.9] tracking-tighter mt-4 mb-6">
            AI HACKATHON{' '}
            <span className="text-gradient-cyan">BLUMENAU</span>
          </h1>

          <p className="text-lg sm:text-xl text-text-muted font-light max-w-2xl mb-8 leading-relaxed">
            {t.ui.heroDesc}
          </p>

          <div className="flex flex-wrap gap-6">
            {t.ui.badges.map((badge, i) => (
              <div key={i} className="flex items-center gap-2 text-xs sm:text-sm font-medium uppercase tracking-widest text-white/70">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan" />
                {badge}
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-24 space-y-24">
        {/* Why Invest */}
        <section>
          <SectionLabel>{t.ui.whyInvestLabel}</SectionLabel>
          <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold mt-3 mb-6">
            {t.ui.whyInvestTitle}{' '}
            <span className="text-gradient-cyan">{t.ui.whyInvestHighlight}</span>
          </h2>
          <p className="text-text-muted text-base sm:text-lg font-light max-w-2xl mb-10 leading-relaxed">
            {t.ui.whyInvestDesc}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {t.ui.whyInvestCards.map((card, i) => (
              <div key={i} className="card-glass rounded-xl p-6">
                <div className="text-xs font-bold uppercase tracking-widest text-cyan mb-3">{card.title}</div>
                <p className="text-sm text-text-muted leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 card-glass rounded-xl p-6 border-l-4 border-l-cyan">
            <p className="text-sm text-text-muted leading-relaxed">
              <strong className="text-white font-semibold">{t.ui.flexPrefix}</strong>{' '}
              {t.ui.flexBody} <strong className="text-cyan">{t.ui.flexHighlight}</strong> {t.ui.flexSuffix}
            </p>
          </div>
        </section>

        {/* Sponsor Tiers */}
        <section>
          <SectionLabel>{t.ui.tiersLabel}</SectionLabel>
          <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold mt-3 mb-10">
            {t.ui.tiersTitle}{' '}
            <span className="text-gradient-violet">{t.ui.tiersHighlight}</span>
          </h2>

          <div className="space-y-6">
            {t.tiers.map((tier, i) => (
              <TierCard key={tier.name} tier={tier} index={i} />
            ))}
          </div>
        </section>

        {/* Brand Experiences */}
        <section>
          <SectionLabel>{t.ui.experiencesLabel}</SectionLabel>
          <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold mt-3 mb-6">
            {t.ui.experiencesTitle}{' '}
            <span className="text-gradient-fire">{t.ui.experiencesHighlight}</span>
          </h2>
          <p className="text-text-muted text-base sm:text-lg font-light max-w-2xl mb-10 leading-relaxed">
            {t.ui.experiencesDesc}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {experiences.map((exp, i) => (
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
                {t.ui.ctaTitle}{' '}
                <span className="text-gradient-cyan">{t.ui.ctaHighlight}</span>
              </h2>
              <p className="text-text-muted text-sm font-light mt-4">
                {t.ui.ctaSubtitle}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 mt-6">
                <a
                  href={EVENT_CONFIG.sponsorship.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-cyan text-dark font-bold rounded-lg hover:bg-cyan/90 transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  {t.ui.ctaButtonVini}
                </a>
                <a
                  href="https://wa.me/5547988895675"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-violet text-white font-bold rounded-lg hover:bg-violet/90 transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  {t.ui.ctaButtonLycia}
                </a>
              </div>
            </div>

            <div className="space-y-8">
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-cyan mb-1">
                  {EVENT_CONFIG.sponsorship.coordinator}
                </div>
                <div className="text-sm text-text-muted">{t.ui.contactRole}</div>
                <a href={EVENT_CONFIG.sponsorship.whatsappUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-white/60 hover:text-cyan transition-colors">
                  {EVENT_CONFIG.sponsorship.whatsapp}
                </a>
              </div>

              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-violet mb-1">
                  Lycia Barbosa
                </div>
                <div className="text-sm text-text-muted">{t.ui.lyciaRole}</div>
                <a href="https://wa.me/5547988895675" target="_blank" rel="noopener noreferrer" className="text-sm text-white/60 hover:text-violet transition-colors">
                  +55 47 9 8889-5675
                </a>
              </div>

              <div className="space-y-3">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-cyan/60">{t.ui.emailLabel}</span>
                  <a href={`mailto:${EVENT_CONFIG.organizer.email}`} className="text-sm text-white hover:text-cyan transition-colors">
                    {EVENT_CONFIG.organizer.email}
                  </a>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-cyan/60">{t.ui.siteLabel}</span>
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
