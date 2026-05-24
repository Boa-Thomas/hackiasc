import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const PHASES = [
  { id: 'closed', label: 'Fechado', help: 'Ninguém registra nem vota.' },
  { id: 'wall_open', label: 'Muro aberto', help: 'Participantes registram dores.' },
  { id: 'voting_open', label: 'Votação aberta', help: 'Participantes votam (até 3).' },
]

// Painel de moderacao do Muro de Dores. Alterna a fase global, lista dores
// (inclui ocultas), oculta/reexibe e mostra o ranking por votos.
export default function AdminWall() {
  const [phase, setPhase] = useState(null)
  const [pains, setPains] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!supabase) { setError('Supabase não configurado.'); setLoading(false); return }
    const { data, error: err } = await supabase.rpc('wall_admin_list')
    if (err) setError(err.message)
    else if (data) {
      setError(null)
      setPhase(data.phase)
      setPains(data.pains || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load() // eslint-disable-line react-hooks/set-state-in-effect
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [load])

  async function setWallPhase(p) {
    if (!supabase || busy || p === phase) return
    setBusy(true); setError(null)
    const { error: err } = await supabase.rpc('wall_set_phase', { p_phase: p })
    setBusy(false)
    if (err) { setError(err.message); return }
    setPhase(p)
    await load()
  }

  async function hide(id) {
    if (!supabase || !window.confirm('Ocultar essa dor do telão?')) return
    const { error: err } = await supabase.rpc('wall_hide_pain', { p_id: id })
    if (err) { alert(`Erro: ${err.message}`); return }
    await load()
  }

  async function unhide(id) {
    if (!supabase) return
    const { error: err } = await supabase.rpc('wall_unhide_pain', { p_id: id })
    if (err) { alert(`Erro: ${err.message}`); return }
    await load()
  }

  if (loading) return <p className="text-white/60 font-mono">Carregando...</p>

  const visible = pains.filter(p => p.status === 'visible')
  const hidden = pains.filter(p => p.status === 'hidden')

  return (
    <div className="space-y-6">
      {error && <div className="bg-hot/10 border border-hot/30 rounded-lg px-4 py-2.5 text-hot text-sm">{error}</div>}

      {/* Controle de fase */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h3 className="text-white font-semibold mb-1">Fase do muro</h3>
        <p className="text-white/50 text-xs mb-4">Controla o que os participantes podem fazer em <span className="font-mono">/#muro</span> e o que o telão (<span className="font-mono">/#telao</span>) exibe.</p>
        <div className="grid sm:grid-cols-3 gap-3">
          {PHASES.map(p => (
            <button
              key={p.id}
              onClick={() => setWallPhase(p.id)}
              disabled={busy}
              className={`text-left rounded-xl border px-4 py-3 transition-colors disabled:opacity-50 ${
                phase === p.id
                  ? 'bg-cyan/20 text-cyan border-cyan/40'
                  : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10'
              }`}
            >
              <div className="font-semibold flex items-center gap-2">
                {phase === p.id && <span>●</span>}
                {p.label}
              </div>
              <div className="text-xs text-white/40 mt-1">{p.help}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Ranking / dores visiveis */}
      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-white/5 text-white/60 text-xs uppercase font-mono flex justify-between">
          <span>Dores visíveis ({visible.length})</span>
          <span>ordenadas por votos</span>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {visible.map((p, i) => (
              <tr key={p.id} className="border-t border-white/5">
                <td className="px-4 py-3 w-12 text-center font-mono text-white/40">#{i + 1}</td>
                <td className="px-2 py-3 w-16 text-center">
                  <span className="font-mono text-xl text-gold">{p.vote_count}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="text-white">{p.title}</div>
                  {p.description && <div className="text-white/50 text-xs mt-0.5">{p.description}</div>}
                  <div className="flex gap-2 mt-1 text-xs text-white/40 font-mono">
                    {p.axis && <span className="px-2 py-0.5 rounded-full bg-violet/15 text-violet">{p.axis}</span>}
                    {p.author_name && <span>por {p.author_name}</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => hide(p.id)} className="text-xs text-hot hover:underline">ocultar</button>
                </td>
              </tr>
            ))}
            {!visible.length && (
              <tr><td className="px-4 py-6 text-center text-white/40">Nenhuma dor registrada ainda.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Dores ocultas */}
      {hidden.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-white/5 text-white/60 text-xs uppercase font-mono">
            Ocultas ({hidden.length})
          </div>
          <table className="w-full text-sm">
            <tbody>
              {hidden.map(p => (
                <tr key={p.id} className="border-t border-white/5 opacity-60">
                  <td className="px-2 py-3 w-16 text-center font-mono text-white/40">{p.vote_count}</td>
                  <td className="px-4 py-3 text-white/70 line-through">{p.title}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => unhide(p.id)} className="text-xs text-cyan hover:underline">reexibir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
