import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Vitrine pública de equipes (read-only, para projeção/compartilhamento).
// Lista nome + descrição da ideia de cada equipe. Polling 5s.
const POLL_MS = 5000

const AXIS_STYLES = [
  'bg-electric/10 text-electric border-electric/20',
  'bg-cyan/10 text-cyan border-cyan/20',
  'bg-violet/10 text-violet border-violet/20',
  'bg-gold/10 text-gold border-gold/20',
  'bg-hot/10 text-hot border-hot/20',
]

export default function TeamsShowcase() {
  const [teams, setTeams] = useState([])
  const [error, setError] = useState(null)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    if (!supabase) {
      setError('Sistema indisponível.')
      setLoaded(true)
      return
    }
    const { data, error: err } = await supabase.rpc('public_list_teams')
    if (err) {
      setError(err.message)
    } else {
      setError(null)
      setTeams(Array.isArray(data) ? data : [])
    }
    setLoaded(true)
  }, [])

  useEffect(() => {
    load() // eslint-disable-line react-hooks/set-state-in-effect
    const t = setInterval(load, POLL_MS)
    return () => clearInterval(t)
  }, [load])

  return (
    <div className="min-h-screen bg-dark bg-grid relative overflow-hidden">
      <div className="orb w-[700px] h-[700px] bg-electric/15 -top-60 -left-60 animate-pulse-glow" aria-hidden />
      <div className="orb w-[600px] h-[600px] bg-violet/10 -bottom-40 -right-40 animate-pulse-glow" aria-hidden />

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-12">
        <header className="mb-10">
          <p className="font-mono text-sm uppercase tracking-[0.3em] text-cyan/70">HackIA SC · Blumenau 2026</p>
          <h1 className="text-5xl xl:text-6xl font-display font-extrabold text-gradient-cyan mt-2">
            Vitrine de Equipes
          </h1>
          <div className="flex items-baseline gap-2 mt-4 font-mono">
            <span className="text-3xl font-bold text-electric">{teams.length}</span>
            <span className="text-white/50 text-lg">{teams.length === 1 ? 'equipe' : 'equipes'}</span>
          </div>
        </header>

        {error && (
          <div className="card-glass rounded-2xl p-6 border border-hot/30 text-hot">{error}</div>
        )}

        {!error && loaded && teams.length === 0 && (
          <p className="text-text-muted">Nenhuma equipe confirmada ainda.</p>
        )}

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {teams.map(team => (
            <article key={team.name} className="card-glass rounded-2xl p-6 flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-2xl font-bold text-white">{team.name}</h2>
                <span className="text-xs font-mono text-white/40 whitespace-nowrap mt-1">
                  {team.member_count} {team.member_count === 1 ? 'membro' : 'membros'}
                </span>
              </div>
              {team.idea_description ? (
                <p className="text-sm text-white/75 mt-3 whitespace-pre-wrap flex-1">{team.idea_description}</p>
              ) : (
                <p className="text-sm text-white/30 italic mt-3 flex-1">Ideia em construção…</p>
              )}
              {Array.isArray(team.economic_axes) && team.economic_axes.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {team.economic_axes.map((axis, i) => (
                    <span
                      key={axis}
                      className={'px-2 py-0.5 rounded-full text-[10px] font-mono border ' + AXIS_STYLES[i % AXIS_STYLES.length]}
                    >
                      {axis}
                    </span>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
