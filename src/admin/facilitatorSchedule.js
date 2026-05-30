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
