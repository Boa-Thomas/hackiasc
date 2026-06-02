import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usesEdgeRevoke } from '../lib/grantRouting'
import { buildScope } from './accountScope'

// Link grants (magic-link personas).
const LINK_ROLES = ['facilitator', 'staff', 'mentor', 'juror', 'checkin', 'viewer']
// Password accounts (persistent login).
const PASSWORD_ROLES = ['admin', 'viewer', 'checkin', 'staff']

function accessLink(token) {
  const base = window.location.origin + window.location.pathname
  return `${base}#acesso?t=${token}`
}
function grantKind(authKind) {
  if (authKind === 'password') return 'senha'
  if (authKind === 'rpc_token') return 'token'
  return 'link'
}

export default function AdminAccess() {
  const [grants, setGrants] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ label: '', role: 'facilitator', expires_at: '' })
  const [acct, setAcct] = useState({ label: '', role: 'viewer', email: '', readOnly: false, allowedTabs: '' })
  // Show-once secret: a link token OR a password.
  const [secret, setSecret] = useState(null) // { kind: 'link'|'password', value: string }
  const [error, setError] = useState(null)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.rpc('admin_list_grants')
    if (error) setError(error.message)
    else setGrants(Array.isArray(data) ? data : [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // Call an admin-gated edge function with the current admin bearer token.
  async function callEdge(fnName, payload) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) { setError('Sessão admin expirada — refaça login.'); return null }
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fnName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(`Falha: ${data?.error ?? res.status}`); return null }
      return data
    } catch {
      setError('Falha de rede.')
      return null
    }
  }

  async function create(e) {
    e.preventDefault()
    setError(null); setSecret(null)
    const { data, error } = await supabase.rpc('admin_create_grant', {
      p_label: form.label.trim(),
      p_role: form.role,
      p_scope: {},
      p_expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      p_email: null,
    })
    if (error) { setError(error.message); return }
    setSecret({ kind: 'link', value: accessLink(data.token) })
    setForm({ label: '', role: form.role, expires_at: '' })
    load()
  }

  async function createAccount(e) {
    e.preventDefault()
    setError(null); setSecret(null)
    const scope = buildScope({
      readOnly: acct.readOnly,
      allowedTabs: acct.allowedTabs.split(',').map((t) => t.trim()).filter(Boolean),
    })
    const data = await callEdge('access-account', {
      action: 'create', role: acct.role, label: acct.label.trim(), email: acct.email.trim(), scope,
    })
    if (!data) return
    setSecret({ kind: 'password', value: `${data.email} · ${data.password}` })
    setAcct({ label: '', role: acct.role, email: '', readOnly: false, allowedTabs: '' })
    load()
  }

  async function resetPassword(g) {
    setError(null); setSecret(null)
    const data = await callEdge('access-account', { action: 'reset_password', grant_id: g.id })
    if (!data) return
    setSecret({ kind: 'password', value: `${g.email} · ${data.password}` })
  }

  async function revoke(g) {
    setError(null); setSecret(null)
    if (usesEdgeRevoke(g.auth_kind)) {
      const data = await callEdge('access-admin', { grant_id: g.id })
      if (data) load()
    } else {
      const { error } = await supabase.rpc('admin_revoke_grant', { p_grant_id: g.id })
      if (error) setError(error.message); else load()
    }
  }

  async function regenerate(id) {
    setError(null); setSecret(null)
    const { data, error } = await supabase.rpc('admin_regenerate_grant_token', { p_grant_id: id })
    if (error) { setError(error.message); return }
    setSecret({ kind: 'link', value: accessLink(data.token) }); load()
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="card-glass p-4 space-y-3">
        <h3 className="font-display text-lg">Criar acesso por link</h3>
        <div className="flex flex-wrap gap-3">
          <input required value={form.label} onChange={e => setForm({ ...form, label: e.target.value })}
            placeholder="Nome (ex: FULANO)" className="bg-dark/50 border border-white/10 rounded px-3 py-2" />
          <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
            className="bg-dark/50 border border-white/10 rounded px-3 py-2">
            {LINK_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <input type="datetime-local" value={form.expires_at}
            onChange={e => setForm({ ...form, expires_at: e.target.value })}
            className="bg-dark/50 border border-white/10 rounded px-3 py-2" />
          <button className="glow-cyan rounded px-4 py-2 font-mono">Gerar link</button>
        </div>
      </form>

      <form onSubmit={createAccount} className="card-glass p-4 space-y-3">
        <h3 className="font-display text-lg">Criar conta (login por senha)</h3>
        <div className="flex flex-wrap gap-3">
          <input required value={acct.label} onChange={e => setAcct({ ...acct, label: e.target.value })}
            placeholder="Nome (ex: FULANO)" className="bg-dark/50 border border-white/10 rounded px-3 py-2" />
          <select value={acct.role} onChange={e => setAcct({ ...acct, role: e.target.value })}
            className="bg-dark/50 border border-white/10 rounded px-3 py-2">
            {PASSWORD_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <input required type="email" value={acct.email} autoComplete="off"
            onChange={e => setAcct({ ...acct, email: e.target.value })}
            placeholder="email@exemplo.com" className="bg-dark/50 border border-white/10 rounded px-3 py-2" />
          <button className="glow-cyan rounded px-4 py-2 font-mono">Criar conta</button>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm text-white/70">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={acct.readOnly}
              onChange={e => setAcct({ ...acct, readOnly: e.target.checked })} />
            somente leitura
          </label>
          <input value={acct.allowedTabs} onChange={e => setAcct({ ...acct, allowedTabs: e.target.value })}
            placeholder="abas (ex: results, payments)"
            className="bg-dark/50 border border-white/10 rounded px-3 py-2 flex-1 min-w-[12rem]" />
          <span className="text-white/30 font-mono text-xs">scope é armazenado; aplicado na SP3</span>
        </div>
      </form>

      {secret && (
        <div className="text-sm font-mono break-all bg-cyan/10 border border-cyan/30 rounded p-2">
          {secret.value}
          <button type="button" onClick={() => navigator.clipboard?.writeText(secret.value)}
            className="ml-2 text-electric underline">copiar</button>
          <p className="text-gold mt-1">
            {secret.kind === 'password'
              ? 'Copie a senha agora — ela não será mostrada de novo.'
              : 'Copie o link agora — o token não será mostrado de novo.'}
          </p>
        </div>
      )}
      {error && <p className="text-hot text-sm">{error}</p>}

      <div className="card-glass p-4">
        <h3 className="font-display text-lg mb-3">Acessos</h3>
        {loading ? <p className="text-white/50">Carregando…</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-white/50 text-left">
              <th className="py-1">Nome</th><th>Papel</th><th>Tipo</th><th>Expira</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              {grants.map(g => (
                <tr key={g.id} className="border-t border-white/5">
                  <td className="py-2">{g.label}</td>
                  <td>{g.role}</td>
                  <td className="text-white/60">{grantKind(g.auth_kind)}</td>
                  <td>{g.expires_at ? new Date(g.expires_at).toLocaleString('pt-BR') : '—'}</td>
                  <td className={g.active ? 'text-cyan' : 'text-hot'}>{g.active ? 'ativo' : 'inativo'}</td>
                  <td className="text-right space-x-2">
                    {g.auth_kind === 'password'
                      ? (g.active && <button onClick={() => resetPassword(g)} className="text-electric underline">resetar senha</button>)
                      : <button onClick={() => regenerate(g.id)} className="text-electric underline">novo link</button>}
                    {g.active && <button onClick={() => revoke(g)} className="text-hot underline">revogar</button>}
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
