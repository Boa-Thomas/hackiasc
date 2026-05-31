import { useState, useRef, useEffect } from 'react'
import { useNotifications } from '../hooks/useNotifications'

export default function NotificationBell({ auth }) {
  const { items, unread, markRead } = useNotifications(auth)
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && unread > 0) markRead(items.filter((n) => !n.read).map((n) => n.id))
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={toggle} className="relative text-white/60 hover:text-white p-1.5" aria-label="Avisos">
        <span className="text-lg">🔔</span>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-hot text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-[60vh] overflow-y-auto card-glass border border-white/10 rounded-xl shadow-xl z-[60]">
          <div className="px-4 py-2 border-b border-white/10 text-white/80 text-sm font-medium">Avisos</div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-white/40 text-sm text-center">Nenhum aviso ainda.</p>
          ) : (
            items.map((n) => (
              <a key={n.id} href={n.url || '#'} onClick={() => setOpen(false)}
                className={`block px-4 py-3 border-b border-white/5 hover:bg-white/5 ${n.read ? 'opacity-60' : ''}`}>
                <div className="text-white text-sm font-medium">{n.title}</div>
                <div className="text-white/60 text-xs mt-0.5">{n.body}</div>
              </a>
            ))
          )}
        </div>
      )}
    </div>
  )
}
