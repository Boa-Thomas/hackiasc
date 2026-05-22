import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

const TOKEN_KEY = 'hackiasc_participant_token'

// A Postgres/Supabase error has a structured `code` field (e.g. 'PGRST301', 'P0001').
// A network/timeout failure surfaces as a plain object without `code` or with no response.
function isAuthFailure(rpcError) {
  if (!rpcError) return false
  // If the error has a structured Postgres/PostgREST code it came from the server
  if (rpcError.code) return true
  // Supabase client may also set a numeric status for HTTP errors
  if (rpcError.status && rpcError.status < 500) return true
  // Otherwise treat as transient (network/timeout/proxy)
  return false
}

export function useParticipantAuth() {
  const [token, setToken] = useState(() => {
    try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
  })
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(!!token)
  const [error, setError] = useState(null)
  const initialized = useRef(false)

  const persistToken = (t) => {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t)
      else localStorage.removeItem(TOKEN_KEY)
    } catch { /* ignore quota / private mode errors */ }
  }

  const refreshMe = useCallback(async (t) => {
    const useToken = t ?? token
    if (!useToken || !supabase) return null
    const { data, error: rpcError } = await supabase.rpc('participant_get_me', { p_token: useToken })
    if (rpcError || !data) {
      // Only clear the session for genuine server-side auth rejection.
      // Transient network errors (no structured code) keep the token intact.
      if (isAuthFailure(rpcError) || !data) {
        persistToken(null)
        setToken(null)
        setMe(null)
      }
      return null
    }
    setMe(data)
    return data
  }, [token])

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    if (token) {
      refreshMe(token).finally(() => setLoading(false)) // eslint-disable-line react-hooks/set-state-in-effect
    } else {
      setLoading(false)
    }
  }, [token, refreshMe])

  const login = useCallback(async (email, cpf) => {
    setError(null)
    if (!supabase) {
      setError('Sistema indisponível. Tente novamente mais tarde.')
      return false
    }
    setLoading(true)
    const { data, error: rpcError } = await supabase.rpc('participant_login', {
      p_email: email.trim().toLowerCase(),
      p_cpf: cpf.trim(),
    })
    if (rpcError) {
      setError('Erro de conexão. Tente novamente.')
      setLoading(false)
      return false
    }
    if (!data) {
      setError('Email ou CPF inválidos. Após várias tentativas o acesso é bloqueado por 1 hora.')
      setLoading(false)
      return false
    }
    persistToken(data.token)
    setToken(data.token)
    await refreshMe(data.token)
    setLoading(false)
    return true
  }, [refreshMe])

  const logout = useCallback(async () => {
    if (token && supabase) {
      try { await supabase.rpc('participant_logout', { p_token: token }) } catch { /* best-effort */ }
    }
    persistToken(null)
    setToken(null)
    setMe(null)
  }, [token])

  return {
    token,
    me,
    profile: me?.profile ?? null,
    teamMembers: me?.team_members ?? [],
    pendingRequests: me?.pending_requests ?? [],
    myRequests: me?.my_requests ?? [],
    team: me?.team ?? null,
    loading,
    error,
    isAuthenticated: !!token && !!me,
    login,
    logout,
    refreshMe,
  }
}
