import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function formatSize(bytes) {
  if (bytes == null) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ResourcesSection({ auth }) {
  const [resources, setResources] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [downloadingId, setDownloadingId] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      if (!supabase) { setError('Sistema indisponível.'); setLoading(false); return }
      const { data, error: rpcError } = await supabase.rpc('participant_list_resources', { p_token: auth.token })
      if (!active) return
      if (rpcError) { setError('Não foi possível carregar os materiais.'); setLoading(false); return }
      setResources(data ?? [])
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [auth.token])

  async function handleDownload(resource) {
    setError(null)
    setDownloadingId(resource.id)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('resource-download', {
        body: { token: auth.token, resource_id: resource.id },
      })
      if (fnError || !data?.url) throw new Error('download_failed')
      window.open(data.url, '_blank', 'noopener,noreferrer')
    } catch {
      setError('Não foi possível gerar o link de download. Tente novamente.')
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="card-glass rounded-2xl p-6">
        <p className="text-xs font-mono text-cyan uppercase tracking-wider">Recursos</p>
        <h2 className="text-xl font-bold text-white mt-1">Materiais do evento</h2>
        <p className="text-sm text-text-muted mt-1">
          Templates, slides e materiais de apoio disponibilizados pela organização.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-hot/30 bg-hot/5 px-4 py-3 text-sm text-hot">{error}</div>
      )}

      {loading ? (
        <div className="card-glass rounded-2xl p-6">
          <p className="text-sm text-text-muted font-mono">Carregando...</p>
        </div>
      ) : !resources.length ? (
        <div className="card-glass rounded-2xl p-6">
          <p className="text-sm text-text-muted">Nenhum material disponível ainda. Volte mais tarde.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {resources.map(r => {
            const size = formatSize(r.size_bytes)
            return (
              <div key={r.id} className="card-glass rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">{r.title}</p>
                  {r.description && <p className="text-xs text-text-muted mt-1">{r.description}</p>}
                  <p className="text-xs text-text-muted mt-1 font-mono">
                    {r.file_name || 'arquivo'}{size ? ` · ${size}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => handleDownload(r)}
                  disabled={downloadingId === r.id}
                  className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-cyan/10 text-cyan border border-cyan/30 hover:bg-cyan/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  {downloadingId === r.id ? 'Gerando...' : 'Baixar'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
