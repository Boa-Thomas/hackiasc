import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

const VALID_ROLES = ['admin', 'viewer', 'checkin']

const SESSION_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes of inactivity
const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_DURATION_MS = 5 * 60 * 1000 // 5 minutes

export function useAdminAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [role, setRole] = useState(null) // 'admin' | 'viewer'
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Refs are used to avoid stale closures inside event listeners
  const lastActivityRef = useRef(Date.now())
  const inactivityTimerRef = useRef(null)
  const failedAttemptsRef = useRef(0)
  const lockoutUntilRef = useRef(null)

  // --- Inactivity timeout ---

  const resetInactivityTimer = useCallback(() => {
    lastActivityRef.current = Date.now()
    clearTimeout(inactivityTimerRef.current)
    inactivityTimerRef.current = setTimeout(() => {
      performLogout()
    }, SESSION_TIMEOUT_MS)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const startActivityTracking = useCallback(() => {
    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll']
    events.forEach(ev => window.addEventListener(ev, resetInactivityTimer, { passive: true }))
    resetInactivityTimer()
    return () => {
      events.forEach(ev => window.removeEventListener(ev, resetInactivityTimer))
      clearTimeout(inactivityTimerRef.current)
    }
  }, [resetInactivityTimer])

  const stopActivityTracking = useCallback(() => {
    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll']
    events.forEach(ev => window.removeEventListener(ev, resetInactivityTimer))
    clearTimeout(inactivityTimerRef.current)
  }, [resetInactivityTimer])

  // --- Core auth logic ---

  // UI-only teardown. Does NOT call signOut(), so it is safe to invoke from the
  // onAuthStateChange SIGNED_OUT handler without triggering an infinite loop.
  const clearAuthState = useCallback(() => {
    stopActivityTracking()
    setIsAuthenticated(false)
    setRole(null)
    window.location.hash = '#admin-login'
  }, [stopActivityTracking])

  const performLogout = useCallback(async () => {
    if (supabase) {
      await supabase.auth.signOut()
    }
    clearAuthState()
  }, [clearAuthState])

  const checkSession = useCallback(async () => {
    if (!supabase) {
      setLoading(false)
      return
    }
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        const userRole = session.user.app_metadata?.role ?? null
        if (VALID_ROLES.includes(userRole)) {
          setRole(userRole)
          setIsAuthenticated(true)
          startActivityTracking()
        } else {
          await supabase.auth.signOut()
        }
      }
    } catch {
      setIsAuthenticated(false)
    } finally {
      setLoading(false)
    }
  }, [startActivityTracking])

  useEffect(() => {
    checkSession()

    let authSubscription = null
    if (supabase) {
      const { data } = supabase.auth.onAuthStateChange((event) => {
        // Session revoked/expired elsewhere (logout, token revocation, expiry).
        // Only do UI cleanup here — calling signOut() would re-fire SIGNED_OUT
        // and loop forever.
        if (event === 'SIGNED_OUT') {
          clearAuthState()
        }
      })
      authSubscription = data?.subscription
    }

    return () => {
      stopActivityTracking()
      authSubscription?.unsubscribe()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // --- Rate limiting ---

  const isLockedOut = useCallback(() => {
    if (!lockoutUntilRef.current) return false
    if (Date.now() < lockoutUntilRef.current) return true
    // Lockout expired — reset
    lockoutUntilRef.current = null
    failedAttemptsRef.current = 0
    return false
  }, [])

  const getRemainingLockoutSeconds = useCallback(() => {
    if (!lockoutUntilRef.current) return 0
    return Math.ceil((lockoutUntilRef.current - Date.now()) / 1000)
  }, [])

  // --- Login ---

  const login = useCallback(async (email, password) => {
    setError(null)

    if (!supabase) {
      setError('Supabase não configurado')
      return false
    }

    if (isLockedOut()) {
      const secs = getRemainingLockoutSeconds()
      setError(`Muitas tentativas. Aguarde ${secs}s para tentar novamente.`)
      return false
    }

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) {
        console.error('[Admin Auth]', authError.message, authError.status)
        failedAttemptsRef.current += 1
        if (failedAttemptsRef.current >= MAX_FAILED_ATTEMPTS) {
          lockoutUntilRef.current = Date.now() + LOCKOUT_DURATION_MS
          failedAttemptsRef.current = 0
          setError('Conta bloqueada por 5 minutos após múltiplas tentativas inválidas.')
        } else {
          setError(`Credenciais inválidas. (${authError.message})`)
        }
        return false
      }

      // Success — reset rate limit counters
      failedAttemptsRef.current = 0
      lockoutUntilRef.current = null

      const userRole = data.user?.app_metadata?.role ?? null
      if (!VALID_ROLES.includes(userRole)) {
        await supabase.auth.signOut()
        setError('Acesso restrito a administradores.')
        return false
      }
      setRole(userRole)
      setIsAuthenticated(true)
      startActivityTracking()
      return true
    } catch (err) {
      setError(err.message)
      return false
    }
  }, [isLockedOut, getRemainingLockoutSeconds, startActivityTracking])

  const logout = useCallback(async () => {
    await performLogout()
  }, [performLogout])

  return { isAuthenticated, role, loading, error, login, logout }
}
