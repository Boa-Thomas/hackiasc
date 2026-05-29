import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Link de acesso direto do mentor (sem login). Espelha a rota lida em
// useMentorAuth (#mentor?t=<access_token>, modo link).
const mentorLink = (token) => `${window.location.origin}/#mentor?t=${token}`

export default function AdminMentors({ readOnly = false }) {
  const [mentors, setMentors] = useState([])
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [teamId, setTeamId] = useState('')
  const [creating, setCreating] = useState(false)
  const [generatedCode, setGeneratedCode] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
  const [copiedAll, setCopiedAll] = useState(false)

  async function fetchData() {
    if (!supabase) { setError('Supabase não configurado.'); setLoading(false); return }
    setError(null)
    const [{ data: ms, error: mErr }, { data: ts, error: tErr }] = await Promise.all([
      supabase.from('mentors').select('id, email, name, team_id, access_token').order('created_at', { ascending: true }),
      supabase.from('teams').select('id, name').order('name', { ascending: true }),
    ])
    if (mErr) setError(mErr.message)
    else if (tErr) setError(tErr.message)
    else { setMentors(ms ?? []); setTeams(ts ?? []) }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, []) // eslint-disable-line react-hooks/set-state-in-effect

  const teamName = (id) => teams.find(t => t.id === id)?.name || '—'

  // Map of team_id → list of mentors. Multiple mentors per team is normal:
  // several mentors can share the same team_id.
  const mentorsByTeam = new Map()
  mentors.forEach(m => {
    if (!m.team_id) return
    const list = mentorsByTeam.get(m.team_id)
    if (list) list.push(m)
    else mentorsByTeam.set(m.team_id, [m])
  })

  const mentorLabel = (m) => m.name || m.email

  // Informative summary of mentors already paired to a team, e.g.
  // "2 mentores: Fulano, Beltrano". Optionally excludes a mentor (the one
  // being reassigned) so the dropdown describes the *other* mentors.
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
      p_email: email.trim(), p_name: name.trim(), p_team_id: teamId || null,
    })
    setCreating(false)
    if (err) {
      setError(err.message?.includes('email_already_exists') ? 'Já existe mentor com esse email.' : `Erro: ${err.message}`)
      return
    }
    setGeneratedCode({ email: email.trim(), code: data.code })
    setEmail(''); setName(''); setTeamId('')
    await fetchData()
  }

  async function reassign(id, newTeamId) {
    if (!supabase) return
    const { error: err } = await supabase.from('mentors').update({ team_id: newTeamId || null }).eq('id', id)
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
        <form onSubmit={createMentor} className="bg-white/5 border border-white/10 rounded-xl p-4 grid sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs text-white/60 mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan/50" placeholder="mentor@email.com" />
          </div>
          <div>
            <label className="block text-xs text-white/60 mb-1">Nome</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan/50" placeholder="Nome do mentor" />
          </div>
          <div>
            <label className="block text-xs text-white/60 mb-1">Equipe</label>
            <select value={teamId} onChange={e => setTeamId(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan/50">
              <option value="">Sem equipe</option>
              {teams.map(t => {
                const summary = teamMentorsSummary(t.id)
                return (
                  <option key={t.id} value={t.id}>
                    {t.name}{summary ? ` — ${summary}` : ''}
                  </option>
                )
              })}
            </select>
          </div>
          <button type="submit" disabled={creating || !email.trim()} className="px-4 py-2 rounded-lg text-sm font-semibold bg-cyan/20 text-cyan border border-cyan/40 hover:bg-cyan/30 disabled:opacity-50 disabled:cursor-not-allowed">
            {creating ? 'Criando...' : 'Adicionar mentor'}
          </button>
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
            {copiedAll ? 'â links copiados' : 'copiar todos os links'}
          </button>
        </div>
      )}


      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-white/60 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Mentor</th>
              <th className="text-left px-4 py-2">Equipe</th>
              {!readOnly && <th className="text-right px-4 py-2">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {mentors.map(m => (
              <tr key={m.id} className="border-t border-white/5">
                <td className="px-4 py-2">
                  <div className="text-white">{m.name || '—'}</div>
                  <div className="text-white/50 text-xs">{m.email}</div>
                </td>
                <td className="px-4 py-2">
                  {readOnly ? teamName(m.team_id) : (
                    <select
                      value={m.team_id || ''}
                      onChange={e => reassign(m.id, e.target.value)}
                      className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-cyan/50"
                    >
                      <option value="">Sem equipe</option>
                      {teams.map(t => {
                        // Informative count of *other* mentors already on the team
                        // (excludes this mentor). Pairing a 2nd/3rd mentor is normal.
                        const summary = teamMentorsSummary(t.id, m.id)
                        return (
                          <option key={t.id} value={t.id}>
                            {t.name}{summary ? ` — já tem ${summary}` : ''}
                          </option>
                        )
                      })}
                    </select>
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
            ))}
            {!mentors.length && (
              <tr><td colSpan={readOnly ? 2 : 3} className="px-4 py-6 text-center text-white/40">Nenhum mentor cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
