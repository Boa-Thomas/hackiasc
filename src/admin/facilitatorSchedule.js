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
