import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function jurorLink(token) {
  return `${window.location.origin}/#jurado?t=${token}`
}

export default function AdminJurors() {
  const [jurors, setJurors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [creating, setCreating] = useState(false)
  const [copiedId, setCopiedId] = useState(null)
  const [copiedAll, setCopiedAll] = useState(false)

  async function fetchData() {
    if (!supabase) { setError('Supabase não configurado.'); setLoading(false); return }
    setError(null)
    const { data, error: err } = await supabase.rpc('admin_list_jurors')
    if (err) setError(err.message)
    else setJurors(data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, []) // eslint-disable-line react-hooks/set-state-in-effect

  async function createJuror(e) {
    e.preventDefault()
    if (!supabase || !name.trim()) return
    setCreating(true); setError(null)
    const { error: err } = await supabase.from('jurors').insert({
      name: name.trim(),
      email: email.trim() || null,
    })
    setCreating(false)
    if (err) { setError(`Erro: ${err.message}`); return }
    setName(''); setEmail('')
    await fetchData()
  }

  async function toggleActive(j) {
    if (!supabase) return
    const { error: err } = await supabase.from('jurors').update({ active: !j.active }).eq('id', j.id)
    if (err) { alert(`Erro: ${err.message}`); return }
    await fetchData()
  }

  async function removeJuror(j) {
    if (!supabase || !window.confirm(`Remover o jurado ${j.name}? As notas dele serão apagadas.`)) return
    const { error: err } = await supabase.from('jurors').delete().eq('id', j.id)
    if (err) { alert(`Erro: ${err.message}`); return }
    await fetchData()
  }

  async function copyLink(j) {
    const link = jurorLink(j.access_token)
    try {
      await navigator.clipboard.writeText(link)
      setCopiedId(j.id)
      setTimeout(() => setCopiedId(null), 2500)
    } catch {
      window.prompt('Copie o link do jurado:', link)
    }
  }

  async function copyAllLinks() {
    const active = jurors.filter(j => j.active)
    if (!active.length) return
    const text = active.map(j => `${j.name}: ${jurorLink(j.access_token)}`).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopiedAll(true)
      setTimeout(() => setCopiedAll(false), 2500)
    } catch {
      window.prompt('Copie os links dos jurados:', text)
    }
  }


  if (loading) return <p className="text-white/60 font-mono">Carregando...</p>

  return (
    <div className="space-y-6">
      {error && <div className="bg-hot/10 border border-hot/30 rounded-lg px-4 py-2.5 text-hot text-sm">{error}</div>}

      <div className="bg-cyan/5 border border-cyan/20 rounded-xl px-4 py-3">
        <p className="text-xs text-white/60">
          Cada jurado recebe um <strong>link secreto</strong> único (token na URL). O jurado acessa sem login,
          avalia as equipes pela rubrica do edital e pode editar enquanto a votação estiver aberta.
          Desative um jurado para invalidar o link dele.
        </p>
      </div>

      <form onSubmit={createJuror} className="bg-white/5 border border-white/10 rounded-xl p-4 grid sm:grid-cols-3 gap-3 items-end">
        <div>
          <label className="block text-xs text-white/60 mb-1">Nome</label>
          <input value={name} onChange={e => setName(e.target.value)} required className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan/50" placeholder="Nome do jurado" />
        </div>
        <div>
          <label className="block text-xs text-white/60 mb-1">Email (opcional)</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan/50" placeholder="jurado@email.com" />
        </div>
        <button type="submit" disabled={creating || !name.trim()} className="px-4 py-2 rounded-lg text-sm font-semibold bg-cyan/20 text-cyan border border-cyan/40 hover:bg-cyan/30 disabled:opacity-50 disabled:cursor-not-allowed">
          {creating ? 'Criando...' : 'Adicionar jurado'}
        </button>
      </form>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={copyAllLinks}
          disabled={!jurors.some(j => j.active)}
          className="text-xs px-3 py-1.5 rounded-lg bg-cyan/10 text-cyan border border-cyan/30 hover:bg-cyan/20 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {copiedAll ? 'â links copiados' : 'copiar todos os links'}
        </button>
      </div>


      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-white/60 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Jurado</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-right px-4 py-2">Avaliadas</th>
              <th className="text-right px-4 py-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {jurors.map(j => (
              <tr key={j.id} className="border-t border-white/5">
                <td className="px-4 py-2">
                  <div className="text-white">{j.name}</div>
                  <div className="text-white/50 text-xs">{j.email || '—'}</div>
                </td>
                <td className="px-4 py-2">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs border ${j.active ? 'bg-cyan/10 text-cyan border-cyan/30' : 'bg-white/5 text-white/40 border-white/10'}`}>
                    {j.active ? 'ativo' : 'inativo'}
                  </span>
                </td>
                <td className="px-4 py-2 text-right text-white/70 font-mono">{j.evaluated_count}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <button onClick={() => copyLink(j)} className="text-xs text-cyan hover:underline mr-3">
                    {copiedId === j.id ? '✓ copiado' : 'copiar link'}
                  </button>
                  <button onClick={() => toggleActive(j)} className="text-xs text-electric hover:underline mr-3">
                    {j.active ? 'desativar' : 'ativar'}
                  </button>
                  <button onClick={() => removeJuror(j)} className="text-xs text-hot hover:underline">remover</button>
                </td>
              </tr>
            ))}
            {!jurors.length && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-white/40">Nenhum jurado cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
