import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// ─── Constants ───────────────────────────────────────────────────────────────

const OCCUPATION_COLORS = {
  hacker:  { bg: 'bg-electric/20', text: 'text-electric', border: 'border-electric/30' },
  hustler: { bg: 'bg-cyan/20',     text: 'text-cyan',     border: 'border-cyan/30'     },
  hipster: { bg: 'bg-violet/20',   text: 'text-violet',   border: 'border-violet/30'   },
}

const PAYMENT_COLORS = {
  confirmed: { bg: 'bg-cyan/15',    text: 'text-cyan',  border: 'border-cyan/30',  label: 'Confirmado'  },
  pending:   { bg: 'bg-gold/15',    text: 'text-gold',  border: 'border-gold/30',  label: 'Pendente'    },
  cancelled: { bg: 'bg-hot/15',     text: 'text-hot',   border: 'border-hot/30',   label: 'Cancelado'   },
}

const AI_LEVEL_LABELS = {
  none:         'Nenhuma',
  basic:        'Básica',
  intermediate: 'Intermediária',
  advanced:     'Avançada',
  expert:       'Expert',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTeamStatus(members) {
  if (members.every(m => m.payment_status === 'confirmed')) return 'confirmed'
  if (members.some(m => m.payment_status === 'cancelled'))  return 'cancelled'
  return 'pending'
}

function Badge({ colorMap, value, fallbackLabel }) {
  const style = colorMap[value] ?? { bg: 'bg-white/10', text: 'text-white/50', border: 'border-white/10' }
  const label = style.label ?? fallbackLabel ?? value ?? '—'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono border ${style.bg} ${style.text} ${style.border}`}>
      {label}
    </span>
  )
}

function StatusDot({ status }) {
  const colors = {
    confirmed: 'bg-cyan',
    pending:   'bg-gold',
    cancelled: 'bg-hot',
  }
  return (
    <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${colors[status] ?? 'bg-white/30'}`} />
  )
}

// ─── MoveModal ───────────────────────────────────────────────────────────────

