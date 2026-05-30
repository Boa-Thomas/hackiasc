import { describe, it, expect } from 'vitest'
import { buildFaseScoreRows } from './aiScores'

describe('buildFaseScoreRows', () => {
  it('devolve sempre as 3 fases na ordem, com null para fase sem nota', () => {
    const rows = buildFaseScoreRows([{ deliverable: 'fase1', total_score: 68 }])
    expect(rows.map(r => r.id)).toEqual(['fase1', 'fase2', 'fase3'])
    expect(rows[0].score).toBe(68)
    expect(rows[1].score).toBeNull()
    expect(rows[2].score).toBeNull()
  })

  it('arredonda e limita a nota entre 0 e 100', () => {
    const rows = buildFaseScoreRows([
      { deliverable: 'fase1', total_score: 72.4 },
      { deliverable: 'fase2', total_score: 150 },
      { deliverable: 'fase3', total_score: -5 },
    ])
    expect(rows[0].score).toBe(72)
    expect(rows[1].score).toBe(100)
    expect(rows[2].score).toBe(0)
  })

  it('trata entrada vazia/nula e ignora itens invalidos', () => {
    expect(buildFaseScoreRows(null).every(r => r.score === null)).toBe(true)
    expect(buildFaseScoreRows([]).every(r => r.score === null)).toBe(true)
    const rows = buildFaseScoreRows([
      { deliverable: 'fase2', total_score: null },
      { deliverable: 'fase1', total_score: 50 },
    ])
    expect(rows[0].score).toBe(50)
    expect(rows[1].score).toBeNull()
  })
})
