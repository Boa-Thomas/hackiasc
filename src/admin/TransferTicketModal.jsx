import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { audit } from '../lib/auditLog'

const PAYMENT_LABELS = {
  pending: 'Pendente',
  confirmed: 'Confirmado',
  cancelled: 'Cancelado',
}

const TIER_LABELS = {
  early_bird: 'Early Bird',
  regular: 'Regular',
  dati: 'DATI',
}

function formatBRL(cents) {
  if (cents == null) return '—'
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function PersonCard({ title, person, accent }) {
  if (!person) {
    return (
      <div className="flex-1 rounded-xl border border-dashed border-white/10 p-4 text-center text-white/30 text-sm font-mono">
        {title}
      </div>
    )
  }
  return (
    <div className={`flex-1 rounded-xl border p-4 space-y-1 ${accent}`}>
      <div className="text-[10px] font-mono uppercase tracking-widest text-white/40">{title}</div>
      <div className="font-display font-semibold text-white truncate">{person.full_name}</div>
      <div className="text-xs font-mono text-white/60 truncate">{person.email}</div>
      <div className="text-xs font-mono text-white/40">
        {PAYMENT_LABELS[person.payment_status] ?? person.payment_status}
        {' · '}
        {TIER_LABELS[person.ticket_tier] ?? person.ticket_tier}
        {' · '}
        {formatBRL(person.ticket_price)}
      </div>
      {person.team_name && (
        <div className="text-xs font-mono text-white/40">Time: {person.team_name}</div>
      )}
    </div>
  )
}

export default function TransferTicketModal({ source, onClose, onDone }) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [target, setTarget] = useState(null)
  const [transferring, setTransferring] = useState(false)
  const [error, setError] = useState(null)

  function updateSearch(v) {
    setSearch(v)
    if (v.trim().length < 2) {
      setResults([])
      setSearching(false)
    }
  }

  // Debounced search for pending registrations matching the query
  useEffect(() => {
    // Sanitize: strip PostgREST operators to prevent .or() filter injection.
    // Keep '.' so email/domain matching still works.
    const q = search.trim().replace(/[,()*%]/g, ' ').trim()
    if (q.length < 2) return
    let cancelled = false
    const handle = setTimeout(async () => {
      if (!supabase) return
      setSearching(true)
      const { data, error: err } = await supabase
        .from('registrations')
        .select('id, full_name, email, payment_status, ticket_tier, ticket_price, team_name, transferred_to_id, transferred_from_id')
        .neq('id', source.id)
        .neq('payment_status', 'confirmed')
        .neq('payment_status', 'cancelled')
        .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
        .order('created_at', { ascending: false })
        .limit(10)
      if (cancelled) return
      if (err) setError(err.message)
      else { setError(null); setResults(data ?? []) }
      setSearching(false)
    }, 250)
    return () => { cancelled = true; clearTimeout(handle) }
  }, [search, source.id])

  const canTransfer = useMemo(() => {
    if (!target) return false
    if (source.payment_status !== 'confirmed') return false
    if (target.payment_status === 'confirmed') return false
    if (target.payment_status === 'cancelled') return false
    return true
  }, [source, target])

  async function handleConfirm() {
    if (!supabase || !target) return
    setTransferring(true)
    setError(null)
    const { data, error: err } = await supabase.rpc('transfer_ticket', {
      p_from_id: source.id,
      p_to_id: target.id,
    })
    if (err) {
      setError(err.message)
      setTransferring(false)
      return
    }
    audit({
      action: 'ticket.transfer',
      actorType: 'admin',
      targetTable: 'registrations',
      targetId: target.id,
      targetEmail: target.email,
      oldData: {
        from: { id: source.id, email: source.email, payment_status: 'confirmed' },
        to:   { id: target.id, email: target.email, payment_status: target.payment_status },
      },
      newData: {
        from: { id: source.id, email: source.email, payment_status: 'cancelled' },
        to:   { id: target.id, email: target.email, payment_status: 'confirmed' },
      },
      metadata: {
        ticket_tier: data?.ticket_tier ?? source.ticket_tier,
        ticket_price: data?.ticket_price ?? source.ticket_price,
        from_name: source.full_name,
        to_name: target.full_name,
      },
    })
    setTransferring(false)
    onDone?.({ source, target })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark/80 backdrop-blur-sm">
      <div className="card-glass rounded-2xl p-6 w-full max-w-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        <div>
          <h3 className="font-display font-semibold text-white text-lg">Transferir ingresso</h3>
          <p className="text-white/50 text-sm mt-1">
            O pagamento confirmado de <span className="text-white">{source.full_name}</span> passa para outro participante (já cadastrado, ainda não pago). Sem reembolso.
          </p>
        </div>

        {/* Source vs Target preview */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch">
          <PersonCard
            title="De (origem · pago)"
            person={source}
            accent="border-cyan/30 bg-cyan/5"
          />
          <div className="self-center text-electric font-mono text-xl">→</div>
          <PersonCard
            title="Para (destino)"
            person={target}
            accent={target ? 'border-electric/30 bg-electric/5' : 'border-white/10'}
          />
        </div>

        {/* Search */}
        {!target && (
          <div className="space-y-2">
            <label className="text-xs font-mono uppercase tracking-widest text-white/40">
              Buscar destinatário (cadastrado, não pago)
            </label>
            <input
              type="text"
              value={search}
              onChange={e => updateSearch(e.target.value)}
              autoFocus
              placeholder="Nome ou email..."
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-electric/50 focus:ring-1 focus:ring-electric/30 transition-colors"
            />

            <div className="rounded-lg border border-white/5 divide-y divide-white/5 max-h-64 overflow-y-auto">
              {searching && (
                <div className="px-3 py-3 text-sm text-white/40 font-mono">Buscando...</div>
              )}
              {!searching && search.trim().length >= 2 && results.length === 0 && (
                <div className="px-3 py-3 text-sm text-white/40 font-mono">
                  Nenhum cadastro pendente encontrado.
                </div>
              )}
              {!searching && search.trim().length < 2 && (
                <div className="px-3 py-3 text-sm text-white/30 font-mono">
                  Digite pelo menos 2 caracteres.
                </div>
              )}
              {results.map(r => (
                <button
                  key={r.id}
                  onClick={() => setTarget(r)}
                  className="w-full text-left px-3 py-2.5 hover:bg-white/5 transition-colors flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white font-medium truncate">{r.full_name}</div>
                    <div className="text-xs text-white/50 font-mono truncate">{r.email}</div>
                  </div>
                  <div className="text-xs font-mono text-gold border border-gold/30 bg-gold/10 rounded px-2 py-0.5">
                    {PAYMENT_LABELS[r.payment_status] ?? r.payment_status}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {target && (
          <button
            onClick={() => { setTarget(null); setError(null) }}
            className="text-xs text-white/50 hover:text-white font-mono underline underline-offset-2"
          >
            ← Trocar destinatário
          </button>
        )}

        {error && (
          <div className="rounded-lg border border-hot/30 bg-hot/10 px-3 py-2 text-sm text-hot font-mono">
            {error}
          </div>
        )}

        {target && (
          <div className="rounded-lg border border-gold/20 bg-gold/5 px-3 py-2 text-xs text-gold/90 font-mono leading-relaxed">
            ⚠ A inscrição de origem ficará marcada como cancelada (transferida) e não gerará reembolso. O ingresso e o tier ({TIER_LABELS[source.ticket_tier] ?? source.ticket_tier} · {formatBRL(source.ticket_price)}) passam para o destino.
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={transferring}
            className="flex-1 py-2 rounded-lg text-sm font-medium bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border border-white/10 transition-colors disabled:opacity-30"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canTransfer || transferring}
            className="flex-1 py-2 rounded-lg text-sm font-medium bg-electric/20 text-electric hover:bg-electric/30 border border-electric/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {transferring ? 'Transferindo...' : 'Confirmar transferência'}
          </button>
        </div>
      </div>
    </div>
  )
}
