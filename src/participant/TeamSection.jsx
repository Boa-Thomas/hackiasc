import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const ROLE_LABELS = {
  hacker: 'Hacker',
  hustler: 'Hustler',
  hipster: 'Hipster',
  enthusiast: 'Entusiasta',
}

const ERROR_LABELS = {
  invalid_or_expired_session: 'Sessão expirou. Faça login novamente.',
  already_in_team: 'Você já está em uma equipe.',
  not_in_team: 'Você não está em nenhuma equipe.',
  team_not_found: 'Equipe não encontrada.',
  team_full: 'Equipe já está com 6 membros.',
  request_already_pending: 'Você já tem um pedido pendente para essa equipe.',
  request_not_found: 'Pedido não encontrado.',
  request_not_for_your_team: 'Esse pedido não é da sua equipe.',
  request_already_decided: 'Esse pedido já foi respondido.',
  request_not_found_or_already_decided: 'Pedido já foi respondido ou cancelado.',
  not_team_leader: 'Apenas o líder pode fazer essa ação.',
  leader_must_transfer_or_be_alone: 'Você é o líder da equipe — transfira a liderança antes de sair.',
  cannot_transfer_to_self: 'Você já é o líder.',
  new_leader_not_in_team: 'Membro selecionado não está na equipe.',
  team_name_required: 'Informe um nome de equipe válido (até 120 caracteres).',
  team_name_taken: 'Esse nome de equipe já está em uso.',
  idea_too_long: 'A descrição da ideia deve ter até 500 caracteres.',
  payment_not_confirmed: 'Pagamento ainda não confirmado — funcionalidades de equipe ficam liberadas após a confirmação.',
}

function translateError(err) {
  if (!err) return 'Erro inesperado.'
  const msg = err.message || String(err)
  for (const key of Object.keys(ERROR_LABELS)) {
    if (msg.includes(key)) return ERROR_LABELS[key]
  }
  return 'Erro: ' + msg
}

export default function TeamSection({ auth }) {
  const { profile, teamMembers, pendingRequests, myRequests, refreshMe, token, team } = auth
  const inTeam = !!profile?.team_name

  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState(null) // { type: 'error' | 'success', text }

  const callRpc = useCallback(async (name, params) => {
    if (!supabase) {
      setFeedback({ type: 'error', text: 'Sistema indisponível.' })
      return null
    }
    setBusy(true)
    setFeedback(null)
    const { data, error } = await supabase.rpc(name, { p_token: token, ...params })
    setBusy(false)
    if (error) {
      setFeedback({ type: 'error', text: translateError(error) })
      return null
    }
    return data
  }, [token])

  const flash = (text) => {
    setFeedback({ type: 'success', text })
    setTimeout(() => setFeedback(curr => (curr?.text === text ? null : curr)), 4000)
  }

  return (
    <div className="space-y-6">
      {feedback && (
        <div className={`rounded-xl px-4 py-3 text-sm border ${
          feedback.type === 'error'
            ? 'bg-hot/10 border-hot/30 text-hot'
            : 'bg-cyan/10 border-cyan/30 text-cyan'
        }`}>
          {feedback.text}
        </div>
      )}

      {inTeam ? (
        <CurrentTeamView
          profile={profile}
          team={team}
          members={teamMembers}
          busy={busy}
          onSave={async ({ name, idea }) => {
            const ok = await callRpc('participant_update_team', { p_team_name: name, p_idea_description: idea })
            if (ok) { flash('Equipe atualizada.'); await refreshMe() }
            return ok
          }}
          onLeave={async () => {
            const ok = await callRpc('participant_leave_team', {})
            if (ok) { flash('Você saiu da equipe.'); await refreshMe() }
          }}
          onTransfer={async (newLeaderId) => {
            const ok = await callRpc('participant_transfer_leadership', { p_new_leader_id: newLeaderId })
            if (ok) { flash('Liderança transferida.'); await refreshMe() }
          }}
        />
      ) : (
        <NoTeamView
          token={token}
          myRequests={myRequests}
          busy={busy}
          callRpc={callRpc}
          refreshMe={refreshMe}
          flash={flash}
        />
      )}

      {profile?.is_team_leader && inTeam && (
        <PendingRequestsList
          requests={pendingRequests}
          busy={busy}
          onApprove={async (id) => {
            const ok = await callRpc('participant_approve_request', { p_request_id: id })
            if (ok) { flash('Pedido aprovado — membro adicionado à equipe.'); await refreshMe() }
          }}
          onReject={async (id) => {
            const ok = await callRpc('participant_reject_request', { p_request_id: id })
            if (ok) { flash('Pedido recusado.'); await refreshMe() }
          }}
        />
      )}
    </div>
  )
}

