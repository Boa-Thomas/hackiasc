// Logica pura do destaque "voce esta aqui" no cronograma do participante.
// O ponteiro vem da facilitadora: get_public_schedule expoe `done` por item.
// Regra (espelha computeNowNext do cockpit): em ordem cronologica global,
// o primeiro item nao-feito e o "atual"; os anteriores sao "feitos"; os
// demais "futuros" (inclusive eventuais feitos apos o atual — exibicao
// contigua). Sem React, testavel.
//
// Entrada: dias no formato interno do participante
//   [{ day, window, accent, note, items: [{ time, activity, done }] }]
// Saida: { days: [...mesmos dias com item.status], currentDayIndex }
//   status: 'done' | 'current' | 'upcoming'
//   currentDayIndex: indice do dia que contem o bloco atual, ou -1 (tudo feito).
export function withScheduleStatus(days) {
  const list = Array.isArray(days) ? days : []
  let foundCurrent = false
  let currentDayIndex = -1
  const tagged = list.map((day, di) => ({
    ...day,
    items: (day.items || []).map((item) => {
      let status
      if (foundCurrent) {
        status = 'upcoming'
      } else if (item.done) {
        status = 'done'
      } else {
        status = 'current'
        foundCurrent = true
        currentDayIndex = di
      }
      return { ...item, status }
    }),
  }))
  return { days: tagged, currentDayIndex }
}
