import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { parseAccessToken, routeForRole } from '../lib/grantRouting'

const EXCHANGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/access-exchange`

// Resolves a #acesso?t=<token> link: rpc-token roles store the token and route;
// jwt-exchange roles call the edge function and verifyOtp into a real session.
export function useGrantAccess() {
  const [state, setState] = useState({ status: 'idle', error: null })

  useEffect(() => {
    const token = parseAccessToken(window.location.hash)
    if (!token || !supabase) return
    let cancelled = false

    ;(async () => {
      setState({ status: 'resolving', error: null })
      // Strip the token from the URL immediately (before any await) so it never
      // lingers in the address bar / history — on success OR error.
      window.history.replaceState(null, '', window.location.pathname)
      try {
        const res = await fetch(EXCHANGE_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // access-exchange is verify_jwt=false (pre-session entry point — the
            // link-holder has no session yet; the grant token IS the credential,
            // validated in-function by grant_resolve + rate-limit). apikey is sent
            // for routing; Authorization is not required (kept harmless for parity).
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ token }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || 'invalid_grant')

        if (data.rpc_token) {
          const key = data.role === 'mentor' ? 'hackiasc_mentor_token' : 'hackiasc_juror_token'
          localStorage.setItem(key, token)
          if (data.role === 'mentor') localStorage.setItem('hackiasc_mentor_mode', 'link')
        } else if (data.hashed_token) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: data.hashed_token,
            type: 'magiclink',
          })
          if (error) {
            // The #acesso link is single-use. If verifyOtp fails, the token was
            // already consumed (e.g. a refresh after first load). The user must
            // reopen the original link or request a new one.
            throw new Error(
              'Este link já foi utilizado e não pode ser reaberto. Feche e reabra o link original, ou peça um novo link ao organizador.'
            )
          }
        } else {
          throw new Error('invalid_grant')
        }

        if (cancelled) return
        const dest = routeForRole(data.role) || '#'
        // A real Supabase session was just established (jwt_exchange) or a token
        // stored (rpc_token). The destination panel's auth hooks (useMentorAuth/
        // useJuror/useAdminAuth/facilitator) run their session detection ONCE at
        // mount — which already happened before this session/token existed. Force a
        // full reload at the destination so they re-init WITH it; otherwise the
        // panel renders its "no access" gate despite a valid session.
        window.location.hash = dest
        window.location.reload()
      } catch (e) {
        if (!cancelled) setState({ status: 'error', error: e.message || 'invalid_grant' })
      }
    })()

    return () => { cancelled = true }
  }, [])

  return state
}
