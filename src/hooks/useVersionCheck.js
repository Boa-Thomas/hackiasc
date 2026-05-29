/* global __BUILD_ID__ */
import { useState, useEffect, useRef } from 'react'

const POLL_MS = 3 * 60 * 1000

// Detecta deploy novo: compara o __BUILD_ID__ embutido no bundle com o
// version.json servido (cache-bypassed). Falha de rede / dev sem version.json
// => silencioso (nao mostra nada).
export function useVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const current = useRef(typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : null)

  useEffect(() => {
    if (!current.current || current.current === 'dev') return
    let stopped = false
    async function check() {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, {
          cache: 'no-store',
        })
        if (!res.ok) return
        const data = await res.json()
        if (!stopped && data && data.buildId && data.buildId !== current.current) {
          setUpdateAvailable(true)
        }
      } catch {
        /* offline / silencioso */
      }
    }
    const t = setInterval(check, POLL_MS)
    check()
    return () => {
      stopped = true
      clearInterval(t)
    }
  }, [])

  return updateAvailable
}
