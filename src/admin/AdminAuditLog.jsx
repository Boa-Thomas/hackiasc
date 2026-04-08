import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// ─── Constants ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 30

const ACTION_LABELS = {
  'registration.create': 'Inscrição individual',
  'registration.create_team': 'Inscrição de time',
  'registration.recover': 'Recuperação de inscrição',
  'registration.update_field': 'Campo editado',
  'registration.cancel': 'Inscrição cancelada',
  'waitlist.join': 'Entrou na lista de espera',
  'payment.confirm': 'Pagamento confirmado',
  'payment.preference_created': 'Preferência MP criada',
  'payment.confirmed_webhook': 'Pagamento confirmado (MP)',
  'payment.pending_webhook': 'Pagamento pendente (MP)',
  'payment.cancelled_webhook': 'Pagamento cancelado (MP)',
  'payment.refund': 'Reembolso solicitado',
  'payment.refund_processed': 'Reembolso processado',
  'checkin.in': 'Check-in realizado',
  'checkin.undo': 'Check-in desfeito',
  'team.move_member': 'Membro movido de time',
  'team.remove_member': 'Membro removido do time',
  'team.add_member': 'Membro adicionado ao time',
}

const ACTOR_STYLES = {
  public: 'bg-electric/10 text-electric border-electric/30',
  admin: 'bg-violet/10 text-violet border-violet/30',
  system: 'bg-gold/10 text-gold border-gold/30',
}

const ACTION_CATEGORIES = {
  registration: 'bg-cyan/10 text-cyan border-cyan/30',
  payment: 'bg-gold/10 text-gold border-gold/30',
  checkin: 'bg-electric/10 text-electric border-electric/30',
  team: 'bg-violet/10 text-violet border-violet/30',
  waitlist: 'bg-white/5 text-white/60 border-white/10',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function getCategory(action) {
  const cat = action?.split('.')[0]
  return ACTION_CATEGORIES[cat] ?? ACTION_CATEGORIES.waitlist
}

function formatBRL(centavos) {
  if (!centavos && centavos !== 0) return null
  return `R$ ${(centavos / 100).toFixed(2).replace('.', ',')}`
}

// ─── Detail renderer ─────────────────────────────────────────────────────────

function LogDetails({ entry }) {
  const details = []

  if (entry.old_data) {
    Object.entries(entry.old_data).forEach(([k, v]) => {
      const newV = entry.new_data?.[k]
      if (newV !== undefined && newV !== v) {
        const displayOld = k.includes('price') || k.includes('amount') ? formatBRL(v) : String(v ?? '—')
        const displayNew = k.includes('price') || k.includes('amount') ? formatBRL(newV) : String(newV ?? '—')
        details.push(`${k}: ${displayOld} → ${displayNew}`)
      }
    })
  }

  if (entry.new_data && !entry.old_data) {
    Object.entries(entry.new_data).forEach(([k, v]) => {
      if (v != null && k !== 'full_name') {
        const display = k.includes('price') || k.includes('amount') ? formatBRL(v) : String(v)
        details.push(`${k}: ${display}`)
      }
    })
  }

  const meta = entry.metadata
  if (meta) {
    if (meta.reason) details.push(meta.reason)
    if (meta.needs_manual_refund) details.push('Reembolso manual necessário')
    if (meta.team_cancelled) details.push('Time inteiro cancelado')
    if (meta.team_name) details.push(`Time: ${meta.team_name}`)
  }

  if (details.length === 0) return null

  return (
    <div className="mt-1 text-xs text-white/40 font-mono leading-relaxed">
      {details.map((d, i) => <div key={i}>{d}</div>)}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function AdminAuditLog() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  // Filters
  const [filterAction, setFilterAction] = useState('')
  const [filterActor, setFilterActor] = useState('')
  const [search, setSearch] = useState('')

  async function fetchLogs() {
    if (!supabase) return
    setLoading(true)

    let query = supabase
      .from('audit_log')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (filterAction) query = query.like('action', `${filterAction}%`)
    if (filterActor) query = query.eq('actor_type', filterActor)
    if (search.trim()) {
      // Sanitize: remove PostgREST operators (.,%) to prevent filter injection
      const q = search.trim().toLowerCase().replace(/[.,%]/g, '')
      if (q) {
        query = query.or(`target_email.ilike.%${q}%,actor_email.ilike.%${q}%`)
      }
    }

    query = query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

    const { data, count, error } = await query
    if (error) {
      console.error('Audit log fetch error:', error?.message)
      setLoading(false)
      return
    }

    setLogs(data || [])
    setTotalCount(count || 0)
    setLoading(false)
  }

  useEffect(() => {
    fetchLogs()
  }, [page, filterAction, filterActor, search])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [filterAction, filterActor, search])

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  // Get unique action categories for filter
  const actionCategories = [
    { value: '', label: 'Todas as ações' },
    { value: 'registration', label: 'Inscrições' },
    { value: 'payment', label: 'Pagamentos' },
    { value: 'checkin', label: 'Check-in' },
    { value: 'team', label: 'Times' },
    { value: 'waitlist', label: 'Lista de espera' },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="card-glass rounded-xl p-4 flex flex-wrap gap-3 items-center">
        <input
          type="search"
          placeholder="Buscar por email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[180px] bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-electric/50 transition-colors"
        />

        <select
          value={filterAction}
          onChange={e => setFilterAction(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-electric/50 transition-colors"
        >
          {actionCategories.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>

        <select
          value={filterActor}
          onChange={e => setFilterActor(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-electric/50 transition-colors"
        >
          <option value="">Todos os atores</option>
          <option value="public">Público</option>
          <option value="admin">Admin</option>
          <option value="system">Sistema</option>
        </select>

        <span className="text-xs text-white/40 font-mono">
          {totalCount} registro{totalCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Log list */}
      <div className="card-glass rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-white/40 text-sm">Carregando logs...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-white/40 text-sm">Nenhum log encontrado.</div>
        ) : (
          <div className="divide-y divide-white/5">
            {logs.map(entry => (
              <div key={entry.id} className="px-4 py-3 hover:bg-white/[0.02] transition-colors">
                <div className="flex items-start gap-3">
                  {/* Timestamp */}
                  <span className="text-xs text-white/30 font-mono whitespace-nowrap pt-0.5 min-w-[130px]">
                    {formatDateTime(entry.created_at)}
                  </span>

                  {/* Action badge */}
                  <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-mono whitespace-nowrap ${getCategory(entry.action)}`}>
                    {ACTION_LABELS[entry.action] ?? entry.action}
                  </span>

                  {/* Actor badge */}
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-mono uppercase ${ACTOR_STYLES[entry.actor_type] ?? ACTOR_STYLES.system}`}>
                    {entry.actor_type}
                  </span>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {entry.metadata?.full_name && (
                        <span className="text-sm text-white font-medium truncate">
                          {entry.metadata.full_name}
                        </span>
                      )}
                      {entry.target_email && (
                        <span className="text-xs text-white/40 font-mono truncate">
                          {entry.target_email}
                        </span>
                      )}
                    </div>
                    <LogDetails entry={entry} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded-lg text-sm bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 disabled:opacity-30 transition-colors"
          >
            Anterior
          </button>
          <span className="text-sm text-white/40 font-mono px-3">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 rounded-lg text-sm bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 disabled:opacity-30 transition-colors"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  )
}
