import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

const TOKEN_KEY = 'hackiasc_juror_token'

// Lê o token do jurado da URL (#jurado?t=<uuid>), espelha em sessionStorage e
// limpa o token da barra de endereços (history.replaceState) para não vazar via
// histórico/print. Recargas subsequentes usam o sessionStorage.
function seedTokenFromUrl() {
  let urlToken = null
  try {
    const hash = window.location.hash || ''
    const qIdx = hash.indexOf('?')
    if (qIdx !== -1) {
      const params = new URLSearchParams(hash.slice(qIdx + 1))
      urlToken = params.get('t')
    }
  } catch { /* ignore malformed hash */ }

  if (urlToken) {
    try { sessionStorage.setItem(TOKEN_KEY, urlToken) } catch { /* private mode */ }
    // Remove o token da URL preservando a rota base (#jurado).
    try { window.history.replaceState(null, '', '#jurado') } catch { /* ignore */ }
    return urlToken
  }

  try { return sessionStorage.getItem(TOKEN_KEY) } catch { return null }
}

export function useJuror() {
  const [token] = useState(seedTokenFromUrl)
  const [context, setContext] = useState(null)
  const [loading, setLoading] = useState(!!token)
  const [error, setError] = useState(null)
  const initialized = useRef(false)

  const refresh = useCallback(async () => {
    if (!token || !supabase) return null
    const { data, error: rpcError } = await supabase.rpc('juror_get_context', { p_token: token })
    if (rpcError || !data) {
      setContext(null)
      setError('invalid_token')
      return null
    }
    setContext(data)
    setError(null)
    return data
  }, [token])

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    if (!token) { setLoading(false); return }
    if (!supabase) { setError('unavailable'); setLoading(false); return }
    refresh().finally(() => setLoading(false))
  }, [token, refresh])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Grava/atualiza um scorecard. scores: [{criterion_key, score, justification}].
  const submitScore = useCallback(async ({ teamId, scores, summary, eliminated }) => {
    if (!token || !supabase) return { ok: false, error: 'unavailable' }
    const { data, error: rpcError } = await supabase.rpc('juror_submit_score', {
      p_token: token,
      p_team_id: teamId,
      p_scores: scores,
      p_summary: summary ?? '',
      p_eliminated: !!eliminated,
    })
    if (rpcError) return { ok: false, error: rpcError.message }
    await refresh()
    return { ok: true, data }
  }, [token, refresh])

  // Registra o aceite do termo de consentimento (cláusula 5.3 do edital).
  const acceptConsent = useCallback(async () => {
    if (!token || !supabase) return { ok: false, error: 'unavailable' }
    const { data, error: rpcError } = await supabase.rpc('juror_accept_consent', {
      p_token: token,
    })
    if (rpcError) return { ok: false, error: rpcError.message }
    await refresh()
    return { ok: true, data }
  }, [token, refresh])

  return {
    token,
    context,
    juror: context?.juror ?? null,
    teams: context?.teams ?? [],
    myScores: context?.my_scores ?? [],
    loading,
    error,
    isValid: !!token && !!context,
    submitScore,
    acceptConsent,
    refresh,
  }
}
