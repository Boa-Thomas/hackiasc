import { describe, it, expect } from 'vitest'
import { densityFor, sortPainsForPhase } from './wallLayout'

describe('densityFor', () => {
  it('usa 3 colunas e fonte grande para poucas dores', () => {
    expect(densityFor(1).cols).toBe(3)
    expect(densityFor(12).cols).toBe(3)
  })
  it('escala colunas conforme a quantidade', () => {
    expect(densityFor(13).cols).toBe(4)
    expect(densityFor(24).cols).toBe(4)
    expect(densityFor(25).cols).toBe(5)
    expect(densityFor(40).cols).toBe(5)
    expect(densityFor(41).cols).toBe(6)
    expect(densityFor(200).cols).toBe(6)
  })
  it('devolve uma classe de titulo (string nao vazia) em cada faixa', () => {
    for (const n of [1, 13, 25, 41]) {
      expect(typeof densityFor(n).titleClass).toBe('string')
      expect(densityFor(n).titleClass.length).toBeGreaterThan(0)
    }
  })
})

describe('sortPainsForPhase', () => {
  const pains = [
    { id: 'a', created_at: '2026-05-30T10:00:00Z', vote_count: 1 },
    { id: 'b', created_at: '2026-05-30T10:01:00Z', vote_count: 5 },
    { id: 'c', created_at: '2026-05-30T10:02:00Z', vote_count: 3 },
  ]
  it('ordena por criacao (estavel) fora de results', () => {
    expect(sortPainsForPhase(pains, 'wall_open').map(p => p.id)).toEqual(['a', 'b', 'c'])
    expect(sortPainsForPhase(pains, 'voting_open').map(p => p.id)).toEqual(['a', 'b', 'c'])
  })
  it('ordena por votos desc (desempate por criacao) em results', () => {
    expect(sortPainsForPhase(pains, 'results').map(p => p.id)).toEqual(['b', 'c', 'a'])
  })
  it('nao muta o array recebido', () => {
    const copy = [...pains]
    sortPainsForPhase(pains, 'results')
    expect(pains).toEqual(copy)
  })
})
