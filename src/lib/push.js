import { supabase } from './supabase'

export const SNOOZE_KEY = 'hackiasc_push_snooze_until'
export const SNOOZE_MS = 15 * 60 * 1000

export function isIOS(ua = navigator.userAgent) {
  return /iphone|ipad|ipod/i.test(ua)
}

export function isStandalone(nav = navigator, matches = (q) => window.matchMedia(q).matches) {
  if (nav && nav.standalone) return true
  try { return matches('(display-mode: standalone)') } catch { return false }
}

export function shouldShowPrompt(permission, snoozedUntil, now = Date.now()) {
  if (permission !== 'default') return false
  return now >= (snoozedUntil || 0)
}

export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function getSnoozeUntil() {
  try { return Number(localStorage.getItem(SNOOZE_KEY)) || 0 } catch { return 0 }
}

export function snooze() {
  try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS)) } catch { /* ignore */ }
}

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY

// auth = { kind: 'participant'|'mentor'|'admin', token?: string }
export async function enablePush(auth) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('unsupported')
  }
  if (!VAPID_PUBLIC) throw new Error('no_vapid_key')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, permission }

  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    })
  }
  const json = sub.toJSON()
  const args = { p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth, p_ua: navigator.userAgent }

  if (!supabase) return { ok: false, permission }
  if (auth.kind === 'participant') {
    await supabase.rpc('push_subscribe_participant', { p_token: auth.token, ...args })
  } else if (auth.kind === 'mentor') {
    await supabase.rpc('push_subscribe_mentor', { p_token: auth.token, ...args })
  } else if (auth.kind === 'admin') {
    await supabase.rpc('push_subscribe_admin', args)
  }
  return { ok: true, permission }
}
