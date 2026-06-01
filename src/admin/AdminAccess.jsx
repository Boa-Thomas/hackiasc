import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Phase 1 offers only the jwt-exchange roles whose panel + RLS already accept the
// session: staff, checkin, viewer. facilitator/mentor/juror/admin need panel+RLS
// wiring (Phase 2) before a link can actually work, so they are not offered here yet.
const ROLES = ['staff', 'checkin', 'viewer']

function accessLink(token) {
  const base = window.location.origin + window.location.pathname
  return `${base}#acesso?t=${token}`
}

export default function AdminAccess() {
  const [grants, setGrants] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ label: '', role: 'staff', expires_at: '' })
  const [newLink, setNewLink] = useState(null)
  const [error, setError] = useState(null)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.rpc('admin_list_grants')
    if (error) setError(error.message)
    else setGrants(Array.isArray(data) ? data : [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function create(e) {
    e.preventDefault()
    setError(null); setNewLink(null)
    const { data, error } = await supabase.rpc('admin_create_grant', {
      p_label: form.label.trim(),
      p_role: form.role,
      p_scope: {},
      p_expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      p_email: null,
    })
    if (error) { setError(error.message); return }
    setNewLink(accessLink(data.token))
    setForm({ label: '', role: form.role, expires_at: '' })
    load()
  }

  async function revoke(id) {
    const { error } = await supabase.rpc('admin_revoke_grant', { p_grant_id: id })
    if (error) setError(error.message); else load()
  }

  async function regenerate(id) {
    const { data, error } = await supabase.rpc('admin_regenerate_grant_token', { p_grant_id: id })
    if (error) { setError(error.message); return }
    setNewLink(accessLink(data.token)); load()
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="card-glass p-4 space-y-3">
        <h3 className="font-display text-lg">Criar acesso</h3>
        <div className="flex flex-wrap gap-3">
          <input required value={form.label} onChange={e => setForm({ ...form, label: e.target.value })}
            placeholder="Nome (ex: FULANO)" className="bg-dark/50 border border-white/10 rounded px-3 py-2" />
          <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
            className="bg-dark/50 border border-white/10 rounded px-3 py-2">
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <input type="datetime-local" value={form.expires_at}
            onChange={e => setForm({ ...form, expires_at: e.target.value })}
            className="bg-dark/50 border border-white/10 rounded px-3 py-2" />
          <button className="glow-cyan rounded px-4 py-2 font-mono">Gerar link</button>
        </div>
        {newLink && (
          <div className="text-sm font-mono break-all bg-cyan/10 border border-cyan/30 rounded p-2">
            {newLink}
            <button type="button" onClick={() => navigator.clipboard?.writeText(newLink)}
              className="ml-2 text-electric underline">copiar</button>
            <p className="text-gold mt-1">Copie agora — o token não será mostrado de novo.</p>
          </div>
        )}
        {error && <p className="text-hot text-sm">{error}</p>}
      </form>

      <div className="card-glass p-4">
        <h3 className="font-display text-lg mb-3">Acessos</h3>
        {loading ? <p className="text-white/50">Carregando…</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-white/50 text-left">
              <th className="py-1">Nome</th><th>Papel</th><th>Expira</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              {grants.map(g => (
                <tr key={g.id} className="border-t border-white/5">
                  <td className="py-2">{g.label}</td>
                  <td>{g.role}</td>
                  <td>{g.expires_at ? new Date(g.expires_at).toLocaleString('pt-BR') : '—'}</td>
                  <td className={g.active ? 'text-cyan' : 'text-hot'}>{g.active ? 'ativo' : 'inativo'}</td>
                  <td className="text-right space-x-2">
                    <button onClick={() => regenerate(g.id)} className="text-electric underline">novo link</button>
                    {g.active && <button onClick={() => revoke(g.id)} className="text-hot underline">revogar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
