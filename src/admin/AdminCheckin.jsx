import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// ─── Constants ───────────────────────────────────────────────────────────────

const OCCUPATION_COLORS = {
  hacker:     { bg: 'bg-electric/15', text: 'text-electric', border: 'border-electric/30', label: 'Hacker' },
  hustler:    { bg: 'bg-cyan/15',     text: 'text-cyan',     border: 'border-cyan/30',     label: 'Hustler' },
  hipster:    { bg: 'bg-violet/15',   text: 'text-violet',   border: 'border-violet/30',   label: 'Hipster' },
  enthusiast: { bg: 'bg-gold/15',     text: 'text-gold',     border: 'border-gold/30',     label: 'Enthusiast' },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function CheckinProgressBar({ checkedIn, total }) {
  const pct = total > 0 ? Math.round((checkedIn / total) * 100) : 0
  return (
    <div className="card-glass rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl font-display font-bold text-cyan">{checkedIn}</span>
          <span className="text-white/40 font-mono text-sm">/ {total} presentes</span>
        </div>
        <span className="text-lg font-mono font-bold text-cyan">{pct}%</span>
      </div>
      <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full bg-cyan rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function CheckinRow({ registration, onCheckin, onUndo, busy }) {
  const isCheckedIn = !!registration.checked_in_at
  const occ = OCCUPATION_COLORS[registration.occupation_type] ?? { bg: 'bg-white/10', text: 'text-white/50', border: 'border-white/10', label: registration.occupation_type }

  return (
    <div className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${
      isCheckedIn
        ? 'bg-cyan/5 border-cyan/20'
        : 'bg-white/[0.02] border-white/5 hover:border-white/10'
    }`}>
      {/* Status indicator */}
      <div className={`w-3 h-3 rounded-full flex-shrink-0 ${isCheckedIn ? 'bg-cyan animate-pulse' : 'bg-white/15'}`} />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`font-display font-medium text-sm ${isCheckedIn ? 'text-white' : 'text-white/80'}`}>
            {registration.full_name}
          </span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono border ${occ.bg} ${occ.text} ${occ.border}`}>
            {occ.label}
          </span>
        </div>
        <div className="flex flex-wrap gap-3 mt-0.5">
          <span className="text-xs text-white/40 font-mono">{registration.email}</span>
          {registration.team_name && (
            <span className="text-xs text-white/30 font-mono">
              {registration.team_name}
            </span>
          )}
          {isCheckedIn && (
            <span className="text-xs text-cyan/60 font-mono">
              Check-in: {formatTime(registration.checked_in_at)}
            </span>
          )}
        </div>
      </div>

      {/* Action */}
      {isCheckedIn ? (
        <button
          onClick={() => onUndo(registration.id)}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 text-white/40 border border-white/10 hover:bg-white/10 hover:text-white/60 disabled:opacity-30 transition-colors whitespace-nowrap"
        >
          Desfazer
        </button>
      ) : (
        <button
          onClick={() => onCheckin(registration.id)}
          disabled={busy}
          className="px-4 py-1.5 rounded-lg text-sm font-medium bg-cyan/20 text-cyan border border-cyan/30 hover:bg-cyan/30 disabled:opacity-30 transition-colors whitespace-nowrap"
        >
          Check-in
        </button>
      )}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function AdminCheckin() {
  const [registrations, setRegistrations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all') // 'all' | 'pending' | 'checked_in'
  const [busyId, setBusyId] = useState(null)

  async function fetchData() {
    if (!supabase) {
      setError('Supabase não configurado.')
      setLoading(false)
      return
    }
    const { data, error: err } = await supabase
      .from('registrations')
      .select('id, full_name, email, occupation_type, team_name, payment_status, checked_in_at')
      .eq('payment_status', 'confirmed')
      .order('full_name', { ascending: true })

    if (err) {
      setError(err.message)
    } else {
      setRegistrations(data ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchData() // eslint-disable-line react-hooks/set-state-in-effect

    // Realtime subscription
    if (!supabase) return
    const channel = supabase
      .channel('checkin-changes')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'registrations' }, () => {
        fetchData()
      })
      .subscribe()

    return () => { channel?.unsubscribe() }
  }, [])

  // ─── Derived ────────────────────────────────────────────────────────────────

  const { filtered, checkedInCount, totalCount } = useMemo(() => {
    let data = registrations

    // Search
    if (search.trim()) {
      const q = search.toLowerCase()
      data = data.filter(r =>
        r.full_name?.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q) ||
        r.team_name?.toLowerCase().includes(q)
      )
    }

    // Filter
    if (filter === 'pending') {
      data = data.filter(r => !r.checked_in_at)
    } else if (filter === 'checked_in') {
      data = data.filter(r => !!r.checked_in_at)
    }

    // Sort: pending first, then by name
    data = [...data].sort((a, b) => {
      if (!a.checked_in_at && b.checked_in_at) return -1
      if (a.checked_in_at && !b.checked_in_at) return 1
      return a.full_name.localeCompare(b.full_name)
    })

    return {
      filtered: data,
      checkedInCount: registrations.filter(r => !!r.checked_in_at).length,
      totalCount: registrations.length,
    }
  }, [registrations, search, filter])

  // ─── Actions ────────────────────────────────────────────────────────────────

  async function handleCheckin(id) {
    if (!supabase) return
    setBusyId(id)
    const { error: err } = await supabase
      .from('registrations')
      .update({ checked_in_at: new Date().toISOString() })
      .eq('id', id)
    if (err) alert(`Erro: ${err.message}`)
    else {
      setRegistrations(prev => prev.map(r =>
        r.id === id ? { ...r, checked_in_at: new Date().toISOString() } : r
      ))
    }
    setBusyId(null)
  }

  async function handleUndo(id) {
    if (!supabase) return
    setBusyId(id)
    const { error: err } = await supabase
      .from('registrations')
      .update({ checked_in_at: null })
      .eq('id', id)
    if (err) alert(`Erro: ${err.message}`)
    else {
      setRegistrations(prev => prev.map(r =>
        r.id === id ? { ...r, checked_in_at: null } : r
      ))
    }
    setBusyId(null)
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-white/40 font-mono text-sm">
        Carregando participantes...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <p className="text-hot font-mono text-sm">{error}</p>
        <button
          onClick={() => { setError(null); setLoading(true); fetchData() }}
          className="px-4 py-2 rounded-lg text-sm bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 transition-colors"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* Progress */}
      <CheckinProgressBar checkedIn={checkedInCount} total={totalCount} />

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome, email ou time..."
          className="flex-1 min-w-[200px] bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 pl-10 text-white text-sm placeholder-white/30 focus:outline-none focus:border-cyan/50 focus:ring-1 focus:ring-cyan/30 transition-colors"
        />

        <div className="flex gap-1">
          {[
            { id: 'all', label: 'Todos' },
            { id: 'pending', label: 'Aguardando' },
            { id: 'checked_in', label: 'Presentes' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${
                filter === f.id
                  ? 'bg-cyan/20 text-cyan border-cyan/30'
                  : 'bg-white/5 text-white/50 border-white/10 hover:text-white/70'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Count */}
      <div className="text-xs text-white/40 font-mono px-1">
        {filtered.length} participante{filtered.length !== 1 ? 's' : ''}
        {filtered.length !== totalCount && ` (de ${totalCount} total)`}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-white/30 font-mono text-sm">
          {search ? 'Nenhum participante encontrado.' : 'Nenhum participante confirmado.'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(reg => (
            <CheckinRow
              key={reg.id}
              registration={reg}
              onCheckin={handleCheckin}
              onUndo={handleUndo}
              busy={busyId === reg.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}
