import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD

export function useAdminAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    checkSession()
  }, [])

  async function checkSession() {
    if (!supabase) {
      setLoading(false)
      return
    }
    try {
      const { data: { session } } = await supabase.auth.getSession()
      setIsAuthenticated(!!session)
    } catch {
      setIsAuthenticated(false)
    } finally {
      setLoading(false)
    }
  }

  const login = useCallback(async (email, password) => {
    setError(null)

    if (!supabase) {
      setError('Supabase não configurado')
      return false
    }

    if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
      setError('Credenciais inválidas')
      return false
    }

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      })

      if (authError) {
        setError(authError.message)
        return false
      }

      setIsAuthenticated(true)
      return true
    } catch (err) {
      setError(err.message)
      return false
    }
  }, [])

  const logout = useCallback(async () => {
    if (supabase) {
      await supabase.auth.signOut()
    }
    setIsAuthenticated(false)
    window.location.hash = '#admin-login'
  }, [])

  return { isAuthenticated, loading, error, login, logout }
}
