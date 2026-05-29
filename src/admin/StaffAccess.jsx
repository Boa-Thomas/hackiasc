import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { STAFF_ACCESS_EMAIL } from '../lib/config'

// Auto-login da equipe (Muro + Check-in) via link #admin-acesso?t=<senha>.
// O token e a senha da conta staff; o email e fixo. Apos o signIn, remove o
// token da URL e redireciona para o painel (#admin).
export default function StaffAccess() {
  const [error, setError] = useState(null)
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    ;(async () => {
      if (!supabase) { setError('Sistema indisponível no momento.'); return }
      let token = null
      try {
        const hash = window.location.hash || ''
        const qIdx = hash.indexOf('?')
        if (qIdx !== -1) token = new URLSearchParams(hash.slice(qIdx + 1)).get('t')
      } catch { /* hash malformado */ }
      if (!token) { setError('Link inválido.'); return }
      // Remove o token da URL ANTES do signIn (cobre tambem o caminho de erro).
      try { window.history.replaceState(null, '', '#admin-acesso') } catch { /* ignore */ }
      const { error: err } = await supabase.auth.signInWithPassword({
        email: STAFF_ACCESS_EMAIL,
        password: token,
      })
      if (err) { setError('Link inválido ou expirado. Peça um novo à organização.'); return }
      // Sucesso: navega pro painel. A URL atual é '#admin-acesso', então setar o
      // hash para '#admin' dispara o hashchange; useAdminAuth assume via SIGNED_IN.
      window.location.hash = '#admin'
    })()
  }, [])

  return (
    <div className="min-h-screen bg-dark flex items-center justify-center p-4 bg-grid">
      <div className="orb w-[400px] h-[400px] bg-violet/10 -top-20 -right-20 animate-pulse-glow pointer-events-none" />
      <div className="relative card-glass p-8 w-full max-w-md text-center">
        {!error ? (
          <p className="text-white/70 font-mono">Entrando...</p>
        ) : (
          <div className="space-y-4">
            <p className="text-hot text-sm">{error}</p>
            <a href="#admin-login" className="inline-block text-cyan text-sm underline">Ir para o login</a>
          </div>
        )}
      </div>
    </div>
  )
}
