import { describe, it, expect } from 'vitest'
import { withScheduleStatus } from './participantSchedule'

// Cronograma no formato interno do participante (item.done vem de get_public_schedule).
const DAYS = [
  {
    day: 'Sexta',
    items: [
      { time: '18:30', activity: 'Coffee', done: true },
      { time: '19:00', activity: 'Abertura', done: true },
    ],
  },
  {
    day: 'Sábado',
    items: [
      { time: '09:00', activity: 'Café', done: false },
      { time: '10:00', activity: 'Hard 2', done: false },
    ],
  },
]

const statuses = (r) => r.days.flatMap((d) => d.items.map((it) => it.status))

describe('withScheduleStatus', () => {
  it('marca feitos, o primeiro nao-feito como atual e o resto futuro', () => {
    const r = withScheduleStatus(DAYS)
    expect(statuses(r)).toEqual(['done', 'done', 'current', 'upcoming'])
    expect(r.currentDayIndex).toBe(1)
  })

  it('antes do evento (nada feito): primeiro bloco e o atual', () => {
    const r = withScheduleStatus([
      { day: 'Sexta', items: [{ time: '18:30', activity: 'Coffee' }, { time: '19:00', activity: 'Abertura' }] },
    ])
    expect(statuses(r)).toEqual(['current', 'upcoming'])
    expect(r.currentDayIndex).toBe(0)
  })

  it('evento encerrado (tudo feito): nenhum atual, tudo feito', () => {
    const allDone = DAYS.map((d) => ({ ...d, items: d.items.map((it) => ({ ...it, done: true })) }))
    const r = withScheduleStatus(allDone)
    expect(statuses(r)).toEqual(['done', 'done', 'done', 'done'])
    expect(r.currentDayIndex).toBe(-1)
  })

  it('itens feitos depois do atual contam como futuro (exibicao contigua)', () => {
    const gappy = [
      { day: 'Sexta', items: [{ time: '18:30', activity: 'a', done: true }, { time: '19:00', activity: 'b', done: false }, { time: '20:00', activity: 'c', done: true }] },
    ]
    const r = withScheduleStatus(gappy)
    expect(statuses(r)).toEqual(['done', 'current', 'upcoming'])
  })

  it('e tolerante a entrada vazia ou itens ausentes', () => {
    expect(withScheduleStatus(null)).toEqual({ days: [], currentDayIndex: -1 })
    const r = withScheduleStatus([{ day: 'X' }])
    expect(r.days[0].items).toEqual([])
    expect(r.currentDayIndex).toBe(-1)
  })
})
