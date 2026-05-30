import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { computeNowNext, neighborToSwap } from './facilitatorSchedule'
import FacilitatorGuide from '../facilitator/FacilitatorGuide'

const ACCENT = {
  cyan: { text: 'text-cyan', dot: 'bg-cyan', border: 'border-cyan/40', soft: 'bg-cyan/10' },
  electric: { text: 'text-electric', dot: 'bg-electric', border: 'border-electric/40', soft: 'bg-electric/10' },
  violet: { text: 'text-violet', dot: 'bg-violet', border: 'border-violet/40', soft: 'bg-violet/10' },
}
const accentOf = (a) => ACCENT[a] || ACCENT.cyan

const WALL_PHASES = [
  { id: 'closed', label: 'Fechado' },
  { id: 'wall_open', label: 'Muro aberto' },
  { id: 'voting_open', label: 'Votação aberta' },
  { id: 'results', label: 'Resultado' },
]

// Cockpit da facilitadora: conduz o evento ao vivo. Cronograma editavel (fonte
// unica, lido por landing + participante via get_public_schedule), check ao vivo,
// painel Agora/Proximo, avisos para participantes e atalhos de controle.
export default function AdminFacilitator() {
  const [days, setDays] = useState([])
  const [items, setItems] = useState([])
  const [announcement, setAnnouncement] = useState(null)
  const [wallPhase, setWallPhase] = useState(null)
  const [scoresVisible, setScoresVisible] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [view, setView] = useState('cockpit')

  const loadSchedule = useCallback(async () => {
    if (!supabase) { setError('Supabase não configurado.'); setLoading(false); return }
    const [d, i, a] = await Promise.all([
      supabase.from('schedule_days').select('day_key, label, time_window, note, accent, sort_order').order('sort_order'),
      supabase.from('schedule_items').select('id, day_key, sort_order, time, title, description, done, done_at').order('sort_order'),
      supabase.from('announcements').select('id, body, active, created_at').eq('active', true).order('created_at', { ascending: false }).limit(1),
    ])
    const firstErr = [d, i, a].find((x) => x.error)
    if (firstErr) { setError(firstErr.error.message); setLoading(false); return }
    setError(null)
    setDays(d.data ?? [])
    setItems(i.data ?? [])
    setAnnouncement((a.data ?? [])[0] ?? null)
    setLoading(false)
  }, [])

  const loadControls = useCallback(async () => {
    if (!supabase) return
    const [w, s] = await Promise.all([
      supabase.rpc('wall_admin_list'),
      supabase.rpc('get_team_scores_visible'),
    ])
    if (!w.error && w.data) setWallPhase(w.data.phase)
    if (!s.error) setScoresVisible(s.data === true)
  }, [])

  useEffect(() => {
    loadSchedule() // eslint-disable-line react-hooks/set-state-in-effect
    loadControls()
    const t = setInterval(loadSchedule, 6000)
    return () => clearInterval(t)
  }, [loadSchedule, loadControls])

  if (loading) return <p className="text-white/60 font-mono">Carregando...</p>
  if (!supabase) return <p className="text-hot font-mono">Supabase não configurado.</p>

  if (view === 'guide') return <FacilitatorGuide onBack={() => setView('cockpit')} />

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={() => setView('guide')}
          className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border border-cyan/30 bg-cyan/5 text-cyan hover:bg-cyan/15 transition-colors"
        >
          📖 Guia da Facilitadora
        </button>
      </div>
      {error && <div className="bg-hot/10 border border-hot/30 rounded-lg px-4 py-2.5 text-hot text-sm">{error}</div>}
      <NowNext days={days} items={items} onError={setError} onChanged={loadSchedule} />
      <ScheduleEditor days={days} items={items} onError={setError} onChanged={loadSchedule} />
      <AnnouncementBox current={announcement} onError={setError} onChanged={loadSchedule} />
      <ControlShortcuts
        wallPhase={wallPhase}
        scoresVisible={scoresVisible}
        onWallPhase={setWallPhase}
        onScoresVisible={setScoresVisible}
        onError={setError}
      />
    </div>
  )
}

