import { createClient } from 'npm:@supabase/supabase-js@2'

// Edge function: upload/download dos slides do pitch (entrega final) para o
// bucket privado `files`, prefixo `deliverables/<team_id>/slides.pdf`.
//
// O participante NÃO usa Supabase Auth: autentica via token custom validado
// por participant_session_owner_confirmed (service role). Por isso esta
// function precisa de verify_jwt:false no deploy.
//
//   action 'upload-url'  -> gera signed upload URL (upsert) p/ o time enviar o PDF
//   action 'download-url'-> gera signed URL (60s) do slides salvo do time
//
// CORS espelha resource-download (origens conhecidas).
// Limite de 50MB por arquivo é imposto pelo file_size_limit do bucket `files`
// (ver migrations/add_slides_upload.sql) e validado também no cliente.
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
  const corsHeaders = getCorsHeaders(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    const { token, action, file_name } = await req.json()

    if (!token || !action) {
      return json({ error: 'Missing required fields: token, action' }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Valida sessão + pagamento confirmado. A RPC lança exceção (vem em
    // authError) quando o token é inválido ou o pagamento não foi
    // confirmado. data é o registration_id do dono da sessão.
    const { data: regId, error: authError } = await supabase.rpc('participant_session_owner_confirmed', {
      p_token: token,
    })
    if (authError || !regId) {
      return json({ error: 'Unauthorized' }, 401)
    }

    // Descobre o team_id do participante a partir do registration_id.
    const { data: reg, error: regError } = await supabase
      .from('registrations')
      .select('team_id')
      .eq('id', regId)
      .single()

    if (regError) {
      console.error('registrations lookup error:', regError)
      return json({ error: 'Internal server error' }, 500)
    }
    if (!reg?.team_id) {
      return json({ error: 'no_team' }, 400)
    }
    const teamId = reg.team_id as string
    const path = `deliverables/${teamId}/slides.pdf`

    if (action === 'upload-url') {
      if (typeof file_name !== 'string' || !/\.pdf$/i.test(file_name.trim())) {
        return json({ error: 'invalid_file_type' }, 400)
      }
      // Prazo de envio (data de corte configurada pelo admin). A regra de tempo
      // vive 100% no banco: slides_upload_allowed() compara now() vs o deadline
      // do singleton slides_config — nenhum parse/timezone em JS aqui. Apenas o
      // upload e barrado; o download (action 'download-url') continua liberado.
      const { data: allowed, error: gateError } = await supabase.rpc('slides_upload_allowed')
      if (gateError) {
        console.error('slides_upload_allowed error:', gateError)
        return json({ error: 'Internal server error' }, 500)
      }
      if (allowed === false) {
        return json({ error: 'deadline_passed' }, 403)
      }
      // Remove o slides anterior do time antes de gerar a nova URL assinada.
      // Belt-and-suspenders: garante que "Substituir" funcione mesmo que a
      // versão do supabase-js não suporte upsert em createSignedUploadUrl
      // (remove é no-op se o objeto não existir). service role ignora RLS.
      await supabase.storage.from('files').remove([path])

      // Signed upload URL (upsert: sobrescreve o slides anterior do time).
      const { data: signed, error: signError } = await supabase.storage
        .from('files')
        .createSignedUploadUrl(path, { upsert: true })

      if (signError || !signed?.signedUrl || !signed?.token) {
        console.error('createSignedUploadUrl error:', signError)
        return json({ error: 'Failed to generate upload link' }, 500)
      }
      // path: caminho do objeto; token: token do signed upload (uploadToSignedUrl)
      return json({ path: signed.path ?? path, token: signed.token, signedUrl: signed.signedUrl })
    }

    if (action === 'download-url') {
      // Lê o caminho salvo nas entregas finais do time.
      const { data: team, error: teamError } = await supabase
        .from('teams')
        .select('final_deliverables')
        .eq('id', teamId)
        .single()

      if (teamError) {
        console.error('teams lookup error:', teamError)
        return json({ error: 'Internal server error' }, 500)
      }
      const slidesPath = team?.final_deliverables?.slides_path
      if (!slidesPath) {
        return json({ error: 'no_slides' }, 404)
      }
      const { data: dl, error: dlError } = await supabase.storage
        .from('files')
        .createSignedUrl(slidesPath, 60)

      if (dlError || !dl?.signedUrl) {
        console.error('createSignedUrl error:', dlError)
        return json({ error: 'Failed to generate download link' }, 500)
      }
      return json({ url: dl.signedUrl })
    }

    return json({ error: 'invalid_action' }, 400)
  } catch (err) {
    console.error('Error:', err)
    return json({ error: 'Internal server error' }, 500)
  }
})
