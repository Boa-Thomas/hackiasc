import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

const TOKEN_KEY = 'hackiasc_mentor_token'

// Auth do mentor por token custom (email + código), espelhando useParticipantAuth.
export function useMentorAuth() {
  const [token, setToken] = useState(() => {
    try { return sessionStorage.getItem(TOKEN_KEY) } catch { return null }
  })
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(!!token)
  const [error, setError] = useState(null)
  const initialized = useRef(false)

  const persistToken = (t) => {
    try {
      if (t) sessionStorage.setItem(TOKEN_KEY, t)
      else sessionStorage.removeItem(TOKEN_KEY)
    } catch { /* ignore quota / private mode errors */ }
  }

  const refreshMe = useCallback(async (t) => {
    const useToken = t ?? token
    if (!useToken || !supabase) return null
    const { data, error: rpcError } = await supabase.rpc('mentor_get_me', { p_token: useToken })
    if (rpcError || !data) {
      persistToken(null)
      setToken(null)
      setMe(null)
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
      setError('Email ou código inválidos. Após várias tentativas o acesso é bloqueado por 1 hora.')
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
      try { await supabase.rpc('mentor_logout', { p_token: token }) } catch { /* best-effort */ }
    }
    persistToken(null)
    setToken(null)
    setMe(null)
  }, [token])

  return {
    token,
    me,
    mentor: me?.mentor ?? null,
    team: me?.team ?? null,
    notes: me?.notes ?? [],
    loading,
    error,
    isAuthenticated: !!token && !!me,
    login,
    logout,
    refreshMe,
  }
}
