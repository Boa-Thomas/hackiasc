import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

const TOKEN_KEY = 'hackiasc_juror_token'
const POLL_MS = 30000

// Lê o token do jurado da URL (#jurado?t=<uuid>), espelha em localStorage e
// limpa o token da barra de endereços (history.replaceState) para não vazar via
// histórico/print. Recargas subsequentes usam o localStorage.
// localStorage (e não sessionStorage) é deliberado: a sessão persiste mesmo após
// fechar o navegador, então o jurado segue logado durante o evento sem reabrir o
// link. O token não expira no servidor (juror_token_owner valida só active=true).
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
    try { localStorage.setItem(TOKEN_KEY, urlToken) } catch { /* private mode */ }
    // Remove o token da URL preservando a rota base (#jurado).
    try { window.history.replaceState(null, '', '#jurado') } catch { /* ignore */ }
    return urlToken
  }

  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}

export function useJuror() {
  const [token] = useState(seedTokenFromUrl)
  const [context, setContext] = useState(null)
  const [loading, setLoading] = useState(!!token)
  const [error, setError] = useState(null)
  const initialized = useRef(false)
  // Último valor do sinal de recarga visto. Null até a primeira carga.
  const reloadAtRef = useRef(null)

  const refresh = useCallback(async () => {
    if (!token || !supabase) return null
    const { data, error: rpcError } = await supabase.rpc('juror_get_context', { p_token: token })
    if (rpcError || !data) {
      setContext(null)
      setError('invalid_token')
      return null
    }
    // Sinal de recarga remoto: o admin pode "forçar recarga" (juror_force_reload
    // bumpa juror_reload_at). Na primeira carga só registramos o valor; numa
    // checagem posterior, se mudou, recarregamos o painel para aplicar o estado
    // novo (ex.: ocultar a ideia) mesmo em abas já abertas. Os rascunhos do
    // scorecard ficam no localStorage e são restaurados após a recarga.
    const rl = data.reload_at ?? null
    if (reloadAtRef.current == null) {
      reloadAtRef.current = rl
    } else if (rl != null && rl !== reloadAtRef.current) {
      reloadAtRef.current = rl
      try { window.location.reload() } catch { /* ignore */ }
      return data
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

  // Polling leve: re-busca o contexto periodicamente. Isso (1) aplica o switch
  // de visibilidade da ideia em painéis já abertos sem recarga dura e (2) detecta
  // o sinal de "forçar recarga" disparado pelo admin (ver refresh()).
  useEffect(() => {
    if (!token || !supabase) return undefined
    const id = setInterval(() => { refresh() }, POLL_MS)
    return () => clearInterval(id)
  }, [token, refresh])

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
    ideaVisible: context?.idea_visible ?? false,
    myScores: context?.my_scores ?? [],
    loading,
    error,
    isValid: !!token && !!context,
    submitScore,
    acceptConsent,
    refresh,
  }
}
