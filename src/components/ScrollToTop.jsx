import { useState, useEffect } from 'react'

export default function ScrollToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > 500)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <button
      onClick={scrollToTop}
      aria-label="Voltar ao topo"
      className={`fixed right-4 sm:right-6 z-40 p-3 flex items-center justify-center rounded-full bg-gradient-to-tr from-[#0a0a20] to-[#12123a] border border-[#3a86ff]/30 text-[#3a86ff] hover:text-white transition-all duration-300 shadow-[0_0_20px_rgba(58,134,255,0.15)] hover:shadow-[0_0_30px_rgba(58,134,255,0.4)] hover:scale-110 hover:border-[#3a86ff] ${
        visible ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-10 pointer-events-none'
      }`}
      style={{ bottom: '130px' }}
    >
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
      </svg>
    </button>
  )
}
