import { useState, useEffect } from 'react'
import { EVENT_CONFIG } from '../lib/config'

function useCountdown(targetDate) {
  const calc = () => {
    const diff = new Date(targetDate) - new Date()
    if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true }
    return {
      days:    Math.floor(diff / (1000 * 60 * 60 * 24)),
      hours:   Math.floor((diff / (1000 * 60 * 60)) % 24),
      minutes: Math.floor((diff / (1000 * 60)) % 60),
      seconds: Math.floor((diff / 1000) % 60),
      expired: false,
    }
  }
  const [t, setT] = useState(calc)
  useEffect(() => {
    const id = setInterval(() => setT(calc()), 1000)
    return () => clearInterval(id)
  }, [targetDate])
  return t
}

function Digit({ value, label }) {
  const str = String(value).padStart(2, '0')
  return (
    <div className="flex flex-col items-center gap-[2px] sm:gap-[3px]">
        className="bg-black/35 border border-white/25 rounded-md sm:rounded-lg font-mono font-black text-white text-center flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.5)]"
        style={{
          padding: '4px 8px',
          fontSize: 'clamp(18px, 4vw, 34px)',
          minWidth: 'clamp(42px, 8vw, 54px)',
          letterSpacing: '-1px',
        }}>
        {str}
      </div>
      <span className="text-[7px] sm:text-[8px] uppercase tracking-[1px] sm:tracking-[2px] text-white/55 font-mono font-bold">
        {label}
      </span>
    </div>
  )
}

export default function CountdownFloat() {
  const [dismissed, setDismissed] = useState(false)
  const [visible, setVisible] = useState(false)
  const { days, hours, minutes, seconds, expired } = useCountdown(EVENT_CONFIG.loteDeadline)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 1500)
    return () => clearTimeout(t)
  }, [])

  if (dismissed || expired) return null

  return (
    <>
      <style>{`
        @keyframes ctaShake {
          0%, 92%, 100% { transform: scale(1); }
          94% { transform: scale(1.04); }
          96% { transform: scale(0.98); }
          98% { transform: scale(1.03); }
        }
        @keyframes priceBlink {
          0%, 80%, 100% { opacity: 1; }
          85% { opacity: 0.4; }
        }
        @keyframes hotDot {
          0%, 100% { transform: scale(1); opacity: 1; box-shadow: 0 0 8px #ff006e, 0 0 16px #ff006e44; }
          50% { transform: scale(1.4); opacity: 0.8; box-shadow: 0 0 14px #ff006e, 0 0 28px #ff006e66; }
        }
        @keyframes stripShimmer {
          0% { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
        .urgency-cta:hover {
          filter: brightness(1.12);
          transform: scale(1.03);
        }
      `}</style>

      <div style={{
        position: 'fixed',
        bottom: 0, left: 0, right: 0,
        zIndex: 400,
        transform: visible ? 'translateY(0)' : 'translateY(110%)',
        transition: 'transform 0.55s cubic-bezier(0.34, 1.4, 0.64, 1)',
      }}>

        {/* Strip animada no topo — 3px vibrante */}
        <div style={{
          height: '3px',
          background: 'linear-gradient(90deg, #ff006e, #8338ec, #3a86ff, #06d6a0, #ff006e)',
          backgroundSize: '300% 100%',
          animation: 'stripShimmer 3s linear infinite',
        }} />

        {/* Corpo da barra */}
        <div 
          className="flex flex-col md:flex-row items-center justify-center md:justify-between gap-3 md:gap-4 p-4 md:py-3 md:px-8 lg:px-14 relative overflow-hidden"
          style={{
            /* gradiente vibrante que rompe com o dark do site */
            background: 'linear-gradient(100deg, #1a0533 0%, #2d0a5e 30%, #1e0b45 60%, #0f1535 100%)',
            borderTop: '1px solid rgba(131,56,236,0.6)',
            boxShadow: '0 -12px 60px rgba(131,56,236,0.35), 0 -2px 0 rgba(255,0,110,0.2)',
        }}>

          {/* Glow radial de fundo */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'radial-gradient(ellipse 60% 120% at 50% 100%, rgba(131,56,236,0.18) 0%, transparent 70%)',
          }} />

          {/* ── ESQUERDA: Mensagem de urgência ── */}
          <div className="flex flex-col items-center md:items-start gap-1 shrink-0 z-10">
            <div className="flex items-center gap-2">
              {/* Dot pulsante */}
              <span style={{
                display: 'inline-block',
                width: '9px', height: '9px',
                borderRadius: '50%',
                background: '#ff006e',
                animation: 'hotDot 1.2s ease-in-out infinite',
                flexShrink: 0,
              }} />
              <span style={{
                fontFamily: 'Sora, sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(13px, 1.5vw, 19px)',
                color: '#fff',
                letterSpacing: '0.3px',
                whiteSpace: 'nowrap',
              }}>
                🔥 Virada de Lote em:
              </span>
            </div>
            {/* Preço atual */}
            <div className="flex items-center justify-center md:justify-start gap-1 md:pl-[17px]">
              <span style={{
                fontFamily: 'Sora, sans-serif',
                fontSize: 'clamp(11px, 1.2vw, 14px)',
                color: '#06d6a0',
                fontWeight: 700,
              }}>
                Lote atual: R$ 200,00
              </span>
            </div>
          </div>

          {/* ── CENTRO: Countdown ── */}
          <div className="flex items-start gap-1 sm:gap-2 shrink-0 z-10">
            <Digit value={days}    label="dias"     />
            <span className="text-white/30 text-xl md:text-3xl font-black pt-1 md:pt-1.5 leading-none font-mono">:</span>
            <Digit value={hours}   label="horas"    />
            <span className="text-white/30 text-xl md:text-3xl font-black pt-1 md:pt-1.5 leading-none font-mono">:</span>
            <Digit value={minutes} label="min"      />
            <span className="text-white/30 text-xl md:text-3xl font-black pt-1 md:pt-1.5 leading-none font-mono">:</span>
            <Digit value={seconds} label="seg"      />
          </div>

          {/* ── DIREITA: CTA de conversão ── */}
          <div className="flex flex-col items-center gap-1.5 shrink-0 z-10 w-full md:w-auto">
            <a
              href="#inscricao"
              onClick={() => setDismissed(true)}
              className="urgency-cta w-full flex justify-center"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                /* CTA em verde-cyan — contrasta com o roxo da barra E com o pink do site */
                background: 'linear-gradient(135deg, #06d6a0 0%, #0ab98a 100%)',
                color: '#031a12',
                fontFamily: 'Sora, sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(12px, 1.3vw, 15px)',
                padding: 'clamp(10px, 1.2vw, 14px) clamp(18px, 2vw, 32px)',
                borderRadius: '10px',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                boxShadow: '0 0 28px rgba(6,214,160,0.45), 0 4px 12px rgba(0,0,0,0.4)',
                animation: 'ctaShake 5s ease-in-out infinite',
                transition: 'filter 0.15s, transform 0.15s',
                letterSpacing: '0.2px',
              }}
            >
              ⚡ Garantir ingresso
            </a>
            <button
              onClick={() => setDismissed(true)}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.25)',
                fontSize: '10px',
                cursor: 'pointer',
                fontFamily: 'Sora, sans-serif',
                textDecoration: 'underline',
                padding: 0,
                transition: 'color 0.2s',
                letterSpacing: '0.3px',
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.55)'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.25)'}
            >
              Não quero, obrigado.
            </button>
          </div>

        </div>
      </div>
    </>
  )
}
