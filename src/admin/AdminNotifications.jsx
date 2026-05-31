import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const EVENT_LABELS = {
  sugar_released: 'Mural liberado → participantes',
  team_scores_visible: 'Notas da IA visíveis → participantes',
  wall_phase: 'Fase do muro → participantes',
  payment_confirmed: 'Pagamento confirmado → o participante',
  evaluation_open: 'Avaliação aberta → participantes + mentores',
  announcement: 'Aviso publicado → participantes',
  team_lunch: 'Almoço do time → membros do time',
  deliverable_started: 'Entrega iniciada → mentores do time',
  slides_deadline: 'Deadline de slides → participantes',
  mentor_assigned: 'Mentor designado → o mentor',
  schedule_start: 'Início de atividade do cronograma → participantes',
}

export default function AdminNotifications() {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [kind, setKind] = useState('all_participants')
  const [teams, setTeams] = useState([])
  const [selectedTeams, setSelectedTeams] = useState([])
  const [events, setEvents] = useState([])
  const [history, setHistory] = useState([])
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState(null)

  const loadAll = useCallback(async () => {
    if (!supabase) return
    const [t, e, h] = await Promise.all([
      supabase.rpc('admin_teams_for_broadcast'),
      supabase.rpc('get_notify_events'),
      supabase.rpc('admin_notifications_history', { p_limit: 50 }),
    ])
    if (!t.error) setTeams(t.data || [])
    if (!e.error) setEvents(e.data || [])
    if (!h.error) setHistory(h.data || [])
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  async function send() {
    if (!title.trim() || !body.trim()) { setMsg('Preencha título e mensagem.'); return }
    if (kind === 'teams_members' && selectedTeams.length === 0) { setMsg('Selecione ao menos um time.'); return }
    setSending(true)
    setMsg(null)
    const { error } = await supabase.rpc('broadcast_notification', {
      p_title: title.trim(),
      p_body: body.trim(),
      p_audience_kind: kind,
      p_team_ids: kind === 'teams_members' ? selectedTeams : null,
      p_url: kind === 'all_mentors' ? '#mentor' : '#participante',
    })
    setSending(false)
    if (error) { setMsg('Erro ao enviar: ' + error.message); return }
    setMsg('Enviado!')
    setTitle('')
    setBody('')
    setSelectedTeams([])
    loadAll()
  }

  async function toggleEvent(eventKey, enabled) {
    setEvents((prev) => prev.map((ev) => (ev.event_key === eventKey ? { ...ev, enabled } : ev)))
    await supabase.rpc('set_notify_event', { p_event_key: eventKey, p_on: enabled })
  }

  function toggleTeam(id) {
    setSelectedTeams((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  return (
    <div className="space-y-8">
      <section className="card-glass p-5 rounded-xl border border-white/10">
        <h2 className="text-white font-display font-semibold mb-3">📣 Enviar aviso</h2>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título"
          className="w-full mb-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Mensagem" rows={3}
          className="w-full mb-3 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
        <div className="flex flex-wrap gap-2 mb-3 text-sm">
          {[['all_participants', 'Todos participantes'], ['all_mentors', 'Só mentores'],
            ['participants_and_mentors', 'Participantes + mentores'], ['teams_members', 'Times…']].map(([k, l]) => (
            <button key={k} onClick={() => setKind(k)}
              className={`px-3 py-1.5 rounded-lg border ${kind === k ? 'bg-cyan/20 text-cyan border-cyan/30' : 'text-white/60 border-white/10 hover:bg-white/5'}`}>{l}</button>
          ))}
        </div>
        {kind === 'teams_members' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mb-3 max-h-40 overflow-y-auto">
            {teams.map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-white/70 text-xs bg-white/5 rounded px-2 py-1">
                <input type="checkbox" checked={selectedTeams.includes(t.id)} onChange={() => toggleTeam(t.id)} />
                {t.name}
              </label>
            ))}
          </div>
        )}
        <button onClick={send} disabled={sending}
          className="px-4 py-2 rounded-lg bg-cyan/20 text-cyan border border-cyan/30 text-sm font-medium hover:bg-cyan/30 disabled:opacity-50">
          {sending ? 'Enviando…' : 'Enviar aviso'}
        </button>
        {msg && <span className="ml-3 text-white/60 text-sm">{msg}</span>}
      </section>

      <section className="card-glass p-5 rounded-xl border border-white/10">
        <h2 className="text-white font-display font-semibold mb-3">⚙️ Eventos automáticos</h2>
        <div className="space-y-1.5">
          {events.map((ev) => (
            <label key={ev.event_key} className="flex items-center justify-between gap-3 py-1.5 border-b border-white/5">
              <span className="text-white/70 text-sm">{EVENT_LABELS[ev.event_key] || ev.event_key}</span>
              <input type="checkbox" checked={ev.enabled} onChange={(e) => toggleEvent(ev.event_key, e.target.checked)} />
            </label>
          ))}
        </div>
      </section>

      <section className="card-glass p-5 rounded-xl border border-white/10">
        <h2 className="text-white font-display font-semibold mb-3">🕓 Histórico de envios</h2>
        <div className="space-y-1.5">
          {history.length === 0 ? (
            <p className="text-white/40 text-sm">Nada enviado ainda.</p>
          ) : (
            history.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-white/5 text-sm">
                <div className="min-w-0">
                  <span className="text-white truncate">{h.title}</span>
                  <span className="text-white/40 ml-2 text-xs">{h.event_key}</span>
                </div>
                <span className="text-white/50 text-xs flex-shrink-0">{h.recipients} dest.</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
