import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

const MAX_BYTES = 52428800 // 50MB

// Resolve the team-slides edge function URL from the configured Supabase URL.
function edgeUrl() {
  const base = import.meta.env.VITE_SUPABASE_URL
  if (!base) return null
  return `${base.replace(/\/$/, '')}/functions/v1/team-slides`
}

// Slides do pitch (entrega final): upload de PDF (máx 50MB) para o bucket
// privado `files` (prefixo deliverables/<team_id>/). Persiste slides_path e
// slides_name em final_deliverables via `onPersist` (que chama a RPC
// participant_save_team_deliverable através do formulário pai).
//
// Compat: equipes antigas podem ter slides_url (URL). Mostramos o link antigo
// quando não há slides_path, sem quebrar.
export default function SlidesUpload({ token, deliverables, onPersist }) {
  const data = deliverables || {}
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const fileRef = useRef(null)

  const hasUpload = !!data.slides_path
  const legacyUrl = data.slides_url

  async function callEdge(action, file_name) {
    const url = edgeUrl()
    if (!url) throw new Error('unavailable')
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      body: JSON.stringify({ token, action, file_name }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      const e = new Error(body?.error || `http_${res.status}`)
      e.code = body?.error
      throw e
    }
    return body
  }

  async function handleFile(file) {
    setError(null)
    if (!file) return
    if (!/\.pdf$/i.test(file.name)) {
      setError('Envie um arquivo PDF.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('Arquivo muito grande. Máximo 50MB.')
      return
    }
    if (!supabase) {
      setError('Sistema indisponível. Tente novamente mais tarde.')
      return
    }
    setBusy(true)
    try {
      // 1. Pede a signed upload URL à edge function (valida token + acha team_id).
      const { path, token: uploadToken } = await callEdge('upload-url', file.name)
      // 2. Faz o upload diretamente para o storage com o token assinado.
      const { error: upErr } = await supabase.storage
        .from('files')
        .uploadToSignedUrl(path, uploadToken, file, { contentType: 'application/pdf' })
      if (upErr) throw upErr
      // 3. Persiste o caminho + nome nas entregas finais (RPC via formulário pai).
      await onPersist({ slides_path: path, slides_name: file.name })
    } catch (e) {
      if (e?.code === 'no_team') setError('Você precisa estar em uma equipe para enviar os slides.')
      else if (e?.code === 'invalid_file_type') setError('Envie um arquivo PDF.')
      else setError('Falha ao enviar. Tente novamente.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleDownload() {
    setError(null)
    setBusy(true)
    try {
      const { url } = await callEdge('download-url')
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      setError('Não foi possível gerar o link de download.')
    } finally {
      setBusy(false)
    }
  }

  const pickFile = () => fileRef.current?.click()

  return (
    <div className="space-y-3">
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={e => handleFile(e.target.files?.[0])}
        disabled={busy}
      />

      {hasUpload ? (
        <div className="flex items-center gap-3 flex-wrap rounded-xl border border-cyan/30 bg-cyan/5 px-4 py-3">
          <span className="text-sm text-white">
            Slides enviado: <span className="font-semibold">{data.slides_name || 'slides.pdf'}</span>
          </span>
          <div className="flex gap-2 ml-auto">
            <button type="button" onClick={handleDownload} disabled={busy}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-electric/20 text-electric border border-electric/40 hover:bg-electric/30 disabled:opacity-50">
              {busy ? '...' : 'Baixar'}
            </button>
            <button type="button" onClick={pickFile} disabled={busy}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-dark-border text-text-muted hover:text-white disabled:opacity-50">
              Substituir
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {legacyUrl && (
            <p className="text-xs text-text-muted">
              Link antigo:{' '}
              <a href={legacyUrl} target="_blank" rel="noopener noreferrer" className="text-electric hover:underline break-all">{legacyUrl}</a>
              {' '}· envie o PDF abaixo para substituir.
            </p>
          )}
          <button type="button" onClick={pickFile} disabled={busy}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-cyan/20 text-cyan border border-cyan/40 hover:bg-cyan/30 disabled:opacity-50 disabled:cursor-not-allowed">
            {busy ? 'Enviando...' : 'Enviar PDF (até 50MB)'}
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl px-4 py-2.5 text-sm border bg-hot/10 border-hot/30 text-hot">{error}</div>
      )}
    </div>
  )
}
