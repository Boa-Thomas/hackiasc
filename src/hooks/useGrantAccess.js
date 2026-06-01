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
      try {
        const res = await fetch(EXCHANGE_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            // anon key as Bearer satisfies the function gateway's verify_jwt
            // (the link-holder has no session yet; the grant token is validated in-function)
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
            type: 'email',
          })
          if (error) throw error
        } else {
          throw new Error('invalid_grant')
        }

        if (cancelled) return
        const dest = routeForRole(data.role)
        window.history.replaceState(null, '', window.location.pathname)
        window.location.hash = dest || '#'
        setState({ status: 'done', error: null })
      } catch (e) {
        if (!cancelled) setState({ status: 'error', error: e.message || 'invalid_grant' })
      }
    })()

    return () => { cancelled = true }
  }, [])

  return state
}
