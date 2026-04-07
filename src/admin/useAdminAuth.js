import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD
const VIEWER_PASSWORD = import.meta.env.VITE_VIEWER_PASSWORD

export function useAdminAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [role, setRole] = useState(null) // 'admin' | 'viewer'
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
      if (session) {
        setIsAuthenticated(true)
        setRole(sessionStorage.getItem('hackia_role') || 'admin')
      }
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

    // Check viewer access (shared password, no Supabase Auth needed)
    if (VIEWER_PASSWORD && password === VIEWER_PASSWORD) {
      // Viewer uses admin Supabase session for read access
      try {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
        })
        if (authError) {
          setError('Erro ao autenticar. Tente novamente.')
          return false
        }
        setRole('viewer')
        sessionStorage.setItem('hackia_role', 'viewer')
        setIsAuthenticated(true)
        return true
      } catch (err) {
        setError(err.message)
        return false
      }
    }

    // Check admin access
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

      setRole('admin')
      sessionStorage.setItem('hackia_role', 'admin')
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
    setRole(null)
    sessionStorage.removeItem('hackia_role')
    window.location.hash = '#admin-login'
  }, [])

  return { isAuthenticated, role, loading, error, login, logout }
}