function NowNext({ days, items, onError, onChanged }) {
  const [busy, setBusy] = useState(false)
  const { current, next, doneCount, total, finished } = computeNowNext(days, items)

  async function advance() {
    if (!current || busy) return
    setBusy(true)
    const { error: err } = await supabase
      .from('schedule_items')
      .update({ done: true, done_at: new Date().toISOString() })
      .eq('id', current.id)
    setBusy(false)
    if (err) { onError(`Erro ao avançar: ${err.message}`); return }
    await onChanged()
  }

  return (
    <div className="card-glass rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-mono text-cyan uppercase tracking-wider">Agora / Próximo</p>
        <span className="text-xs font-mono text-white/40">{doneCount}/{total} concluídos</span>
      </div>

      {total === 0 && <p className="text-white/50 text-sm">Cronograma vazio. Adicione blocos abaixo.</p>}

      {finished && (
        <div className="rounded-xl border border-violet/40 bg-violet/10 px-4 py-3 text-violet font-semibold">
          🎉 Todos os blocos foram concluídos.
        </div>
      )}

      {current && (
        <div className="grid sm:grid-cols-[1fr_auto] gap-4 items-stretch">
          <div className={`rounded-xl border ${accentOf(current.day.accent).border} ${accentOf(current.day.accent).soft} px-4 py-4`}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-white/50">Agora</span>
              <span className={`text-[10px] font-mono ${accentOf(current.day.accent).text}`}>{current.day.label}</span>
            </div>
            <div className="flex items-baseline gap-3">
              <span className={`font-mono text-lg font-bold ${accentOf(current.day.accent).text}`}>{current.time || '—'}</span>
              <span className="text-lg font-bold text-white leading-tight">{current.title}</span>
            </div>
            {current.description && <p className="text-sm text-white/60 mt-1 leading-relaxed">{current.description}</p>}
          </div>
          <button
            onClick={advance}
            disabled={busy}
            className="rounded-xl border border-cyan/40 bg-cyan/15 text-cyan font-semibold px-5 py-4 hover:bg-cyan/25 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            ✓ Concluir e avançar
          </button>
        </div>
      )}

      {next && (
        <div className="mt-3 flex items-center gap-3 px-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-white/40">Próximo</span>
          <span className="font-mono text-sm text-white/50">{next.time || '—'}</span>
          <span className="text-sm text-white/70">{next.title}</span>
          <span className="text-[10px] font-mono text-white/30">· {next.day.label}</span>
        </div>
      )}
    </div>
  )
}

function ScheduleEditor({ days, items, onError, onChanged }) {
  const itemsOf = (dayKey) => items.filter((it) => it.day_key === dayKey).sort((a, b) => a.sort_order - b.sort_order)

  async function patchItem(id, patch) {
    const { error: err } = await supabase.from('schedule_items').update(patch).eq('id', id)
    if (err) { onError(`Erro ao salvar: ${err.message}`); return }
    await onChanged()
  }

  async function toggleDone(it) {
    await patchItem(it.id, { done: !it.done, done_at: it.done ? null : new Date().toISOString() })
  }

  async function move(dayKey, id, direction) {
    const pair = neighborToSwap(items, dayKey, id, direction)
    if (!pair) return
    const [a, b] = pair
    const r1 = await supabase.from('schedule_items').update({ sort_order: b.sort_order }).eq('id', a.id)
    const r2 = await supabase.from('schedule_items').update({ sort_order: a.sort_order }).eq('id', b.id)
    if (r1.error || r2.error) { onError('Erro ao reordenar.'); return }
    await onChanged()
  }

  async function addItem(dayKey) {
    const max = itemsOf(dayKey).reduce((m, it) => Math.max(m, it.sort_order), 0)
    const { error: err } = await supabase.from('schedule_items').insert({ day_key: dayKey, sort_order: max + 10, title: 'Novo bloco', time: '' })
    if (err) { onError(`Erro ao adicionar: ${err.message}`); return }
    await onChanged()
  }

  async function removeItem(it) {
    if (!window.confirm(`Excluir "${it.title}"?`)) return
    const { error: err } = await supabase.from('schedule_items').delete().eq('id', it.id)
    if (err) { onError(`Erro ao excluir: ${err.message}`); return }
    await onChanged()
  }

  async function patchDay(dayKey, patch) {
    const { error: err } = await supabase.from('schedule_days').update(patch).eq('day_key', dayKey)
    if (err) { onError(`Erro ao salvar dia: ${err.message}`); return }
    await onChanged()
  }

  return (
    <div className="card-glass rounded-2xl p-5">
      <p className="text-xs font-mono text-violet uppercase tracking-wider mb-1">Cronograma (fonte única)</p>
      <p className="text-white/40 text-xs mb-4">Edições aqui valem para a landing e o painel do participante. Os checks são internos.</p>

      <div className="space-y-5">
        {days.map((day) => {
          const a = accentOf(day.accent)
          const dayItems = itemsOf(day.day_key)
          return (
            <div key={day.day_key} className={`rounded-xl border ${a.border} overflow-hidden`}>
              <div className={`px-4 py-3 ${a.soft} flex flex-wrap items-center gap-x-3 gap-y-2`}>
                <span className={`w-2 h-2 rounded-full ${a.dot}`} />
                <span className={`text-sm font-bold ${a.text}`}>{day.label}</span>
                <input
                  defaultValue={day.time_window || ''}
                  onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== (day.time_window || null)) patchDay(day.day_key, { time_window: v }) }}
                  placeholder="janela (ex: 09:00 às 22:00)"
                  className="bg-dark/60 border border-white/10 rounded px-2 py-1 text-xs font-mono text-white/70 w-44 focus:outline-none focus:border-white/30"
                />
                <input
                  defaultValue={day.note || ''}
                  onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== (day.note || null)) patchDay(day.day_key, { note: v }) }}
                  placeholder="observação do dia"
                  className="bg-dark/60 border border-white/10 rounded px-2 py-1 text-xs text-white/60 flex-1 min-w-40 focus:outline-none focus:border-white/30"
                />
              </div>

              <div className="divide-y divide-white/5">
                {dayItems.map((it, idx) => (
                  <ItemRow
                    key={it.id}
                    item={it}
                    accent={a}
                    isFirst={idx === 0}
                    isLast={idx === dayItems.length - 1}
                    onToggleDone={() => toggleDone(it)}
                    onMoveUp={() => move(day.day_key, it.id, 'up')}
                    onMoveDown={() => move(day.day_key, it.id, 'down')}
                    onPatch={(patch) => patchItem(it.id, patch)}
                    onRemove={() => removeItem(it)}
                  />
                ))}
                {dayItems.length === 0 && <p className="px-4 py-3 text-white/30 text-xs">Sem blocos.</p>}
              </div>

              <button onClick={() => addItem(day.day_key)} className="w-full px-4 py-2 text-xs font-mono text-white/50 hover:text-white hover:bg-white/5 transition-colors text-left">
                + adicionar bloco
              </button>
            </div>
          )
        })}
        {days.length === 0 && <p className="text-white/40 text-sm">Nenhum dia cadastrado. Aplique a migration add_schedule.sql.</p>}
      </div>
    </div>
  )
}

