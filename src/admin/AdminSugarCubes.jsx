import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import SendSugarCube from '../sugar/SendSugarCube'

const TYPE_LABEL = { participant: 'Participante', mentor: 'Mentor', organization: 'Organização' }
const FILTERS = [
  { id: 'pending', label: 'Pendentes' },
  { id: 'approved', label: 'Aprovados' },
  { id: 'rejected', label: 'Rejeitados' },
]

// Curadoria do mural de elogios: aprova/rejeita item a item, envia em nome da
// organização e controla o switch global de liberação.
export default function AdminSugarCubes() {
  const [filter, setFilter] = useState('pending')
  const [items, setItems] = useState([])
  const [released, setReleased] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!supabase) { setError('Supabase não configurado.'); setLoading(false); return }
    const [list, rel] = await Promise.all([
      supabase.rpc('sugar_admin_list', { p_status: null }),
      supabase.rpc('get_sugar_released'),
    ])
    if (list.error) setError(list.error.message)
    else { setError(null); setItems(list.data || []) }
    if (!rel.error) setReleased(rel.data === true)
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [load])

  async function moderate(id, newStatus) {
    if (busy) return
    setBusy(true)
    const { error: err } = await supabase.rpc('sugar_moderate', { p_id: id, p_status: newStatus })
    setBusy(false)
    if (err) { alert(`Erro: ${err.message}`); return }
    await load()
  }

  async function toggleReleased() {
    const next = !released
    const msg = next
      ? 'LIBERAR os elogios? Todos os destinatários passarão a ver imediatamente os elogios aprovados endereçados a eles.'
      : 'Esconder novamente os elogios de todos os painéis?'
    if (!window.confirm(msg)) return
    setBusy(true)
    const { error: err } = await supabase.rpc('set_sugar_released', { p_bool: next })
    setBusy(false)
    if (err) { alert(`Erro: ${err.message}`); return }
    setReleased(next)
  }

  if (loading) return <p className="text-white/60 font-mono">Carregando...</p>

  const counts = {
    pending: items.filter(i => i.status === 'pending').length,
    approved: items.filter(i => i.status === 'approved').length,
    rejected: items.filter(i => i.status === 'rejected').length,
  }
  const shown = items.filter(i => i.status === filter)
  const filterLabel = FILTERS.find(f => f.id === filter).label.toLowerCase()

  return (
    <div className="space-y-5">
      {error && <p className="text-hot font-mono text-sm">{error}</p>}

      <div className="card-glass rounded-2xl p-4 flex items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-lg text-white">Liberação dos elogios</h3>
          <p className="text-white/50 text-sm">
            {released
              ? 'LIBERADO — destinatários estão vendo os elogios aprovados.'
              : 'Oculto — ninguém vê (nem sabe que recebeu).'}
          </p>
        </div>
        <button
          onClick={toggleReleased}
          disabled={busy}
          className={`px-4 py-2 rounded-lg font-semibold disabled:opacity-50 whitespace-nowrap ${released ? 'bg-hot text-white' : 'bg-cyan text-dark'}`}
        >
          {released ? 'Esconder de novo' : 'Liberar elogios'}
        </button>
      </div>

      <SendSugarCube mode="org" />

      <div className="flex gap-2 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-lg text-sm ${filter === f.id ? 'bg-electric text-white' : 'bg-dark/60 text-white/60'}`}
          >
            {f.label} ({counts[f.id]})
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-white/40 font-mono text-sm">Nenhum elogio {filterLabel}.</p>
      ) : (
        <ul className="space-y-3">
          {shown.map(it => (
            <li key={it.id} className="card-glass rounded-2xl p-4">
              <p className="text-white/50 text-xs font-mono mb-2">
                De: {it.sender_name} ({TYPE_LABEL[it.sender_type]}) → Para: {it.recipient_name} ({TYPE_LABEL[it.recipient_type]})
              </p>
              <p className="text-white/90 mb-3 whitespace-pre-wrap">{it.message}</p>
              {it.status === 'pending' ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => moderate(it.id, 'approved')}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-lg bg-cyan text-dark text-sm font-semibold disabled:opacity-50"
                  >
                    Aprovar
                  </button>
                  <button
                    onClick={() => moderate(it.id, 'rejected')}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-lg border border-hot text-hot text-sm disabled:opacity-50"
                  >
                    Rejeitar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => moderate(it.id, 'pending')}
                  disabled={busy}
                  className="text-white/40 text-xs underline disabled:opacity-50"
                >
                  Mover para pendentes
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
