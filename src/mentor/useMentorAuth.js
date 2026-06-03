import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

const TOKEN_KEY = 'hackiasc_mentor_token'
const MODE_KEY = 'hackiasc_mentor_mode'

// Le o access_token do mentor da URL (#mentor?t=<uuid>), espelha em
// localStorage e limpa o token da barra de enderecos (history.replaceState)
// para nao vazar via historico/print — mesmo padrao do useJuror.
// Persistimos em localStorage (nao sessionStorage) de proposito: a sessao
// sobrevive ao fechar o navegador, mantendo o mentor logado durante o evento.
function seedFromUrl() {
  let urlToken = null
  try {
    const hash = window.location.hash || ''
    // Só captura o token na rota do mentor. Este hook roda em TODAS as rotas
    // (montado no App, antes do roteamento), então sem este guard ele
    // "sequestraria" o ?t= de outras rotas — ex.: #jurado?t=... viraria #mentor.
    if (hash.startsWith('#mentor')) {
      const qIdx = hash.indexOf('?')
      if (qIdx !== -1) {
        const params = new URLSearchParams(hash.slice(qIdx + 1))
        urlToken = params.get('t')
      }
    }
  } catch { /* ignore malformed hash */ }

  if (urlToken) {
    try {
      localStorage.setItem(TOKEN_KEY, urlToken)
      localStorage.setItem(MODE_KEY, 'link')
    } catch { /* private mode */ }
    // Remove o token da URL preservando a rota base (#mentor).
    try { window.history.replaceState(null, '', '#mentor') } catch { /* ignore */ }
    return { token: urlToken, mode: 'link' }
  }

  try {
    return { token: localStorage.getItem(TOKEN_KEY), mode: localStorage.getItem(MODE_KEY) || 'link' }
  } catch { return { token: null, mode: 'link' } }
}

// Auth do mentor: por sessao Supabase (jwt_exchange via #acesso) OU por link
// secreto legado (#mentor?t=<uuid>). O modo email+codigo foi removido em B2.
export function useMentorAuth() {
  // Seed unico (le URL/localStorage, faz replaceState) calculado uma vez
  // via lazy initializer — espelha o padrao do useJuror.
  const [seed] = useState(seedFromUrl)
  // isSession: true → authenticated via Supabase session (role=mentor).
  // Starts false; set to true after getSession() confirms a mentor session.
  const [isSession, setIsSession] = useState(false)
  // Legacy link token (null in session mode). Kept for coexistence (B3 removes).
  const [token, setToken] = useState(seed.token)
  const [me, setMe] = useState(null)
  // loading stays true until session detection + optional fetch completes.
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const initialized = useRef(false)
  // Stable ref for isSession to avoid stale closures.
  const isSessionRef = useRef(false)

  const persist = (t, m) => {
    try {
      if (t) {
        localStorage.setItem(TOKEN_KEY, t)
        localStorage.setItem(MODE_KEY, m)
      } else {
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(MODE_KEY)
      }
    } catch { /* ignore quota / private mode errors */ }
  }

  // refreshMe calls mentor_get_me for both session and legacy-link modes.
  // B1 re-keyed mentor_get_me to dual-mode (null → session identity, uuid → link token).
  // Called with no args by MentorNotes/MentorPanel after a mutation.
  const refreshMe = useCallback(async (overrideToken) => {
    const useSession = isSessionRef.current
    const useToken = overrideToken !== undefined ? overrideToken : (useSession ? null : token)
    const authed = useSession || !!useToken
    if (!authed || !supabase) return null
    const { data, error: rpcError } = await supabase.rpc('mentor_get_me', {
      p_token: useToken ?? null,
    })
    if (rpcError || !data) {
      if (!useSession) {
        // Legacy token is invalid — clear it.
        persist(null)
        setToken(null)
      }
      setMe(null)
      return null
    }
    setMe(data)
    return data
  }, [token]) // isSession read via ref

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    if (!supabase) { setLoading(false); return }

    ;(async () => {
      // (a) Session-first: check for a real Supabase session with role=mentor.
      // IMPORTANT: only treat it as mentor if app_metadata.role === 'mentor'
      // (admin/viewer sessions must NOT get mentor access — this hook is mounted globally).
      const { data: { session } } = await supabase.auth.getSession()
      const sessionIsMentor = session?.user?.app_metadata?.role === 'mentor'
      if (sessionIsMentor) {
        isSessionRef.current = true
        setIsSession(true)
        await refreshMe(null)
        setLoading(false)
        return
      }

      // (b) Legacy link token fallback (coexistence — removed in B3).
      if (seed.token) {
        await refreshMe(seed.token)
        setLoading(false)
        return
      }

      setLoading(false)
    })()
  }, [seed.token, refreshMe])

  const logout = useCallback(async () => {
    if (supabase) {
      try { await supabase.auth.signOut() } catch { /* best-effort */ }
    }
    // Clear any legacy localStorage token/mode.
    persist(null)
    setToken(null)
    isSessionRef.current = false
    setIsSession(false)
    setMe(null)
  }, [])

  const isAuthenticated = (isSession || !!token) && !!me

  return {
    // In session mode, token is null — push/notif RPCs resolve via the session.
    // In legacy-link mode, token is the uuid access_token.
    token: isSession ? null : token,
    me,
    mentor: me?.mentor ?? null,
    teams: me?.teams ?? [],
    notes: me?.notes ?? [],
    evaluations: me?.evaluations ?? [],
    loading,
    error,
    isAuthenticated,
    logout,
    refreshMe,
  }
}
