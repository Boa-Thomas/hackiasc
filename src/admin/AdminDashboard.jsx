import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// --- helpers ---

function formatBRL(centavos) {
  return (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function computeStats(registrations) {
  const total = registrations.length
  const confirmed = registrations.filter((r) => r.payment_status === 'confirmed')
  const pending = registrations.filter((r) => r.payment_status === 'pending')
  const cancelled = registrations.filter((r) => r.payment_status === 'cancelled')

  const revenueConfirmed = confirmed.reduce((sum, r) => sum + (r.ticket_price ?? 0), 0)
  const revenuePending = pending.reduce((sum, r) => sum + (r.ticket_price ?? 0), 0)

  const byType = {
    hacker: registrations.filter((r) => r.occupation_type === 'hacker').length,
    hustler: registrations.filter((r) => r.occupation_type === 'hustler').length,
    hipster: registrations.filter((r) => r.occupation_type === 'hipster').length,
    enthusiast: registrations.filter((r) => r.occupation_type === 'enthusiast').length,
  }

  const byTier = {
    early_bird: registrations.filter((r) => r.ticket_tier === 'early_bird').length,
    regular: registrations.filter((r) => r.ticket_tier === 'regular').length,
  }

  const byModality = {
    individual_form_team: registrations.filter((r) => r.inscription_modality === 'individual_form_team').length,
    individual_own: registrations.filter((r) => r.inscription_modality === 'individual_own').length,
    team: registrations.filter((r) => r.inscription_modality === 'team').length,
  }

  const recent = [...registrations]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5)

  return {
    total,
    confirmedCount: confirmed.length,
    pendingCount: pending.length,
    cancelledCount: cancelled.length,
    revenueConfirmed,
    revenuePending,
    byType,
    byTier,
    byModality,
    recent,
  }
}

// --- sub-components ---

function SummaryCard({ label, value, color, borderColor }) {
  return (
    <div
      className="card-glass rounded-xl p-5 flex flex-col gap-2"
      style={{ borderColor }}
    >
      <span className="text-xs font-mono uppercase tracking-widest" style={{ color }}>
        {label}
      </span>
      <span className="text-4xl font-bold font-display" style={{ color }}>
        {value}
      </span>
    </div>
  )
}

function RevenueCard({ label, amount, color }) {
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

function BreakdownGroup({ title, items }) {
  return (
    <div className="card-glass rounded-xl p-5 flex flex-col gap-3">
      <h3 className="text-xs font-mono uppercase tracking-widest text-white/40">{title}</h3>
      <ul className="flex flex-col gap-2">
        {items.map(({ label, count, color }) => (
          <li key={label} className="flex items-center justify-between">
            <span className="text-sm text-white/70 font-display">{label}</span>
            <span
              className="text-sm font-bold font-mono px-2 py-0.5 rounded"
              style={{ color, background: `${color}22` }}
            >
              {count}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function StatusBadge({ status }) {
  const map = {
    confirmed: { label: 'Confirmado', color: '#06d6a0' },
    pending: { label: 'Pendente', color: '#ffbe0b' },
    cancelled: { label: 'Cancelado', color: '#ff006e' },
  }
  const { label, color } = map[status] ?? { label: status, color: '#7a7aa0' }
  return (
    <span
      className="text-xs font-mono px-2 py-0.5 rounded"
      style={{ color, background: `${color}22` }}
    >
      {label}
    </span>
  )
}

// --- main component ---

export default function AdminDashboard({ onViewRegistration }) {
  const [registrations, setRegistrations] = useState([])
  const [loading, setLoading] = useState(!supabase ? false : true)
  const [error, setError] = useState(!supabase ? 'Supabase não configurado.' : null)

  useEffect(() => {
    if (!supabase) return

    async function fetchRegistrations() {
      const { data, error: fetchError } = await supabase
        .from('registrations')
        .select('id, full_name, email, payment_status, occupation_type, ticket_tier, ticket_price, inscription_modality, created_at')
        .order('created_at', { ascending: false })

      if (fetchError) {
        setError(fetchError.message)
      } else {
        setRegistrations(data ?? [])
      }
      setLoading(false)
    }

    fetchRegistrations()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-white/40 font-mono text-sm">
        Carregando dados...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-24 text-hot font-mono text-sm">
        Erro ao carregar dados: {error}
      </div>
    )
  }

  const stats = computeStats(registrations)

  return (
    <div className="flex flex-col gap-6">

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          label="Total inscritos"
          value={stats.total}
          color="#3a86ff"
          borderColor="rgba(58,134,255,0.3)"
        />
        <SummaryCard
          label="Confirmados"
          value={stats.confirmedCount}
          color="#06d6a0"
          borderColor="rgba(6,214,160,0.3)"
        />
        <SummaryCard
          label="Pendentes"
          value={stats.pendingCount}
          color="#ffbe0b"
          borderColor="rgba(255,190,11,0.3)"
        />
        <SummaryCard
          label="Cancelados"
          value={stats.cancelledCount}
          color="#ff006e"
          borderColor="rgba(255,0,110,0.3)"
        />
      </div>

      {/* Revenue cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <RevenueCard
          label="Receita confirmada"
          amount={stats.revenueConfirmed}
          color="#06d6a0"
        />
        <RevenueCard
          label="Receita pendente"
          amount={stats.revenuePending}
          color="#ffbe0b"
        />
      </div>

      {/* Breakdown sections */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <BreakdownGroup
          title="Por perfil"
          items={[
            { label: 'Hacker', count: stats.byType.hacker, color: '#3a86ff' },
            { label: 'Hustler', count: stats.byType.hustler, color: '#06d6a0' },
            { label: 'Hipster', count: stats.byType.hipster, color: '#8338ec' },
            { label: 'Enthusiast', count: stats.byType.enthusiast, color: '#ffbe0b' },
          ]}
        />
        <BreakdownGroup
          title="Por tier"
          items={[
            { label: 'Early Bird', count: stats.byTier.early_bird, color: '#ffbe0b' },
            { label: 'Regular', count: stats.byTier.regular, color: '#3a86ff' },
          ]}
        />
        <BreakdownGroup
          title="Por modalidade"
          items={[
            { label: 'Time (form)', count: stats.byModality.individual_form_team, color: '#8338ec' },
            { label: 'Individual', count: stats.byModality.individual_own, color: '#06d6a0' },
            { label: 'Time próprio', count: stats.byModality.team, color: '#3a86ff' },
          ]}
        />
      </div>

      {/* Recent registrations */}
      <div className="card-glass rounded-xl p-5 flex flex-col gap-4">
        <h3 className="text-xs font-mono uppercase tracking-widest text-white/40">
          Inscrições recentes
        </h3>

        {stats.recent.length === 0 ? (
          <p className="text-white/30 text-sm font-mono">Nenhuma inscrição encontrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left pb-2 text-white/30 font-mono text-xs uppercase tracking-wider pr-4">
                    Nome
                  </th>
                  <th className="text-left pb-2 text-white/30 font-mono text-xs uppercase tracking-wider pr-4">
                    E-mail
                  </th>
                  <th className="text-left pb-2 text-white/30 font-mono text-xs uppercase tracking-wider pr-4">
                    Status
                  </th>
                  <th className="text-left pb-2 text-white/30 font-mono text-xs uppercase tracking-wider">
                    Data
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.recent.map((reg) => (
                  <tr
                    key={reg.id}
                    onClick={() => onViewRegistration(reg.id)}
                    className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
                  >
                    <td className="py-3 pr-4 text-white/80 font-display truncate max-w-[160px]">
                      {reg.full_name ?? '—'}
                    </td>
                    <td className="py-3 pr-4 text-white/50 font-mono text-xs truncate max-w-[180px]">
                      {reg.email ?? '—'}
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={reg.payment_status} />
                    </td>
                    <td className="py-3 text-white/40 font-mono text-xs whitespace-nowrap">
                      {reg.created_at ? formatDate(reg.created_at) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}
