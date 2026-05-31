import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { computeNowNext, neighborToSwap, cascadeShift, reorderByDrag, markAsCurrent, parseTime, computePulse } from './facilitatorSchedule'
import FacilitatorGuide from '../facilitator/FacilitatorGuide'
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTeamPhases } from '../hooks/useTeamPhases'
import PhaseBadge from './PhaseBadge'
import TeamPhaseAliasesEditor from './TeamPhaseAliasesEditor'

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

const QUICK_ANNOUNCEMENTS = [
  'Almoço liberado',
  'Jantar liberado',
  'Pitch em 10 minutos',
  'Retornem para a sala',
  'Intervalo de 15 minutos',
]

const pad2 = (n) => String(n).padStart(2, '0')

// Formata um delta em minutos como "+1:30" / "−0:15".
function fmtDelta(min) {
  const sign = min < 0 ? '−' : '+'
  const a = Math.abs(min)
  return `${sign}${Math.floor(a / 60)}:${pad2(a % 60)}`
}

// Duração em minutos -> "1h05" / "45min".
function fmtDur(min) {
  const a = Math.abs(min)
  return a >= 60 ? `${Math.floor(a / 60)}h${pad2(a % 60)}` : `${a}min`
}

// Cockpit da facilitadora: conduz o evento ao vivo. Cronograma editavel (fonte
// unica), arrastar/checar ao vivo, cronometro, avisos e atalhos de controle.
export default function AdminFacilitator() {
  const [days, setDays] = useState([])
  const [items, setItems] = useState([])
  const [announcement, setAnnouncement] = useState(null)
  const [history, setHistory] = useState([])
  const [wallPhase, setWallPhase] = useState(null)
  const [scoresVisible, setScoresVisible] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [view, setView] = useState('cockpit')
  const [pulse, setPulse] = useState(null)

  const loadSchedule = useCallback(async () => {
    if (!supabase) { setError('Supabase não configurado.'); setLoading(false); return }
    const [d, i, a] = await Promise.all([
      supabase.from('schedule_days').select('day_key, label, time_window, note, accent, sort_order').order('sort_order'),
      supabase.from('schedule_items').select('id, day_key, sort_order, time, title, description, done, done_at').order('sort_order'),
      supabase.from('announcements').select('id, body, active, created_at').order('created_at', { ascending: false }).limit(6),
    ])
    const firstErr = [d, i, a].find((x) => x.error)
    if (firstErr) { setError(firstErr.error.message); setLoading(false); return }
    setError(null)
    setDays(d.data ?? [])
    setItems(i.data ?? [])
    const list = a.data ?? []
    setHistory(list)
    setAnnouncement(list.find((x) => x.active) ?? null)
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

  const loadPulse = useCallback(async () => {
    if (!supabase) return
    const [r, t] = await Promise.all([
      supabase.from('registrations').select('id, payment_status, checked_in_at, team_id'),
      supabase.from('teams').select('id, hypotheses_canvas, slc_ia_canvas, learning_diary, final_deliverables'),
    ])
    if (r.error || t.error) return
    setPulse(computePulse(r.data || [], t.data || []))
  }, [])

  useEffect(() => {
    loadSchedule() // eslint-disable-line react-hooks/set-state-in-effect
    loadControls()
    const t = setInterval(loadSchedule, 6000)
    return () => clearInterval(t)
  }, [loadSchedule, loadControls])

  useEffect(() => {
    loadPulse() // eslint-disable-line react-hooks/set-state-in-effect
    const t = setInterval(loadPulse, 20000)
    return () => clearInterval(t)
  }, [loadPulse])

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
      <Pulse pulse={pulse} />
      <TeamPhases />
      <SessionTimer />
      <ScheduleEditor days={days} items={items} onError={setError} onChanged={loadSchedule} />
      <AnnouncementBox current={announcement} history={history} onError={setError} onChanged={loadSchedule} />
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
            <Cronometro current={current} next={next} />
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

// Relogio ao vivo + contagem regressiva ate o proximo bloco + atraso acumulado
// (hora atual vs horario agendado do bloco corrente). Tudo derivado dos horarios
// HH:MM; o "delta" cruza a meia-noite quando o proximo e menor que o atual.
function Cronometro({ current, next }) {
  const [now, setNow] = useState(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() })
  useEffect(() => {
    const t = setInterval(() => { const d = new Date(); setNow(d.getHours() * 60 + d.getMinutes()) }, 15000)
    return () => clearInterval(t)
  }, [])

  const startM = parseTime(current?.time)
  let endM = parseTime(next?.time)
  if (endM != null && startM != null && endM < startM) endM += 1440

  const remaining = endM != null ? endM - now : null   // min ate o proximo bloco
  const delay = startM != null ? now - startM : null   // >0 atrasados, <0 adiantados

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono">
      <span className="text-white/40">🕑 {pad2(Math.floor(now / 60))}:{pad2(now % 60)}</span>
      {remaining != null && (
        remaining >= 0
          ? <span className="text-cyan/80">faltam {fmtDur(remaining)} p/ o próximo</span>
          : <span className="text-hot/90">já passou {fmtDur(remaining)} do próximo</span>
      )}
      {delay != null && (
        Math.abs(delay) < 3
          ? <span className="text-cyan/70">no horário</span>
          : delay > 0
            ? <span className="text-gold/90">{fmtDur(delay)} atrasados</span>
            : <span className="text-cyan/70">{fmtDur(delay)} adiantados</span>
      )}
    </div>
  )
}

function ScheduleEditor({ days, items, onError, onChanged }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const itemsOf = (dayKey) => items.filter((it) => it.day_key === dayKey).sort((a, b) => a.sort_order - b.sort_order)

  async function patchItem(id, patch) {
    const { error: err } = await supabase.from('schedule_items').update(patch).eq('id', id)
    if (err) { onError(`Erro ao salvar: ${err.message}`); return }
    await onChanged()
  }

  async function changeTime(it, oldTime, rawNew) {
    const newTime = rawNew.trim()
    if (newTime === (it.time || '')) return
    const { delta, updates } = cascadeShift(items, it.day_key, it.id, oldTime, newTime)
    let toApply = [{ id: it.id, time: newTime }]
    if (updates.length > 0 && window.confirm(`Deslocar os ${updates.length} bloco(s) seguintes de hoje em ${fmtDelta(delta)}? (mantém os intervalos)`)) {
      toApply = toApply.concat(updates)
    }
    for (const u of toApply) {
      const { error: err } = await supabase.from('schedule_items').update({ time: u.time }).eq('id', u.id)
      if (err) { onError(`Erro ao salvar horário: ${err.message}`); return }
    }
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

  async function handleDragEnd(dayKey, event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const updates = reorderByDrag(items, dayKey, active.id, over.id)
    for (const u of updates) {
      const { error: err } = await supabase.from('schedule_items').update({ sort_order: u.sort_order }).eq('id', u.id)
      if (err) { onError('Erro ao reordenar.'); return }
    }
    await onChanged()
  }

  async function makeCurrent(it) {
    const updates = markAsCurrent(days, items, it.id)
    if (updates.length === 0) return
    if (!window.confirm(`Tornar "${it.title}" o bloco atual? (marca os anteriores como feitos)`)) return
    for (const u of updates) {
      const { error: err } = await supabase
        .from('schedule_items')
        .update({ done: u.done, done_at: u.done ? new Date().toISOString() : null })
        .eq('id', u.id)
      if (err) { onError(`Erro ao marcar atual: ${err.message}`); return }
    }
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

  async function announceStart(it) {
    if (!window.confirm(`Anunciar início de "${it.title}" para todos os participantes?`)) return
    const { error: err } = await supabase.rpc('notify_schedule_start', { p_item_id: it.id })
    if (err) { onError(`Erro ao anunciar início: ${err.message}`); return }
  }

  async function patchDay(dayKey, patch) {
    const { error: err } = await supabase.from('schedule_days').update(patch).eq('day_key', dayKey)
    if (err) { onError(`Erro ao salvar dia: ${err.message}`); return }
    await onChanged()
  }

  return (
    <div className="card-glass rounded-2xl p-5">
      <p className="text-xs font-mono text-violet uppercase tracking-wider mb-1">Cronograma (fonte única)</p>
      <p className="text-white/40 text-xs mb-4">Arraste pelo ⠿ para reordenar (as setas ↑/↓ também funcionam). Ao mudar um horário, os blocos seguintes do dia podem ser deslocados junto. Os checks são internos.</p>

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

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(day.day_key, e)}>
                <SortableContext items={dayItems.map((it) => it.id)} strategy={verticalListSortingStrategy}>
                  <div className="divide-y divide-white/5">
                    {dayItems.map((it, idx) => (
                      <SortableItemRow
                        key={it.id}
                        item={it}
                        accent={a}
                        isFirst={idx === 0}
                        isLast={idx === dayItems.length - 1}
                        onToggleDone={() => toggleDone(it)}
                        onMoveUp={() => move(day.day_key, it.id, 'up')}
                        onMoveDown={() => move(day.day_key, it.id, 'down')}
                        onPatch={(patch) => patchItem(it.id, patch)}
                        onTimeChange={(oldT, newT) => changeTime(it, oldT, newT)}
                        onMakeCurrent={() => makeCurrent(it)}
                        onAnnounceStart={() => announceStart(it)}
                        onRemove={() => removeItem(it)}
                      />
                    ))}
                    {dayItems.length === 0 && <p className="px-4 py-3 text-white/30 text-xs">Sem blocos.</p>}
                  </div>
                </SortableContext>
              </DndContext>

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

function SortableItemRow({ item, accent, isFirst, isLast, onToggleDone, onMoveUp, onMoveDown, onPatch, onTimeChange, onMakeCurrent, onAnnounceStart, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  function saveField(field, value) {
    const v = field === 'title' ? value.trim() : (value.trim() || null)
    const cur = item[field] ?? (field === 'description' ? null : '')
    if (v === cur) return
    if (field === 'title' && !v) return
    onPatch({ [field]: v })
  }

  return (
    <div ref={setNodeRef} style={style} className={`flex items-start gap-1.5 px-3 py-2 ${isDragging ? 'opacity-70 relative z-10 shadow-lg shadow-black/40' : ''} ${item.done ? 'bg-white/[0.03]' : 'bg-dark'}`}>
      <button
        {...attributes}
        {...listeners}
        title="Arraste para reordenar"
        className="mt-1 flex-shrink-0 w-5 h-6 rounded text-white/25 hover:text-white/60 cursor-grab active:cursor-grabbing touch-none leading-none"
      >
        ⠿
      </button>

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
        key={`time-${item.id}-${item.time}`}
        defaultValue={item.time || ''}
        onBlur={(e) => onTimeChange(item.time || '', e.target.value)}
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
        <button onClick={onMakeCurrent} className="w-6 h-6 rounded text-white/30 hover:text-cyan hover:bg-cyan/10 transition-colors" title="Tornar este o bloco atual">◉</button>
        <button onClick={onAnnounceStart} className="w-6 h-6 rounded text-white/30 hover:text-electric hover:bg-electric/10 transition-colors" title="Anunciar início aos participantes">▶️</button>
        <button onClick={onMoveUp} disabled={isFirst} className="w-6 h-6 rounded text-white/40 hover:text-white hover:bg-white/10 disabled:opacity-20 disabled:hover:bg-transparent transition-colors" title="Subir">↑</button>
        <button onClick={onMoveDown} disabled={isLast} className="w-6 h-6 rounded text-white/40 hover:text-white hover:bg-white/10 disabled:opacity-20 disabled:hover:bg-transparent transition-colors" title="Descer">↓</button>
        <button onClick={onRemove} className="w-6 h-6 rounded text-white/30 hover:text-hot hover:bg-hot/10 transition-colors" title="Excluir">✕</button>
      </div>
    </div>
  )
}

function AnnouncementBox({ current, history, onError, onChanged }) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  async function publish(text) {
    const t = (text ?? '').trim()
    if (!t || busy) return
    setBusy(true)
    const { error: err } = await supabase.rpc('set_announcement', { p_body: t })
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

  const recent = (history || []).filter((h) => h.id !== current?.id).slice(0, 4)

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

      <div className="flex flex-wrap gap-1.5 mb-3">
        {QUICK_ANNOUNCEMENTS.map((q) => (
          <button
            key={q}
            onClick={() => publish(q)}
            disabled={busy}
            className="text-xs px-2.5 py-1 rounded-full border border-gold/20 bg-gold/5 text-gold/80 hover:bg-gold/15 transition-colors disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') publish(body) }}
          placeholder="Escreva um aviso e pressione Enter…"
          className="flex-1 bg-dark/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/40"
        />
        <button onClick={() => publish(body)} disabled={busy || !body.trim()} className="rounded-lg border border-gold/40 bg-gold/15 text-gold font-semibold px-5 py-2 hover:bg-gold/25 transition-colors disabled:opacity-50">
          Publicar
        </button>
      </div>

      {recent.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] font-mono text-white/30 uppercase tracking-wider mb-2">Recentes</p>
          <ul className="space-y-1">
            {recent.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-white/50 truncate">{h.body}</span>
                <button onClick={() => publish(h.body)} disabled={busy} className="flex-shrink-0 text-xs font-mono text-cyan/60 hover:text-cyan disabled:opacity-50">re-enviar</button>
              </li>
            ))}
          </ul>
        </div>
      )}
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

function Pulse({ pulse }) {
  if (!pulse) return null
  return (
    <div className="card-glass rounded-2xl p-5">
      <p className="text-xs font-mono text-electric uppercase tracking-wider mb-3">Pulso do evento</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <PulseStat label="Presentes" value={pulse.present} total={pulse.confirmed} accent="cyan" />
        <PulseStat label="Entregaram Fase 1" value={pulse.fase1} total={pulse.teams} accent="electric" />
        <PulseStat label="Entregaram Fase 2" value={pulse.fase2} total={pulse.teams} accent="electric" />
        <PulseStat label="Entregaram Fase 3" value={pulse.fase3} total={pulse.teams} accent="violet" />
      </div>
    </div>
  )
}

function PulseStat({ label, value, total, accent }) {
  const a = accentOf(accent)
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className={`rounded-xl border ${a.border} ${a.soft} px-3 py-3`}>
      <p className="text-[10px] font-mono uppercase tracking-wider text-white/50 leading-tight">{label}</p>
      <p className="mt-1">
        <span className={`text-2xl font-bold ${a.text}`}>{value}</span>
        <span className="text-sm text-white/40">/{total}</span>
      </p>
      <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full ${a.dot}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// Fase atual de cada equipe, lida (read-only) do painel externo. Atualiza ~20s.
function TeamPhases() {
  const { getPhase, getUnmatched, externalList, aliases, aliasesLoaded, saveAliases, loading, error, lastUpdated } = useTeamPhases()
  const [names, setNames] = useState([])
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!supabase) return
    supabase.from('teams').select('name').order('name').then(({ data }) => {
      if (data) setNames(data.map((t) => t.name))
    })
  }, [])

  const orphans = useMemo(() => getUnmatched(names), [getUnmatched, names])
  const updatedLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null

  return (
    <div className="card-glass rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-mono text-cyan uppercase tracking-wider">Fases das equipes</p>
        <span className="text-[10px] font-mono text-white/30">
          {error ? 'offline — último valor' : updatedLabel ? `atualizado ${updatedLabel}` : ''}
        </span>
      </div>

      {loading && names.length === 0 ? (
        <p className="text-white/40 text-sm font-mono">Carregando fases...</p>
      ) : names.length === 0 ? (
        <p className="text-white/40 text-sm font-mono">Nenhuma equipe cadastrada.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {names.map((name) => (
            <div key={name} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5">
              <span className="text-sm text-white/80 truncate">{name}</span>
              <PhaseBadge phase={getPhase(name)} />
            </div>
          ))}
        </div>
      )}

      {orphans.length > 0 && (
        <p className="mt-3 text-[10px] font-mono text-white/30">
          No tracking externo sem par aqui: {orphans.join(', ')}
        </p>
      )}

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => setEditing(v => !v)}
          disabled={!aliasesLoaded}
          title={aliasesLoaded ? undefined : 'Carregando apelidos...'}
          className="text-[10px] font-mono text-white/40 hover:text-cyan transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {editing ? 'fechar' : '✎ ajustar apelidos'}
        </button>
      </div>
      {editing && aliasesLoaded && (
        <TeamPhaseAliasesEditor
          aliases={aliases}
          externalNames={externalList.map((e) => e.name)}
          hackiaNames={names}
          onSave={saveAliases}
        />
      )}
    </div>
  )
}

const TIMER_PRESETS = [
  { label: 'Pitch 3:00', sec: 180 },
  { label: 'Demo 1:00', sec: 60 },
  { label: 'Q&A 5:00', sec: 300 },
  { label: 'Teste jurados 1:00', sec: 60 },
  { label: 'Working 45:00', sec: 2700 },
  { label: 'Intervalo 15:00', sec: 900 },
]

// Beep curto no fim do timer (sem asset; via Web Audio, dentro de gesto do usuario).
function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g)
    g.connect(ctx.destination)
    o.type = 'sine'
    o.frequency.value = 880
    g.gain.setValueAtTime(0.25, ctx.currentTime)
    o.start()
    o.stop(ctx.currentTime + 0.6)
    o.onended = () => ctx.close()
  } catch { /* ignore */ }
}

