import { useState, useEffect } from 'react'

const NAV_LINKS = [
  { href: '#sobre', label: 'Sobre' },
  { href: '#cronograma', label: 'Cronograma' },
  { href: '#premios', label: 'Prêmios' },
  { href: '#inscricao', label: 'Inscrição' },
  { href: '#faq', label: 'FAQ' },
]

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      scrolled
        ? 'bg-dark/90 backdrop-blur-xl border-b border-dark-border shadow-lg shadow-black/20'
        : 'bg-transparent'
    }`}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
        <a href="#" className="flex items-center gap-2 group">
          <span className="font-mono text-lg font-bold tracking-tight">
            <span className="text-cyan">{'>'}</span>
            <span className="text-white group-hover:text-cyan transition-colors">hack</span>
            <span className="text-gradient-cyan">IA</span>
            <span className="text-text-muted">.sc</span>
          </span>
        </a>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="px-3 py-2 text-sm text-text-muted hover:text-white transition-colors rounded-lg hover:bg-white/5"
            >
              {label}
            </a>
          ))}
          <a
            href="#inscricao"
            className="ml-3 px-4 py-2 text-sm font-semibold bg-cyan/10 text-cyan border border-cyan/30 rounded-lg hover:bg-cyan/20 hover:border-cyan/50 transition-all"
          >
            Inscreva-se
          </a>
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setOpen(!open)}
          className="md:hidden p-2 text-text-muted hover:text-white"
          aria-label="Menu"
        >
          <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? (
              <path d="M6 6l12 12M6 18L18 6" />
            ) : (
              <path d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-dark/95 backdrop-blur-xl border-b border-dark-border">
          <div className="px-4 py-4 flex flex-col gap-2">
            {NAV_LINKS.map(({ href, label }) => (
              <a
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="px-4 py-3 text-text-muted hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              >
                {label}
              </a>
            ))}
            <a
              href="#inscricao"
              onClick={() => setOpen(false)}
              className="mt-2 px-4 py-3 text-center font-semibold bg-cyan/10 text-cyan border border-cyan/30 rounded-lg"
            >
              Inscreva-se
            </a>
          </div>
        </div>
      )}
    </nav>
  )
}
