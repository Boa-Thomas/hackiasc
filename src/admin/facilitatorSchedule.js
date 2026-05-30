// Logica pura do cronograma da facilitadora — sem React, testavel.
// Os dias e itens vem do banco (schedule_days / schedule_items). O bloco
// "Agora" e derivado: e o primeiro item ainda nao marcado como feito, na
// ordem cronologica global (dias por sort_order, depois itens por sort_order).
// Dar check num item avanca o ponteiro naturalmente — sem estado "current".

// Ordena dias + itens e devolve uma lista plana cronologica. Cada item ganha
// uma referencia ao seu dia em `day`.
export function flattenSchedule(days, items) {
  const sortedDays = [...days].sort((a, b) => a.sort_order - b.sort_order)
  const dayIndex = new Map(sortedDays.map((d, i) => [d.day_key, i]))
  return [...items]
    .filter((it) => dayIndex.has(it.day_key))
    .sort((a, b) => {
      const da = dayIndex.get(a.day_key)
      const db = dayIndex.get(b.day_key)
      if (da !== db) return da - db
      return a.sort_order - b.sort_order
    })
    .map((it) => ({ ...it, day: sortedDays[dayIndex.get(it.day_key)] }))
}

// Bloco atual (primeiro nao-feito) + proximo. `finished` quando tudo esta feito.
export function computeNowNext(days, items) {
  const flat = flattenSchedule(days, items)
  const total = flat.length
  const doneCount = flat.filter((it) => it.done).length
  const currentIndex = flat.findIndex((it) => !it.done)
  const current = currentIndex === -1 ? null : flat[currentIndex]
  const next = currentIndex === -1 ? null : flat[currentIndex + 1] ?? null
  return { current, next, doneCount, total, finished: total > 0 && currentIndex === -1 }
}

// Para reordenar com botoes ↑/↓: devolve o par de itens [arrastado, vizinho]
// cujos sort_order devem ser trocados, ou null se nao houver vizinho na direcao.
export function neighborToSwap(items, dayKey, itemId, direction) {
  const inDay = items
    .filter((it) => it.day_key === dayKey)
    .sort((a, b) => a.sort_order - b.sort_order)
  const idx = inDay.findIndex((it) => it.id === itemId)
  if (idx === -1) return null
  const target = direction === 'up' ? idx - 1 : idx + 1
  if (target < 0 || target >= inDay.length) return null
  return [inDay[idx], inDay[target]]
}

// "HH:MM" (ou "HHhMM"/"HHh"/"HH") -> minutos desde 00:00, ou null se nao parseavel.
export function parseTime(t) {
  if (!t) return null
  const s = String(t).trim()
  let m = s.match(/^(\d{1,2})[:h](\d{2})$/)
  if (m) {
    const h = +m[1]
    const mn = +m[2]
    return h < 24 && mn < 60 ? h * 60 + mn : null
  }
  m = s.match(/^(\d{1,2})h?$/)
  if (m) {
    const h = +m[1]
    return h < 24 ? h * 60 : null
  }
  return null
}

// minutos -> "HH:MM" (mod 24h, pois o evento entra pela madrugada).
export function formatTime(min) {
  const v = ((Math.round(min) % 1440) + 1440) % 1440
  const h = Math.floor(v / 60)
  const mn = v % 60
  return `${String(h).padStart(2, '0')}:${String(mn).padStart(2, '0')}`
}

// Ao mudar o horario de um bloco, calcula o deslocamento dos blocos SEGUINTES
// do MESMO dia pelo mesmo delta (mantendo os intervalos). Blocos com horario
// nao parseavel (texto) sao pulados. Retorna { delta (min) | null, updates:[{id,time}] }.
export function cascadeShift(items, dayKey, editedId, oldTime, newTime) {
  const oldM = parseTime(oldTime)
  const newM = parseTime(newTime)
  if (oldM === null || newM === null) return { delta: null, updates: [] }
  const delta = newM - oldM
  if (delta === 0) return { delta: 0, updates: [] }

  const inDay = items
    .filter((it) => it.day_key === dayKey)
    .sort((a, b) => a.sort_order - b.sort_order)
  const idx = inDay.findIndex((it) => it.id === editedId)
  if (idx === -1) return { delta, updates: [] }

  const updates = []
  for (const it of inDay.slice(idx + 1)) {
    const m = parseTime(it.time)
    if (m === null) continue
    updates.push({ id: it.id, time: formatTime(m + delta) })
  }
  return { delta, updates }
}

// Reordena um bloco dentro do dia via drag (active solto sobre over) e reatribui
// sort_order em passos de 10. Retorna so os itens cujo sort_order mudou.
export function reorderByDrag(items, dayKey, activeId, overId) {
  if (activeId === overId) return []
  const inDay = items.filter((it) => it.day_key === dayKey).sort((a, b) => a.sort_order - b.sort_order)
  const from = inDay.findIndex((it) => it.id === activeId)
  const to = inDay.findIndex((it) => it.id === overId)
  if (from === -1 || to === -1) return []
  const reordered = [...inDay]
  const [moved] = reordered.splice(from, 1)
  reordered.splice(to, 0, moved)
  const updates = []
  reordered.forEach((it, idx) => {
    const so = (idx + 1) * 10
    if (it.sort_order !== so) updates.push({ id: it.id, sort_order: so })
  })
  return updates
}

// Torna um bloco o "atual": marca todos os anteriores (ordem cronologica global)
// como feitos e o alvo + seguintes como nao-feitos. Retorna so o que muda
// (sem done_at — o chamador preenche o timestamp ao aplicar).
export function markAsCurrent(days, items, targetId) {
  const flat = flattenSchedule(days, items)
  const idx = flat.findIndex((it) => it.id === targetId)
  if (idx === -1) return []
  const updates = []
  flat.forEach((it, i) => {
    const shouldDone = i < idx
    if (it.done !== shouldDone) updates.push({ id: it.id, done: shouldDone })
  })
  return updates
}

// Pulso do evento: presentes (check-in) vs confirmados e entregas por fase.
// Espelha o "preenchido" do AdminDeliverables. Puro/testavel.
export function computePulse(registrations, teams) {
  const regs = registrations || []
  const confirmed = regs.filter((r) => r.payment_status === 'confirmed')
  const present = confirmed.filter((r) => r.checked_in_at).length
  const activeTeamIds = new Set(regs.filter((r) => r.team_id && r.payment_status !== 'cancelled').map((r) => r.team_id))
  const activeTeams = (teams || []).filter((t) => activeTeamIds.has(t.id))

  const filledObj = (o) => !!o && typeof o === 'object' && Object.values(o).some((v) => v != null && String(v).trim() !== '')
  const diaryFilled = (d) => (Array.isArray(d) ? d.length > 0 : filledObj(d))

  let fase1 = 0
  let fase2 = 0
  let fase3 = 0
  for (const t of activeTeams) {
    if (filledObj(t.hypotheses_canvas)) fase1 += 1
    if (filledObj(t.slc_ia_canvas) || diaryFilled(t.learning_diary)) fase2 += 1
    if (filledObj(t.final_deliverables)) fase3 += 1
  }
  return { present, confirmed: confirmed.length, teams: activeTeams.length, fase1, fase2, fase3 }
}
