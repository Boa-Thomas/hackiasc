import { describe, it, expect } from 'vitest'
import { scoreTone, toneClasses } from './aiEvalDisplay'

describe('scoreTone', () => {
  it('classifica por faixa: hi >=75, mid 50-74, lo <50', () => {
    expect(scoreTone(75)).toBe('hi')
    expect(scoreTone(100)).toBe('hi')
    expect(scoreTone(74)).toBe('mid')
    expect(scoreTone(50)).toBe('mid')
    expect(scoreTone(49)).toBe('lo')
    expect(scoreTone(0)).toBe('lo')
  })

  it('aceita string numérica', () => {
    expect(scoreTone('80')).toBe('hi')
  })

  it('devolve null para ausência/valor inválido', () => {
    expect(scoreTone(null)).toBeNull()
    expect(scoreTone(undefined)).toBeNull()
    expect(scoreTone(NaN)).toBeNull()
    expect(scoreTone('abc')).toBeNull()
  })
})

describe('toneClasses', () => {
  it('mapeia a nota para classes Tailwind de texto e barra', () => {
    expect(toneClasses(90)).toEqual({ text: 'text-cyan', bar: 'bg-cyan' })
    expect(toneClasses(60)).toEqual({ text: 'text-gold', bar: 'bg-gold' })
    expect(toneClasses(30)).toEqual({ text: 'text-hot', bar: 'bg-hot' })
  })

  it('usa fallback neutro quando não há nota', () => {
    expect(toneClasses(null)).toEqual({ text: 'text-text-muted', bar: 'bg-white/20' })
  })
})