// Cronometro manual (start/pausa/reset) com presets e modo ampliado para projetor.
function SessionTimer() {
  const [remaining, setRemaining] = useState(180)
  const [running, setRunning] = useState(false)
  const [last, setLast] = useState(180)
  const [big, setBig] = useState(false)
  const [mins, setMins] = useState('')

  useEffect(() => {
    if (!running) return
    const t = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) { setRunning(false); beep(); return 0 }
        return r - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [running])

  function setPreset(sec) { setRemaining(sec); setLast(sec); setRunning(false) }
  function reset() { setRemaining(last); setRunning(false) }
  function applyCustom() { const m = parseInt(mins, 10); if (m > 0) { setPreset(m * 60); setMins('') } }

  const mmss = `${pad2(Math.floor(remaining / 60))}:${pad2(remaining % 60)}`
  const danger = remaining === 0
  const warn = remaining > 0 && remaining <= 10
  const color = danger ? 'text-hot' : warn ? 'text-gold' : 'text-white'

  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={() => setRunning((v) => !v)} className="px-4 py-1.5 rounded-lg border border-cyan/40 bg-cyan/15 text-cyan text-sm font-semibold hover:bg-cyan/25 transition-colors">{running ? 'Pausar' : 'Iniciar'}</button>
      <button onClick={reset} className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-white/60 text-sm hover:text-white transition-colors">Resetar</button>
      <button onClick={() => setRemaining((r) => r + 60)} className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-white/60 text-sm hover:text-white transition-colors">+1min</button>
    </div>
  )

  return (
    <div className="card-glass rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-mono text-gold uppercase tracking-wider">Timer de pitch / sessão</p>
        <button onClick={() => setBig(true)} className="text-xs font-mono text-white/40 hover:text-white transition-colors">⤢ ampliar</button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <span className={`font-mono text-4xl font-bold tabular-nums ${color} ${danger ? 'animate-pulse' : ''}`}>{mmss}</span>
        {controls}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mt-3">
        {TIMER_PRESETS.map((p) => (
          <button key={p.label} onClick={() => setPreset(p.sec)} className="text-xs px-2.5 py-1 rounded-full border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 transition-colors">{p.label}</button>
        ))}
        <span className="inline-flex items-center gap-1">
          <input value={mins} onChange={(e) => setMins(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') applyCustom() }} placeholder="min" inputMode="numeric" className="w-14 bg-dark/60 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-white/30" />
          <button onClick={applyCustom} className="text-xs px-2 py-1 rounded border border-white/10 text-white/60 hover:text-white transition-colors">definir</button>
        </span>
      </div>

      {big && (
        <div className="fixed inset-0 z-[60] bg-dark/95 flex flex-col items-center justify-center gap-8 p-6">
          <span className={`font-mono font-bold tabular-nums ${color} ${danger ? 'animate-pulse' : ''}`} style={{ fontSize: 'min(38vw, 32vh)' }}>{mmss}</span>
          <div className="scale-150">{controls}</div>
          <button onClick={() => setBig(false)} className="absolute top-6 right-6 text-white/50 hover:text-white text-sm font-mono">fechar ✕</button>
        </div>
      )}
    </div>
  )
}