function MoveModal({ member, teams, onConfirm, onCancel }) {
  const [newTeamName, setNewTeamName] = useState('')
  const [mode, setMode] = useState('existing') // 'existing' | 'new'

  const otherTeams = teams.filter(t => t !== member.team_name)

  function handleSubmit(e) {
    e.preventDefault()
    const target = mode === 'new' ? newTeamName.trim() : newTeamName
    if (!target) return
    onConfirm(target)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark/80 backdrop-blur-sm">
      <div className="card-glass rounded-2xl p-6 w-full max-w-sm space-y-4">
        <h3 className="font-display font-semibold text-white">
          Mover <span className="text-cyan">{member.full_name}</span>
        </h3>
        <p className="text-white/50 text-sm">
          Time atual: <span className="text-white/70 font-mono">{member.team_name}</span>
        </p>

        <div className="flex gap-2">
          <button
            onClick={() => { setMode('existing'); setNewTeamName('') }}
            className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
              mode === 'existing'
                ? 'bg-electric/20 text-electric border-electric/30'
                : 'bg-white/5 text-white/50 border-white/10 hover:text-white/70'
            }`}
          >
            Time existente
          </button>
          <button
            onClick={() => { setMode('new'); setNewTeamName('') }}
            className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
              mode === 'new'
                ? 'bg-electric/20 text-electric border-electric/30'
                : 'bg-white/5 text-white/50 border-white/10 hover:text-white/70'
            }`}
          >
            Novo nome
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'existing' ? (
            <select
              value={newTeamName}
              onChange={e => setNewTeamName(e.target.value)}
              required
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-electric/50 focus:ring-1 focus:ring-electric/30 transition-colors"
            >
              <option value="">Selecione um time...</option>
              {otherTeams.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={newTeamName}
              onChange={e => setNewTeamName(e.target.value)}
              required
              placeholder="Nome do novo time"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-electric/50 focus:ring-1 focus:ring-electric/30 transition-colors"
            />
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-2 rounded-lg text-sm font-medium bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border border-white/10 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 py-2 rounded-lg text-sm font-medium bg-electric/20 text-electric hover:bg-electric/30 border border-electric/30 transition-colors"
            >
              Confirmar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── MemberRow ───────────────────────────────────────────────────────────────

function MemberRow({ member, allTeamNames, onMove, onRemove, readOnly }) {
  const [showMove, setShowMove] = useState(false)

  async function handleMove(newTeamName) {
    setShowMove(false)
    await onMove(member, newTeamName)
  }

  return (
    <>
      <div className="flex items-start gap-3 p-3 rounded-xl bg-white/3 border border-white/5 hover:border-white/10 transition-colors">
        {/* Leader crown */}
        <div className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full mt-0.5">
          {member.is_team_leader
            ? <span className="text-gold text-base" title="Líder do time">★</span>
            : <span className="text-white/20 text-xs">●</span>
          }
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-white text-sm truncate">
              {member.full_name}
              {member.is_team_leader && (
                <span className="ml-1.5 text-xs text-gold/80 font-mono">(líder)</span>
              )}
            </span>
            <Badge
              colorMap={OCCUPATION_COLORS}
              value={member.occupation_type}
              fallbackLabel={member.occupation_type}
            />
            <Badge
              colorMap={PAYMENT_COLORS}
              value={member.payment_status}
            />
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-white/50 font-mono">
            <span>{member.email}</span>
            {member.ai_experience_level && (
              <span className="text-white/40">
                IA: {AI_LEVEL_LABELS[member.ai_experience_level] ?? member.ai_experience_level}
              </span>
            )}
          </div>
        </div>

        {/* Actions (non-leader only) */}
        {!readOnly && !member.is_team_leader && (
          <div className="flex gap-1.5 flex-shrink-0">
            <button
              onClick={() => setShowMove(true)}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-electric/10 text-electric/80 hover:bg-electric/20 hover:text-electric border border-electric/20 transition-colors"
            >
              Mover
            </button>
            <button
              onClick={() => onRemove(member)}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-hot/10 text-hot/70 hover:bg-hot/20 hover:text-hot border border-hot/20 transition-colors"
            >
              Remover
            </button>
          </div>
        )}
      </div>

      {showMove && (
        <MoveModal
          member={member}
          teams={allTeamNames}
          onConfirm={handleMove}
          onCancel={() => setShowMove(false)}
        />
      )}
    </>
  )
}

// ─── Profile Composition ──────────────────────────────────────────────────────

const ALL_PROFILES = ['hacker', 'hustler', 'hipster']
const PROFILE_COLORS = {
  hacker:     '#3a86ff',
  hustler:    '#06d6a0',
  hipster:    '#8338ec',
  enthusiast: '#ffbe0b',
}
const PROFILE_LABELS = {
  hacker: 'H',
  hustler: 'U',
  hipster: 'D',
  enthusiast: 'E',
}

function ProfileComposition({ members }) {
  const types = new Set(members.map(m => m.occupation_type))
  const missing = ALL_PROFILES.filter(p => !types.has(p))
  const isBalanced = missing.length === 0

  return (
    <div className="flex items-center gap-1.5">
      {['hacker', 'hustler', 'hipster', 'enthusiast'].map(type => {
        const count = members.filter(m => m.occupation_type === type).length
        if (count === 0) return null
        return (
          <span
            key={type}
            className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold font-mono"
            style={{ background: `${PROFILE_COLORS[type]}30`, color: PROFILE_COLORS[type] }}
            title={`${type}: ${count}`}
          >
            {PROFILE_LABELS[type]}
          </span>
        )
      })}
      {isBalanced ? (
        <span className="text-[10px] font-mono text-cyan ml-1">Balanceado</span>
      ) : (
        <span className="text-[10px] font-mono text-gold/60 ml-1">
          Falta: {missing.join(', ')}
        </span>
      )}
    </div>
  )
}

function PaymentProgressBar({ confirmed, total }) {
  const pct = total > 0 ? (confirmed / total) * 100 : 0
  return (
    <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden" title={`${confirmed}/${total} pagos`}>
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{
          width: `${pct}%`,
          background: pct === 100 ? '#06d6a0' : '#ffbe0b',
        }}
      />
    </div>
  )
}

// ─── TeamCard ─────────────────────────────────────────────────────────────────

function TeamCard({ team, allTeamNames, expanded, onToggle, onRefetch, readOnly }) {
  const { name, members } = team
  const status = getTeamStatus(members)
  const confirmedCount = members.filter(m => m.payment_status === 'confirmed').length

  const statusStyle = {
    confirmed: { dot: 'bg-cyan', text: 'text-cyan',  label: 'Todos confirmados' },
    pending:   { dot: 'bg-gold', text: 'text-gold',  label: 'Pagamentos pendentes' },
    cancelled: { dot: 'bg-hot',  text: 'text-hot',   label: 'Cancelamento detectado' },
  }[status]

  async function handleMove(member, newTeamName) {
    if (!supabase) return
    const { error } = await supabase
      .from('registrations')
      .update({ team_name: newTeamName })
      .eq('id', member.id)
    if (error) {
      alert(`Erro ao mover membro: ${error.message}`)
    }
    onRefetch()
  }

  async function handleRemove(member) {
    const ok = window.confirm(
      `Remover "${member.full_name}" do time "${name}"?\n\nO membro será movido para inscrições individuais.`
    )
    if (!ok || !supabase) return
    const { error } = await supabase
      .from('registrations')
      .update({ team_name: null, inscription_modality: 'individual_own' })
      .eq('id', member.id)
    if (error) {
      alert(`Erro ao remover membro: ${error.message}`)
    }
    onRefetch()
  }

  // Sort: leader first, then alphabetically
  const sortedMembers = [...members].sort((a, b) => {
    if (a.is_team_leader && !b.is_team_leader) return -1
    if (!a.is_team_leader && b.is_team_leader) return 1
    return a.full_name.localeCompare(b.full_name)
  })

  return (
    <div className="card-glass rounded-2xl overflow-hidden">
      {/* Card header (always visible) */}
      <button
        onClick={onToggle}
        className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-white/3 transition-colors"
      >
        {/* Status dot */}
        <StatusDot status={status} />

        {/* Team name */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-display font-semibold text-white truncate">{name}</span>
            <span className="text-white/40 text-sm font-mono">
              {members.length}/6 membros
            </span>
            <span className={`text-xs font-mono ${statusStyle.text}`}>
              {confirmedCount}/{members.length} confirmados
            </span>
            <PaymentProgressBar confirmed={confirmedCount} total={members.length} />
          </div>
          <div className="flex items-center gap-3 mt-1">
            <ProfileComposition members={members} />
          </div>
        </div>

        {/* Expand chevron */}
        <span className={`text-white/30 text-sm transition-transform ${expanded ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>

      {/* Expanded member list */}
      {expanded && (
        <div className="px-5 pb-5 space-y-2 border-t border-white/5 pt-4">
          {sortedMembers.map(member => (
            <MemberRow
              key={member.id}
              member={member}
              allTeamNames={allTeamNames}
              onMove={handleMove}
              onRemove={handleRemove}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── IndividualSection ───────────────────────────────────────────────────────

function IndividualSection({ individuals }) {
  const [expanded, setExpanded] = useState(false)

  if (individuals.length === 0) return null

  return (
    <div className="card-glass rounded-2xl overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-white/3 transition-colors"
      >
        <span className="text-white/30 text-sm">○</span>
        <div className="flex-1">
          <span className="font-display font-semibold text-white/70">Individuais sem time</span>
          <span className="ml-3 text-white/40 text-sm font-mono">{individuals.length} pessoa{individuals.length !== 1 ? 's' : ''}</span>
        </div>
        <span className={`text-white/30 text-sm transition-transform ${expanded ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-2 border-t border-white/5 pt-4">
          {[...individuals]
            .sort((a, b) => a.full_name.localeCompare(b.full_name))
            .map(member => (
              <div
                key={member.id}
                className="flex items-start gap-3 p-3 rounded-xl bg-white/3 border border-white/5"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-white/80 text-sm">{member.full_name}</span>
                    <Badge
                      colorMap={OCCUPATION_COLORS}
                      value={member.occupation_type}
                      fallbackLabel={member.occupation_type}
                    />
                    <Badge colorMap={PAYMENT_COLORS} value={member.payment_status} />
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-white/40 font-mono">
                    <span>{member.email}</span>
                    <span className="text-white/25 capitalize">{member.inscription_modality?.replace(/_/g, ' ')}</span>
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

// ─── Matching Suggestions ─────────────────────────────────────────────────────

function MatchingSuggestions({ individuals, teamsMap, sortedTeamNames, onRefetch }) {
  const [busy, setBusy] = useState(null)

  const seekingTeam = individuals.filter(i => i.inscription_modality === 'individual_form_team')
  const incompleteTeams = sortedTeamNames.filter(n => teamsMap[n].length < 6)

  // Build suggestions: which individuals could fill missing profiles
  const suggestions = useMemo(() => {
    const result = []
    for (const teamName of incompleteTeams) {
      const members = teamsMap[teamName]
      const existingTypes = new Set(members.map(m => m.occupation_type))
      const missingTypes = ALL_PROFILES.filter(p => !existingTypes.has(p))

      for (const individual of seekingTeam) {
        if (missingTypes.includes(individual.occupation_type)) {
          result.push({ individual, teamName, reason: `Falta ${individual.occupation_type}` })
        }
      }
    }
    return result
  }, [incompleteTeams, teamsMap, seekingTeam])

  // Also show remaining seekers without perfect matches
  const matched = new Set(suggestions.map(s => s.individual.id))
  const unmatched = seekingTeam.filter(i => !matched.has(i.id))

  if (seekingTeam.length === 0 || incompleteTeams.length === 0) return null

  async function handleAdd(individualId, teamName) {
    if (!supabase) return
    setBusy(individualId)
    const { error } = await supabase
      .from('registrations')
      .update({ team_name: teamName, inscription_modality: 'team' })
      .eq('id', individualId)
    if (error) alert(`Erro: ${error.message}`)
    onRefetch()
    setBusy(null)
  }

  return (
    <div className="card-glass rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-mono uppercase tracking-widest text-electric">
          Sugestões de matching
        </h3>
        <span className="text-xs font-mono text-white/40">
          {seekingTeam.length} buscando time
        </span>
      </div>

      {suggestions.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-mono text-white/30 uppercase">Matches por perfil</h4>
          {suggestions.slice(0, 10).map(({ individual, teamName, reason }) => (
            <div
              key={`${individual.id}-${teamName}`}
              className="flex items-center gap-3 p-3 rounded-xl bg-electric/5 border border-electric/10"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-display text-white">{individual.full_name}</span>
                  <span
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                    style={{ color: PROFILE_COLORS[individual.occupation_type], background: `${PROFILE_COLORS[individual.occupation_type]}20` }}
                  >
                    {individual.occupation_type}
                  </span>
                </div>
                <span className="text-xs text-white/40 font-mono">
                  → {teamName} ({reason})
                </span>
              </div>
              <button
                onClick={() => handleAdd(individual.id, teamName)}
                disabled={busy === individual.id}
                className="px-3 py-1 rounded-lg text-xs font-medium bg-electric/15 text-electric border border-electric/20 hover:bg-electric/25 disabled:opacity-30 transition-colors whitespace-nowrap"
              >
                Adicionar
              </button>
            </div>
          ))}
        </div>
      )}

      {unmatched.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-mono text-white/30 uppercase">Sem match ideal</h4>
          {unmatched.map(individual => (
            <div key={individual.id} className="flex items-center gap-3 p-2 rounded-lg bg-white/[0.02]">
              <span className="text-sm text-white/60 font-display">{individual.full_name}</span>
              <span
                className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                style={{ color: PROFILE_COLORS[individual.occupation_type], background: `${PROFILE_COLORS[individual.occupation_type]}20` }}
              >
                {individual.occupation_type}
              </span>
              <span className="text-xs text-white/30 font-mono ml-auto">{individual.email}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── AdminTeams ───────────────────────────────────────────────────────────────

export default function AdminTeams({ readOnly }) {
  const [registrations, setRegistrations] = useState([])
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState(null)
  const [search, setSearch]               = useState('')
  const [expandedTeam, setExpandedTeam]   = useState(null)

  // fetchData is defined outside useEffect so TeamCard can call it for refetch
  async function fetchData() {
    setLoading(true)
    setError(null)
    if (!supabase) {
      setError('Supabase não configurado.')
      setLoading(false)
      return
    }
    const { data, error: err } = await supabase
      .from('registrations')
      .select('id, full_name, email, phone, occupation_type, ai_experience_level, team_name, is_team_leader, inscription_modality, payment_status, ticket_price, created_at')
      .order('full_name', { ascending: true })

    if (err) {
      setError(err.message)
    } else {
      setRegistrations(data ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      if (!supabase) {
        setError('Supabase não configurado.')
        setLoading(false)
        return
      }
      const { data, error: err } = await supabase
        .from('registrations')
        .select('id, full_name, email, phone, occupation_type, ai_experience_level, team_name, is_team_leader, inscription_modality, payment_status, ticket_price, created_at')
        .order('full_name', { ascending: true })

      if (err) {
        setError(err.message)
      } else {
        setRegistrations(data ?? [])
      }
      setLoading(false)
    }
    load()
  }, [])

  // ── Derived data ────────────────────────────────────────────────────────────

  const { teamsMap, individuals } = useMemo(() => {
    const map = {}
    const solo = []

    for (const reg of registrations) {
      if (reg.team_name) {
        if (!map[reg.team_name]) map[reg.team_name] = []
        map[reg.team_name].push(reg)
      } else {
        solo.push(reg)
      }
    }

    return { teamsMap: map, individuals: solo }
  }, [registrations])

  const sortedTeamNames = useMemo(
    () => Object.keys(teamsMap).sort((a, b) => a.localeCompare(b)),
    [teamsMap]
  )

  const filteredTeamNames = useMemo(() => {
    if (!search.trim()) return sortedTeamNames
    const q = search.toLowerCase()
    return sortedTeamNames.filter(name => name.toLowerCase().includes(q))
  }, [sortedTeamNames, search])

  // ── Stats ───────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const total     = sortedTeamNames.length
    const complete   = sortedTeamNames.filter(n => teamsMap[n].length >= 3).length
    const incomplete = total - complete
    const solo       = individuals.length
    return { total, complete, incomplete, solo }
  }, [sortedTeamNames, teamsMap, individuals])

  // ── Toggle ──────────────────────────────────────────────────────────────────

  function toggleTeam(name) {
    setExpandedTeam(prev => (prev === name ? null : name))
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-white/40 font-mono text-sm">
        Carregando times...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <p className="text-hot font-mono text-sm">{error}</p>
        <button
          onClick={fetchData}
          className="px-4 py-2 rounded-lg bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border border-white/10 text-sm transition-colors"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* Stats header */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total de times',     value: stats.total,      color: 'text-electric' },
          { label: 'Times completos',    value: stats.complete,   color: 'text-cyan',    note: '≥ 3 membros' },
          { label: 'Times incompletos',  value: stats.incomplete, color: 'text-gold',    note: '< 3 membros' },
          { label: 'Individuais',        value: stats.solo,       color: 'text-white/60' },
        ].map(stat => (
          <div key={stat.label} className="card-glass rounded-xl px-4 py-3">
            <div className={`text-2xl font-display font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-white/50 text-xs mt-0.5">{stat.label}</div>
            {stat.note && <div className="text-white/25 text-xs font-mono">{stat.note}</div>}
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome do time..."
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 pl-10 text-white text-sm placeholder-white/30 focus:outline-none focus:border-electric/50 focus:ring-1 focus:ring-electric/30 transition-colors"
        />
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 text-sm">⌕</span>
      </div>

      {/* Teams list */}
      {filteredTeamNames.length === 0 && !search && sortedTeamNames.length === 0 ? (
        <div className="text-center py-16 text-white/30 font-mono text-sm">
          Nenhum time cadastrado ainda.
        </div>
      ) : filteredTeamNames.length === 0 ? (
        <div className="text-center py-12 text-white/30 font-mono text-sm">
          Nenhum time encontrado para "<span className="text-white/50">{search}</span>".
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTeamNames.map(name => (
            <TeamCard
              key={name}
              team={{ name, members: teamsMap[name] }}
              allTeamNames={sortedTeamNames}
              expanded={expandedTeam === name}
              onToggle={() => toggleTeam(name)}
              onRefetch={fetchData}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}

      {/* Individuals section */}
      <IndividualSection individuals={individuals} />

      {/* Matching suggestions */}
      <MatchingSuggestions
        individuals={individuals}
        teamsMap={teamsMap}
        sortedTeamNames={sortedTeamNames}
        onRefetch={fetchData}
      />
    </div>
  )
}
