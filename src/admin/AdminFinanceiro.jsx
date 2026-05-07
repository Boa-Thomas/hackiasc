import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ─── Constants ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 20

const MP_STATUS = {
  approved: { label: 'Aprovado', color: '#06d6a0' },
  pending: { label: 'Pendente', color: '#ffbe0b' },
  in_process: { label: 'Em processo', color: '#3a86ff' },
  rejected: { label: 'Rejeitado', color: '#ff006e' },
  cancelled: { label: 'Cancelado', color: '#ff006e' },
  refunded: { label: 'Reembolsado', color: '#8338ec' },
  charged_back: { label: 'Chargeback', color: '#ff006e' },
}

const METHOD_LABELS = {
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito',
  pix: 'Pix',
  account_money: 'Saldo MP',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBRL(centavos) {
  return (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function aggregateByKey(rows, key) {
  const map = {}
  for (const row of rows) {
    const k = row[key] || 'unknown'
    if (!map[k]) map[k] = { count: 0, total: 0 }
    map[k].count++
    map[k].total += row.gross_amount ?? 0
  }
  return map
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SummaryCard({ label, amount, color }) {
  return (
    <div className="card-glass rounded-xl p-5 flex flex-col gap-2">
      <span className="text-xs font-mono uppercase tracking-widest text-white/50">
        {label}
      </span>
      <span className="text-2xl font-bold font-mono" style={{ color }}>
        {formatBRL(amount)}
      </span>
    </div>
  )
}

function StatusBadge({ status }) {
  const s = MP_STATUS[status] ?? { label: status, color: '#666' }
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-xs font-mono border"
      style={{ color: s.color, borderColor: `${s.color}33`, backgroundColor: `${s.color}15` }}
    >
      {s.label}
    </span>
  )
}

function BreakdownSection({ title, data, labelMap, colorMap }) {
  const entries = Object.entries(data).sort((a, b) => b[1].total - a[1].total)
  if (entries.length === 0) return null

  return (
    <div className="card-glass rounded-xl p-5 flex flex-col gap-4">
      <h3 className="text-sm font-mono uppercase tracking-widest text-white/50">{title}</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {entries.map(([key, { count, total }]) => {
          const color = colorMap?.[key] ?? '#666'
          const label = labelMap?.[key] ?? key
          return (
            <div
              key={key}
              className="rounded-lg p-4 flex flex-col gap-2 border"
              style={{ borderColor: `${color}25`, backgroundColor: `${color}08` }}
            >
              <span
                className="text-xs font-mono font-semibold"
                style={{ color }}
              >
                {label}
              </span>
              <span className="text-lg font-bold font-mono text-white/90">
                {formatBRL(total)}
              </span>
              <span className="text-xs font-mono text-white/40">
                {count} pagamento{count !== 1 ? 's' : ''}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function AdminFinanceiro({ readOnly = false }) {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [feeData, setFeeData] = useState(null)
  const [syncStatus, setSyncStatus] = useState(null)
  const [syncing, setSyncing] = useState(false)

  // Viewer aggregated data
  const [breakdownByStatus, setBreakdownByStatus] = useState({})
  const [breakdownByMethod, setBreakdownByMethod] = useState({})
  const [breakdownLoading, setBreakdownLoading] = useState(true)

  // Filters (admin only)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterMethod, setFilterMethod] = useState('')
  const [search, setSearch] = useState('')

  const fetchPayments = useCallback(async () => {
    if (!supabase || readOnly) return
    setLoading(true)

    let query = supabase
      .from('mp_payments')
      .select('*', { count: 'exact' })
      .eq('operation_type', 'regular_payment')
      .order('date_created', { ascending: false })

    if (filterStatus) query = query.eq('status', filterStatus)
    if (filterMethod) query = query.eq('payment_method', filterMethod)
    if (search.trim()) {
      const q = search.trim().toLowerCase().replace(/[.,%]/g, '')
      if (q) query = query.ilike('payer_email', `%${q}%`)
    }

    query = query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

    const { data, count, error } = await query
    if (error) {
      console.error('Fetch payments error:', error)
      setLoading(false)
      return
    }

    setPayments(data || [])
    setTotalCount(count || 0)
    setLoading(false)
  }, [page, filterStatus, filterMethod, search, readOnly])

  const fetchBreakdown = useCallback(async () => {
    if (!supabase || !readOnly) return
    setBreakdownLoading(true)
    const { data, error } = await supabase
      .from('mp_payments')
      .select('status, payment_method, gross_amount')
      .eq('operation_type', 'regular_payment')
    if (error) {
      console.error('Fetch breakdown error:', error)
      setBreakdownLoading(false)
      return
    }
    const rows = data || []
    setBreakdownByStatus(aggregateByKey(rows, 'status'))
    setBreakdownByMethod(aggregateByKey(rows, 'payment_method'))
    setBreakdownLoading(false)
  }, [readOnly])

  const fetchFeeData = useCallback(async () => {
    if (!supabase) return
    const { data } = await supabase.rpc('get_mp_fee_summary')
    if (data) setFeeData(data)
  }, [])

  const fetchSyncStatus = useCallback(async () => {
    if (!supabase) return
    const { data } = await supabase.from('mp_sync_status').select('*').eq('id', 1).single()
    if (data) setSyncStatus(data)
  }, [])

  const handleSync = useCallback(async () => {
    if (!supabase) return
    setSyncing(true)
    try {
      const { error: syncError } = await supabase.functions.invoke('sync-mp-payments')
      if (syncError) throw syncError
      await fetchPayments()
      await fetchFeeData()
      await fetchSyncStatus()
    } catch (err) {
      console.error('MP sync error:', err)
    } finally {
      setSyncing(false)
    }
  }, [fetchPayments, fetchFeeData, fetchSyncStatus])

  useEffect(() => {
    if (!readOnly) fetchPayments()
  }, [fetchPayments, readOnly])

  useEffect(() => {
    if (readOnly) fetchBreakdown()
  }, [fetchBreakdown, readOnly])

  useEffect(() => {
    fetchFeeData()
    fetchSyncStatus()
  }, [fetchFeeData, fetchSyncStatus])

  // Reset page when filters change (admin only)
  useEffect(() => {
    setPage(1)
  }, [filterStatus, filterMethod, search])

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const statusColorMap = Object.fromEntries(
    Object.entries(MP_STATUS).map(([k, v]) => [k, v.color])
  )
  const statusLabelMap = Object.fromEntries(
    Object.entries(MP_STATUS).map(([k, v]) => [k, v.label])
  )
  const methodColorMap = {
    credit_card: '#3a86ff',
    debit_card: '#8338ec',
    pix: '#06d6a0',
    account_money: '#ffbe0b',
  }

  return (
    <div className="flex flex-col gap-4">

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          label="Total bruto"
          amount={feeData?.total_gross ?? 0}
          color="#06d6a0"
        />
        <SummaryCard
          label="Total líquido"
          amount={feeData?.total_net ?? 0}
          color="#3a86ff"
        />
        <SummaryCard
          label="Taxas MP"
          amount={feeData?.total_marketplace_fee ?? 0}
          color="#ff006e"
        />
        <SummaryCard
          label="Taxas financiamento"
          amount={feeData?.total_financing_fee ?? 0}
          color="#ffbe0b"
        />
      </div>

      {/* Sync banner */}
      <div className="card-glass rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-mono text-white/50">
            {syncStatus?.last_sync_at
              ? `Último sync: ${formatDateTime(syncStatus.last_sync_at)} — ${syncStatus.last_sync_count ?? 0} pagamentos`
              : 'Nenhuma sincronização realizada'}
          </span>
          {syncStatus?.last_sync_error && (
            <span className="text-xs font-mono text-hot">
              Erro: {syncStatus.last_sync_error}
            </span>
          )}
        </div>
        {!readOnly && (
          <button
            onClick={handleSync}
            disabled={syncing}
            className={`px-4 py-2 rounded-lg text-sm font-mono border transition-colors ${
              syncing
                ? 'bg-gold/10 text-gold border-gold/20 cursor-wait'
                : 'bg-cyan/10 text-cyan border-cyan/20 hover:bg-cyan/20'
            }`}
          >
            {syncing ? 'Sincronizando...' : 'Sincronizar agora'}
          </button>
        )}
      </div>

      {/* ─── Viewer: aggregated breakdowns ─── */}
      {readOnly && (
        breakdownLoading ? (
          <div className="card-glass rounded-xl flex items-center justify-center py-12 text-white/40 font-mono text-sm">
            Carregando...
          </div>
        ) : (
          <>
            <BreakdownSection
              title="Por status"
              data={breakdownByStatus}
              labelMap={statusLabelMap}
              colorMap={statusColorMap}
            />
            <BreakdownSection
              title="Por método de pagamento"
              data={breakdownByMethod}
              labelMap={METHOD_LABELS}
              colorMap={methodColorMap}
            />
          </>
        )
      )}

      {/* ─── Admin: filters + table + pagination ─── */}
      {!readOnly && (
        <>
          {/* Filters toolbar */}
          <div className="card-glass rounded-xl p-4 flex flex-wrap gap-3 items-center">
            <input
              type="search"
              placeholder="Buscar por email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 min-w-[180px] bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-electric/50 transition-colors"
            />

            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-electric/50 transition-colors"
            >
              <option value="">Todos os status</option>
              {Object.entries(MP_STATUS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>

            <select
              value={filterMethod}
              onChange={e => setFilterMethod(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-electric/50 transition-colors"
            >
              <option value="">Todos os métodos</option>
              {Object.entries(METHOD_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>

            <span className="text-xs font-mono text-white/30">
              {totalCount} pagamento{totalCount !== 1 ? 's' : ''}
            </span>
            <span className="text-xs font-mono text-white/30 basis-full">
              Operações internas da conta MP (cofrinho, transferências) não são exibidas.
            </span>
          </div>

          {/* Payments table */}
          <div className="card-glass rounded-xl overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-white/40 font-mono text-sm">
                Carregando...
              </div>
            ) : payments.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-white/40 font-mono text-sm">
                {feeData?.payment_count === 0
                  ? 'Nenhum pagamento sincronizado. Clique em "Sincronizar agora".'
                  : 'Nenhum pagamento encontrado com esses filtros.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left px-4 py-3 text-xs font-mono text-white/40 uppercase">ID</th>
                      <th className="text-left px-4 py-3 text-xs font-mono text-white/40 uppercase">Status</th>
                      <th className="text-right px-4 py-3 text-xs font-mono text-white/40 uppercase">Bruto</th>
                      <th className="text-right px-4 py-3 text-xs font-mono text-white/40 uppercase">Líquido</th>
                      <th className="text-right px-4 py-3 text-xs font-mono text-white/40 uppercase">Taxa MP</th>
                      <th className="text-right px-4 py-3 text-xs font-mono text-white/40 uppercase">Taxa Financ.</th>
                      <th className="text-left px-4 py-3 text-xs font-mono text-white/40 uppercase">Método</th>
                      <th className="text-left px-4 py-3 text-xs font-mono text-white/40 uppercase">Email</th>
                      <th className="text-left px-4 py-3 text-xs font-mono text-white/40 uppercase">Data</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {payments.map(p => (
                      <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3 text-xs font-mono text-white/50">
                          {p.payment_id}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={p.status} />
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-white/80">
                          {formatBRL(p.gross_amount)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-cyan">
                          {formatBRL(p.net_amount)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-hot/70">
                          {p.marketplace_fee > 0 ? `-${formatBRL(p.marketplace_fee)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gold/70">
                          {p.financing_fee > 0 ? `-${formatBRL(p.financing_fee)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-white/60">
                          {METHOD_LABELS[p.payment_method] ?? p.payment_method ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-white/60 max-w-[200px] truncate">
                          {p.payer_email ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-white/40">
                          {formatDateTime(p.date_approved || p.date_created)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1 text-xs font-mono text-white/50 hover:text-white disabled:text-white/20 transition-colors"
              >
                Anterior
              </button>
              <span className="text-xs font-mono text-white/40">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1 text-xs font-mono text-white/50 hover:text-white disabled:text-white/20 transition-colors"
              >
                Próxima
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
