import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { EVENT_CONFIG } from '../lib/config'

// ─── Helpers ────────────────────────────────────────────────────────────────

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

// Demographic aggregations — applied to a filtered subset (by audience).
function computeDemographics(registrations) {
  const byType = {
    hacker: registrations.filter((r) => r.occupation_type === 'hacker').length,
    hustler: registrations.filter((r) => r.occupation_type === 'hustler').length,
    hipster: registrations.filter((r) => r.occupation_type === 'hipster').length,
    enthusiast: registrations.filter((r) => r.occupation_type === 'enthusiast').length,
  }

  const byTier = {
    early_bird: registrations.filter((r) => r.ticket_tier === 'early_bird').length,
    regular: registrations.filter((r) => r.ticket_tier === 'regular').length,
    dati: registrations.filter((r) => r.ticket_tier === 'dati').length,
  }

  const byModality = {
    individual_form_team: registrations.filter((r) => r.inscription_modality === 'individual_form_team').length,
    individual_own: registrations.filter((r) => r.inscription_modality === 'individual_own').length,
    team: registrations.filter((r) => r.inscription_modality === 'team').length,
  }

  const dietaryMap = {}
  registrations.forEach(r => {
    const val = (r.dietary_restrictions ?? '').trim().toLowerCase()
    if (val && val !== 'nenhuma' && val !== 'não' && val !== 'nao' && val !== 'n/a' && val !== '-' && val !== 'nenhum') {
      dietaryMap[val] = (dietaryMap[val] ?? 0) + 1
    }
  })
  const dietarySorted = Object.entries(dietaryMap).sort((a, b) => b[1] - a[1])

  const pcdCount = registrations.filter(r => r.is_pcd).length
  const pcdTypes = {}
  registrations.forEach(r => {
    if (r.is_pcd && r.pcd_type) {
      const t = r.pcd_type.trim()
      if (t) pcdTypes[t] = (pcdTypes[t] ?? 0) + 1
    }
  })

  const aiLevels = {}
  registrations.forEach(r => {
    const lvl = r.ai_experience_level
    if (lvl != null) aiLevels[lvl] = (aiLevels[lvl] ?? 0) + 1
  })
  const aiAvg = registrations.length > 0
    ? (registrations.reduce((s, r) => s + (Number(r.ai_experience_level) || 0), 0) / registrations.length).toFixed(1)
    : 0

  const axesMap = {}
  registrations.forEach(r => {
    (r.economic_axes ?? []).forEach(ax => {
      axesMap[ax] = (axesMap[ax] ?? 0) + 1
    })
  })
  const axesSorted = Object.entries(axesMap).sort((a, b) => b[1] - a[1])

  const withProject = registrations.filter(r => r.has_project).length

  return {
    audienceSize: registrations.length,
    byType,
    byTier,
    byModality,
    dietarySorted,
    pcdCount,
    pcdTypes,
    aiLevels,
    aiAvg,
    axesSorted,
    withProject,
  }
}

function computeStats(registrations) {
  const total = registrations.length
  const confirmed = registrations.filter((r) => r.payment_status === 'confirmed')
  const pending = registrations.filter((r) => r.payment_status === 'pending')
  const cancelled = registrations.filter((r) => r.payment_status === 'cancelled')

  const revenueConfirmed = confirmed.reduce((sum, r) => sum + (r.ticket_price ?? 0), 0)
  const revenuePending = pending.reduce((sum, r) => sum + (r.ticket_price ?? 0), 0)

  const avgTicket = confirmed.length > 0 ? Math.round(revenueConfirmed / confirmed.length) : 0
  const conversionRate = (confirmed.length + pending.length) > 0
    ? Math.round((confirmed.length / (confirmed.length + pending.length)) * 100)
    : 0

  const earlyBirdUsed = confirmed.filter(r => r.ticket_tier === 'early_bird').length
  const earlyBirdLeft = Math.max(0, (EVENT_CONFIG.earlyBirdLimit ?? 10) - earlyBirdUsed)

  const recent = [...registrations]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5)

  const timeline = {}
  registrations.forEach(r => {
    const day = r.created_at?.slice(0, 10)
    if (day) timeline[day] = (timeline[day] ?? 0) + 1
  })

  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString()
  const stalePending = pending
    .filter(r => r.created_at < threeDaysAgo)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  return {
    total,
    confirmedCount: confirmed.length,
    pendingCount: pending.length,
    cancelledCount: cancelled.length,
    revenueConfirmed,
    revenuePending,
    avgTicket,
    conversionRate,
    earlyBirdLeft,
    earlyBirdUsed,
    recent,
    timeline,
    stalePending,
  }
}

