import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { audit } from '../lib/auditLog'
import TransferTicketModal from './TransferTicketModal'
import { cleanIdeaDescription, IDEA_MAX_LENGTH } from './teamIdea'

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

// ─── Modal shell ──────────────────────────────────────────────────────────────

function ModalShell({ title, onClose, children, maxWidth = 'max-w-sm' }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`card-glass rounded-2xl p-6 w-full ${maxWidth} space-y-4`}
        onClick={e => e.stopPropagation()}
      >
        {title && (
          <h3 className="font-display font-semibold text-white">{title}</h3>
        )}
        {children}
      </div>
    </div>
  )
}

// ─── MoveModal ───────────────────────────────────────────────────────────────

function MoveModal({ member, teams, onConfirm, onCancel }) {
  const [newTeamName, setNewTeamName] = useState('')
  const [mode, setMode] = useState('existing')

  const otherTeams = teams.filter(t => t !== member.team_name)

  function handleSubmit(e) {
    e.preventDefault()
    const target = mode === 'new' ? newTeamName.trim() : newTeamName
    if (!target) return
    onConfirm(target)
  }

  return (
    <ModalShell title={<>Mover <span className="text-cyan">{member.full_name}</span></>} onClose={onCancel}>
      <p className="text-white/50 text-sm">
        Time atual: <span className="text-white/70 font-mono">{member.team_name || '— sem time —'}</span>
      </p>

      <div className="flex gap-2">
        <button
          type="button"
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
          type="button"
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
            maxLength={120}
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
    </ModalShell>
  )
}

// ─── RenameTeamModal ──────────────────────────────────────────────────────────

