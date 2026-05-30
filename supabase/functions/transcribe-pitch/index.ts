import { createClient } from 'npm:@supabase/supabase-js@2'

// Edge function: transcreve o audio do pitch de uma equipe com o Whisper self-hosted
// (FastAPI) e grava a transcricao em teams. Admin-only (mesma checagem do refund-payment).
//
//   admin (JWT) -> valida role 'admin' -> acha deliverables/<team_id>/pitch.* no bucket
//   privado `files` -> GET {WHISPER_URL}/health -> POST /transcribe (multipart) ->
//   grava teams.pitch_transcript / pitch_segments / pitch_transcribed_at (service role).
//
// Edital cl. 5.3. Processado APOS o evento — a caixa Whisper precisa estar online.
// Segredo necessario: WHISPER_URL (ex.: https://thomas-2024-2.koi-tetra.ts.net).

const ALLOWED_ORIGINS = ['https://hackiasc.com', 'https://www.hackiasc.com', 'http://localhost:5173']

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401)

  const whisperBase = (Deno.env.get('WHISPER_URL') || '').replace(/\/$/, '')
  if (!whisperBase) return json({ error: 'whisper_not_configured' }, 500)

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 1. Autoriza admin (app_metadata.role nao e auto-editavel pelo usuario).
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) return json({ error: 'unauthorized' }, 401)
    if (user.app_metadata?.role !== 'admin') return json({ error: 'forbidden' }, 403)

    // 2. Input.
    const { team_id } = await req.json().catch(() => ({}))
    if (!team_id) return json({ error: 'team_id_required' }, 400)

    // 3. Acha o objeto de audio deliverables/<team_id>/pitch.*
    const prefix = `deliverables/${team_id}`
    const { data: list, error: listErr } = await supabase.storage.from('files').list(prefix)
    if (listErr) {
      console.error('list error:', listErr)
      return json({ error: 'storage_error' }, 500)
    }
    const audio = (list || []).find(o => /^pitch\./i.test(o.name))
    if (!audio) return json({ error: 'no_audio' }, 404)
    const audioPath = `${prefix}/${audio.name}`

    // 4. Health-check do Whisper (a caixa pode estar offline).
    try {
      const h = await fetch(`${whisperBase}/health`, { method: 'GET' })
      if (!h.ok) throw new Error(`health ${h.status}`)
    } catch (e) {
      console.error('whisper health failed:', e)
      return json({ error: 'whisper_offline' }, 503)
    }

    // 5. Baixa o audio e envia ao Whisper.
    const { data: blob, error: dlErr } = await supabase.storage.from('files').download(audioPath)
    if (dlErr || !blob) {
      console.error('download error:', dlErr)
      return json({ error: 'download_failed' }, 500)
    }

    const form = new FormData()
    form.append('audio', blob, audio.name)
    form.append('language', 'pt')
    form.append('vad', 'true')

    const resp = await fetch(`${whisperBase}/transcribe`, { method: 'POST', body: form })
    if (!resp.ok) {
      const detail = await resp.text().catch(() => '')
      console.error('whisper transcribe failed:', resp.status, detail)
      return json({ error: 'transcribe_failed', status: resp.status }, 502)
    }
    const result = await resp.json().catch(() => null) as
      | { text?: string; transcription?: string; segments?: Array<{ start?: number; end?: number; text?: string }> }
      | null

    // 6. Parse defensivo (schema do servidor e destipado).
    const segments = Array.isArray(result?.segments) ? result!.segments : null
    const transcript = (
      result?.text ??
      result?.transcription ??
      (segments ? segments.map(s => s?.text || '').join(' ').trim() : '')
    ) || ''
    if (!transcript) return json({ error: 'empty_transcript' }, 502)

    // 7. Grava em teams (service role bypassa RLS).
    const { error: upErr } = await supabase.from('teams').update({
      pitch_transcript: transcript,
      pitch_segments: segments,
      pitch_transcribed_at: new Date().toISOString(),
    }).eq('id', team_id)
    if (upErr) {
      console.error('teams update error:', upErr)
      return json({ error: 'save_failed' }, 500)
    }

    return json({ ok: true, chars: transcript.length, segments: segments?.length ?? 0 })
  } catch (err) {
    console.error('transcribe-pitch error:', err)
    return json({ error: 'internal_error' }, 500)
  }
})