// ─── Event Phase ────────────────────────────────────────────────────────────

function getEventPhase() {
  const now = new Date()
  const start = new Date(EVENT_CONFIG.eventStartDate)
  const end = new Date(EVENT_CONFIG.eventEndDate)

  if (now >= end) return { label: 'Evento encerrado', color: '#7a7aa0', icon: '✓' }
  if (now >= start) return { label: 'Evento em andamento', color: '#ff006e', icon: '⚡' }
  return { label: 'Inscrições abertas', color: '#06d6a0', icon: '●' }
}

function getCountdown() {
  const now = new Date()
  const start = new Date(EVENT_CONFIG.eventStartDate)
  const diff = start - now
  if (diff <= 0) return null
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  return { days, hours, minutes }
}

// ─── Sub-components ─────────────────────────────────────────────────────────

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

function MetricCard({ label, value, sub, color }) {
  return (
    <div className="card-glass rounded-xl p-4 flex flex-col gap-1">
      <span className="text-xs font-mono uppercase tracking-widest text-white/40">
        {label}
      </span>
      <span className="text-xl font-bold font-mono" style={{ color }}>
        {value}
      </span>
      {sub && <span className="text-xs text-white/30 font-mono">{sub}</span>}
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

// ─── Countdown Banner ───────────────────────────────────────────────────────

function CountdownBanner() {
  const [countdown, setCountdown] = useState(getCountdown)
  const phase = getEventPhase()

  useEffect(() => {
    const interval = setInterval(() => setCountdown(getCountdown()), 60000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="card-glass rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{phase.icon}</span>
        <div>
          <span className="text-sm font-mono uppercase tracking-widest" style={{ color: phase.color }}>
            {phase.label}
          </span>
          <p className="text-white/40 text-xs font-mono mt-0.5">
            {EVENT_CONFIG.name} — {EVENT_CONFIG.dates}
          </p>
        </div>
      </div>
      {countdown && (
        <div className="flex items-center gap-4">
          {[
            { value: countdown.days, label: 'dias' },
            { value: countdown.hours, label: 'hrs' },
            { value: countdown.minutes, label: 'min' },
          ].map(({ value, label }) => (
            <div key={label} className="text-center">
              <span className="text-3xl font-bold font-display text-cyan">{value}</span>
              <span className="block text-[10px] font-mono uppercase tracking-wider text-white/40">
                {label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Capacity Progress Bar ──────────────────────────────────────────────────

function CapacityBar({ confirmed, pending, max }) {
  const confirmedPct = Math.min((confirmed / max) * 100, 100)
  const pendingPct = Math.min((pending / max) * 100, 100 - confirmedPct)
  const total = confirmed + pending

  return (
    <div className="card-glass rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-mono uppercase tracking-widest text-white/40">
          Capacidade do evento
        </h3>
        <span className="text-sm font-mono text-white/60">
          {total}/{max} vagas
          {total >= max * 0.9 && total < max && (
            <span className="ml-2 text-gold text-xs">⚠ Quase lotado</span>
          )}
          {total >= max && (
            <span className="ml-2 text-hot text-xs">🔴 Lotado</span>
          )}
        </span>
      </div>
      <div className="w-full h-4 rounded-full bg-white/5 overflow-hidden relative">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
          style={{
            width: `${confirmedPct}%`,
            background: 'linear-gradient(90deg, #06d6a0, #3a86ff)',
          }}
        />
        <div
          className="absolute inset-y-0 rounded-full transition-all duration-700"
          style={{
            left: `${confirmedPct}%`,
            width: `${pendingPct}%`,
            background: 'rgba(255, 190, 11, 0.4)',
          }}
        />
      </div>
      <div className="flex items-center gap-4 text-xs font-mono text-white/40">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#06d6a0' }} />
          {confirmed} confirmados
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(255,190,11,0.6)' }} />
          {pending} pendentes
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
          {Math.max(0, max - total)} disponíveis
        </span>
      </div>
    </div>
  )
}

// ─── Donut Chart (SVG) ──────────────────────────────────────────────────────

function DonutChart({ data, title }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) return null

  const size = 120
  const strokeWidth = 20
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  // Pre-compute offsets to avoid mutating during render
  const segments = data.reduce((acc, d) => {
    const pct = d.value / total
    const dash = pct * circumference
    const gap = circumference - dash
    const prevOffset = acc.length > 0 ? acc[acc.length - 1].nextOffset : 0
    acc.push({ dash, gap, offset: prevOffset, nextOffset: prevOffset + dash, color: d.color })
    return acc
  }, [])

  return (
    <div className="card-glass rounded-xl p-5 flex flex-col gap-3">
      <h3 className="text-xs font-mono uppercase tracking-widest text-white/40">{title}</h3>
      <div className="flex items-center gap-6">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0 -rotate-90">
          {segments.map((seg, i) => (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${seg.dash} ${seg.gap}`}
                strokeDashoffset={-seg.offset}
                className="transition-all duration-700"
              />
          ))}
        </svg>
        <ul className="flex flex-col gap-1.5">
          {data.map((d, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: d.color }} />
              <span className="text-white/70 font-display">{d.label}</span>
              <span className="text-white/40 font-mono text-xs ml-auto pl-2">
                {d.value} ({Math.round((d.value / total) * 100)}%)
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ─── Timeline Chart (SVG) ───────────────────────────────────────────────────

function TimelineChart({ timeline }) {
  const entries = Object.entries(timeline).sort((a, b) => a[0].localeCompare(b[0]))
  if (entries.length === 0) return null

  // Fill gaps between dates
  const filledEntries = []
  if (entries.length > 0) {
    const startDate = new Date(entries[0][0])
    const endDate = new Date(entries[entries.length - 1][0])
    const current = new Date(startDate)
    while (current <= endDate) {
      const key = current.toISOString().slice(0, 10)
      filledEntries.push([key, timeline[key] ?? 0])
      current.setDate(current.getDate() + 1)
    }
  }

  if (filledEntries.length === 0) return null

  const maxVal = Math.max(...filledEntries.map(e => e[1]), 1)
  const width = 600
  const height = 120
  const padding = { top: 10, bottom: 25, left: 5, right: 5 }
  const chartW = width - padding.left - padding.right
  const chartH = height - padding.top - padding.bottom

  const points = filledEntries.map((e, i) => {
    const x = padding.left + (i / Math.max(filledEntries.length - 1, 1)) * chartW
    const y = padding.top + chartH - (e[1] / maxVal) * chartH
    return { x, y, value: e[1], date: e[0] }
  })

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const areaPath = linePath + ` L${points[points.length - 1].x},${padding.top + chartH} L${points[0].x},${padding.top + chartH} Z`

  // Cumulative line - compute total first for normalization
  const maxCumulative = filledEntries.reduce((s, e) => s + e[1], 0)
  const normalizedCumulative = filledEntries.map((e, i) => {
    let sum = 0
    for (let j = 0; j <= i; j++) sum += filledEntries[j][1]
    const x = padding.left + (i / Math.max(filledEntries.length - 1, 1)) * chartW
    const y = padding.top + chartH - (sum / Math.max(maxCumulative, 1)) * chartH
    return { x, y }
  })
  const cumulativePath = normalizedCumulative.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')

  // Show ~5 date labels
  const labelStep = Math.max(1, Math.floor(filledEntries.length / 5))

  return (
    <div className="card-glass rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-mono uppercase tracking-widest text-white/40">
          Inscrições ao longo do tempo
        </h3>
        <div className="flex items-center gap-3 text-[10px] font-mono text-white/30">
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 rounded" style={{ background: '#06d6a0' }} />
            Por dia
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 rounded" style={{ background: '#3a86ff' }} />
            Acumulado
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(pct => (
          <line
            key={pct}
            x1={padding.left}
            x2={width - padding.right}
            y1={padding.top + chartH * (1 - pct)}
            y2={padding.top + chartH * (1 - pct)}
            stroke="rgba(255,255,255,0.05)"
          />
        ))}
        {/* Area fill */}
        <path d={areaPath} fill="url(#areaGrad)" />
        {/* Daily line */}
        <path d={linePath} fill="none" stroke="#06d6a0" strokeWidth="2" />
        {/* Cumulative line */}
        <path d={cumulativePath} fill="none" stroke="#3a86ff" strokeWidth="1.5" strokeDasharray="4 2" />
        {/* Dots */}
        {points.map((p, i) => (
          p.value > 0 && (
            <circle key={i} cx={p.x} cy={p.y} r="3" fill="#06d6a0" />
          )
        ))}
        {/* Date labels */}
        {filledEntries.map((e, i) => (
          i % labelStep === 0 && (
            <text
              key={i}
              x={padding.left + (i / Math.max(filledEntries.length - 1, 1)) * chartW}
              y={height - 2}
              textAnchor="middle"
              fill="rgba(255,255,255,0.25)"
              fontSize="8"
              fontFamily="monospace"
            >
              {e[0].slice(5)}
            </text>
          )
        ))}
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#06d6a0" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#06d6a0" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  )
}

// ─── Bar Chart (horizontal) ─────────────────────────────────────────────────

function HorizontalBarChart({ title, items, color }) {
  if (items.length === 0) return null
  const max = Math.max(...items.map(i => i.value), 1)

  return (
    <div className="card-glass rounded-xl p-5 flex flex-col gap-3">
      <h3 className="text-xs font-mono uppercase tracking-widest text-white/40">{title}</h3>
      <div className="flex flex-col gap-2">
        {items.map(({ label, value }) => (
          <div key={label} className="flex items-center gap-3">
            <span className="text-xs text-white/60 font-display w-32 truncate text-right" title={label}>
              {label}
            </span>
            <div className="flex-1 h-5 rounded bg-white/5 overflow-hidden relative">
              <div
                className="h-full rounded transition-all duration-500"
                style={{
                  width: `${(value / max) * 100}%`,
                  background: color ?? '#3a86ff',
                  minWidth: value > 0 ? '2px' : '0',
                }}
              />
            </div>
            <span className="text-xs font-mono text-white/50 w-8 text-right">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── AI Experience Histogram ────────────────────────────────────────────────

function AIExperienceChart({ aiLevels, aiAvg, audienceLabel }) {
  const levels = Array.from({ length: 10 }, (_, i) => i + 1)
  const max = Math.max(...levels.map(l => aiLevels[l] ?? 0), 1)

  return (
    <div className="card-glass rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-mono uppercase tracking-widest text-white/40">
          Experiência em IA{audienceLabel ? ` — ${audienceLabel}` : ''}
        </h3>
        <span className="text-sm font-mono text-electric">
          Média: {aiAvg}
        </span>
      </div>
      <div className="flex items-end gap-1.5">
        {levels.map(lvl => {
          const count = aiLevels[lvl] ?? 0
          const barHeight = max > 0 ? (count / max) * 80 : 0
          return (
            <div key={lvl} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[10px] font-mono text-white/40 leading-none h-3">
                {count > 0 ? count : ''}
              </span>
              <div
                className="w-full rounded-t transition-all duration-500"
                style={{
                  height: `${barHeight}px`,
                  minHeight: count > 0 ? '4px' : '0',
                  background: `hsl(${160 + lvl * 12}, 70%, 55%)`,
                }}
              />
              <span className="text-[10px] font-mono text-white/30 leading-none">{lvl}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Dietary & PCD Cards ────────────────────────────────────────────────────

function DietaryCard({ dietarySorted, total, audienceLabel }) {
  const withRestrictions = dietarySorted.reduce((s, [, c]) => s + c, 0)

  return (
    <div className="card-glass rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <h3 className="text-xs font-mono uppercase tracking-widest text-white/40">
            Restrições alimentares
          </h3>
          {audienceLabel && (
            <span className="text-[10px] font-mono text-white/30 mt-0.5">
              {audienceLabel}
            </span>
          )}
        </div>
        <span className="text-sm font-mono" style={{ color: withRestrictions > 0 ? '#ffbe0b' : '#06d6a0' }}>
          {withRestrictions}/{total}
        </span>
      </div>
      {dietarySorted.length === 0 ? (
        <p className="text-white/30 text-sm font-mono">Nenhuma restrição registrada.</p>
      ) : (
        <ul className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
          {dietarySorted.map(([restriction, count]) => (
            <li key={restriction} className="flex items-center justify-between text-sm">
              <span className="text-white/70 capitalize truncate max-w-[200px]" title={restriction}>{restriction}</span>
              <span className="text-gold font-mono text-xs px-2 py-0.5 rounded bg-gold/10">
                {count}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PCDCard({ pcdCount, pcdTypes, total, audienceLabel }) {
  return (
    <div className="card-glass rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <h3 className="text-xs font-mono uppercase tracking-widest text-white/40">
            Acessibilidade (PCD)
          </h3>
          {audienceLabel && (
            <span className="text-[10px] font-mono text-white/30 mt-0.5">
              {audienceLabel}
            </span>
          )}
        </div>
        <span className="text-sm font-mono" style={{ color: pcdCount > 0 ? '#8338ec' : '#06d6a0' }}>
          {pcdCount}/{total}
        </span>
      </div>
      {pcdCount === 0 ? (
        <p className="text-white/30 text-sm font-mono">Nenhum PCD registrado.</p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold font-display text-violet">{pcdCount}</span>
            <span className="text-white/50 text-sm">participante{pcdCount !== 1 ? 's' : ''} PCD</span>
          </div>
          {Object.keys(pcdTypes).length > 0 && (
            <ul className="flex flex-col gap-1">
              {Object.entries(pcdTypes).map(([type, count]) => (
                <li key={type} className="flex items-center justify-between text-sm">
                  <span className="text-white/70 capitalize">{type}</span>
                  <span className="text-violet font-mono text-xs px-2 py-0.5 rounded bg-violet/10">
                    {count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

// ─── Conversion Funnel ─────────────────────────────────────────────────────

function ConversionFunnel({ total, pending, confirmed, checkedIn }) {
  const stages = [
    { label: 'Total inscritos', count: total, color: '#3a86ff' },
    { label: 'Pendentes', count: pending, color: '#ffbe0b' },
    { label: 'Confirmados', count: confirmed, color: '#06d6a0' },
  ]
  if (checkedIn != null) {
    stages.push({ label: 'Check-in', count: checkedIn, color: '#8338ec' })
  }

  if (total === 0) return null

  const svgW = 400
  const stageH = 48
  const svgH = stages.length * stageH + 10
  const maxW = 340
  const minW = 120

  return (
    <div className="card-glass rounded-xl p-5 flex flex-col gap-3">
      <h3 className="text-xs font-mono uppercase tracking-widest text-white/40">
        Funil de conversão
      </h3>
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full max-w-md mx-auto" preserveAspectRatio="xMidYMid meet">
        {stages.map((stage, i) => {
          const pct = total > 0 ? stage.count / total : 0
          const nextPct = i < stages.length - 1 && total > 0
            ? stages[i + 1].count / total
            : pct * 0.7
          const w = minW + (maxW - minW) * pct
          const nextW = minW + (maxW - minW) * nextPct
          const cx = svgW / 2
          const y = i * stageH + 5

          return (
            <g key={stage.label}>
              {/* Trapezoid */}
              <path
                d={`M${cx - w / 2},${y} L${cx + w / 2},${y} L${cx + nextW / 2},${y + stageH - 4} L${cx - nextW / 2},${y + stageH - 4} Z`}
                fill={stage.color}
                opacity="0.2"
                stroke={stage.color}
                strokeWidth="1"
                strokeOpacity="0.4"
              />
              {/* Label */}
              <text x={cx} y={y + stageH / 2 - 5} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="11" fontFamily="var(--font-display, sans-serif)">
                {stage.label}
              </text>
              <text x={cx} y={y + stageH / 2 + 10} textAnchor="middle" fill={stage.color} fontSize="14" fontWeight="bold" fontFamily="monospace">
                {stage.count} ({total > 0 ? Math.round((stage.count / total) * 100) : 0}%)
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ─── Stale Payment Alerts ──────────────────────────────────────────────────

function AlertsSection({ stalePending, onViewAll, now }) {
  if (stalePending.length === 0) return null

  return (
    <div className="card-glass rounded-xl p-5 flex flex-col gap-3 border border-gold/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-gold text-lg">⚠</span>
          <h3 className="text-xs font-mono uppercase tracking-widest text-gold">
            Pagamentos pendentes há mais de 3 dias
          </h3>
        </div>
        <span className="text-sm font-mono font-bold text-gold px-2 py-0.5 rounded bg-gold/10">
          {stalePending.length}
        </span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {stalePending.slice(0, 5).map(r => {
          const daysAgo = Math.floor((now - new Date(r.created_at)) / 86400000)
          return (
            <li key={r.id} className="flex items-center justify-between text-sm">
              <span className="text-white/70 font-display truncate max-w-[200px]">{r.full_name}</span>
              <span className="text-white/40 font-mono text-xs">{daysAgo} dias atrás</span>
            </li>
          )
        })}
      </ul>
      {stalePending.length > 5 && (
        <span className="text-white/30 text-xs font-mono">
          ... e mais {stalePending.length - 5}
        </span>
      )}
      {onViewAll && (
        <button
          onClick={onViewAll}
          className="self-start px-3 py-1.5 rounded-lg text-xs font-medium bg-gold/10 text-gold border border-gold/20 hover:bg-gold/20 transition-colors"
        >
          Ver todos pendentes
        </button>
      )}
    </div>
  )
}

// ─── Audience Filter ───────────────────────────────────────────────────────

const AUDIENCE_OPTIONS = [
  { id: 'confirmed', label: 'Confirmados', hint: 'Quem efetivamente vai ao evento' },
  { id: 'active', label: '+ Pendentes', hint: 'Confirmados + pagamentos em aberto' },
  { id: 'all', label: 'Todos', hint: 'Inclui inscrições canceladas' },
]

function filterRegistrationsByAudience(registrations, audience) {
  if (audience === 'confirmed') {
    return registrations.filter(r => r.payment_status === 'confirmed')
  }
  if (audience === 'active') {
    return registrations.filter(r => r.payment_status !== 'cancelled')
  }
  return registrations
}

function AudienceFilter({ audience, onChange, counts }) {
  return (
    <div className="card-glass rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="text-cyan text-lg">⌾</span>
        <div>
          <h3 className="text-xs font-mono uppercase tracking-widest text-white/60">
            Audiência dos gráficos demográficos
          </h3>
          <p className="text-white/40 text-[11px] font-mono mt-0.5">
            Afeta perfil, modalidade, tier, IA, eixos, restrições alimentares e PCD.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1 border border-white/10">
        {AUDIENCE_OPTIONS.map(opt => {
          const active = audience === opt.id
          return (
            <button
              key={opt.id}
              onClick={() => onChange(opt.id)}
              title={opt.hint}
              className={`px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider transition-colors ${
                active
                  ? 'bg-cyan/20 text-cyan border border-cyan/30'
                  : 'text-white/50 hover:text-white/80 border border-transparent'
              }`}
            >
              {opt.label}
              <span className="ml-1.5 text-[10px] opacity-60">
                ({counts[opt.id]})
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Auto-refresh / Live Indicator ─────────────────────────────────────────

function RefreshBar({ lastUpdated, autoRefresh, onToggle, isLive }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - lastUpdated) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [lastUpdated])

  const formatElapsed = (s) => {
    if (s < 60) return `${s}s`
    return `${Math.floor(s / 60)}m ${s % 60}s`
  }

  return (
    <div className="flex items-center justify-end gap-4 text-xs font-mono text-white/40">
      {isLive && (
        <span className="flex items-center gap-1.5 text-cyan">
          <span className="w-2 h-2 rounded-full bg-cyan animate-pulse" />
          LIVE
        </span>
      )}
      <span>Atualizado há {formatElapsed(elapsed)}</span>
      <button
        onClick={onToggle}
        className={`px-2 py-1 rounded text-xs border transition-colors ${
          autoRefresh
            ? 'bg-cyan/10 text-cyan border-cyan/20'
            : 'bg-white/5 text-white/40 border-white/10'
        }`}
      >
        Auto-refresh {autoRefresh ? 'ON' : 'OFF'}
      </button>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function AdminDashboard({ onViewRegistration }) {
  const [registrations, setRegistrations] = useState([])
  const [loading, setLoading] = useState(!supabase ? false : true)
  const [error, setError] = useState(!supabase ? 'Supabase não configurado.' : null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(() => Date.now())
  const [isLive, setIsLive] = useState(false)
  const [feeData, setFeeData] = useState(null)
  const [syncStatus, setSyncStatus] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [audience, setAudience] = useState(() => {
    try { return localStorage.getItem('admin.dashboard.audience') ?? 'confirmed' } catch { return 'confirmed' }
  })

  const updateAudience = useCallback((next) => {
    setAudience(next)
    try { localStorage.setItem('admin.dashboard.audience', next) } catch { /* storage opcional */ }
  }, [])

  const fetchRegistrations = useCallback(async () => {
    if (!supabase) return
    const { data, error: fetchError } = await supabase
      .from('registrations')
      .select('id, full_name, email, payment_status, occupation_type, ticket_tier, ticket_price, inscription_modality, created_at, dietary_restrictions, is_pcd, pcd_type, ai_experience_level, economic_axes, has_project, project_name')
      .order('created_at', { ascending: false })

    if (fetchError) {
      setError(fetchError.message)
    } else {
      setRegistrations(data ?? [])
    }
    setLastUpdated(Date.now())
    setLoading(false)
  }, [])

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

  const handleMpSync = useCallback(async () => {
    if (!supabase) return
    setSyncing(true)
    try {
      const { error: syncError } = await supabase.functions.invoke('sync-mp-payments')
      if (syncError) throw syncError
      await fetchFeeData()
      await fetchSyncStatus()
    } catch (err) {
      console.error('MP sync error:', err)
    } finally {
      setSyncing(false)
    }
  }, [fetchFeeData, fetchSyncStatus])

  // Initial fetch + realtime subscription
  useEffect(() => {
    if (!supabase) return
    fetchRegistrations() // eslint-disable-line react-hooks/set-state-in-effect
    fetchFeeData()
    fetchSyncStatus()

    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, () => {
        fetchRegistrations()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mp_payments' }, () => {
        fetchFeeData()
      })
      .subscribe((status) => {
        setIsLive(status === 'SUBSCRIBED')
      })

    return () => { channel?.unsubscribe() }
  }, [fetchRegistrations, fetchFeeData, fetchSyncStatus])

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefresh || !supabase) return
    const interval = setInterval(fetchRegistrations, 60000)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchRegistrations])

  const stats = useMemo(() => computeStats(registrations), [registrations])

  const audienceCounts = useMemo(() => ({
    confirmed: stats.confirmedCount,
    active: stats.confirmedCount + stats.pendingCount,
    all: stats.total,
  }), [stats.confirmedCount, stats.pendingCount, stats.total])

  const demographics = useMemo(
    () => computeDemographics(filterRegistrationsByAudience(registrations, audience)),
    [registrations, audience]
  )

  const audienceLabel = AUDIENCE_OPTIONS.find(o => o.id === audience)?.label ?? 'Confirmados'

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

  const maxCapacity = EVENT_CONFIG.maxCapacity ?? 100

  return (
    <div className="flex flex-col gap-6">

      {/* Refresh bar */}
      <RefreshBar
        lastUpdated={lastUpdated}
        autoRefresh={autoRefresh}
        onToggle={() => setAutoRefresh(v => !v)}
        isLive={isLive}
      />

      {/* Countdown & Phase */}
      <CountdownBanner />

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

      {/* Stale payment alerts */}
      <AlertsSection stalePending={stats.stalePending} now={lastUpdated} />

      {/* Capacity bar */}
      <CapacityBar
        confirmed={stats.confirmedCount}
        pending={stats.pendingCount}
        max={maxCapacity}
      />

      {/* MP Sync indicator */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-white/40">
          {syncStatus?.last_sync_at
            ? `Último sync MP: ${formatDate(syncStatus.last_sync_at)}`
            : 'MP ainda não sincronizado'}
        </span>
        <button
          onClick={handleMpSync}
          disabled={syncing}
          className={`px-3 py-1 rounded text-xs font-mono border transition-colors ${
            syncing
              ? 'bg-gold/10 text-gold border-gold/20 cursor-wait'
              : 'bg-cyan/10 text-cyan border-cyan/20 hover:bg-cyan/20'
          }`}
        >
          {syncing ? 'Sincronizando...' : 'Sincronizar MP'}
        </button>
      </div>

      {/* Revenue cards + advanced metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <RevenueCard
          label="Receita bruta"
          amount={feeData ? feeData.total_gross : stats.revenueConfirmed}
          color="#06d6a0"
        />
        <RevenueCard
          label="Receita líquida"
          amount={feeData ? feeData.total_net : stats.revenueConfirmed}
          color="#3a86ff"
        />
        <RevenueCard
          label="Taxas MP"
          amount={feeData ? feeData.total_fees : 0}
          color="#ff006e"
        />
        <RevenueCard
          label="Receita pendente"
          amount={stats.revenuePending}
          color="#ffbe0b"
        />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Ticket médio"
          value={formatBRL(stats.avgTicket)}
          color="#3a86ff"
        />
        <MetricCard
          label="Receita projetada"
          value={formatBRL((feeData ? feeData.total_net : stats.revenueConfirmed) + stats.revenuePending)}
          sub="Líquida + pendentes"
          color="#8338ec"
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Taxa de conversão"
          value={`${stats.conversionRate}%`}
          sub="Confirmados / (Confirmados + Pendentes)"
          color="#06d6a0"
        />
        <MetricCard
          label="Early bird restantes"
          value={stats.earlyBirdLeft}
          sub={`${stats.earlyBirdUsed}/${EVENT_CONFIG.earlyBirdLimit ?? 10} usados`}
          color={stats.earlyBirdLeft <= 2 ? '#ff006e' : '#ffbe0b'}
        />
      </div>

      {/* Audience filter for demographic sections */}
      <AudienceFilter audience={audience} onChange={updateAudience} counts={audienceCounts} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Com projeto"
          value={demographics.withProject}
          sub={`de ${demographics.audienceSize} (${audienceLabel.toLowerCase()})`}
          color="#8338ec"
        />
        <MetricCard
          label="Nível IA médio"
          value={demographics.aiAvg}
          sub={`Escala 1-10 (${audienceLabel.toLowerCase()})`}
          color="#3a86ff"
        />
      </div>

      {/* Conversion Funnel */}
      <ConversionFunnel
        total={stats.total}
        pending={stats.pendingCount}
        confirmed={stats.confirmedCount}
      />

      {/* Timeline chart */}
      <TimelineChart timeline={stats.timeline} />

      {/* Donut + Breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DonutChart
          title={`Distribuição por perfil — ${audienceLabel}`}
          data={[
            { label: 'Hacker', value: demographics.byType.hacker, color: '#3a86ff' },
            { label: 'Hustler', value: demographics.byType.hustler, color: '#06d6a0' },
            { label: 'Hipster', value: demographics.byType.hipster, color: '#8338ec' },
            { label: 'Enthusiast', value: demographics.byType.enthusiast, color: '#ffbe0b' },
          ]}
        />
        <DonutChart
          title={`Por modalidade — ${audienceLabel}`}
          data={[
            { label: 'Time (form)', value: demographics.byModality.individual_form_team, color: '#8338ec' },
            { label: 'Individual', value: demographics.byModality.individual_own, color: '#06d6a0' },
            { label: 'Time próprio', value: demographics.byModality.team, color: '#3a86ff' },
          ]}
        />
      </div>

      {/* Breakdown sections */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <BreakdownGroup
          title={`Por perfil — ${audienceLabel}`}
          items={[
            { label: 'Hacker', count: demographics.byType.hacker, color: '#3a86ff' },
            { label: 'Hustler', count: demographics.byType.hustler, color: '#06d6a0' },
            { label: 'Hipster', count: demographics.byType.hipster, color: '#8338ec' },
            { label: 'Enthusiast', count: demographics.byType.enthusiast, color: '#ffbe0b' },
          ]}
        />
        <BreakdownGroup
          title={`Por tier — ${audienceLabel}`}
          items={[
            { label: 'Early Bird', count: demographics.byTier.early_bird, color: '#ffbe0b' },
            { label: 'Regular', count: demographics.byTier.regular, color: '#3a86ff' },
            { label: 'DATI', count: demographics.byTier.dati, color: '#8338ec' },
          ]}
        />
        <BreakdownGroup
          title={`Por modalidade — ${audienceLabel}`}
          items={[
            { label: 'Time (form)', count: demographics.byModality.individual_form_team, color: '#8338ec' },
            { label: 'Individual', count: demographics.byModality.individual_own, color: '#06d6a0' },
            { label: 'Time próprio', count: demographics.byModality.team, color: '#3a86ff' },
          ]}
        />
      </div>

      {/* AI Experience Histogram */}
      <AIExperienceChart aiLevels={demographics.aiLevels} aiAvg={demographics.aiAvg} audienceLabel={audienceLabel} />

      {/* Economic Axes */}
      {demographics.axesSorted.length > 0 && (
        <HorizontalBarChart
          title={`Eixos econômicos mais populares — ${audienceLabel}`}
          items={demographics.axesSorted.map(([label, value]) => ({ label, value }))}
          color="#8338ec"
        />
      )}

      {/* Dietary & PCD */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <DietaryCard
          dietarySorted={demographics.dietarySorted}
          total={demographics.audienceSize}
          audienceLabel={audienceLabel}
        />
        <PCDCard
          pcdCount={demographics.pcdCount}
          pcdTypes={demographics.pcdTypes}
          total={demographics.audienceSize}
          audienceLabel={audienceLabel}
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

      {/* Waitlist section */}
      <WaitlistSection />

    </div>
  )
}

// ─── Waitlist Section ─────────────────────────────────────────────────────────

function WaitlistSection() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    supabase
      .from('waitlist')
      .select('id, full_name, email, phone, created_at')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setEntries(data ?? [])
        setLoading(false)
      })
  }, [])

  if (loading) return null
  if (entries.length === 0) return null

  return (
    <div className="rounded-2xl border border-hot/20 bg-white/[0.02] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-bold flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-hot animate-pulse" />
          Lista de Espera
          <span className="text-hot font-mono text-sm">({entries.length})</span>
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-white/40 text-left font-mono text-xs border-b border-white/10">
              <th className="pb-2 pr-4">Nome</th>
              <th className="pb-2 pr-4">E-mail</th>
              <th className="pb-2 pr-4">Telefone</th>
              <th className="pb-2">Data</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-white/5">
                <td className="py-3 pr-4 text-white/80 truncate max-w-[160px]">{e.full_name}</td>
                <td className="py-3 pr-4 text-white/50 font-mono text-xs truncate max-w-[180px]">{e.email}</td>
                <td className="py-3 pr-4 text-white/50 font-mono text-xs">{e.phone}</td>
                <td className="py-3 text-white/40 font-mono text-xs whitespace-nowrap">
                  {e.created_at ? formatDate(e.created_at) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
