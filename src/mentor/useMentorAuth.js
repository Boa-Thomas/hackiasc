import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

const TOKEN_KEY = 'hackiasc_mentor_token'
// Modo de auth: 'session' (email+codigo) ou 'link' (access_token na URL).
// Guardado para saber qual RPC usar em refreshMe e se o logout deve invalidar
// a sessao server-side (mentor_logout) — o link permanece valido apos sair.
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
    return { token: localStorage.getItem(TOKEN_KEY), mode: localStorage.getItem(MODE_KEY) || 'session' }
  } catch { return { token: null, mode: 'session' } }
}

// Auth do mentor: por sessao (email + codigo) OU por link secreto (token na URL).
// Os dois caminhos sao aditivos — o link e uma forma adicional de acesso.
export function useMentorAuth() {
  // Seed unico (le URL/localStorage, faz replaceState) calculado uma vez
  // via lazy initializer — espelha o padrao do useJuror.
  const [seed] = useState(seedFromUrl)
  const [token, setToken] = useState(seed.token)
  const [mode, setMode] = useState(seed.mode)
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(!!seed.token)
  const [error, setError] = useState(null)
  const initialized = useRef(false)

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

  const refreshMe = useCallback(async (t, m) => {
    const useToken = t ?? token
    const useMode = m ?? mode
    if (!useToken || !supabase) return null
    // Modo link valida pelo access_token (retorna NULL em token invalido);
    // modo sessao usa o token de mentor_sessions (email+codigo).
    const rpc = useMode === 'link' ? 'mentor_get_me_by_token' : 'mentor_get_me'
    const args = useMode === 'link' ? { p_access_token: useToken } : { p_token: useToken }
    const { data, error: rpcError } = await supabase.rpc(rpc, args)
    if (rpcError || !data) {
      persist(null)
      setToken(null)
      setMe(null)
      return null
    }
    setMe(data)
    return data
  }, [token, mode])

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    if (token) {
      refreshMe(token, mode).finally(() => setLoading(false)) // eslint-disable-line react-hooks/set-state-in-effect
    } else {
      setLoading(false)
    }
  }, [token, mode, refreshMe])

  const login = useCallback(async (email, code) => {
    setError(null)
    if (!supabase) {
      setError('Sistema indisponível. Tente novamente mais tarde.')
      return false
    }
    setLoading(true)
    const { data, error: rpcError } = await supabase.rpc('mentor_login', {
      p_email: email.trim().toLowerCase(),
      p_code: code.trim(),
    })
    if (rpcError) {
      setError('Erro de conexão. Tente novamente.')
      setLoading(false)
      return false
    }
    if (!data) {
      setError('Email ou código inválidos. Após várias tentativas o acesso é bloqueado por 1 minuto.')
      setLoading(false)
      return false
    }
    persist(data.token, 'session')
    setToken(data.token)
    setMode('session')
    await refreshMe(data.token, 'session')
    setLoading(false)
    return true
  }, [refreshMe])

  const logout = useCallback(async () => {
    // So invalida a sessao server-side no modo email+codigo. No modo link,
    // o access_token segue valido — apenas limpamos o localStorage local.
    if (token && mode === 'session' && supabase) {
      try { await supabase.rpc('mentor_logout', { p_token: token }) } catch { /* best-effort */ }
    }
    persist(null)
    setToken(null)
    setMode('session')
    setMe(null)
  }, [token, mode])

  return {
    token,
    me,
    mentor: me?.mentor ?? null,
    teams: me?.teams ?? [],
    notes: me?.notes ?? [],
    evaluations: me?.evaluations ?? [],
    loading,
    error,
    isAuthenticated: !!token && !!me,
    login,
    logout,
    refreshMe,
  }
}
