import { describe, it, expect } from 'vitest'
import {
  EVALUATION_DIMENSIONS,
  dimensionsFor,
  validateScores,
  EVAL_MIN,
  EVAL_MAX,
} from './evaluationDimensions'

describe('dimensionsFor', () => {
  it('participante recebe todas as dimensões (inclui mentorship)', () => {
    const keys = dimensionsFor('participant').map(d => d.key)
    expect(keys).toContain('mentorship')
    expect(keys.length).toBe(EVALUATION_DIMENSIONS.length)
  })

  it('mentor não recebe mentorship', () => {
    const keys = dimensionsFor('mentor').map(d => d.key)
    expect(keys).not.toContain('mentorship')
    expect(keys.length).toBe(EVALUATION_DIMENSIONS.length - 1)
  })
})

describe('validateScores', () => {
  it('mantém só as chaves permitidas e omite ausentes', () => {
    const { value, error } = validateScores({ venue: 8, bogus: 5 }, 'participant')
    expect(error).toBe(null)
    expect(value).toEqual({ venue: 8 })
  })

  it('rejeita mentorship vindo de um mentor', () => {
    const { value } = validateScores({ mentorship: 9, food: 7 }, 'mentor')
    expect(value).toEqual({ food: 7 })
  })

  it('aceita meio ponto (step 0,5)', () => {
    expect(validateScores({ food: 7.5 }, 'participant')).toEqual({ value: { food: 7.5 }, error: null })
  })

  it('omite notas vazias / nulas (não viram 0)', () => {
    expect(validateScores({ food: '', venue: null }, 'participant')).toEqual({ value: {}, error: null })
  })

  it('rejeita fora da faixa', () => {
    expect(validateScores({ food: 11 }, 'participant')).toEqual({ value: null, error: 'score_out_of_range' })
    expect(validateScores({ food: -1 }, 'participant')).toEqual({ value: null, error: 'score_out_of_range' })
  })

  it('rejeita step inválido (ex: 7,3)', () => {
    expect(validateScores({ food: 7.3 }, 'participant')).toEqual({ value: null, error: 'invalid_step' })
  })

  it('rejeita valor não-numérico', () => {
    expect(validateScores({ food: 'abc' }, 'participant')).toEqual({ value: null, error: 'invalid_score' })
  })

  it('expõe a faixa da escala', () => {
    expect(EVAL_MIN).toBe(0)
    expect(EVAL_MAX).toBe(10)
  })
})
