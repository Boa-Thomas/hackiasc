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
  // isSession: true → authenticated via Supabase session (no token needed).
  // Starts null until getSession() resolves to avoid false negatives.
  const [isSession, setIsSession] = useState(false)
  const [token] = useState(seedTokenFromUrl)
  const [context, setContext] = useState(null)
  // loading starts true until session detection + optional fetch completes.
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const initialized = useRef(false)
  // Último valor do sinal de recarga visto. Null até a primeira carga.
  const reloadAtRef = useRef(null)
  // Verdadeiro enquanto uma mutação (salvar nota / aceitar termo) está em voo.
  // Evita que o refresh() pós-mutação dispare window.location.reload() no meio da
  // operação; o próximo poll (<=30s) aplica o sinal de recarga com segurança.
  const mutatingRef = useRef(false)
  // Stable ref for isSession to avoid stale closures in poll/callbacks.
  const isSessionRef = useRef(false)

  const refresh = useCallback(async (sessionMode) => {
    // sessionMode param allows calling refresh before isSession state updates.
    const useSession = sessionMode !== undefined ? sessionMode : isSessionRef.current
    const authed = useSession || !!token
    if (!authed || !supabase) return null
    const p_token = useSession ? null : token
    const { data, error: rpcError } = await supabase.rpc('juror_get_context', { p_token })
    if (rpcError || !data) {
      setContext(null)
      setError('invalid_token')
      return null
    }
    // Sinal de recarga remoto: o admin pode "forçar recarga" (juror_force_reload
    // bumpa juror_reload_at). Na primeira carga só registramos o valor; numa
    // checagem posterior, se mudou, recarregamos o painel para aplicar o estado
    // novo (ex.: ocultar a ideia) mesmo em abas já abertas. Não recarregamos no
    // meio de uma mutação (mutatingRef): o próximo poll cuida disso. Os rascunhos
    // do scorecard ficam no localStorage e são restaurados após a recarga.
    const rl = data.reload_at ?? null
    if (reloadAtRef.current == null) {
      reloadAtRef.current = rl
    } else if (rl != null && rl !== reloadAtRef.current && !mutatingRef.current) {
      reloadAtRef.current = rl
      try { window.location.reload() } catch { /* ignore */ }
      return data
    }
    setContext(data)
    setError(null)
    return data
  }, [token]) // isSession not in deps — read via ref to avoid re-creating on session detect

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    if (!supabase) { setError('unavailable'); setLoading(false); return }

    ;(async () => {
      // (a) Session-first: check for a real Supabase session with role=juror.
      const { data: { session } } = await supabase.auth.getSession()
      const sessionIsJuror = session?.user?.app_metadata?.role === 'juror'
      if (sessionIsJuror) {
        isSessionRef.current = true
        setIsSession(true)
        await refresh(true)
        setLoading(false)
        return
      }

      // (b) Legacy token fallback (coexistence — removed in B3).
      if (!token) { setLoading(false); return }
      await refresh(false)
      setLoading(false)
    })()
  }, [token, refresh])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Polling leve: re-busca o contexto periodicamente. Isso (1) aplica o switch
  // de visibilidade da ideia em painéis já abertos sem recarga dura e (2) detecta
  // o sinal de "forçar recarga" disparado pelo admin (ver refresh()).
  useEffect(() => {
    const authed = isSession || !!token
    if (!authed || !supabase) return undefined
    const id = setInterval(() => { refresh() }, POLL_MS)
    return () => clearInterval(id)
  }, [isSession, token, refresh])

  // Grava/atualiza um scorecard. scores: [{criterion_key, score, justification}].
  const submitScore = useCallback(async ({ teamId, scores, summary, eliminated }) => {
    const authed = isSessionRef.current || !!token
    if (!authed || !supabase) return { ok: false, error: 'unavailable' }
    mutatingRef.current = true
    try {
      const p_token = isSessionRef.current ? null : token
      const { data, error: rpcError } = await supabase.rpc('juror_submit_score', {
        p_token,
        p_team_id: teamId,
        p_scores: scores,
        p_summary: summary ?? '',
        p_eliminated: !!eliminated,
      })
      if (rpcError) return { ok: false, error: rpcError.message }
      await refresh()
      return { ok: true, data }
    } finally {
      mutatingRef.current = false
    }
  }, [token, refresh])

  // Registra o aceite do termo de consentimento (cláusula 5.3 do edital).
  const acceptConsent = useCallback(async () => {
    const authed = isSessionRef.current || !!token
    if (!authed || !supabase) return { ok: false, error: 'unavailable' }
    mutatingRef.current = true
    try {
      const p_token = isSessionRef.current ? null : token
      const { data, error: rpcError } = await supabase.rpc('juror_accept_consent', {
        p_token,
      })
      if (rpcError) return { ok: false, error: rpcError.message }
      await refresh()
      return { ok: true, data }
    } finally {
      mutatingRef.current = false
    }
  }, [token, refresh])

  const authed = isSession || !!token

  return {
    token,
    context,
    juror: context?.juror ?? null,
    teams: context?.teams ?? [],
    ideaVisible: context?.idea_visible ?? false,
    myScores: context?.my_scores ?? [],
    loading,
    error,
    isValid: authed && !!context,
    submitScore,
    acceptConsent,
    refresh,
  }
}
