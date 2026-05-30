import { describe, it, expect } from 'vitest'
import { flattenSchedule, computeNowNext, neighborToSwap, parseTime, formatTime, cascadeShift } from './facilitatorSchedule'

const DAYS = [
  { day_key: 'sat', label: 'Sab', sort_order: 20 },
  { day_key: 'fri', label: 'Sex', sort_order: 10 },
]

// Itens fora de ordem de proposito para garantir que a ordenacao funciona.
const ITEMS = [
  { id: 'b', day_key: 'fri', sort_order: 20, title: 'Abertura', done: true },
  { id: 'a', day_key: 'fri', sort_order: 10, title: 'Coffee', done: true },
  { id: 'd', day_key: 'sat', sort_order: 20, title: 'Hard 2', done: false },
  { id: 'c', day_key: 'sat', sort_order: 10, title: 'Cafe', done: false },
]

describe('flattenSchedule', () => {
  it('ordena por dia e depois por item, anexando o dia', () => {
    const flat = flattenSchedule(DAYS, ITEMS)
    expect(flat.map((it) => it.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(flat[0].day.day_key).toBe('fri')
    expect(flat[2].day.day_key).toBe('sat')
  })

  it('ignora itens de dias inexistentes', () => {
    const flat = flattenSchedule(DAYS, [...ITEMS, { id: 'x', day_key: 'sun', sort_order: 10, done: false }])
    expect(flat.map((it) => it.id)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('computeNowNext', () => {
  it('agora = primeiro nao-feito; proximo = o seguinte', () => {
    const r = computeNowNext(DAYS, ITEMS)
    expect(r.current.id).toBe('c')
    expect(r.next.id).toBe('d')
    expect(r.doneCount).toBe(2)
    expect(r.total).toBe(4)
    expect(r.finished).toBe(false)
  })

  it('proximo nulo quando o atual e o ultimo', () => {
    const items = ITEMS.map((it) => (it.id === 'd' ? it : { ...it, done: true }))
    const r = computeNowNext(DAYS, items)
    expect(r.current.id).toBe('d')
    expect(r.next).toBeNull()
  })

  it('finished quando tudo esta feito', () => {
    const items = ITEMS.map((it) => ({ ...it, done: true }))
    const r = computeNowNext(DAYS, items)
    expect(r.current).toBeNull()
    expect(r.next).toBeNull()
    expect(r.finished).toBe(true)
  })

  it('cronograma vazio nao quebra nem fica finished', () => {
    const r = computeNowNext([], [])
    expect(r).toEqual({ current: null, next: null, doneCount: 0, total: 0, finished: false })
  })
})

describe('neighborToSwap', () => {
  it('move para cima troca com o anterior do mesmo dia', () => {
    const pair = neighborToSwap(ITEMS, 'sat', 'd', 'up')
    expect(pair.map((it) => it.id)).toEqual(['d', 'c'])
  })

  it('move para baixo troca com o proximo do mesmo dia', () => {
    const pair = neighborToSwap(ITEMS, 'sat', 'c', 'down')
    expect(pair.map((it) => it.id)).toEqual(['c', 'd'])
  })

  it('null nas bordas', () => {
    expect(neighborToSwap(ITEMS, 'sat', 'c', 'up')).toBeNull()
    expect(neighborToSwap(ITEMS, 'sat', 'd', 'down')).toBeNull()
  })

  it('null para item inexistente', () => {
    expect(neighborToSwap(ITEMS, 'sat', 'zzz', 'up')).toBeNull()
  })
})

describe('parseTime / formatTime', () => {
  it('parseia HH:MM, HHhMM, HHh, HH', () => {
    expect(parseTime('21:30')).toBe(1290)
    expect(parseTime('21h30')).toBe(1290)
    expect(parseTime('9h')).toBe(540)
    expect(parseTime('09')).toBe(540)
  })

  it('retorna null para textual / vazio / invalido', () => {
    expect(parseTime('madrugada')).toBeNull()
    expect(parseTime('')).toBeNull()
    expect(parseTime(null)).toBeNull()
    expect(parseTime('25:00')).toBeNull()
    expect(parseTime('10:75')).toBeNull()
  })

  it('formata minutos com mod 24h', () => {
    expect(formatTime(1290)).toBe('21:30')
    expect(formatTime(540)).toBe('09:00')
    expect(formatTime(1500)).toBe('01:00') // 25:00 -> 01:00
  })
})

describe('cascadeShift', () => {
  const DAY = [
    { id: 'a', day_key: 'fri', sort_order: 10, time: '19:00' },
    { id: 'b', day_key: 'fri', sort_order: 20, time: '20:00' },
    { id: 'c', day_key: 'fri', sort_order: 30, time: '21:00' },
    { id: 'd', day_key: 'fri', sort_order: 40, time: 'madrugada' },
    { id: 'e', day_key: 'fri', sort_order: 50, time: '23:00' },
    { id: 'z', day_key: 'sat', sort_order: 10, time: '09:00' },
  ]

  it('desloca os seguintes do mesmo dia pelo delta (exemplo do usuario)', () => {
    // 'b' de 20:00 -> 21:30 (delta +1:30). 'c' 21:00 -> 22:30.
    const r = cascadeShift(DAY, 'fri', 'b', '20:00', '21:30')
    expect(r.delta).toBe(90)
    expect(r.updates).toEqual([
      { id: 'c', time: '22:30' },
      { id: 'e', time: '00:30' }, // 23:00 + 1:30 -> 00:30 (mod 24h)
    ])
    // 'd' (madrugada) foi pulado; 'a' (anterior) e 'z' (outro dia) intactos.
  })

  it('delta negativo desloca para tras', () => {
    const r = cascadeShift(DAY, 'fri', 'a', '19:00', '18:30')
    expect(r.delta).toBe(-30)
    expect(r.updates).toEqual([
      { id: 'b', time: '19:30' },
      { id: 'c', time: '20:30' },
      { id: 'e', time: '22:30' },
    ])
  })

  it('sem cascata quando horario novo/antigo nao parseia ou delta zero', () => {
    expect(cascadeShift(DAY, 'fri', 'b', '20:00', 'depois').updates).toEqual([])
    expect(cascadeShift(DAY, 'fri', 'b', '20:00', '20:00').updates).toEqual([])
    expect(cascadeShift(DAY, 'fri', 'd', 'madrugada', '02:00').updates).toEqual([])
  })

  it('ultimo bloco do dia nao tem seguintes', () => {
    expect(cascadeShift(DAY, 'fri', 'e', '23:00', '23:30').updates).toEqual([])
  })
})
