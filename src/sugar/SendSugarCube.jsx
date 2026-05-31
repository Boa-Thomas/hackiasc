import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { buildRecipientOptions, validateMessage, errorText, MESSAGE_MAX } from './sugarCubes'

// Formulário de envio de elogio. mode: 'participant' | 'mentor' | 'org'.
// token: necessário para participant/mentor (sessão do painel); ignorado p/ org.
export default function SendSugarCube({ mode, token }) {
  const [roster, setRoster] = useState(null)
  const [loadErr, setLoadErr] = useState(null)
  const [target, setTarget] = useState('') // formato "type:ref"
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState(null) // { type: 'ok' | 'err', text }
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    async function load() {
      if (!supabase) { setLoadErr('Sistema indisponível no momento.'); return }
      const rpc = mode === 'org' ? 'sugar_roster_admin' : 'sugar_roster'
      const args = mode === 'org'
        ? {}
        : {
            p_participant_token: mode === 'participant' ? token : null,
            p_mentor_token: mode === 'mentor' ? token : null,
          }
      const { data, error } = await supabase.rpc(rpc, args)
      if (!alive) return
      if (error) { setLoadErr(errorText(error.message)); return }
      setRoster(data)
    }
    load()
    return () => { alive = false }
  }, [mode, token])

  const options = useMemo(() => (roster ? buildRecipientOptions(roster) : []), [roster])

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    if (!target) { setStatus({ type: 'err', text: 'Escolha quem vai receber.' }); return }
    const v = validateMessage(message)
    if (!v.ok) { setStatus({ type: 'err', text: errorText(v.error) }); return }

    const sep = target.indexOf(':')
    const type = target.slice(0, sep)
    const ref = target.slice(sep + 1) || null

    setBusy(true)
    setStatus(null)
    const rpc = mode === 'participant' ? 'sugar_send_participant'
      : mode === 'mentor' ? 'sugar_send_mentor'
      : 'sugar_send_org'
    const args = mode === 'org'
      ? { p_recipient_type: type, p_recipient_ref: ref, p_message: v.value }
      : { p_token: token, p_recipient_type: type, p_recipient_ref: ref, p_message: v.value }
    const { error } = await supabase.rpc(rpc, args)
    setBusy(false)
    if (error) { setStatus({ type: 'err', text: errorText(error.message) }); return }
    setStatus({ type: 'ok', text: 'Elogio enviado! Passa por curadoria e é revelado no fim do evento. 🧁' })
    setMessage('')
    setTarget('')
  }

  if (loadErr) return <p className="text-hot font-mono text-sm">{loadErr}</p>
  if (!roster) return <p className="text-white/60 font-mono text-sm">Carregando...</p>

  const groups = [
    { key: 'Organização', items: options.filter(o => o.type === 'organization') },
    { key: 'Participantes', items: options.filter(o => o.type === 'participant') },
    { key: 'Mentores', items: options.filter(o => o.type === 'mentor') },
  ]

  return (
    <form onSubmit={submit} className="card-glass rounded-2xl p-5 space-y-4">
      <div>
        <h3 className="font-display text-lg text-white mb-1">Enviar um elogio 🧁</h3>
        <p className="text-white/50 text-sm">
          Passa por curadoria da organização e é revelado, de forma anônima, no fim do evento.
        </p>
      </div>

      <label className="block">
        <span className="text-white/70 text-sm">Para quem?</span>
        <select
          value={target}
          onChange={e => setTarget(e.target.value)}
          className="mt-1 w-full bg-dark/60 border border-white/10 rounded-lg px-3 py-2 text-white"
        >
          <option value="">Escolha...</option>
          {groups.map(g => g.items.length > 0 && (
            <optgroup key={g.key} label={g.key}>
              {g.items.map(o => (
                <option key={`${o.type}:${o.ref ?? ''}`} value={`${o.type}:${o.ref ?? ''}`}>
                  {o.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-white/70 text-sm">Elogio</span>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value.slice(0, MESSAGE_MAX))}
          rows={3}
          maxLength={MESSAGE_MAX}
          placeholder="Escreva algo gentil e específico..."
          className="mt-1 w-full bg-dark/60 border border-white/10 rounded-lg px-3 py-2 text-white"
        />
        <span className="text-white/40 text-xs">{message.length}/{MESSAGE_MAX}</span>
      </label>

      {status && (
        <p className={`text-sm font-mono ${status.type === 'ok' ? 'text-cyan' : 'text-hot'}`}>
          {status.text}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="px-4 py-2 rounded-lg bg-cyan text-dark font-semibold disabled:opacity-50"
      >
        {busy ? 'Enviando...' : 'Enviar elogio'}
      </button>
    </form>
  )
}