function ItemRow({ item, accent, isFirst, isLast, onToggleDone, onMoveUp, onMoveDown, onPatch, onRemove }) {
  function saveField(field, value) {
    const v = field === 'time' || field === 'title' ? value.trim() : (value.trim() || null)
    const cur = item[field] ?? (field === 'description' ? null : '')
    if (v === cur) return
    if (field === 'title' && !v) return
    onPatch({ [field]: v })
  }

  return (
    <div className={`flex items-start gap-2 px-3 py-2 ${item.done ? 'bg-white/[0.02]' : ''}`}>
      <button
        onClick={onToggleDone}
        title={item.done ? 'Desmarcar' : 'Marcar como feito'}
        className={`mt-1 flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center text-[11px] transition-colors ${
          item.done ? 'bg-cyan/20 border-cyan/50 text-cyan' : 'border-white/20 text-transparent hover:border-white/40'
        }`}
      >
        ✓
      </button>

      <input
        defaultValue={item.time || ''}
        onBlur={(e) => saveField('time', e.target.value)}
        placeholder="HH:MM"
        className={`mt-0.5 flex-shrink-0 w-16 bg-dark/40 border border-white/10 rounded px-2 py-1 font-mono text-xs ${accent.text} focus:outline-none focus:border-white/30`}
      />

      <div className="flex-1 min-w-0">
        <input
          defaultValue={item.title}
          onBlur={(e) => saveField('title', e.target.value)}
          className={`w-full bg-transparent text-sm font-medium text-white focus:outline-none focus:bg-dark/40 rounded px-1 py-0.5 ${item.done ? 'line-through text-white/40' : ''}`}
        />
        <input
          defaultValue={item.description || ''}
          onBlur={(e) => saveField('description', e.target.value)}
          placeholder="descrição (opcional)"
          className="w-full bg-transparent text-xs text-white/50 focus:outline-none focus:bg-dark/40 rounded px-1 py-0.5 mt-0.5"
        />
      </div>

      <div className="flex-shrink-0 flex items-center gap-0.5">
        <button onClick={onMoveUp} disabled={isFirst} className="w-6 h-6 rounded text-white/40 hover:text-white hover:bg-white/10 disabled:opacity-20 disabled:hover:bg-transparent transition-colors" title="Subir">↑</button>
        <button onClick={onMoveDown} disabled={isLast} className="w-6 h-6 rounded text-white/40 hover:text-white hover:bg-white/10 disabled:opacity-20 disabled:hover:bg-transparent transition-colors" title="Descer">↓</button>
        <button onClick={onRemove} className="w-6 h-6 rounded text-white/30 hover:text-hot hover:bg-hot/10 transition-colors" title="Excluir">✕</button>
      </div>
    </div>
  )
}

