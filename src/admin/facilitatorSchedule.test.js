import { describe, it, expect } from 'vitest'
import { flattenSchedule, computeNowNext, neighborToSwap } from './facilitatorSchedule'

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
