export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center bg-grid overflow-hidden">
      {/* Orbs */}
      <div className="orb w-[500px] h-[500px] bg-electric/20 -top-40 -left-40 animate-pulse-glow" />
      <div className="orb w-[400px] h-[400px] bg-violet/20 -bottom-32 -right-32 animate-pulse-glow" style={{ animationDelay: '1.5s' }} />
      <div className="orb w-[300px] h-[300px] bg-cyan/10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-float" />

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 text-center pt-24 pb-20">
        {/* Badge */}
        <div className="animate-slide-up inline-flex items-center gap-2 px-4 py-2 rounded-full border border-cyan/20 bg-cyan/5 text-cyan text-sm font-mono mb-8">
          <span className="w-2 h-2 rounded-full bg-cyan animate-pulse" />
          29 - 31 de Maio de 2026
        </div>

        {/* Title */}
        <h1 className="animate-slide-up text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-extrabold leading-[0.95] tracking-tight mb-6" style={{ animationDelay: '100ms' }}>
          <span className="text-white">AI Hackathon</span>
          <br />
          <span className="text-gradient-cyan">Blumenau 2026</span>
        </h1>

        {/* Subtitle */}
        <p className="animate-slide-up text-lg sm:text-xl text-text-muted max-w-2xl mx-auto mb-4" style={{ animationDelay: '200ms' }}>
          Crie startups reais e escaláveis com Inteligência Artificial.
          <br className="hidden sm:block" />
          3 dias. 1 objetivo: sair daqui com um negócio.
        </p>

        {/* Location */}
        <p className="animate-slide-up text-sm text-text-muted font-mono mb-10" style={{ animationDelay: '300ms' }}>
          <a
            href="https://maps.google.com/?q=Centro+de+Inovação+de+Blumenau+CIB+Rua+São+Paulo+3366+Blumenau+SC"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-cyan transition-colors"
          >
            <span className="text-electric">@</span> CIB — R. São Paulo, 3366 — Itoupava Seca, Blumenau, SC
          </a>
        </p>

        {/* CTAs */}
        <div className="animate-slide-up flex flex-col sm:flex-row items-center justify-center gap-4" style={{ animationDelay: '400ms' }}>
          <a
            href="#inscricao"
            className="group relative px-8 py-4 bg-gradient-to-r from-cyan to-electric text-dark font-bold text-lg rounded-xl transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(6,214,160,0.3)]"
          >
            Inscreva-se Agora
            <span className="absolute inset-0 rounded-xl bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
          </a>
          <a
            href="#sobre"
            className="px-8 py-4 text-text-muted hover:text-white border border-dark-border hover:border-text-muted rounded-xl transition-all"
          >
            Saiba Mais
          </a>
        </div>

        {/* Stats */}
        <div className="animate-slide-up mt-16 grid grid-cols-3 gap-3 sm:gap-8 max-w-lg mx-auto" style={{ animationDelay: '500ms' }}>
          {[
            { value: '3', label: 'Dias' },
            { value: 'R$9k+', label: 'Prêmios' },
            { value: '60-100', label: 'Pessoas' },
          ].map(({ value, label }) => (
            <div key={label} className="text-center">
              <div className="text-xl sm:text-3xl font-bold font-mono text-white">{value}</div>
              <div className="text-[10px] sm:text-sm text-text-muted mt-1">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-dark to-transparent" />
    </section>
  )
}