function AnnouncementBox({ current, onError, onChanged }) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  async function publish() {
    const text = body.trim()
    if (!text || busy) return
    setBusy(true)
    const { error: err } = await supabase.rpc('set_announcement', { p_body: text })
    setBusy(false)
    if (err) { onError(`Erro ao publicar aviso: ${err.message}`); return }
    setBody('')
    await onChanged()
  }

  async function clear() {
    if (busy) return
    setBusy(true)
    const { error: err } = await supabase.rpc('clear_announcement')
    setBusy(false)
    if (err) { onError(`Erro ao limpar aviso: ${err.message}`); return }
    await onChanged()
  }

  return (
    <div className="card-glass rounded-2xl p-5">
      <p className="text-xs font-mono text-gold uppercase tracking-wider mb-1">Aviso ao vivo</p>
      <p className="text-white/40 text-xs mb-3">Aparece no painel do participante. Um aviso vigente por vez.</p>

      {current && (
        <div className="rounded-xl border border-gold/30 bg-gold/10 px-4 py-3 mb-3 flex items-start justify-between gap-3">
          <p className="text-sm text-gold/90 leading-relaxed">{current.body}</p>
          <button onClick={clear} disabled={busy} className="flex-shrink-0 text-xs font-mono text-gold/60 hover:text-hot disabled:opacity-50">limpar</button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') publish() }}
          placeholder="Ex.: Almoço liberado · Pitch de Guerrilha em 10 min"
          className="flex-1 bg-dark/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/40"
        />
        <button onClick={publish} disabled={busy || !body.trim()} className="rounded-lg border border-gold/40 bg-gold/15 text-gold font-semibold px-5 py-2 hover:bg-gold/25 transition-colors disabled:opacity-50">
          Publicar
        </button>
      </div>
    </div>
  )
}

function ControlShortcuts({ wallPhase, scoresVisible, onWallPhase, onScoresVisible, onError }) {
  const [busy, setBusy] = useState(false)

  async function setPhase(p) {
    if (busy || p === wallPhase) return
    setBusy(true)
    const { error: err } = await supabase.rpc('wall_set_phase', { p_phase: p })
    setBusy(false)
    if (err) { onError(`Erro na fase do muro: ${err.message}`); return }
    onWallPhase(p)
  }

  async function toggleScores() {
    if (busy) return
    const next = !scoresVisible
    setBusy(true)
    onScoresVisible(next)
    const { error: err } = await supabase.rpc('set_team_scores_visible', { p_visible: next })
    setBusy(false)
    if (err) { onScoresVisible(!next); onError(`Erro ao salvar visibilidade: ${err.message}`) }
  }

  return (
    <div className="card-glass rounded-2xl p-5">
      <p className="text-xs font-mono text-electric uppercase tracking-wider mb-3">Atalhos de controle</p>

      <div className="space-y-4">
        <div>
          <p className="text-white/60 text-xs mb-2">Fase do Muro de Dores <span className="font-mono text-white/30">(/#muro · /#telao)</span></p>
          <div className="flex flex-wrap gap-2">
            {WALL_PHASES.map((p) => (
              <button
                key={p.id}
                onClick={() => setPhase(p.id)}
                disabled={busy}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${
                  wallPhase === p.id ? 'bg-cyan/20 text-cyan border-cyan/40' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'
                }`}
              >
                {wallPhase === p.id && <span className="mr-1">●</span>}{p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <div>
            <p className="text-white/60 text-xs">Notas da IA visíveis para os times</p>
            <p className="text-white/30 text-[11px]">Mesmo switch da aba Entregas.</p>
          </div>
          <button
            onClick={toggleScores}
            disabled={busy}
            className={`flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-full border transition-colors disabled:opacity-50 ${
              scoresVisible ? 'bg-cyan/15 text-cyan border-cyan/30' : 'bg-white/5 text-white/50 border-white/10'
            }`}
          >
            <span className={`inline-block w-2 h-2 rounded-full ${scoresVisible ? 'bg-cyan' : 'bg-white/30'}`} />
            {scoresVisible ? 'Visíveis' : 'Ocultas'}
          </button>
        </div>
      </div>
    </div>
  )
}
