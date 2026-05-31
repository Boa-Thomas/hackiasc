import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

// Salas de pre-pitch: quadro de planejamento admin-only. N salas por rodada,
// cada uma com mentores e equipes (em ordem de apresentacao). NAO restringe a
// avaliacao (mentor_prepitch_* seguem liberando qualquer equipe) e NAO e exposta
// a mentor/participante. DML direto nas tabelas prepitch_rooms /
// prepitch_room_mentors / prepitch_room_teams (RLS autoriza), como em mentor_teams.

const ROUNDS = [1, 2]

// Proximo nome sugerido: Sala A, B, C... (cai p/ numero depois de Z)
function nextRoomName(count) {
  return count < 26 ? `Sala ${String.fromCharCode(65 + count)}` : `Sala ${count + 1}`
}

export default function AdminPrePitchRooms() {
  const [round, setRound] = useState(1)
  const [rooms, setRooms] = useState([])
  const [roomMentors, setRoomMentors] = useState([]) // { room_id, mentor_id }
  const [roomTeams, setRoomTeams] = useState([])      // { room_id, team_id, present_order }
  const [mentors, setMentors] = useState([])
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [editingRoomId, setEditingRoomId] = useState(null)
  const [editName, setEditName] = useState('')
  const busyRef = useRef(false)     // evita exec sobreposto (clique rapido durante o evento)
  const skipBlurRef = useRef(false) // Escape no input de nome nao deve salvar via blur

  async function fetchData() {
    if (!supabase) { setError('Supabase nao configurado.'); setLoading(false); return }
    setError(null)
    const [rRooms, rRM, rRT, rMentors, rTeams, rRegs] = await Promise.all([
      supabase.from('prepitch_rooms').select('id, name, round, sort_order, created_at'),
      supabase.from('prepitch_room_mentors').select('room_id, mentor_id'),
      supabase.from('prepitch_room_teams').select('room_id, team_id, present_order'),
      supabase.from('mentors').select('id, name, email').order('created_at', { ascending: true }),
      supabase.from('teams').select('id, name').order('name', { ascending: true }),
      supabase.from('registrations').select('team_id').not('team_id', 'is', null).neq('payment_status', 'cancelled'),
    ])
    const failed = [rRooms, rRM, rRT, rMentors, rTeams, rRegs].find(r => r.error)
    if (failed) { setError(failed.error.message); setLoading(false); return }
    // Equipes-fantasma: o trigger cria linha em teams mas nunca remove. So ofertamos
    // equipes com ao menos 1 membro ativo (mesmo criterio do AdminMentors).
    const activeTeamIds = new Set((rRegs.data ?? []).map(r => r.team_id))
    setRooms(rRooms.data ?? [])
    setRoomMentors(rRM.data ?? [])
    setRoomTeams(rRT.data ?? [])
    setMentors(rMentors.data ?? [])
    setTeams((rTeams.data ?? []).filter(t => activeTeamIds.has(t.id)))
    setLoading(false)
  }

  useEffect(() => { fetchData() }, []) // eslint-disable-line react-hooks/set-state-in-effect

  // Roda uma sequencia de queries (para na 1a com erro) e recarrega.
  async function exec(steps) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true); setError(null)
    for (const step of steps) {
      const { error: err } = await step
      if (err) { setError(err.message); busyRef.current = false; setBusy(false); return }
    }
    await fetchData()
    busyRef.current = false
    setBusy(false)
  }

  // --- derivados da rodada selecionada ---
  const roundRooms = rooms
    .filter(r => r.round === round)
    .sort((a, b) => (a.sort_order - b.sort_order) || a.created_at.localeCompare(b.created_at))
  const roundRoomIds = roundRooms.map(r => r.id)
  const roundRoomIdSet = new Set(roundRoomIds)

  const mentorById = id => mentors.find(m => m.id === id)
  const teamById = id => teams.find(t => t.id === id)
  const mentorLabel = m => m.name || m.email

  function mentorsInRoom(roomId) {
    return roomMentors
      .filter(rm => rm.room_id === roomId)
      .map(rm => mentorById(rm.mentor_id))
      .filter(Boolean)
      .sort((a, b) => mentorLabel(a).localeCompare(mentorLabel(b)))
  }

  function teamsInRoom(roomId) {
    return roomTeams
      .filter(rt => rt.room_id === roomId)
      .map(rt => ({ ...rt, team: teamById(rt.team_id) }))
      .filter(rt => rt.team)
      .sort((a, b) => a.present_order - b.present_order)
  }

  // Em qual sala (da rodada atual) este mentor/equipe ja esta, se estiver.
  const roomOfMentor = mentorId => {
    const rm = roomMentors.find(x => x.mentor_id === mentorId && roundRoomIdSet.has(x.room_id))
    return rm ? roundRooms.find(r => r.id === rm.room_id) : null
  }
  const roomOfTeam = teamId => {
    const rt = roomTeams.find(x => x.team_id === teamId && roundRoomIdSet.has(x.room_id))
    return rt ? roundRooms.find(r => r.id === rt.room_id) : null
  }

  const assignedMentorIds = new Set(roomMentors.filter(rm => roundRoomIdSet.has(rm.room_id)).map(rm => rm.mentor_id))
  const assignedTeamIds = new Set(roomTeams.filter(rt => roundRoomIdSet.has(rt.room_id)).map(rt => rt.team_id))
  const pendingMentors = mentors.filter(m => !assignedMentorIds.has(m.id))
  const pendingTeams = teams.filter(t => !assignedTeamIds.has(t.id))

  // --- mutacoes (DML direto; move-semantics = 1 sala por rodada) ---
  function addRoom() {
    exec([supabase.from('prepitch_rooms').insert({
      name: nextRoomName(roundRooms.length), round, sort_order: roundRooms.length,
    })])
  }

  function deleteRoom(id, name) {
    if (!window.confirm(`Remover ${name}? As alocacoes dessa sala serao perdidas.`)) return
    exec([supabase.from('prepitch_rooms').delete().eq('id', id)])
  }

  function startEdit(room) { skipBlurRef.current = false; setEditingRoomId(room.id); setEditName(room.name) }
  function cancelEdit() { skipBlurRef.current = true; setEditingRoomId(null) }
  function saveRoomName(id) {
    if (skipBlurRef.current) { skipBlurRef.current = false; return }
    const name = editName.trim()
    setEditingRoomId(null)
    if (!name) return
    exec([supabase.from('prepitch_rooms').update({ name }).eq('id', id)])
  }

  // Aloca mentor a uma sala: remove de qualquer outra sala da rodada, depois insere.
  function assignMentor(roomId, mentorId) {
    if (!mentorId) return
    exec([
      supabase.from('prepitch_room_mentors').delete().eq('mentor_id', mentorId).in('room_id', roundRoomIds),
      supabase.from('prepitch_room_mentors').insert({ room_id: roomId, mentor_id: mentorId }),
    ])
  }
  function removeMentor(roomId, mentorId) {
    exec([supabase.from('prepitch_room_mentors').delete().eq('room_id', roomId).eq('mentor_id', mentorId)])
  }

  function assignTeam(roomId, teamId) {
    if (!teamId) return
    // proximo order = max+1 (robusto a gaps de remocao; .length colidiria e quebraria o reorder)
    const orders = roomTeams.filter(rt => rt.room_id === roomId).map(rt => rt.present_order)
    const order = orders.length ? Math.max(...orders) + 1 : 0
    exec([
      supabase.from('prepitch_room_teams').delete().eq('team_id', teamId).in('room_id', roundRoomIds),
      supabase.from('prepitch_room_teams').insert({ room_id: roomId, team_id: teamId, present_order: order }),
    ])
  }
  function removeTeam(roomId, teamId) {
    exec([supabase.from('prepitch_room_teams').delete().eq('room_id', roomId).eq('team_id', teamId)])
  }

  // Move a equipe 1 posicao (dir = -1 sobe, +1 desce). Reindexa present_order de TODAS
  // as equipes da sala para 0..n-1 na nova ordem — robusto a empates/gaps (um swap simples
  // nao mexeria a tela quando dois present_order sao iguais).
  function moveTeam(roomId, teamId, dir) {
    const list = teamsInRoom(roomId)
    const i = list.findIndex(rt => rt.team_id === teamId)
    const j = i + dir
    if (i < 0 || j < 0 || j >= list.length) return
    const reordered = [...list]
    const [moved] = reordered.splice(i, 1)
    reordered.splice(j, 0, moved)
    exec(reordered.map((rt, idx) =>
      supabase.from('prepitch_room_teams').update({ present_order: idx }).eq('room_id', roomId).eq('team_id', rt.team_id)
    ))
  }

  if (loading) return <p className="text-white/60 font-mono">Carregando...</p>

  return (
    <div className="space-y-5">
      {error && <div className="bg-hot/10 border border-hot/30 rounded-lg px-4 py-2.5 text-hot text-sm">{error}</div>}

      {/* Cabecalho + rodada + adicionar sala */}
      <div className="card-glass rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-mono text-gold uppercase tracking-wider mb-1">Organizacao do Pre-Pitch</p>
            <p className="text-sm text-text-muted max-w-xl">
              Monte as salas de cada rodada: quem mentora e quais equipes apresentam, em ordem.
              E so planejamento — nao muda quem o mentor pode avaliar.
            </p>
          </div>
          <button
            onClick={addRoom}
            disabled={busy}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-gold/20 text-gold border border-gold/40 hover:bg-gold/30 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            + Adicionar sala
          </button>
        </div>

        <div className="flex gap-2 mt-4">
          {ROUNDS.map(r => (
            <button
              key={r}
              onClick={() => setRound(r)}
              className={`px-4 py-2 rounded-xl border text-sm font-semibold transition-all ${
                round === r
                  ? 'border-cyan/40 bg-cyan/10 text-cyan'
                  : 'border-dark-border bg-dark text-text-muted hover:text-white hover:border-text-muted'
              }`}
            >
              Rodada {r}
            </button>
          ))}
        </div>
      </div>

      {/* Salas */}
      {roundRooms.length === 0 ? (
        <div className="card-glass rounded-2xl p-8 text-center">
          <p className="text-sm text-text-muted">Nenhuma sala na rodada {round}. Clique em <strong className="text-gold">+ Adicionar sala</strong> para comecar.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {roundRooms.map(room => {
            const roomMentorList = mentorsInRoom(room.id)
            const roomTeamList = teamsInRoom(room.id)
            const mentorOptions = mentors.filter(m => !roomMentorList.some(rm => rm.id === m.id))
            const teamOptions = teams.filter(t => !roomTeamList.some(rt => rt.team_id === t.id))
            return (
              <div key={room.id} className="card-glass rounded-2xl p-5 space-y-4">
                {/* Cabecalho da sala */}
                <div className="flex items-center justify-between gap-2">
                  {editingRoomId === room.id ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onBlur={() => saveRoomName(room.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') e.target.blur()
                        if (e.key === 'Escape') cancelEdit()
                      }}
                      className="bg-white/5 border border-cyan/40 rounded-lg px-3 py-1.5 text-white text-base font-bold focus:outline-none"
                    />
                  ) : (
                    <button onClick={() => startEdit(room)} className="text-lg font-bold text-white hover:text-cyan transition-colors" title="Renomear">
                      {room.name} <span className="text-xs text-white/30">✎</span>
                    </button>
                  )}
                  <button onClick={() => deleteRoom(room.id, room.name)} disabled={busy} className="text-xs text-hot hover:underline disabled:opacity-50">remover sala</button>
                </div>

                {/* Mentores */}
                <div>
                  <p className="text-[11px] font-mono text-violet uppercase tracking-wider mb-2">Mentores</p>
                  <div className="flex flex-wrap gap-2 items-center">
                    {roomMentorList.map(m => (
                      <span key={m.id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-violet/15 text-violet border border-violet/30">
                        {mentorLabel(m)}
                        <button onClick={() => removeMentor(room.id, m.id)} disabled={busy} className="hover:text-white disabled:opacity-50" aria-label={`Remover ${mentorLabel(m)}`}>×</button>
                      </span>
                    ))}
                    {mentorOptions.length > 0 && (
                      <select
                        value=""
                        disabled={busy}
                        onChange={e => assignMentor(room.id, e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-cyan/50 disabled:opacity-50"
                      >
                        <option value="">＋ mentor</option>
                        {mentorOptions.map(m => {
                          const other = roomOfMentor(m.id)
                          return <option key={m.id} value={m.id}>{mentorLabel(m)}{other ? ` — em ${other.name}` : ''}</option>
                        })}
                      </select>
                    )}
                    {roomMentorList.length === 0 && mentorOptions.length === 0 && <span className="text-white/40 text-xs">sem mentores</span>}
                  </div>
                </div>

                {/* Equipes (ordem de apresentacao) */}
                <div>
                  <p className="text-[11px] font-mono text-cyan uppercase tracking-wider mb-2">Equipes — ordem de apresentacao</p>
                  <div className="space-y-1.5">
                    {roomTeamList.map((rt, idx) => (
                      <div key={rt.team_id} className="flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5">
                        <span className="text-xs font-mono text-cyan w-5 text-center">{idx + 1}</span>
                        <span className="flex-1 text-sm text-white truncate">{rt.team.name}</span>
                        <div className="flex items-center gap-1">
                          <button onClick={() => moveTeam(room.id, rt.team_id, -1)} disabled={busy || idx === 0} className="text-white/50 hover:text-white disabled:opacity-20" title="Subir" aria-label="Subir">▲</button>
                          <button onClick={() => moveTeam(room.id, rt.team_id, 1)} disabled={busy || idx === roomTeamList.length - 1} className="text-white/50 hover:text-white disabled:opacity-20" title="Descer" aria-label="Descer">▼</button>
                          <button onClick={() => removeTeam(room.id, rt.team_id)} disabled={busy} className="text-hot hover:text-white ml-1 disabled:opacity-50" title="Remover" aria-label={`Remover ${rt.team.name}`}>×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {teamOptions.length > 0 && (
                    <select
                      value=""
                      disabled={busy}
                      onChange={e => assignTeam(room.id, e.target.value)}
                      className="mt-2 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-cyan/50 disabled:opacity-50"
                    >
                      <option value="">＋ equipe</option>
                      {teamOptions.map(t => {
                        const other = roomOfTeam(t.id)
                        return <option key={t.id} value={t.id}>{t.name}{other ? ` — em ${other.name}` : ''}</option>
                      })}
                    </select>
                  )}
                  {roomTeamList.length === 0 && <p className="text-white/40 text-xs mt-1">nenhuma equipe ainda</p>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Nao alocados na rodada */}
      {roundRooms.length > 0 && (pendingMentors.length > 0 || pendingTeams.length > 0) && (
        <div className="card-glass rounded-2xl p-5">
          <p className="text-xs font-mono text-text-muted uppercase tracking-wider mb-3">Ainda nao alocados — rodada {round}</p>
          {pendingTeams.length > 0 && (
            <div className="mb-3">
              <p className="text-[11px] text-white/40 mb-1.5">Equipes ({pendingTeams.length})</p>
              <div className="flex flex-wrap gap-2">
                {pendingTeams.map(t => (
                  <span key={t.id} className="px-2.5 py-1 rounded-lg text-xs bg-white/5 text-white/70 border border-white/10">{t.name}</span>
                ))}
              </div>
            </div>
          )}
          {pendingMentors.length > 0 && (
            <div>
              <p className="text-[11px] text-white/40 mb-1.5">Mentores ({pendingMentors.length})</p>
              <div className="flex flex-wrap gap-2">
                {pendingMentors.map(m => (
                  <span key={m.id} className="px-2.5 py-1 rounded-lg text-xs bg-white/5 text-white/70 border border-white/10">{mentorLabel(m)}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