function RenameTeamModal({ teamName, existingNames, onConfirm, onCancel }) {
  const [newName, setNewName] = useState(teamName)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = newName.trim()
    if (!trimmed) return setError('Nome obrigatório.')
    if (trimmed === teamName) return setError('Esse já é o nome atual.')
    if (trimmed.length > 120) return setError('Nome muito longo (máx 120).')
    if (existingNames.includes(trimmed)) return setError('Já existe um time com esse nome.')
    setBusy(true)
    onConfirm(trimmed)
  }

  return (
    <ModalShell title="Editar nome do time" onClose={onCancel}>
      <p className="text-white/50 text-sm">
        Atual: <span className="text-white/70 font-mono">{teamName}</span>
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="text"
          value={newName}
          onChange={e => { setNewName(e.target.value); setError(null) }}
          maxLength={120}
          required
          autoFocus
          placeholder="Novo nome"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-electric/50 focus:ring-1 focus:ring-electric/30 transition-colors"
        />
        {error && <p className="text-hot text-xs">{error}</p>}
        <p className="text-xs text-white/40">
          O novo nome será aplicado em cascata em todos os membros e nos pedidos de entrada pendentes.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 py-2 rounded-lg text-sm font-medium bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border border-white/10 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex-1 py-2 rounded-lg text-sm font-medium bg-electric/20 text-electric hover:bg-electric/30 border border-electric/30 transition-colors disabled:opacity-50"
          >
            {busy ? 'Salvando...' : 'Renomear'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ─── EditIdeaModal ─────────────────────────────────────────────────

function EditIdeaModal({ teamName, currentIdea, onConfirm, onCancel }) {
  const [idea, setIdea] = useState(currentIdea || '')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    const { value, error: cleanErr } = cleanIdeaDescription(idea)
    if (cleanErr === 'idea_too_long') return setError('Descrição muito longa (máx 500).')
    setBusy(true)
    try {
      await onConfirm(value)
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell title={<>Editar descrição de <span className="text-electric">{teamName}</span></>} onClose={onCancel}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          value={idea}
          onChange={e => { setIdea(e.target.value); setError(null) }}
          maxLength={IDEA_MAX_LENGTH}
          rows={4}
          autoFocus
          placeholder="Coloque aqui a descrição da sua solução"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-electric/50 focus:ring-1 focus:ring-electric/30 transition-colors resize-none"
        />
        <p className="text-xs text-white/40">{idea.length}/{IDEA_MAX_LENGTH}</p>
        {error && <p className="text-hot text-xs">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 py-2 rounded-lg text-sm font-medium bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border border-white/10 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex-1 py-2 rounded-lg text-sm font-medium bg-electric/20 text-electric hover:bg-electric/30 border border-electric/30 transition-colors disabled:opacity-50"
          >
            {busy ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ─── DeleteTeamConfirm ────────────────────────────────────────────────────────

function DeleteTeamConfirm({ teamName, memberCount, pendingCount, onConfirm, onCancel }) {
  const [busy, setBusy] = useState(false)

  return (
    <ModalShell title={<>Excluir time <span className="text-hot">{teamName}</span></>} onClose={onCancel}>
      <div className="space-y-2 text-sm text-white/70">
        <p>Esta ação vai:</p>
        <ul className="list-disc list-inside space-y-1 text-white/60">
          <li>
            Remover <strong className="text-white">{memberCount}</strong> {memberCount === 1 ? 'membro' : 'membros'} do time
          </li>
          <li>
            Cada um vira <span className="font-mono text-electric">individual_own</span> (mantém inscrição e pagamento)
          </li>
          {pendingCount > 0 && (
            <li>
              Cancelar <strong className="text-white">{pendingCount}</strong> {pendingCount === 1 ? 'pedido pendente' : 'pedidos pendentes'} de entrada
            </li>
          )}
        </ul>
        <p className="text-white/40 text-xs pt-2">Pagamentos NÃO são afetados. Os participantes podem ser readicionados a outros times.</p>
      </div>
      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="flex-1 py-2 rounded-lg text-sm font-medium bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border border-white/10 transition-colors disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => { setBusy(true); onConfirm() }}
          disabled={busy}
          className="flex-1 py-2 rounded-lg text-sm font-medium bg-hot/20 text-hot hover:bg-hot/30 border border-hot/30 transition-colors disabled:opacity-50"
        >
          {busy ? 'Excluindo...' : 'Excluir time'}
        </button>
      </div>
    </ModalShell>
  )
}

// ─── AddMemberToTeamModal ─────────────────────────────────────────────────────

function AddMemberToTeamModal({ teamName, candidates, onConfirm, onCancel, currentMemberCount }) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [makeLeader, setMakeLeader] = useState(false)
  const [busy, setBusy] = useState(false)

  const remainingSlots = 6 - currentMemberCount
  const filtered = useMemo(() => {
    if (!search.trim()) return candidates
    const q = search.toLowerCase()
    return candidates.filter(c =>
      c.full_name.toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q)
    )
  }, [candidates, search])

  return (
    <ModalShell title={<>Adicionar membro a <span className="text-cyan">{teamName}</span></>} onClose={onCancel} maxWidth="max-w-md">
      <p className="text-white/50 text-sm">
        Vagas disponíveis: <span className="text-white/80 font-mono">{remainingSlots}/6</span>
      </p>

      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Buscar por nome ou email..."
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-electric/50 focus:ring-1 focus:ring-electric/30 transition-colors"
      />

      <div className="max-h-64 overflow-y-auto space-y-1 -mx-1 px-1">
        {filtered.length === 0 ? (
          <p className="text-center text-white/30 text-sm font-mono py-6">
            {candidates.length === 0
              ? 'Não há indivíduos disponíveis para adicionar.'
              : 'Nenhum candidato encontrado.'}
          </p>
        ) : (
          filtered.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedId(c.id)}
              className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-colors ${
                selectedId === c.id
                  ? 'border-cyan/40 bg-cyan/10'
                  : 'border-white/5 bg-white/[0.02] hover:border-white/15'
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{c.full_name}</p>
                <p className="text-xs text-white/40 font-mono truncate">{c.email}</p>
              </div>
              <div className="flex flex-wrap gap-1.5 justify-end flex-shrink-0">
                <Badge colorMap={OCCUPATION_COLORS} value={c.occupation_type} fallbackLabel={c.occupation_type} />
                <Badge colorMap={PAYMENT_COLORS} value={c.payment_status} />
              </div>
            </button>
          ))
        )}
      </div>

      <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
        <input
          type="checkbox"
          checked={makeLeader}
          onChange={e => setMakeLeader(e.target.checked)}
          className="w-4 h-4 rounded accent-gold"
        />
        Definir como líder do time (rebaixa o líder atual)
      </label>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="flex-1 py-2 rounded-lg text-sm font-medium bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border border-white/10 transition-colors disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={!selectedId || busy || remainingSlots <= 0}
          onClick={() => { setBusy(true); onConfirm({ id: selectedId, makeLeader }) }}
          className="flex-1 py-2 rounded-lg text-sm font-medium bg-electric/20 text-electric hover:bg-electric/30 border border-electric/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {busy ? 'Adicionando...' : 'Adicionar'}
        </button>
      </div>
    </ModalShell>
  )
}

// ─── CreateTeamModal ──────────────────────────────────────────────────────────

function CreateTeamModal({ existingNames, candidates, onConfirm, onCancel }) {
  const [teamName, setTeamName] = useState('')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const filtered = useMemo(() => {
    if (!search.trim()) return candidates
    const q = search.toLowerCase()
    return candidates.filter(c =>
      c.full_name.toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q)
    )
  }, [candidates, search])

  function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const trimmed = teamName.trim()
    if (!trimmed) return setError('Nome do time obrigatório.')
    if (trimmed.length > 120) return setError('Nome muito longo (máx 120).')
    if (existingNames.includes(trimmed)) return setError('Já existe um time com esse nome.')
    if (!selectedId) return setError('Selecione um indivíduo para ser o líder.')
    setBusy(true)
    onConfirm({ teamName: trimmed, leaderId: selectedId })
  }

  return (
    <ModalShell title="Criar novo time" onClose={onCancel} maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-mono text-white/50 uppercase mb-1.5">Nome do time</label>
          <input
            type="text"
            value={teamName}
            onChange={e => { setTeamName(e.target.value); setError(null) }}
            maxLength={120}
            required
            autoFocus
            placeholder="Ex: PrimaTAS"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-electric/50 focus:ring-1 focus:ring-electric/30 transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs font-mono text-white/50 uppercase mb-1.5">Líder inicial</label>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar individual..."
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-electric/50 focus:ring-1 focus:ring-electric/30 transition-colors mb-2"
          />
          <div className="max-h-48 overflow-y-auto space-y-1 -mx-1 px-1">
            {filtered.length === 0 ? (
              <p className="text-center text-white/30 text-sm font-mono py-4">
                Nenhum candidato.
              </p>
            ) : (
              filtered.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { setSelectedId(c.id); setError(null) }}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-colors ${
                    selectedId === c.id
                      ? 'border-gold/40 bg-gold/10'
                      : 'border-white/5 bg-white/[0.02] hover:border-white/15'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{c.full_name}</p>
                    <p className="text-xs text-white/40 font-mono truncate">{c.email}</p>
                  </div>
                  <Badge colorMap={OCCUPATION_COLORS} value={c.occupation_type} fallbackLabel={c.occupation_type} />
                </button>
              ))
            )}
          </div>
        </div>

        {error && <p className="text-hot text-xs">{error}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 py-2 rounded-lg text-sm font-medium bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border border-white/10 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex-1 py-2 rounded-lg text-sm font-medium bg-gold/20 text-gold hover:bg-gold/30 border border-gold/30 transition-colors disabled:opacity-50"
          >
            {busy ? 'Criando...' : 'Criar time'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ─── MemberRow ───────────────────────────────────────────────────────────────

function MemberRow({ member, allTeamNames, onMove, onRemove, onTransfer, onPromoteLeader, onToggleRemote, readOnly }) {
  const [showMove, setShowMove] = useState(false)
  const [busy, setBusy] = useState(null)

  async function handleMove(newTeamName) {
    setShowMove(false)
    await onMove(member, newTeamName)
  }

  const wasTransferred = !!member.transferred_to_id
  const wasReceived = !!member.transferred_from_id
  const canTransfer = member.payment_status === 'confirmed' && !wasTransferred

  return (
    <>
      <div className="flex items-start gap-3 p-3 rounded-xl bg-white/3 border border-white/5 hover:border-white/10 transition-colors">
        <div className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full mt-0.5">
          {member.is_team_leader
            ? <span className="text-gold text-base" title="Líder do time">★</span>
            : <span className="text-white/20 text-xs">●</span>
          }
        </div>

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
            <Badge colorMap={PAYMENT_COLORS} value={member.payment_status} />
            {member.is_remote && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono border bg-violet/15 text-violet border-violet/30" title="Participação remota">
                Remoto
              </span>
            )}
            {wasTransferred && (
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono border bg-violet/15 text-violet border-violet/30"
                title="Ingresso transferido para outro participante"
              >
                ↗ transferido
              </span>
            )}
            {wasReceived && (
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono border bg-violet/15 text-violet border-violet/30"
                title="Ingresso recebido por transferência"
              >
                ↩ recebido
              </span>
            )}
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

        {!readOnly && (
          <div className="flex flex-wrap gap-1.5 flex-shrink-0 justify-end max-w-[300px]">
            <button
              onClick={async () => { setBusy('remote'); await onToggleRemote(member); setBusy(null) }}
              disabled={busy !== null}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 border ${
                member.is_remote
                  ? 'bg-violet/15 text-violet border-violet/30 hover:bg-violet/25'
                  : 'bg-white/5 text-white/50 border-white/10 hover:text-white/70 hover:bg-white/10'
              }`}
              title="Alternar participação remota"
            >
              {busy === 'remote' ? '...' : member.is_remote ? '✓ Remoto' : '+ Remoto'}
            </button>
            {!member.is_team_leader && (
              <button
                onClick={async () => { setBusy('promote'); await onPromoteLeader(member); setBusy(null) }}
                disabled={busy !== null}
                className="px-2.5 py-1 rounded-lg text-xs font-medium bg-gold/10 text-gold/80 hover:bg-gold/20 hover:text-gold border border-gold/20 transition-colors disabled:opacity-50"
                title="Promover a líder (rebaixa o líder atual)"
              >
                {busy === 'promote' ? '...' : '★ Líder'}
              </button>
            )}
            {canTransfer && (
              <button
                onClick={() => onTransfer(member)}
                className="px-2.5 py-1 rounded-lg text-xs font-medium bg-violet/10 text-violet/80 hover:bg-violet/20 hover:text-violet border border-violet/20 transition-colors"
                title="Transferir ingresso pago para outra pessoa cadastrada (sem reembolso)"
              >
                Transferir
              </button>
            )}
            <button
              onClick={() => setShowMove(true)}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-electric/10 text-electric/80 hover:bg-electric/20 hover:text-electric border border-electric/20 transition-colors"
            >
              Mover
            </button>
            <button
              onClick={() => onRemove(member)}
              disabled={busy !== null}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-hot/10 text-hot/70 hover:bg-hot/20 hover:text-hot border border-hot/20 transition-colors disabled:opacity-50"
              title={member.is_team_leader ? 'Vai promover outro membro ou esvaziar o time' : 'Remover do time'}
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

// ─── PendingRequestsForTeam ───────────────────────────────────────────────────

function PendingRequestsForTeam({ requests, onApprove, onReject, readOnly }) {
  const [busy, setBusy] = useState(null)

  if (!requests || requests.length === 0) return null

  return (
    <div className="mt-3 p-4 rounded-xl border border-cyan/15 bg-cyan/5 space-y-2">
      <p className="text-xs font-mono text-cyan uppercase tracking-wider">
        Pedidos de entrada · {requests.length}
      </p>
      {requests.map(req => {
        const r = req.requester
        return (
          <div key={req.id} className="flex items-start justify-between gap-3 p-2.5 rounded-lg bg-white/3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{r?.full_name || '—'}</p>
              <p className="text-xs text-white/40 font-mono truncate">{r?.email}</p>
              {r?.occupation_type && (
                <span className="inline-block mt-1.5 px-2 py-0.5 rounded text-[10px] font-mono"
                      style={{ color: PROFILE_COLORS[r.occupation_type], background: `${PROFILE_COLORS[r.occupation_type]}20` }}>
                  {r.occupation_type}
                </span>
              )}
              {req.message && (
                <p className="mt-2 text-xs text-white/60 italic border-l-2 border-cyan/30 pl-2">
                  &ldquo;{req.message}&rdquo;
                </p>
              )}
            </div>
            {!readOnly && (
              <div className="flex gap-1.5 flex-shrink-0">
                <button
                  onClick={async () => { setBusy(req.id); await onApprove(req); setBusy(null) }}
                  disabled={busy !== null}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium bg-cyan/15 text-cyan hover:bg-cyan/25 border border-cyan/30 disabled:opacity-50 transition-colors"
                >
                  {busy === req.id ? '...' : 'Aceitar'}
                </button>
                <button
                  onClick={async () => { setBusy(req.id); await onReject(req); setBusy(null) }}
                  disabled={busy !== null}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium bg-hot/10 text-hot/80 hover:bg-hot/20 hover:text-hot border border-hot/20 disabled:opacity-50 transition-colors"
                >
                  Recusar
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── LunchToggle ──────────────────────────────────────────────────────────────

function LunchToggle({ lunchAt, onChange }) {
  const [busy, setBusy] = useState(false)
  const done = !!lunchAt

  async function handleClick(e) {
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    await onChange(!done)
    setBusy(false)
  }

  const timeLabel = lunchAt
    ? new Date(lunchAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      title={done ? (timeLabel ? `Almoçou às ${timeLabel} — clique para desmarcar` : 'Almoçou') : 'Marcar que a equipe almoçou'}
      className={`flex-shrink-0 self-stretch px-4 flex items-center gap-2 text-sm font-medium border-l transition-colors disabled:opacity-50 ${
        done
          ? 'bg-cyan/15 text-cyan border-cyan/30 hover:bg-cyan/25'
          : 'bg-white/[0.02] text-white/40 border-white/10 hover:text-white/70 hover:bg-white/5'
      }`}
    >
      <span className={`inline-flex items-center justify-center w-4 h-4 rounded border text-[10px] ${done ? 'bg-cyan/30 border-cyan/50' : 'border-white/30'}`}>
        {done ? '✓' : ''}
      </span>
      <span className="whitespace-nowrap">🍽 Almoçou</span>
    </button>
  )
}

// ─── TeamCard ─────────────────────────────────────────────────────────────────

function TeamCard({ team, idea, lunchAt, mentors, allTeamNames, expanded, onToggle, actions, readOnly, requests }) {
  const { name, members } = team
  const status = getTeamStatus(members)
  const confirmedCount = members.filter(m => m.payment_status === 'confirmed').length

  const statusStyle = {
    confirmed: { dot: 'bg-cyan', text: 'text-cyan',  label: 'Todos confirmados' },
    pending:   { dot: 'bg-gold', text: 'text-gold',  label: 'Pagamentos pendentes' },
    cancelled: { dot: 'bg-hot',  text: 'text-hot',   label: 'Cancelamento detectado' },
  }[status]

  const sortedMembers = [...members].sort((a, b) => {
    if (a.is_team_leader && !b.is_team_leader) return -1
    if (!a.is_team_leader && b.is_team_leader) return 1
    return a.full_name.localeCompare(b.full_name)
  })

  const pendingCount = requests?.length ?? 0

  return (
    <div className="card-glass rounded-2xl overflow-hidden">
      <div className="flex items-stretch">
      <button
        onClick={onToggle}
        className="flex-1 min-w-0 text-left px-5 py-4 flex items-center gap-4 hover:bg-white/3 transition-colors"
      >
        <StatusDot status={status} />

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
            {pendingCount > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan/15 text-cyan border border-cyan/30">
                {pendingCount} {pendingCount === 1 ? 'pedido' : 'pedidos'}
              </span>
            )}
            {mentors?.length > 0 && (
              <span
                className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-violet/15 text-violet border border-violet/30 max-w-[220px] truncate"
                title={mentors.map(m => m.name || m.email).join(', ')}
              >
                🎓 {mentors.length === 1 ? (mentors[0].name || mentors[0].email) : `${mentors.length} mentores`}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <ProfileComposition members={members} />
          </div>
        </div>

        <span className={`text-white/30 text-sm transition-transform ${expanded ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>
        <LunchToggle lunchAt={lunchAt} onChange={done => actions.toggleLunch(name, done)} />
      </div>

      {expanded && (
        <div className="px-5 pb-5 space-y-3 border-t border-white/5 pt-4">
          <div className="rounded-xl border border-electric/20 bg-electric/5 px-4 py-3">
            <p className="text-[10px] font-mono uppercase tracking-wider text-electric/70 mb-1">Ideia</p>
            {idea
              ? <p className="text-sm text-white/80 whitespace-pre-wrap">{idea}</p>
              : <p className="text-sm text-white/30 italic">{readOnly ? 'Sem descrição.' : 'Sem descrição — clique em "Editar descrição".'}</p>
            }
          </div>
          <div className="rounded-xl border border-violet/20 bg-violet/5 px-4 py-3">
            <p className="text-[10px] font-mono uppercase tracking-wider text-violet/70 mb-2">Mentoria</p>
            {mentors?.length ? (
              <div className="flex flex-wrap gap-2">
                {mentors.map(m => (
                  <span key={m.id} className="inline-flex flex-col px-3 py-1.5 rounded-lg bg-violet/15 border border-violet/30">
                    <span className="text-sm text-violet leading-tight">{m.name || m.email}</span>
                    {m.name && <span className="text-[10px] text-violet/60 font-mono leading-tight">{m.email}</span>}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-white/30 italic">{readOnly ? 'Nenhum mentor atribuído.' : 'Nenhum mentor atribuído — atribua na aba Mentores.'}</p>
            )}
          </div>
          {!readOnly && (
            <div className="flex flex-wrap gap-2">
              {members.length < 6 && (
                <button
                  onClick={() => actions.openAddMember({ teamName: name, currentMemberCount: members.length })}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-electric/15 text-electric hover:bg-electric/25 border border-electric/30 transition-colors"
                >
                  + Adicionar membro
                </button>
              )}
              <button
                onClick={() => actions.openRename({ teamName: name })}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/10 transition-colors"
              >
                Editar nome
              </button>
              <button
                onClick={() => actions.openEditIdea({ teamName: name, idea })}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-electric/10 text-electric/80 hover:bg-electric/20 hover:text-electric border border-electric/20 transition-colors"
              >
                Editar descrição
              </button>
              <button
                onClick={() => actions.openDelete({ teamName: name, memberCount: members.length, pendingCount })}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-hot/10 text-hot hover:bg-hot/20 border border-hot/20 transition-colors"
              >
                Excluir time
              </button>
            </div>
          )}

          <div className="space-y-2">
            {sortedMembers.map(member => (
              <MemberRow
                key={member.id}
                member={member}
                allTeamNames={allTeamNames}
                onMove={actions.moveMember}
                onRemove={actions.removeMember}
                onTransfer={actions.openTransfer}
                onPromoteLeader={actions.promoteLeader}
                onToggleRemote={actions.toggleRemote}
                readOnly={readOnly}
              />
            ))}
          </div>

          <PendingRequestsForTeam
            requests={requests}
            onApprove={actions.approveRequest}
            onReject={actions.rejectRequest}
            readOnly={readOnly}
          />
        </div>
      )}
    </div>
  )
}

// ─── IndividualSection ───────────────────────────────────────────────────────

function IndividualSection({ individuals, onAddToTeam, readOnly, sortedTeamNames }) {
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
                {!readOnly && sortedTeamNames.length > 0 && (
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const target = e.target.value
                      if (target) {
                        onAddToTeam(member, target)
                        e.target.value = ''
                      }
                    }}
                    className="text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white/70 focus:outline-none focus:border-electric/40"
                  >
                    <option value="">+ Adicionar a...</option>
                    {sortedTeamNames.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

// ─── Matching Suggestions ─────────────────────────────────────────────────────

function PresenceBadge({ at }) {
  return at ? (
    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded text-cyan bg-cyan/15">
      presente
    </span>
  ) : (
    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded text-white/30 bg-white/5">
      não chegou
    </span>
  )
}

function MatchingSuggestions({ individuals, teamsMap, sortedTeamNames, onAddToTeam }) {
  const [busy, setBusy] = useState(null)
  const [onlyPresent, setOnlyPresent] = useState(true)

  const allSeeking = individuals.filter(i => i.inscription_modality === 'individual_form_team')
  const presentCount = allSeeking.filter(i => i.checked_in_at).length
  const seekingTeam = onlyPresent ? allSeeking.filter(i => i.checked_in_at) : allSeeking
  const incompleteTeams = sortedTeamNames.filter(n => teamsMap[n].length < 6)

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

  const matched = new Set(suggestions.map(s => s.individual.id))
  const unmatched = seekingTeam.filter(i => !matched.has(i.id))

  if (allSeeking.length === 0 || incompleteTeams.length === 0) return null

  async function handleAdd(individual, teamName) {
    setBusy(individual.id)
    await onAddToTeam(individual, teamName)
    setBusy(null)
  }

  return (
    <div className="card-glass rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-mono uppercase tracking-widest text-electric">
          Sugestões de matching
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-white/40">
            {presentCount} presentes · {allSeeking.length} buscando time
          </span>
          <button
            onClick={() => setOnlyPresent(v => !v)}
            className={'px-2.5 py-1 rounded-lg text-[11px] font-mono border transition-colors ' + (onlyPresent ? 'bg-cyan/15 text-cyan border-cyan/30' : 'bg-white/[0.03] text-white/40 border-white/10 hover:text-white/70')}
          >
            Só presentes
          </button>
        </div>
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
                  <PresenceBadge at={individual.checked_in_at} />
                </div>
                <span className="text-xs text-white/40 font-mono">
                  → {teamName} ({reason})
                </span>
              </div>
              <button
                onClick={() => handleAdd(individual, teamName)}
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
              <PresenceBadge at={individual.checked_in_at} />
              <span className="text-xs text-white/30 font-mono ml-auto">{individual.email}</span>
            </div>
          ))}
        </div>
      )}

      {onlyPresent && seekingTeam.length === 0 && (
        <p className="text-xs font-mono text-white/30">
          Ninguém em check-in ainda — desligue "Só presentes" para ver todos.
        </p>
      )}
    </div>
  )
}

// ─── AdminTeams ───────────────────────────────────────────────────────────────

export default function AdminTeams({ readOnly, confirmedOnly }) {
  const [registrations, setRegistrations] = useState([])
  const [requests, setRequests] = useState([])
  const [teamsMeta, setTeamsMeta] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [expandedTeam, setExpandedTeam] = useState(null)
  const [transferSource, setTransferSource] = useState(null)
  const [mentors, setMentors] = useState([])
  const [mentorLinks, setMentorLinks] = useState([])

  const [renameTarget, setRenameTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [addMemberTarget, setAddMemberTarget] = useState(null)
  const [editIdeaTarget, setEditIdeaTarget] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)

  async function fetchData() {
    if (!supabase) {
      setError('Supabase não configurado.')
      setLoading(false)
      return
    }
    setError(null)
    const [{ data: regs, error: regErr }, { data: reqs, error: reqErr }, { data: teamRows }, { data: mentorRows, error: mentorErr }, { data: linkRows, error: linkErr }] = await Promise.all([
      supabase
        .from('registrations')
        .select('id, full_name, email, phone, occupation_type, ai_experience_level, team_name, team_id, is_team_leader, inscription_modality, payment_status, ticket_price, ticket_tier, payment_method, payment_confirmed_at, transferred_to_id, transferred_from_id, transferred_at, created_at, is_remote, checked_in_at')
        .order('full_name', { ascending: true }),
      supabase
        .from('team_join_requests')
        .select('id, team_name, status, message, created_at, requester:registrations!requester_id(id, full_name, email, occupation_type, ai_experience_level)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true }),
      supabase
        .from('teams')
        .select('name, idea_description, lunch_at'),
      supabase
        .from('mentors')
        .select('id, name, email'),
      supabase
        .from('mentor_teams')
        .select('mentor_id, team_id'),
    ])

    if (regErr) {
      setError(regErr.message)
    } else if (reqErr) {
      setError(reqErr.message)
    } else {
      setRegistrations(regs ?? [])
      setRequests(reqs ?? [])
      setTeamsMeta(teamRows ?? [])
      // Mentoria é informativa: se a leitura falhar, não derruba a visão de times.
      if (mentorErr || linkErr) {
        console.warn('[AdminTeams] Erro ao carregar mentores:', (mentorErr || linkErr).message)
        setMentors([])
        setMentorLinks([])
      } else {
        setMentors(mentorRows ?? [])
        setMentorLinks(linkRows ?? [])
      }
    }
    setLoading(false)
  }

  useEffect(() => {
    setLoading(true) // eslint-disable-line react-hooks/set-state-in-effect
    fetchData()
  }, [])

  const { teamsMap, individuals } = useMemo(() => {
    const map = {}
    const solo = []
    const norm = (s) => (s || '').trim().toLowerCase()
    // Nomes que já têm vínculo ATIVO (não-cancelado) com alguma equipe. Usado p/
    // não listar como sem-time alguém que se inscreveu mais de uma vez (e-mails
    // diferentes) e já está numa equipe por outra linha — inclusive líderes, que
    // apareciam na lista de match via a inscrição duplicada/cancelada.
    const namesOnTeam = new Set(
      registrations
        .filter(r => r.team_name && r.payment_status !== 'cancelled')
        .map(r => norm(r.full_name))
    )
    const source = confirmedOnly ? registrations.filter(r => r.payment_status === 'confirmed') : registrations
    for (const reg of source) {
      if (reg.team_name) {
        if (!map[reg.team_name]) map[reg.team_name] = []
        map[reg.team_name].push(reg)
      } else {
        // Bucket sem-time: ignora inscrições canceladas e duplicatas de quem já
        // está em uma equipe, que poluíam as listas de individuais e de match.
        if (reg.payment_status === 'cancelled') continue
        if (namesOnTeam.has(norm(reg.full_name))) continue
        solo.push(reg)
      }
    }
    return { teamsMap: map, individuals: solo }
  }, [registrations, confirmedOnly])

  const sortedTeamNames = useMemo(
    () => Object.keys(teamsMap).sort((a, b) => a.localeCompare(b)),
    [teamsMap]
  )

  const filteredTeamNames = useMemo(() => {
    if (!search.trim()) return sortedTeamNames
    const q = search.toLowerCase()
    return sortedTeamNames.filter(name => name.toLowerCase().includes(q))
  }, [sortedTeamNames, search])

  const requestsByTeam = useMemo(() => {
    const map = {}
    for (const r of requests) {
      if (!map[r.team_name]) map[r.team_name] = []
      map[r.team_name].push(r)
    }
    return map
  }, [requests])

  // mentor[] por team_id, derivado de mentor_teams + mentors. A junção usa
  // team_id (chave estável), então cada card resolve seus mentores pelo team_id
  // de qualquer membro (registrations.team_id).
  const mentorsByTeamId = useMemo(() => {
    const map = new Map()
    for (const { mentor_id, team_id } of mentorLinks) {
      const m = mentors.find(x => x.id === mentor_id)
      if (!m) continue
      const list = map.get(team_id)
      if (list) list.push(m)
      else map.set(team_id, [m])
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email))
    }
    return map
  }, [mentors, mentorLinks])

  const stats = useMemo(() => {
    const total       = sortedTeamNames.length
    const complete    = sortedTeamNames.filter(n => teamsMap[n].length >= 6).length
    const incomplete  = total - complete
    const solo        = individuals.length
    const pending     = requests.length
    const lunched     = sortedTeamNames.filter(n => (teamsMeta.find(t => t.name === n) || {}).lunch_at).length
    return { total, complete, incomplete, solo, pending, lunched }
  }, [sortedTeamNames, teamsMap, individuals, requests, teamsMeta])

  function toggleTeam(name) {
    setExpandedTeam(prev => (prev === name ? null : name))
  }

  // ── Action handlers ─────────────────────────────────────────────────────────

  async function moveMember(member, newTeamName) {
    if (!supabase) return
    const oldTeam = member.team_name
    const { error: err } = await supabase
      .from('registrations')
      .update({ team_name: newTeamName, inscription_modality: 'team' })
      .eq('id', member.id)
    if (err) { alert(`Erro ao mover: ${err.message}`); return }
    audit({
      action: 'team.move_member',
      actorType: 'admin',
      targetTable: 'registrations',
      targetId: member.id,
      targetEmail: member.email,
      oldData: { team_name: oldTeam, inscription_modality: member.inscription_modality },
      newData: { team_name: newTeamName, inscription_modality: 'team' },
      metadata: { full_name: member.full_name },
    })
    await fetchData()
  }

  async function removeMember(member) {
    const ok = window.confirm(
      `Remover "${member.full_name}" do time "${member.team_name}"?\n\n` +
      (member.is_team_leader
        ? 'ATENÇÃO: este membro é o líder do time. O time ficará sem líder até você promover outro.\n\n'
        : '') +
      'A inscrição é mantida — o membro vira individual_own.'
    )
    if (!ok || !supabase) return
    const { error: err } = await supabase
      .from('registrations')
      .update({ team_name: null, inscription_modality: 'individual_own', is_team_leader: false })
      .eq('id', member.id)
    if (err) { alert(`Erro ao remover: ${err.message}`); return }
    audit({
      action: 'team.remove_member',
      actorType: 'admin',
      targetTable: 'registrations',
      targetId: member.id,
      targetEmail: member.email,
      oldData: { team_name: member.team_name, inscription_modality: 'team', is_team_leader: member.is_team_leader },
      newData: { team_name: null, inscription_modality: 'individual_own', is_team_leader: false },
      metadata: { full_name: member.full_name },
    })
    await fetchData()
  }

  async function promoteLeader(member) {
    if (!supabase) return
    const teamName = member.team_name
    if (!teamName) return
    const { error: rpcErr } = await supabase.rpc('admin_promote_leader', {
      p_team_name: teamName,
      p_new_leader_id: member.id,
    })
    if (rpcErr) { console.error(rpcErr); alert('Ocorreu um erro. Tente novamente.'); return }
    audit({
      action: 'team.promote_leader',
      actorType: 'admin',
      targetTable: 'registrations',
      targetId: member.id,
      targetEmail: member.email,
      newData: { team_name: teamName, is_team_leader: true },
      metadata: { full_name: member.full_name },
    })
    await fetchData()
  }

  async function toggleRemote(member) {
    if (!supabase) return
    const newValue = !member.is_remote
    const { error: err } = await supabase
      .from('registrations')
      .update({ is_remote: newValue })
      .eq('id', member.id)
    if (err) { alert(`Erro ao alternar remoto: ${err.message}`); return }
    audit({
      action: 'team.toggle_remote',
      actorType: 'admin',
      targetTable: 'registrations',
      targetId: member.id,
      targetEmail: member.email,
      oldData: { is_remote: member.is_remote },
      newData: { is_remote: newValue },
    })
    await fetchData()
  }

  async function renameTeam(oldName, newName) {
    if (!supabase) return
    // Renomeia via teams.name; o trigger cascade_team_rename propaga para
    // registrations.team_name e team_join_requests (preservando teams.id).
    const teamId = teamsMap[oldName]?.[0]?.team_id
    if (!teamId) { alert('Erro ao renomear: time sem identificador (team_id). Aplique a migração de teams.'); return }
    const { error: teamErr } = await supabase
      .from('teams')
      .update({ name: newName })
      .eq('id', teamId)
    if (teamErr) { alert(`Erro ao renomear: ${teamErr.message}`); return }
    audit({
      action: 'team.rename',
      actorType: 'admin',
      targetTable: 'teams',
      targetId: teamId,
      oldData: { team_name: oldName },
      newData: { team_name: newName },
    })
    setRenameTarget(null)
    if (expandedTeam === oldName) setExpandedTeam(newName)
    await fetchData()
  }

  async function updateTeamIdea(teamName, idea) {
    if (!supabase) return
    const teamId = teamsMap[teamName]?.[0]?.team_id
    if (!teamId) { alert('Erro ao salvar: time sem identificador (team_id). Aplique a migração de teams.'); return }
    const oldIdea = (teamsMeta.find(t => t.name === teamName) || {}).idea_description ?? null
    const { error: err } = await supabase
      .from('teams')
      .update({ idea_description: idea })
      .eq('id', teamId)
    if (err) { alert(`Erro ao salvar descrição: ${err.message}`); return }
    audit({
      action: 'team.update_idea',
      actorType: 'admin',
      targetTable: 'teams',
      targetId: teamId,
      oldData: { idea_description: oldIdea },
      newData: { idea_description: idea },
    })
    setEditIdeaTarget(null)
    await fetchData()
  }

  async function deleteTeam(teamName) {
    if (!supabase) return
    const { error: regErr } = await supabase
      .from('registrations')
      .update({ team_name: null, inscription_modality: 'individual_own', is_team_leader: false })
      .eq('team_name', teamName)
    if (regErr) { alert(`Erro ao excluir time: ${regErr.message}`); return }
    const { error: reqErr } = await supabase
      .from('team_join_requests')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('team_name', teamName)
      .eq('status', 'pending')
    if (reqErr) {
      console.warn('[AdminTeams] Erro ao cancelar pedidos do time excluído:', reqErr.message)
    }
    audit({
      action: 'team.delete',
      actorType: 'admin',
      targetTable: 'registrations',
      oldData: { team_name: teamName },
      newData: { team_name: null, inscription_modality: 'individual_own' },
    })
    setDeleteTarget(null)
    if (expandedTeam === teamName) setExpandedTeam(null)
    await fetchData()
  }

  async function addIndividualToTeam(individual, teamName, makeLeader = false) {
    if (!supabase) return
    if (makeLeader) {
      const { error: demoteErr } = await supabase
        .from('registrations')
        .update({ is_team_leader: false })
        .eq('team_name', teamName)
        .eq('is_team_leader', true)
      if (demoteErr) { alert(`Erro ao rebaixar líder: ${demoteErr.message}`); return }
    }
    const { error: err } = await supabase
      .from('registrations')
      .update({
        team_name: teamName,
        inscription_modality: 'team',
        is_team_leader: makeLeader,
      })
      .eq('id', individual.id)
    if (err) { alert(`Erro ao adicionar membro: ${err.message}`); return }
    audit({
      action: 'team.add_member',
      actorType: 'admin',
      targetTable: 'registrations',
      targetId: individual.id,
      targetEmail: individual.email,
      oldData: { team_name: null, inscription_modality: individual.inscription_modality },
      newData: { team_name: teamName, inscription_modality: 'team', is_team_leader: makeLeader },
      metadata: { full_name: individual.full_name },
    })
    setAddMemberTarget(null)
    await fetchData()
  }

  async function createTeam({ teamName, leaderId }) {
    const leader = registrations.find(r => r.id === leaderId)
    if (!leader) { alert('Indivíduo não encontrado.'); return }
    if (!supabase) return
    const { error: err } = await supabase
      .from('registrations')
      .update({
        team_name: teamName,
        inscription_modality: 'team',
        is_team_leader: true,
      })
      .eq('id', leaderId)
    if (err) { alert(`Erro ao criar time: ${err.message}`); return }
    audit({
      action: 'team.create',
      actorType: 'admin',
      targetTable: 'registrations',
      targetId: leaderId,
      targetEmail: leader.email,
      newData: { team_name: teamName, inscription_modality: 'team', is_team_leader: true },
      metadata: { full_name: leader.full_name },
    })
    setCreateOpen(false)
    setExpandedTeam(teamName)
    await fetchData()
  }

  async function approveRequest(req) {
    if (!supabase) return
    const teamSize = (teamsMap[req.team_name] || []).length
    if (teamSize >= 6) { alert('Time já está cheio (6 membros). Aprovação cancelada.'); return }
    const { error: addErr } = await supabase
      .from('registrations')
      .update({
        team_name: req.team_name,
        inscription_modality: 'team',
        is_team_leader: false,
      })
      .eq('id', req.requester.id)
    if (addErr) { alert(`Erro ao adicionar à equipe: ${addErr.message}`); return }
    const { error: reqErr } = await supabase
      .from('team_join_requests')
      .update({ status: 'approved', decided_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', req.id)
    if (reqErr) {
      console.warn('[AdminTeams] Erro ao marcar pedido aprovado:', reqErr.message)
    }
    await supabase
      .from('team_join_requests')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('requester_id', req.requester.id)
      .eq('status', 'pending')
      .neq('id', req.id)
    audit({
      action: 'team.admin_approve_join',
      actorType: 'admin',
      targetTable: 'team_join_requests',
      targetId: req.id,
      targetEmail: req.requester.email,
      newData: { team_name: req.team_name, status: 'approved' },
      metadata: { full_name: req.requester.full_name },
    })
    await fetchData()
  }

  async function rejectRequest(req) {
    if (!supabase) return
    const { error: err } = await supabase
      .from('team_join_requests')
      .update({ status: 'rejected', decided_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', req.id)
    if (err) { alert(`Erro ao recusar: ${err.message}`); return }
    audit({
      action: 'team.admin_reject_join',
      actorType: 'admin',
      targetTable: 'team_join_requests',
      targetId: req.id,
      targetEmail: req.requester?.email,
      newData: { team_name: req.team_name, status: 'rejected' },
      metadata: { full_name: req.requester?.full_name },
    })
    await fetchData()
  }

  async function toggleLunch(teamName, done) {
    if (!supabase) return
    const teamId = teamsMap[teamName]?.[0]?.team_id
    if (!teamId) { alert('Erro: time sem identificador (team_id).'); return }
    const prevMeta = teamsMeta
    // Otimista: reflete na hora; reverte se a RPC falhar.
    setTeamsMeta(prev => prev.map(t => (t.name === teamName ? { ...t, lunch_at: done ? new Date().toISOString() : null } : t)))
    const { data, error: err } = await supabase.rpc('set_team_lunch', { p_team_id: teamId, p_done: done })
    if (err) {
      setTeamsMeta(prevMeta)
      alert(`Erro ao marcar almoço: ${err.message}`)
      return
    }
    setTeamsMeta(prev => prev.map(t => (t.name === teamName ? { ...t, lunch_at: data ?? null } : t)))
    audit({
      action: 'team.set_lunch',
      actorType: 'admin',
      targetTable: 'teams',
      targetId: teamId,
      newData: { lunch_at: done ? (data ?? 'now') : null },
      metadata: { team_name: teamName },
    })
  }

  const actions = {
    moveMember,
    removeMember,
    promoteLeader,
    toggleRemote,
    toggleLunch,
    openTransfer: setTransferSource,
    openRename: ({ teamName }) => setRenameTarget({ teamName }),
    openEditIdea: ({ teamName, idea }) => setEditIdeaTarget({ teamName, idea }),
    openDelete: ({ teamName, memberCount, pendingCount }) =>
      setDeleteTarget({ teamName, memberCount, pendingCount }),
    openAddMember: ({ teamName, currentMemberCount }) =>
      setAddMemberTarget({ teamName, currentMemberCount }),
    approveRequest,
    rejectRequest,
  }

  // ── Render ──────────────────────────────────────────────────────────────────

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
          onClick={() => { setLoading(true); fetchData() }}
          className="px-4 py-2 rounded-lg bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border border-white/10 text-sm transition-colors"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        {[
          { label: 'Total de times',     value: stats.total,      color: 'text-electric' },
          { label: 'Times completos',    value: stats.complete,   color: 'text-cyan',    note: '6 membros' },
          { label: 'Times incompletos',  value: stats.incomplete, color: 'text-gold',    note: '< 6 membros' },
          { label: 'Individuais',        value: stats.solo,       color: 'text-white/60' },
          { label: 'Pedidos pendentes',  value: stats.pending,    color: 'text-cyan' },
          { label: 'Almoçaram',          value: `${stats.lunched}/${stats.total}`, color: 'text-cyan' },
        ].map(stat => (
          <div key={stat.label} className="card-glass rounded-xl px-4 py-3">
            <div className={`text-2xl font-display font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-white/50 text-xs mt-0.5">{stat.label}</div>
            {stat.note && <div className="text-white/25 text-xs font-mono">{stat.note}</div>}
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome do time..."
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 pl-10 text-white text-sm placeholder-white/30 focus:outline-none focus:border-electric/50 focus:ring-1 focus:ring-electric/30 transition-colors"
          />
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 text-sm">⌕</span>
        </div>
        {!readOnly && (
          <button
            onClick={() => setCreateOpen(true)}
            disabled={individuals.length === 0}
            className="px-4 py-2.5 rounded-xl text-sm font-medium bg-gold/15 text-gold hover:bg-gold/25 border border-gold/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            title={individuals.length === 0 ? 'É preciso ter algum indivíduo para virar líder do novo time' : 'Criar novo time'}
          >
            + Novo time
          </button>
        )}
      </div>

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
              idea={(teamsMeta.find(t => t.name === name) || {}).idea_description}
              lunchAt={(teamsMeta.find(t => t.name === name) || {}).lunch_at}
              mentors={mentorsByTeamId.get(teamsMap[name]?.[0]?.team_id) || []}
              allTeamNames={sortedTeamNames}
              expanded={expandedTeam === name}
              onToggle={() => toggleTeam(name)}
              actions={actions}
              requests={requestsByTeam[name]}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}

      <IndividualSection
        individuals={individuals}
        sortedTeamNames={sortedTeamNames}
        onAddToTeam={(individual, teamName) =>
          addIndividualToTeam(individual, teamName, false)
        }
        readOnly={readOnly}
      />

      <MatchingSuggestions
        individuals={individuals}
        teamsMap={teamsMap}
        sortedTeamNames={sortedTeamNames}
        onAddToTeam={(individual, teamName) =>
          addIndividualToTeam(individual, teamName, false)
        }
      />

      {transferSource && (
        <TransferTicketModal
          source={transferSource}
          onClose={() => setTransferSource(null)}
          onDone={() => {
            setTransferSource(null)
            fetchData()
          }}
        />
      )}

      {renameTarget && (
        <RenameTeamModal
          teamName={renameTarget.teamName}
          existingNames={sortedTeamNames}
          onConfirm={(newName) => renameTeam(renameTarget.teamName, newName)}
          onCancel={() => setRenameTarget(null)}
        />
      )}

      {editIdeaTarget && (
        <EditIdeaModal
          teamName={editIdeaTarget.teamName}
          currentIdea={editIdeaTarget.idea}
          onConfirm={(idea) => updateTeamIdea(editIdeaTarget.teamName, idea)}
          onCancel={() => setEditIdeaTarget(null)}
        />
      )}

      {deleteTarget && (
        <DeleteTeamConfirm
          teamName={deleteTarget.teamName}
          memberCount={deleteTarget.memberCount}
          pendingCount={deleteTarget.pendingCount}
          onConfirm={() => deleteTeam(deleteTarget.teamName)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {addMemberTarget && (
        <AddMemberToTeamModal
          teamName={addMemberTarget.teamName}
          currentMemberCount={addMemberTarget.currentMemberCount}
          candidates={individuals}
          onConfirm={({ id, makeLeader }) => {
            const ind = individuals.find(i => i.id === id)
            if (ind) addIndividualToTeam(ind, addMemberTarget.teamName, makeLeader)
          }}
          onCancel={() => setAddMemberTarget(null)}
        />
      )}

      {createOpen && (
        <CreateTeamModal
          existingNames={sortedTeamNames}
          candidates={individuals}
          onConfirm={createTeam}
          onCancel={() => setCreateOpen(false)}
        />
      )}
    </div>
  )
}
