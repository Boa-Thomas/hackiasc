import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

const POLL_MS = 30000

// auth: { kind: 'participant'|'mentor'|'admin', token?: string }
// Depende dos campos primitivos (kind/token), não do objeto `auth` — senão um
// novo literal a cada render recriaria fetchList/effect e mataria o polling.
export function useNotifications(auth) {
  const kind = auth?.kind
  const token = auth?.token
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const timer = useRef(null)

  const fetchList = useCallback(async () => {
    if (!supabase || !kind) return
    let res
    if (kind === 'participant') {
      res = await supabase.rpc('notifications_list_participant', { p_token: token })
    } else if (kind === 'mentor') {
      res = await supabase.rpc('notifications_list_mentor', { p_token: token })
    } else if (kind === 'admin') {
      res = await supabase.rpc('notifications_list_admin', {})
    }
    if (res && !res.error && Array.isArray(res.data)) setItems(res.data)
    setLoading(false)
  }, [kind, token])

  useEffect(() => {
    fetchList()
    timer.current = setInterval(fetchList, POLL_MS)
    const onFocus = () => fetchList()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(timer.current)
      window.removeEventListener('focus', onFocus)
    }
  }, [fetchList])

  const unread = items.filter((n) => !n.read).length

  const markRead = useCallback(async (ids) => {
    if (!supabase || !kind || !ids.length) return
    setItems((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)))
    if (kind === 'participant') await supabase.rpc('notifications_mark_read_participant', { p_token: token, p_ids: ids })
    else if (kind === 'mentor') await supabase.rpc('notifications_mark_read_mentor', { p_token: token, p_ids: ids })
    else if (kind === 'admin') await supabase.rpc('notifications_mark_read_admin', { p_ids: ids })
  }, [kind, token])

  return { items, unread, loading, markRead, refresh: fetchList }
}
