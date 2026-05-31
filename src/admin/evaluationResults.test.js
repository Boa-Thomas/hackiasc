import { describe, it, expect } from 'vitest'
import { aggregateResults } from './evaluationResults'

describe('aggregateResults', () => {
  it('conta respostas por tipo', () => {
    const r = aggregateResults([
      { respondent_type: 'participant', scores: { venue: 8 } },
      { respondent_type: 'participant', scores: { venue: 6 } },
      { respondent_type: 'mentor', scores: { venue: 10 } },
    ])
    expect(r.participant.count).toBe(2)
    expect(r.mentor.count).toBe(1)
  })

  it('média por dimensão com 1 casa decimal, ignorando ausentes', () => {
    const r = aggregateResults([
      { respondent_type: 'participant', scores: { venue: 8, food: 7 } },
      { respondent_type: 'participant', scores: { venue: 5 } },
    ])
    expect(r.participant.dims.venue).toEqual({ avg: 6.5, count: 2 })
    expect(r.participant.dims.food).toEqual({ avg: 7, count: 1 })
  })

  it('dimensão sem nenhuma nota não aparece', () => {
    const r = aggregateResults([{ respondent_type: 'mentor', scores: { venue: 9 } }])
    expect(r.mentor.dims.food).toBeUndefined()
  })

  it('ignora linhas de tipo desconhecido e lista vazia', () => {
    expect(aggregateResults([{ respondent_type: 'alien', scores: { venue: 9 } }]).participant.count).toBe(0)
    expect(aggregateResults([]).participant.count).toBe(0)
    expect(aggregateResults(null).mentor.count).toBe(0)
  })
})
