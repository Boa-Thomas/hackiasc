import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Mural pessoal de elogios recebidos (anônimos). mode: 'participant' | 'mentor'.
// Fica OCULTO enquanto não há elogios liberados (preserva a surpresa) — o gate
// real está no servidor (só retorna algo com sugar_released = true E approved).
export default function ReceivedComplimentsSection({ mode, token }) {
  const [items, setItems] = useState([])

  useEffect(() => {
    let alive = true
    async function load() {
      if (!supabase || !token) return
      const rpc = mode === 'mentor' ? 'sugar_my_received_mentor' : 'sugar_my_received_participant'
      const { data, error } = await supabase.rpc(rpc, { p_token: token })
      if (!alive || error || !data) return
      setItems(data)
    }
    load()
    const t = setInterval(load, 15000)
    return () => { alive = false; clearInterval(t) }
  }, [mode, token])

  if (items.length === 0) return null

  return (
    <section className="space-y-4">
      <h2 className="font-display text-2xl text-gradient-cyan">
        🧁 Você recebeu {items.length} elogio{items.length > 1 ? 's' : ''}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((it, i) => (
          <div key={i} className="card-glass glow-cyan rounded-2xl p-4">
            <p className="text-white/90 whitespace-pre-wrap">{it.message}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
