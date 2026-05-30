import { describe, it, expect } from 'vitest'
import { cleanIdeaDescription, IDEA_MAX_LENGTH } from './teamIdea'

describe('cleanIdeaDescription', () => {
  it('trims surrounding whitespace', () => {
    expect(cleanIdeaDescription('  hello  ')).toEqual({ value: 'hello', error: null })
  })

  it('maps empty / whitespace-only / nullish to null', () => {
    expect(cleanIdeaDescription('   ')).toEqual({ value: null, error: null })
    expect(cleanIdeaDescription('')).toEqual({ value: null, error: null })
    expect(cleanIdeaDescription(null)).toEqual({ value: null, error: null })
    expect(cleanIdeaDescription(undefined)).toEqual({ value: null, error: null })
  })

  it('accepts exactly the max length (after trim)', () => {
    const s = 'a'.repeat(IDEA_MAX_LENGTH)
    expect(cleanIdeaDescription(s)).toEqual({ value: s, error: null })
  })

  it('rejects over the max length', () => {
    const s = 'a'.repeat(IDEA_MAX_LENGTH + 1)
    expect(cleanIdeaDescription(s)).toEqual({ value: null, error: 'idea_too_long' })
  })
})