// ─── Current team view (in a team) ─────────────────────────────────────────

function CurrentTeamView({ profile, team, members, busy, onLeave, onTransfer, onSave }) {
  const [transferOpen, setTransferOpen] = useState(false)
  const [selectedNewLeader, setSelectedNewLeader] = useState('')
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState(profile.team_name || '')
  const [editIdea, setEditIdea] = useState(team?.idea_description || '')
  const teammates = members.filter(m => m.id !== profile.id)
  const isLeaderAlone = profile.is_team_leader && members.length === 1

  return (
    <div className="card-glass rounded-2xl p-6">
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div>
          <p className="text-xs font-mono text-electric uppercase tracking-wider">Sua equipe</p>
          <h2 className="text-2xl font-bold mt-1">{profile.team_name}</h2>
          <p className="text-sm text-text-muted mt-1">
            {members.length} {members.length === 1 ? 'integrante' : 'integrantes'} de até 6
          </p>
          {team?.idea_description ? (
            <p className="text-sm text-white/70 mt-2 max-w-xl whitespace-pre-wrap">{team.idea_description}</p>
          ) : (
            <div className="mt-3 max-w-xl rounded-xl border border-dashed border-electric/30 bg-electric/5 px-4 py-3">
              <p className="text-sm text-white/50">
                {'\u{1F4DD}'} Coloque aqui a descrição da sua solução — clique em{' '}
                <span className="text-electric font-semibold">Editar equipe</span> para preencher.
              </p>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => { setEditName(profile.team_name || ''); setEditIdea(team?.idea_description || ''); setEditOpen(o => !o) }}
            disabled={busy}
            className="px-4 py-2 rounded-xl text-sm font-semibold border border-electric/30 bg-electric/10 text-electric hover:bg-electric/20 transition-colors disabled:opacity-50"
          >
            Editar equipe
          </button>
          {profile.is_team_leader && !isLeaderAlone && (
            <button
              type="button"
              onClick={() => setTransferOpen(o => !o)}
              disabled={busy}
              className="px-4 py-2 rounded-xl text-sm font-semibold border border-gold/30 bg-gold/10 text-gold hover:bg-gold/20 transition-colors disabled:opacity-50"
            >
              Transferir liderança
            </button>
          )}
          <button
            type="button"
            onClick={() => setLeaveConfirmOpen(true)}
            disabled={busy || (profile.is_team_leader && !isLeaderAlone)}
            className="px-4 py-2 rounded-xl text-sm font-semibold border border-hot/30 bg-hot/10 text-hot hover:bg-hot/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title={profile.is_team_leader && !isLeaderAlone ? 'Transfira a liderança primeiro' : ''}
          >
            Sair da equipe
          </button>
        </div>
      </div>

      {editOpen && (
        <div className="mb-4 p-4 rounded-xl border border-electric/20 bg-electric/5 space-y-3">
          <div>
            <label className="block text-sm font-semibold text-white mb-1">Nome da equipe</label>
            <input
              type="text"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              maxLength={120}
              className="w-full bg-dark border border-dark-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-electric"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-white mb-1">Descrição da ideia</label>
            <textarea
              value={editIdea}
              onChange={e => setEditIdea(e.target.value)}
              maxLength={500}
              rows={4}
              placeholder="Coloque aqui a descrição da sua solução"
              className="w-full bg-dark border border-dark-border rounded-xl px-4 py-2.5 text-white text-sm placeholder-text-muted focus:outline-none focus:border-electric"
            />
            <p className="text-xs text-text-muted mt-1">{editIdea.length}/500</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !editName.trim()}
              onClick={async () => { const ok = await onSave({ name: editName, idea: editIdea }); if (ok) setEditOpen(false) }}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-electric/20 text-electric border border-electric/40 hover:bg-electric/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Salvar
            </button>
            <button
              type="button"
              onClick={() => setEditOpen(false)}
              className="px-4 py-2 rounded-lg text-sm font-semibold border border-dark-border text-text-muted hover:text-white"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {transferOpen && teammates.length > 0 && (
        <div className="mb-4 p-4 rounded-xl border border-gold/20 bg-gold/5 space-y-3">
          <p className="text-sm text-white">Selecione o novo líder:</p>
          <select
            value={selectedNewLeader}
            onChange={e => setSelectedNewLeader(e.target.value)}
            className="w-full bg-dark border border-dark-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold/40"
          >
            <option value="">— Escolher membro —</option>
            {teammates.map(m => (
              <option key={m.id} value={m.id}>{m.full_name}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!selectedNewLeader || busy}
              onClick={() => { onTransfer(selectedNewLeader); setTransferOpen(false); setSelectedNewLeader('') }}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-gold/20 text-gold border border-gold/40 hover:bg-gold/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Confirmar transferência
            </button>
            <button
              type="button"
              onClick={() => setTransferOpen(false)}
              className="px-4 py-2 rounded-lg text-sm font-semibold border border-dark-border text-text-muted hover:text-white"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {members.map(m => (
          <div
            key={m.id}
            className={`flex items-center justify-between gap-3 p-3 rounded-xl border ${
              m.id === profile.id ? 'border-cyan/30 bg-cyan/5' : 'border-dark-border bg-dark'
            }`}
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">
                {m.full_name}
                {m.id === profile.id && <span className="ml-2 text-xs text-cyan">(você)</span>}
              </p>
              <p className="text-xs text-text-muted truncate">{m.email}</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              {m.is_team_leader && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-gold/10 text-gold border border-gold/20">
                  Líder
                </span>
              )}
              {m.is_remote && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-violet/10 text-violet border border-violet/20">
                  Remoto
                </span>
              )}
              {m.occupation_type && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-electric/10 text-electric border border-electric/20">
                  {ROLE_LABELS[m.occupation_type] || m.occupation_type}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {profile.is_team_leader && !isLeaderAlone && (
        <p className="text-xs text-text-muted mt-4">
          Como líder você não pode sair antes de transferir a liderança.
        </p>
      )}

      {/* Leave confirmation modal */}
      {leaveConfirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="leave-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark/80 backdrop-blur-sm"
          onClick={() => setLeaveConfirmOpen(false)}
        >
          <div
            className="card-glass rounded-2xl p-6 max-w-sm w-full"
            onClick={e => e.stopPropagation()}
          >
            <p id="leave-modal-title" className="text-base font-bold text-white mb-2">
              Sair da equipe?
            </p>
            <p className="text-sm text-text-muted mb-6">
              Você sairá da equipe <strong className="text-white">{profile.team_name}</strong>. Será necessário um novo pedido de entrada para voltar.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => { setLeaveConfirmOpen(false); onLeave() }}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold bg-hot/20 text-hot border border-hot/40 hover:bg-hot/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Confirmar saída
              </button>
              <button
                type="button"
                onClick={() => setLeaveConfirmOpen(false)}
                className="px-4 py-2 rounded-xl text-sm font-semibold border border-dark-border text-text-muted hover:text-white transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── No team view: list teams + my requests ────────────────────────────────

function NoTeamView({ token, myRequests, busy, callRpc, refreshMe, flash }) {
  const [teams, setTeams] = useState([])
  const [loadingTeams, setLoadingTeams] = useState(true)
  const [teamsError, setTeamsError] = useState(null)
  const [search, setSearch] = useState('')
  const [requestingTeam, setRequestingTeam] = useState(null) // { team_name }
  const [message, setMessage] = useState('')
  const [creatingTeam, setCreatingTeam] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')

  const loadTeams = useCallback(async () => {
    if (!supabase || !token) return
    setLoadingTeams(true)
    const { data, error } = await supabase.rpc('participant_list_teams', { p_token: token })
    if (error) {
      setTeamsError(translateError(error))
      setLoadingTeams(false)
      return
    }
    setTeams(data || [])
    setLoadingTeams(false)
  }, [token])

  useEffect(() => { loadTeams() }, [loadTeams]) // eslint-disable-line react-hooks/set-state-in-effect

  const filteredTeams = teams.filter(t =>
    t.team_name.toLowerCase().includes(search.toLowerCase()) ||
    (t.leader_name || '').toLowerCase().includes(search.toLowerCase())
  )

  const submitRequest = async () => {
    const ok = await callRpc('participant_request_join', {
      p_team_name: requestingTeam.team_name,
      p_message: message,
    })
    if (ok) {
      flash('Pedido enviado! Aguarde aprovação do líder.')
      setRequestingTeam(null)
      setMessage('')
      await refreshMe()
    }
  }

  const cancelRequest = async (id) => {
    const ok = await callRpc('participant_cancel_request', { p_request_id: id })
    if (ok) { flash('Pedido cancelado.'); await refreshMe() }
  }

  const createTeam = async () => {
    const ok = await callRpc('participant_create_team', { p_team_name: newTeamName })
    if (ok) {
      flash('Equipe criada! Você é o líder.')
      setCreatingTeam(false)
      setNewTeamName('')
      await refreshMe()
    }
  }

  return (
    <div className="space-y-6">
      <div className="card-glass rounded-2xl p-6">
        <p className="text-xs font-mono text-electric uppercase tracking-wider mb-2">Status</p>
        <h2 className="text-xl font-bold text-white">Você ainda não está em uma equipe</h2>
        <p className="text-sm text-text-muted mt-2">
          Crie a sua própria equipe (e vire líder) ou procure uma equipe existente abaixo e envie um pedido de entrada.
        </p>

        {!creatingTeam ? (
          <button
            onClick={() => setCreatingTeam(true)}
            disabled={busy}
            className="mt-4 px-4 py-2 rounded-xl text-sm font-semibold bg-electric/10 text-electric border border-electric/30 hover:bg-electric/20 disabled:opacity-50 transition-colors"
          >
            + Criar minha equipe
          </button>
        ) : (
          <div className="mt-4 p-4 rounded-xl border border-electric/20 bg-electric/5 space-y-3">
            <input
              type="text"
              value={newTeamName}
              onChange={e => setNewTeamName(e.target.value)}
              maxLength={120}
              placeholder="Nome da equipe"
              className="w-full bg-dark border border-dark-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-electric"
            />
            <div className="flex gap-2">
              <button
                onClick={createTeam}
                disabled={busy || !newTeamName.trim()}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-electric/20 text-electric border border-electric/40 hover:bg-electric/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Criar equipe
              </button>
              <button
                onClick={() => { setCreatingTeam(false); setNewTeamName('') }}
                className="px-4 py-2 rounded-lg text-sm font-semibold border border-dark-border text-text-muted hover:text-white"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* My pending requests */}
      {myRequests.length > 0 && (
        <div className="card-glass rounded-2xl p-6">
          <p className="text-xs font-mono text-electric uppercase tracking-wider mb-3">Meus pedidos</p>
          <div className="space-y-2">
            {myRequests.map(r => (
              <div key={r.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-dark-border bg-dark">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{r.team_name}</p>
                  <p className="text-xs text-text-muted">
                    {r.status === 'pending' && 'Aguardando aprovação do líder'}
                    {r.status === 'rejected' && 'Pedido recusado'}
                  </p>
                </div>
                {r.status === 'pending' && (
                  <button
                    onClick={() => cancelRequest(r.id)}
                    disabled={busy}
                    className="text-xs text-text-muted hover:text-hot underline disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                )}
                {r.status === 'rejected' && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-hot/10 text-hot border border-hot/20">
                    Recusado
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Teams list */}
      <div className="card-glass rounded-2xl p-6">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <p className="text-xs font-mono text-electric uppercase tracking-wider">Equipes abertas</p>
          <button
            onClick={loadTeams}
            disabled={loadingTeams}
            className="text-xs text-text-muted hover:text-white underline disabled:opacity-50"
          >
            Atualizar
          </button>
        </div>

        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome da equipe ou líder"
          className="w-full bg-dark border border-dark-border rounded-xl px-4 py-2.5 text-white text-sm placeholder-text-muted focus:outline-none focus:border-electric mb-4"
        />

        {teamsError && (
          <div className="bg-hot/10 border border-hot/30 rounded-lg px-4 py-2.5 text-hot text-sm mb-3">
            {teamsError}
          </div>
        )}

        {loadingTeams ? (
          <p className="text-sm text-text-muted">Carregando...</p>
        ) : filteredTeams.length === 0 ? (
          <p className="text-sm text-text-muted">
            {teams.length === 0
              ? 'Nenhuma equipe disponível no momento.'
              : 'Nenhuma equipe encontrada com esse nome.'}
          </p>
        ) : (
          <div className="space-y-2">
            {filteredTeams.map(t => {
              const alreadyRequested = myRequests.some(r => r.team_name === t.team_name && r.status === 'pending')
              return (
                <div
                  key={t.team_name}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl border border-dark-border bg-dark"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{t.team_name}</p>
                    <p className="text-xs text-text-muted truncate">
                      Líder: {t.leader_name || '—'} · {t.member_count}/6 membros
                    </p>
                    {t.idea_description && (
                      <p className="text-xs text-white/50 mt-1 line-clamp-2">{t.idea_description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => setRequestingTeam(t)}
                    disabled={busy || alreadyRequested}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan/10 text-cyan border border-cyan/30 hover:bg-cyan/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {alreadyRequested ? 'Pedido enviado' : 'Pedir entrada'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Request modal */}
      {requestingTeam && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark/80 backdrop-blur-sm"
          onClick={() => setRequestingTeam(null)}
        >
          <div
            className="card-glass rounded-2xl p-6 max-w-md w-full"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-xs font-mono text-cyan uppercase tracking-wider">Pedido de entrada</p>
            <h3 className="text-xl font-bold text-white mt-1">{requestingTeam.team_name}</h3>
            <p className="text-sm text-text-muted mt-1">Líder: {requestingTeam.leader_name || '—'}</p>

            <label className="block text-sm font-semibold text-white mt-5 mb-2">
              Mensagem para o líder (opcional)
            </label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              maxLength={300}
              rows={3}
              className="w-full bg-dark border border-dark-border rounded-xl px-4 py-2.5 text-white text-sm placeholder-text-muted focus:outline-none focus:border-electric"
              placeholder="Conte um pouco sobre você, suas habilidades..."
            />
            <p className="text-xs text-text-muted mt-1">{message.length}/300</p>

            <div className="flex gap-2 mt-5">
              <button
                onClick={submitRequest}
                disabled={busy}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-cyan/20 text-cyan border border-cyan/40 hover:bg-cyan/30 disabled:opacity-50 transition-colors"
              >
                Enviar pedido
              </button>
              <button
                onClick={() => { setRequestingTeam(null); setMessage('') }}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-dark-border text-text-muted hover:text-white"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Pending requests list (leader view) ────────────────────────────────────

function PendingRequestsList({ requests, busy, onApprove, onReject }) {
  if (requests.length === 0) {
    return (
      <div className="card-glass rounded-2xl p-6">
        <p className="text-xs font-mono text-electric uppercase tracking-wider mb-2">Pedidos de entrada</p>
        <p className="text-sm text-text-muted">Nenhum pedido pendente no momento.</p>
      </div>
    )
  }

  return (
    <div className="card-glass rounded-2xl p-6">
      <p className="text-xs font-mono text-electric uppercase tracking-wider mb-3">
        Pedidos de entrada · {requests.length}
      </p>
      <div className="space-y-3">
        {requests.map(req => (
          <div key={req.id} className="p-4 rounded-xl border border-dark-border bg-dark">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{req.requester.full_name}</p>
                <p className="text-xs text-text-muted truncate">{req.requester.email}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {req.requester.occupation_type && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-electric/10 text-electric border border-electric/20">
                      {ROLE_LABELS[req.requester.occupation_type] || req.requester.occupation_type}
                    </span>
                  )}
                  {req.requester.ai_experience_level && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan/10 text-cyan border border-cyan/20">
                      Nível IA: {req.requester.ai_experience_level}/10
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onApprove(req.id)}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan/10 text-cyan border border-cyan/30 hover:bg-cyan/20 disabled:opacity-50 transition-colors"
                >
                  Aceitar
                </button>
                <button
                  onClick={() => onReject(req.id)}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-hot/10 text-hot border border-hot/30 hover:bg-hot/20 disabled:opacity-50 transition-colors"
                >
                  Recusar
                </button>
              </div>
            </div>
            {req.message && (
              <p className="mt-3 text-sm text-text-muted italic border-l-2 border-electric/30 pl-3">
                &ldquo;{req.message}&rdquo;
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
