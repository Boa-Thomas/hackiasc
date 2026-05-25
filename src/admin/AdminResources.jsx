import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { relativeTime } from '../lib/relativeTime'

function formatSize(bytes) {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Extrai extensão segura do nome original (sem caracteres problemáticos no path).
function safeExtension(name) {
  const dot = name.lastIndexOf('.')
  if (dot === -1) return ''
  const ext = name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '')
  return ext ? `.${ext}` : ''
}

export default function AdminResources() {
  const [resources, setResources] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  async function fetchData() {
    if (!supabase) { setError('Supabase não configurado.'); setLoading(false); return }
    setError(null)
    const { data, error: err } = await supabase
      .from('resources')
      .select('id, title, description, file_path, file_name, content_type, size_bytes, created_at')
      .order('created_at', { ascending: false })
    if (err) { setError(err.message); setLoading(false); return }
    setResources(data ?? [])
    setLoading(false)
  }
  useEffect(() => { fetchData() }, [])

  async function handleUpload(e) {
    e.preventDefault()
    setError(null)
    if (!supabase) { setError('Supabase não configurado.'); return }
    if (!title.trim()) { setError('Informe um título.'); return }
    if (!file) { setError('Selecione um arquivo.'); return }

    setUploading(true)
    try {
      const path = `resources/${crypto.randomUUID()}${safeExtension(file.name)}`
      const { error: upErr } = await supabase.storage.from('files').upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      })
      if (upErr) throw new Error(`Falha no upload: ${upErr.message}`)

      const { data: { user } = {} } = await supabase.auth.getUser()
      const { error: insErr } = await supabase.from('resources').insert({
        title: title.trim(),
        description: description.trim() || null,
        file_path: path,
        file_name: file.name,
        content_type: file.type || null,
        size_bytes: file.size ?? null,
        created_by: user?.id ?? null,
      })
      if (insErr) {
        // Rollback do objeto órfão se o insert falhar.
        await supabase.storage.from('files').remove([path])
        throw new Error(`Falha ao registrar recurso: ${insErr.message}`)
      }

      setTitle(''); setDescription(''); setFile(null)
      e.target.reset() // limpa o input de arquivo antes de re-renderizar a lista
      await fetchData()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(resource) {
    if (!supabase) return
    if (!confirm(`Remover "${resource.title}"? Esta ação é permanente.`)) return
    setDeletingId(resource.id)
    setError(null)
    try {
      const { error: stErr } = await supabase.storage.from('files').remove([resource.file_path])
      if (stErr) throw new Error(`Falha ao remover arquivo: ${stErr.message}`)
      const { error: delErr } = await supabase.from('resources').delete().eq('id', resource.id)
      if (delErr) throw new Error(`Falha ao remover registro: ${delErr.message}`)
      await fetchData()
    } catch (err) {
      setError(err.message)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-mono text-cyan uppercase tracking-wider">Recursos</p>
        <h1 className="text-2xl font-bold text-white mt-1">Materiais para participantes</h1>
        <p className="text-sm text-white/60 mt-1">
          Disponível apenas para participantes com pagamento confirmado. Os arquivos ficam em armazenamento privado.
        </p>
      </div>

      {error && <div className="bg-hot/10 border border-hot/30 rounded-lg px-4 py-2.5 text-hot text-sm">{error}</div>}

      <form onSubmit={handleUpload} className="card-glass rounded-2xl p-6 space-y-4">
        <p className="text-xs font-mono text-electric uppercase tracking-wider">Novo material</p>
        <div>
          <label className="text-xs text-white/60">Título</label>
          <input
            type="text" value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Ex: Template de pitch deck"
            className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan/50"
          />
        </div>
        <div>
          <label className="text-xs text-white/60">Descrição (opcional)</label>
          <textarea
            value={description} onChange={e => setDescription(e.target.value)} rows={2}
            placeholder="Breve descrição do material"
            className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan/50"
          />
        </div>
        <div>
          <label className="text-xs text-white/60">Arquivo</label>
          <input
            type="file" onChange={e => setFile(e.target.files?.[0] ?? null)}
            className="w-full mt-1 text-sm text-white/70 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-cyan/20 file:text-cyan file:text-sm file:font-semibold hover:file:bg-cyan/30"
          />
        </div>
        <button
          type="submit" disabled={uploading}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-cyan/20 text-cyan border border-cyan/40 hover:bg-cyan/30 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {uploading ? 'Enviando...' : 'Adicionar material'}
        </button>
      </form>

      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-white/60 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Título</th>
              <th className="text-left px-4 py-2">Arquivo</th>
              <th className="text-right px-4 py-2">Tamanho</th>
              <th className="text-left px-4 py-2">Enviado</th>
              <th className="text-right px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="px-4 py-6 text-center text-white/40 font-mono">Carregando...</td></tr>}
            {!loading && resources.map(r => (
              <tr key={r.id} className="border-t border-white/5 hover:bg-white/5">
                <td className="px-4 py-2">
                  <p className="text-white font-medium">{r.title}</p>
                  {r.description && <p className="text-xs text-white/50 mt-0.5">{r.description}</p>}
                </td>
                <td className="px-4 py-2 text-white/70 text-xs">{r.file_name || '—'}</td>
                <td className="px-4 py-2 text-right text-white/70">{formatSize(r.size_bytes)}</td>
                <td className="px-4 py-2 text-white/50 text-xs">{r.created_at ? relativeTime(r.created_at) : '—'}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => handleDelete(r)} disabled={deletingId === r.id}
                    className="text-xs text-hot hover:underline disabled:opacity-40"
                  >
                    {deletingId === r.id ? 'Removendo...' : 'Remover'}
                  </button>
                </td>
              </tr>
            ))}
            {!loading && !resources.length && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-white/40">Nenhum material ainda.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
