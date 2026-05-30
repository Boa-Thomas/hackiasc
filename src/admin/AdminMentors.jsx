import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Link de acesso direto do mentor (sem login). Espelha a rota lida em
// useMentorAuth (#mentor?t=<access_token>, modo link).
const mentorLink = (token) => `${window.location.origin}/#mentor?t=${token}`

export default function AdminMentors({ readOnly = false }) {
  const [mentors, setMentors] = useState([])
  const [teams, setTeams] = useState([])
  const [links, setLinks] = useState([]) // linhas de mentor_teams: { mentor_id, team_id }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [createTeamIds, setCreateTeamIds] = useState([])
  const [creating, setCreating] = useState(false)
  const [generatedCode, setGeneratedCode] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
  const [copiedAll, setCopiedAll] = useState(false)

  async function fetchData() {
    if (!supabase) { setError('Supabase não configurado.'); setLoading(false); return }
    setError(null)
    const [{ data: ms, error: mErr }, { data: ts, error: tErr }, { data: ls, error: lErr }, { data: activeRegs, error: arErr }] = await Promise.all([
      supabase.from('mentors').select('id, email, name, access_token').order('created_at', { ascending: true }),
      supabase.from('teams').select('id, name').order('name', { ascending: true }),
      supabase.from('mentor_teams').select('mentor_id, team_id'),
      supabase.from('registrations').select('team_id').not('team_id', 'is', null).neq('payment_status', 'cancelled'),
    ])
    if (mErr) setError(mErr.message)
    else if (tErr) setError(tErr.message)
    else if (lErr) setError(lErr.message)
    else if (arErr) setError(arErr.message)
    else {
      // O trigger sync_registration_team_id cria uma linha em teams quando um
      // team_name aparece, mas NUNCA a remove quando a equipe esvazia (excluída,
      // renomeada ou último membro saiu) — sobram equipes-fantasma na tabela.
      // Só ofertamos para atribuição as equipes com ao menos 1 membro ativo.
      const activeTeamIds = new Set((activeRegs ?? []).map(r => r.team_id))
      setMentors(ms ?? [])
      setTeams((ts ?? []).filter(t => activeTeamIds.has(t.id)))
      setLinks(ls ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, []) // eslint-disable-line react-hooks/set-state-in-effect

  const teamName = (id) => teams.find(t => t.id === id)?.name || '—'
  const mentorLabel = (m) => m.name || m.email

  // team_id[] por mentor e mentor[] por equipe, derivados da junção. Ignora
  // links cujo mentor não está na lista (defensivo; o FK tem ON DELETE CASCADE).
  const teamIdsByMentor = new Map()
  const mentorsByTeam = new Map()
  links.forEach(({ mentor_id, team_id }) => {
    const m = mentors.find(x => x.id === mentor_id)
    if (!m) return
    const tids = teamIdsByMentor.get(mentor_id)
    if (tids) tids.push(team_id); else teamIdsByMentor.set(mentor_id, [team_id])
    const list = mentorsByTeam.get(team_id)
    if (list) list.push(m); else mentorsByTeam.set(team_id, [m])
  })

  const mentorTeams = (mentorId) =>
    (teamIdsByMentor.get(mentorId) || [])
      .map(tid => teams.find(t => t.id === tid))
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name))

  const unassignedTeams = (mentorId) => {
    const assigned = new Set(teamIdsByMentor.get(mentorId) || [])
    return teams.filter(t => !assigned.has(t.id))
  }

  // Resumo dos mentores de uma equipe (exclui opcionalmente um), p/ co-mentoria.
  const teamMentorsSummary = (teamIdValue, excludeId = null) => {
    const list = (mentorsByTeam.get(teamIdValue) || []).filter(m => m.id !== excludeId)
    if (!list.length) return ''
    const names = list.map(mentorLabel)
    const shown = names.slice(0, 3).join(', ')
    const extra = names.length > 3 ? ` e mais ${names.length - 3}` : ''
    const word = list.length === 1 ? 'mentor' : 'mentores'
    return `${list.length} ${word}: ${shown}${extra}`
  }

  async function createMentor(e) {
    e.preventDefault()
    if (!supabase || !email.trim()) return
    setCreating(true); setGeneratedCode(null); setError(null)
    const { data, error: err } = await supabase.rpc('admin_create_mentor', {
      p_email: email.trim(), p_name: name.trim(),
    })
    if (err) {
      setCreating(false)
      setError(err.message?.includes('email_already_exists') ? 'Já existe mentor com esse email.' : `Erro: ${err.message}`)
      return
    }
    // Atribui as equipes selecionadas como linhas em mentor_teams.
    let linkErr = null
    if (createTeamIds.length) {
      const rows = createTeamIds.map(tid => ({ mentor_id: data.id, team_id: tid }))
      const res = await supabase.from('mentor_teams').insert(rows)
      linkErr = res.error
    }
    setCreating(false)
    setGeneratedCode({ email: email.trim(), code: data.code })
    setEmail(''); setName(''); setCreateTeamIds([])
    await fetchData()
    // setError DEPOIS do fetchData (que zera o erro), senão a msg sumiria na hora.
    if (linkErr) setError(`Mentor criado, mas falhou ao vincular equipes: ${linkErr.message}`)
  }

  async function toggleTeam(mentorId, teamId, isAssigned) {
    if (!supabase) return
    const q = isAssigned
      ? supabase.from('mentor_teams').delete().eq('mentor_id', mentorId).eq('team_id', teamId)
      : supabase.from('mentor_teams').insert({ mentor_id: mentorId, team_id: teamId })
    const { error: err } = await q
    if (err) { alert(`Erro: ${err.message}`); return }
    await fetchData()
  }

  async function resetCode(id, mEmail) {
    if (!supabase || !window.confirm(`Gerar novo código para ${mEmail}?`)) return
    const { data, error: err } = await supabase.rpc('admin_reset_mentor_code', { p_mentor_id: id })
    if (err) { alert(`Erro: ${err.message}`); return }
    setGeneratedCode({ email: mEmail, code: data.code })
  }

  async function removeMentor(id, mEmail) {
    if (!supabase || !window.confirm(`Remover o mentor ${mEmail}?`)) return
    const { error: err } = await supabase.from('mentors').delete().eq('id', id)
    if (err) { alert(`Erro: ${err.message}`); return }
    await fetchData()
  }

  async function copyLink(m) {
    const link = mentorLink(m.access_token)
    try {
      await navigator.clipboard.writeText(link)
      setCopiedId(m.id)
      setTimeout(() => setCopiedId(null), 2500)
    } catch {
      window.prompt('Copie o link do mentor:', link)
    }
  }

  async function copyAllLinks() {
    if (!mentors.length) return
    const text = mentors.map(m => `${m.name || m.email}: ${mentorLink(m.access_token)}`).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopiedAll(true)
      setTimeout(() => setCopiedAll(false), 2500)
    } catch {
      window.prompt('Copie os links dos mentores:', text)
    }
  }

  if (loading) return <p className="text-white/60 font-mono">Carregando...</p>

  return (
    <div className="space-y-6">
      {error && <div className="bg-hot/10 border border-hot/30 rounded-lg px-4 py-2.5 text-hot text-sm">{error}</div>}

      {generatedCode && (
        <div className="bg-cyan/10 border border-cyan/30 rounded-xl px-4 py-3">
          <p className="text-sm text-white">
            Código de <strong>{generatedCode.email}</strong>:
            <span className="font-mono text-2xl text-cyan tracking-[0.3em] ml-3">{generatedCode.code}</span>
          </p>
          <p className="text-xs text-white/50 mt-1">
            Anote e repasse ao mentor — não será exibido de novo. O mentor entra em <span className="font-mono">/#mentor</span> com email + código.
          </p>
        </div>
      )}

      {!readOnly && (
        <form onSubmit={createMentor} className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
          <div className="grid sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-xs text-white/60 mb-1">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan/50" placeholder="mentor@email.com" />
            </div>
            <div>
              <label className="block text-xs text-white/60 mb-1">Nome</label>
              <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan/50" placeholder="Nome do mentor" />
            </div>
            <button type="submit" disabled={creating || !email.trim()} className="px-4 py-2 rounded-lg text-sm font-semibold bg-cyan/20 text-cyan border border-cyan/40 hover:bg-cyan/30 disabled:opacity-50 disabled:cursor-not-allowed">
              {creating ? 'Criando...' : 'Adicionar mentor'}
            </button>
          </div>
          <div>
            <label className="block text-xs text-white/60 mb-1">Equipes (opcional)</label>
            <div className="flex flex-wrap gap-2 items-center">
              {createTeamIds.map(tid => (
                <span key={tid} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-violet/15 text-violet border border-violet/30">
                  {teamName(tid)}
                  <button type="button" onClick={() => setCreateTeamIds(ids => ids.filter(x => x !== tid))} className="hover:text-white" aria-label={`Remover ${teamName(tid)}`}>×</button>
                </span>
              ))}
              <select
                value=""
                onChange={e => { const v = e.target.value; if (v) setCreateTeamIds(ids => ids.includes(v) ? ids : [...ids, v]) }}
                className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-cyan/50"
              >
                <option value="">＋ equipe</option>
                {teams.filter(t => !createTeamIds.includes(t.id)).map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>
        </form>
      )}

      {teams.some(t => (mentorsByTeam.get(t.id) || []).length > 1) && (
        <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
          <p className="text-xs text-white/60 uppercase tracking-wide mb-2">Equipes com co-mentoria</p>
          <ul className="space-y-1">
            {teams
              .filter(t => (mentorsByTeam.get(t.id) || []).length > 1)
              .map(t => (
                <li key={t.id} className="text-sm text-white/80">
                  <span className="text-white">{t.name}</span>
                  <span className="text-white/50"> — {teamMentorsSummary(t.id)}</span>
                </li>
              ))}
          </ul>
        </div>
      )}

      {!readOnly && mentors.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={copyAllLinks}
            className="text-xs px-3 py-1.5 rounded-lg bg-cyan/10 text-cyan border border-cyan/30 hover:bg-cyan/20"
          >
            {copiedAll ? '✓ links copiados' : 'copiar todos os links'}
          </button>
        </div>
      )}

      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-white/60 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Mentor</th>
              <th className="text-left px-4 py-2">Equipes</th>
              {!readOnly && <th className="text-right px-4 py-2">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {mentors.map(m => {
              const assigned = mentorTeams(m.id)
              const free = unassignedTeams(m.id)
              return (
                <tr key={m.id} className="border-t border-white/5 align-top">
                  <td className="px-4 py-2">
                    <div className="text-white">{m.name || '—'}</div>
                    <div className="text-white/50 text-xs">{m.email}</div>
                  </td>
                  <td className="px-4 py-2">
                    {readOnly ? (
                      assigned.length ? assigned.map(t => t.name).join(', ') : '—'
                    ) : (
                      <div className="flex flex-wrap gap-2 items-center">
                        {assigned.map(t => (
                          <span key={t.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-violet/15 text-violet border border-violet/30">
                            {t.name}
                            <button type="button" onClick={() => toggleTeam(m.id, t.id, true)} className="hover:text-white" title="Remover equipe" aria-label={`Remover ${t.name}`}>×</button>
                          </span>
                        ))}
                        {free.length > 0 && (
                          <select
                            value=""
                            onChange={e => { if (e.target.value) toggleTeam(m.id, e.target.value, false) }}
                            className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-cyan/50"
                          >
                            <option value="">＋ equipe</option>
                            {free.map(t => {
                              const summary = teamMentorsSummary(t.id, m.id)
                              return (
                                <option key={t.id} value={t.id}>
                                  {t.name}{summary ? ` — já tem ${summary}` : ''}
                                </option>
                              )
                            })}
                          </select>
                        )}
                        {!assigned.length && free.length === 0 && <span className="text-white/40 text-xs">sem equipes</span>}
                      </div>
                    )}
                  </td>
                  {!readOnly && (
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button onClick={() => copyLink(m)} className="text-xs text-cyan hover:underline mr-3">{copiedId === m.id ? '✓ copiado' : 'copiar link'}</button>
                      <button onClick={() => resetCode(m.id, m.email)} className="text-xs text-electric hover:underline mr-3">novo código</button>
                      <button onClick={() => removeMentor(m.id, m.email)} className="text-xs text-hot hover:underline">remover</button>
                    </td>
                  )}
                </tr>
              )
            })}
            {!mentors.length && (
              <tr><td colSpan={readOnly ? 2 : 3} className="px-4 py-6 text-center text-white/40">Nenhum mentor cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
