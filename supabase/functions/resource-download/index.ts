import { createClient } from 'npm:@supabase/supabase-js@2'

// Restrict CORS to known origins only (mirrors create-preference)
const ALLOWED_ORIGINS = ['https://hackiasc.com', 'https://www.hackiasc.com', 'http://localhost:5173']

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req)

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { token, resource_id } = await req.json()

    if (!token || !resource_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: token, resource_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Validate participant session + confirmed payment. The RPC raises an
    // exception (returned as rpcError) when the token is invalid or the
    // payment is not confirmed — treat any error as unauthorized.
    const { error: authError } = await supabase.rpc('participant_session_owner_confirmed', {
      p_token: token,
    })
    if (authError) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch the resource to get its storage path.
    const { data: resource, error: resError } = await supabase
      .from('resources')
      .select('file_path')
      .eq('id', resource_id)
      .single()

    if (resError || !resource) {
      return new Response(
        JSON.stringify({ error: 'Resource not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate a short-lived signed URL (60s) for the private object.
    const { data: signed, error: signError } = await supabase.storage
      .from('files')
      .createSignedUrl(resource.file_path, 60)

    if (signError || !signed?.signedUrl) {
      console.error('createSignedUrl error:', signError)
      return new Response(
        JSON.stringify({ error: 'Failed to generate download link' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ url: signed.signedUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const corsHeaders = getCorsHeaders(req)
    console.error('Error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
