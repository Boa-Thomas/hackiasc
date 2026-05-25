import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { PHASE_LABELS } from './useWallDevice'

// Telao read-only para projecao. Sem identidade (p_registration_id NULL). Polling 2s.
const POLL_MS = 2000

export default function WallScreen() {
  const [phase, setPhase] = useState(null)
  const [pains, setPains] = useState([])
  const [error, setError] = useState(null)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    if (!supabase) {
      setError('Sistema indisponível.')
      setLoaded(true)
      return
    }
    const { data, error: err } = await supabase.rpc('wall_list', { p_registration_id: null })
    if (err) {
      setError(err.message)
    } else if (data) {
      setError(null)
      setPhase(data.phase)
      setPains(data.pains || [])
    }
    setLoaded(true)
  }, [])

  useEffect(() => {
    load() // eslint-disable-line react-hooks/set-state-in-effect
    const t = setInterval(load, POLL_MS)
    return () => clearInterval(t)
  }, [load])

  const maxVotes = pains.reduce((m, p) => Math.max(m, p.vote_count || 0), 0)
  const showVotes = phase === 'voting_open'

  return (
    <div className="min-h-screen bg-dark bg-grid relative overflow-hidden flex flex-col">
      {/* Orbs de fundo */}
      <div className="orb w-[700px] h-[700px] bg-electric/15 -top-60 -left-60 animate-pulse-glow" aria-hidden />
      <div className="orb w-[600px] h-[600px] bg-hot/10 -bottom-40 -right-40 animate-pulse-glow" style={{ animationDelay: '1.5s' }} aria-hidden />
      <div className="orb w-[500px] h-[500px] bg-violet/10 top-1/3 left-1/2 -translate-x-1/2 animate-float" aria-hidden />

      {/* Cabecalho */}
      <header className="relative z-10 px-10 pt-10 pb-6 flex items-center justify-between">
        <div>
          <p className="font-mono text-sm uppercase tracking-[0.3em] text-cyan/70">HackIA SC · Fase 1</p>
          <h1 className="text-5xl xl:text-6xl font-display font-extrabold text-gradient-fire mt-2">
            Muro de Dores
          </h1>
        </div>
        <div className="text-right">
          <span
            className={`inline-block text-2xl font-mono px-6 py-2 rounded-full border ${
              phase === 'voting_open'
                ? 'text-gold border-gold/50 bg-gold/10'
                : phase === 'wall_open'
                  ? 'text-hot border-hot/50 bg-hot/10'
                  : 'text-white/50 border-white/20'
            }`}
          >
            {PHASE_LABELS[phase] || '...'}
          </span>
          {showVotes && (
            <p className="text-white/50 font-mono text-lg mt-2">Votação aberta — 3 votos por pessoa</p>
          )}
        </div>
      </header>

      {/* Conteudo */}
      <main className="relative z-10 flex-1 px-10 pb-10 overflow-hidden">
        {error && (
          <div className="text-hot font-mono text-xl">{error}</div>
        )}

        {!error && phase === 'closed' && (
          <div className="h-full flex items-center justify-center">
            <p className="text-4xl text-white/40 font-display">Aguardando abertura...</p>
          </div>
        )}

        {!error && phase !== 'closed' && loaded && !pains.length && (
          <div className="h-full flex items-center justify-center text-center">
            <p className="text-4xl text-white/40 font-display">
              As primeiras dores aparecem aqui.<br />
              <span className="text-2xl text-cyan/60">Acesse no celular e participe.</span>
            </p>
          </div>
        )}

        {!error && phase !== 'closed' && pains.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 auto-rows-max">
            {pains.map((p, i) => {
              const isTop = showVotes && p.vote_count === maxVotes && maxVotes > 0
              return (
                <div
                  key={p.id}
                  className={`card-glass rounded-2xl p-6 relative ${isTop ? 'border-gold/50 glow-cyan' : ''}`}
                >
                  {showVotes && (
                    <div className="absolute -top-3 -right-3 flex items-center justify-center min-w-12 h-12 px-3 rounded-full bg-gold/20 border border-gold/50">
                      <span className="font-mono text-2xl font-bold text-gold">{p.vote_count}</span>
                    </div>
                  )}
                  <p className="text-2xl xl:text-3xl font-display font-semibold text-white leading-tight">
                    {p.title}
                  </p>
                  {p.description && (
                    <p className="text-white/50 text-lg mt-3 line-clamp-3">{p.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-4 text-sm font-mono text-white/40">
                    {p.axis && (
                      <span className="px-3 py-1 rounded-full bg-violet/15 text-violet">{p.axis}</span>
                    )}
                    {p.author_name && <span>{p.author_name}</span>}
                    {!showVotes && <span className="text-cyan/50">#{i + 1}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
