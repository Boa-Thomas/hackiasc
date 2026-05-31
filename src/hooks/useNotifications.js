import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

const POLL_MS = 30000

// auth: { kind: 'participant'|'mentor'|'admin', token?: string }
export function useNotifications(auth) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const timer = useRef(null)

  const fetchList = useCallback(async () => {
    if (!supabase || !auth) return
    let res
    if (auth.kind === 'participant') {
      res = await supabase.rpc('notifications_list_participant', { p_token: auth.token })
    } else if (auth.kind === 'mentor') {
      res = await supabase.rpc('notifications_list_mentor', { p_token: auth.token })
    } else if (auth.kind === 'admin') {
      res = await supabase.rpc('notifications_list_admin', {})
    }
    if (res && !res.error && Array.isArray(res.data)) setItems(res.data)
    setLoading(false)
  }, [auth])

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
    if (!supabase || !auth || !ids.length) return
    setItems((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)))
    if (auth.kind === 'participant') await supabase.rpc('notifications_mark_read_participant', { p_token: auth.token, p_ids: ids })
    else if (auth.kind === 'mentor') await supabase.rpc('notifications_mark_read_mentor', { p_token: auth.token, p_ids: ids })
    else if (auth.kind === 'admin') await supabase.rpc('notifications_mark_read_admin', { p_ids: ids })
  }, [auth])

  return { items, unread, loading, markRead, refresh: fetchList }
}
