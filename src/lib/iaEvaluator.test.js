import { describe, it, expect } from 'vitest'
import {
  DELIVERABLE_UNITS,
  UNIT_BY_ID,
  PITCH_AXES,
  pitchSpeechMetrics,
  buildDeliverablePrompt,
  parseDeliverableEvaluation,
  aggregateTeamEvaluation,
} from './iaEvaluator'

const TEAM = {
  name: 'Nimbus',
  hypotheses_canvas: { cliente_alvo: 'PMEs têxteis de Blumenau' },
  slc_ia_canvas: { camada_ia: 'GPT-4o, custo R$0,02/chamada' },
  learning_diary: [{ ciclo: 1, decisao: 'persevere' }],
  final_deliverables: { repo_url: 'https://github.com/x', deploy_url: 'https://x.app' },
}
const MEMBERS = [{ full_name: 'Ana', occupation_type: 'dev', is_team_leader: true, economic_axes: ['têxtil'], project_name: 'Nimbus AI' }]

describe('DELIVERABLE_UNITS', () => {
  it('tem 3 unidades com os critérios mapeados por fase', () => {
    expect(DELIVERABLE_UNITS.map(u => u.id)).toEqual(['fase1', 'fase2', 'fase3'])
    expect(UNIT_BY_ID.fase1.criteria).toEqual(['validacao_problema'])
    expect(UNIT_BY_ID.fase2.criteria).toEqual(['tecnica_ia', 'validacao_problema'])
    expect(UNIT_BY_ID.fase3.criteria).toEqual(['tecnica_ia', 'escala_negocio', 'pitch_equipe'])
  })
})

describe('buildDeliverablePrompt', () => {
  it('fase1: inclui só o critério Validação, campos de Hipóteses, sem pitch nem eliminatório', () => {
    const p = buildDeliverablePrompt({ unit: UNIT_BY_ID.fase1, team: TEAM, members: MEMBERS })
    expect(p).toContain('`validacao_problema`')
    expect(p).not.toContain('`tecnica_ia`')
    expect(p).toContain('Cliente-alvo')
    expect(p).not.toContain('ELIMINATÓRIO')
    expect(p).not.toContain('pitch / demo')
    expect(p).toContain('Nimbus')
  })

  it('fase3: inclui Técnica/Escala/Pitch, observações do pitch e o eliminatório', () => {
    const p = buildDeliverablePrompt({ unit: UNIT_BY_ID.fase3, team: TEAM, members: MEMBERS, pitchNotes: 'A IA rodou ao vivo' })
    expect(p).toContain('`tecnica_ia`')
    expect(p).toContain('`escala_negocio`')
    expect(p).toContain('`pitch_equipe`')
    expect(p).toContain('A IA rodou ao vivo')
    expect(p).toContain('ELIMINATÓRIO')
    expect(p).toContain('"eliminated"')
  })

  it('fase2: inclui o Diário e os 2 critérios', () => {
    const p = buildDeliverablePrompt({ unit: UNIT_BY_ID.fase2, team: TEAM, members: MEMBERS })
    expect(p).toContain('Diário de Aprendizado')
    expect(p).toContain('`tecnica_ia`')
    expect(p).toContain('`validacao_problema`')
  })
})

describe('parseDeliverableEvaluation', () => {
  it('fase2 válido: normaliza 2 notas, honra eliminated, calcula nota do entregável', () => {
    const json = JSON.stringify({
      scores: [
        { criterion_key: 'tecnica_ia', score: 60, justification: 'x' },
        { criterion_key: 'validacao_problema', score: 70 },
      ],
      eliminated: true, summary: 's', model: 'm',
    })
    const r = parseDeliverableEvaluation(json, UNIT_BY_ID.fase2)
    expect(r.scores).toHaveLength(2)
    expect(r.scores[0]).toMatchObject({ criterion_key: 'tecnica_ia', label: 'Execução Técnica e IA', weight: 30, score: 60 })
    expect(r.eliminated).toBe(true)
    expect(r.total_score).toBe(65)
    expect(r.model).toBe('m')
  })

  it('rejeita critério faltando', () => {
    const json = JSON.stringify({ scores: [{ criterion_key: 'tecnica_ia', score: 60 }] })
    expect(() => parseDeliverableEvaluation(json, UNIT_BY_ID.fase2)).toThrow(/Faltam critérios/)
  })

  it('rejeita critério fora do entregável', () => {
    const json = JSON.stringify({ scores: [
      { criterion_key: 'tecnica_ia', score: 60 },
      { criterion_key: 'validacao_problema', score: 70 },
      { criterion_key: 'escala_negocio', score: 80 },
    ] })
    expect(() => parseDeliverableEvaluation(json, UNIT_BY_ID.fase2)).toThrow(/fora deste entregável/)
  })

  it('rejeita nota fora de 0–100', () => {
    const json = JSON.stringify({ scores: [{ criterion_key: 'validacao_problema', score: 150 }] })
    expect(() => parseDeliverableEvaluation(json, UNIT_BY_ID.fase1)).toThrow(/0 a 100/)
  })

  it('fase1 ignora eliminated (não cobre o critério eliminatório)', () => {
    const json = JSON.stringify({ scores: [{ criterion_key: 'validacao_problema', score: 80 }], eliminated: true })
    const r = parseDeliverableEvaluation(json, UNIT_BY_ID.fase1)
    expect(r.eliminated).toBe(false)
    expect(r.total_score).toBe(80)
  })

  it('tolera cercas ```json```', () => {
    const json = '```json\n{ "scores": [{ "criterion_key": "validacao_problema", "score": 50 }] }\n```'
    const r = parseDeliverableEvaluation(json, UNIT_BY_ID.fase1)
    expect(r.scores[0].score).toBe(50)
  })
})

describe('aggregateTeamEvaluation', () => {
  const rows = [
    { deliverable: 'fase2', scores: [{ criterion_key: 'tecnica_ia', score: 60 }, { criterion_key: 'validacao_problema', score: 70 }], eliminated: false },
    { deliverable: 'fase3', scores: [{ criterion_key: 'tecnica_ia', score: 80 }, { criterion_key: 'escala_negocio', score: 90 }, { criterion_key: 'pitch_equipe', score: 50 }], eliminated: false },
  ]

  it('faz média entre fases e calcula o total ponderado do edital', () => {
    const agg = aggregateTeamEvaluation(rows)
    const tecnica = agg.criteria.find(c => c.key === 'tecnica_ia')
    expect(tecnica.score).toBe(70)
    expect(tecnica.contributors).toEqual(['fase2', 'fase3'])
    expect(agg.partial).toBe(false)
    expect(agg.scoredCriteria).toBe(4)
    expect(agg.total_score).toBe(71)
    expect(agg.eliminated).toBe(false)
  })

  it('marca parcial e total null quando faltam critérios', () => {
    const agg = aggregateTeamEvaluation([{ deliverable: 'fase1', scores: [{ criterion_key: 'validacao_problema', score: 90 }] }])
    expect(agg.partial).toBe(true)
    expect(agg.scoredCriteria).toBe(1)
    expect(agg.total_score).toBeNull()
  })

  it('eliminated = OR das unidades que cobrem o critério técnico', () => {
    const agg = aggregateTeamEvaluation([
      ...rows.slice(0, 1),
      { deliverable: 'fase3', scores: [{ criterion_key: 'tecnica_ia', score: 10 }, { criterion_key: 'escala_negocio', score: 90 }, { criterion_key: 'pitch_equipe', score: 50 }], eliminated: true },
    ])
    expect(agg.eliminated).toBe(true)
  })

  it('ignora linhas legadas sem deliverable', () => {
    const agg = aggregateTeamEvaluation([{ deliverable: null, scores: [{ criterion_key: 'tecnica_ia', score: 99 }] }])
    expect(agg.scoredCriteria).toBe(0)
  })
})

describe('PITCH_AXES (eixos da cláusula 5.3)', () => {
  it('tem os 3 eixos nomeados no edital, nesta ordem', () => {
    expect(PITCH_AXES.map(a => a.key)).toEqual([
      'consistencia_tecnica', 'tom_de_voz', 'viabilidade_mercadologica',
    ])
  })
  it('só a fase3 cobre os eixos', () => {
    expect(UNIT_BY_ID.fase3.hasAxes).toBe(true)
    expect(UNIT_BY_ID.fase1.hasAxes).toBeFalsy()
    expect(UNIT_BY_ID.fase2.hasAxes).toBeFalsy()
  })
})

describe('pitchSpeechMetrics', () => {
  it('calcula ritmo, pausa e fillers a partir de segments', () => {
    const segments = [
      { start: 0, end: 2, text: 'Nosso produto resolve né' },
      { start: 3, end: 5, text: 'um problema real tipo enorme' },
    ]
    const m = pitchSpeechMetrics(segments)
    expect(m.words).toBe(9)
    expect(m.durationSec).toBe(5)
    expect(m.fillerCount).toBe(2)
    expect(m.wordsPerMin).toBe(108)
    expect(m.avgPauseSec).toBe(1)
  })
  it('retorna null sem segments', () => {
    expect(pitchSpeechMetrics(null)).toBeNull()
    expect(pitchSpeechMetrics([])).toBeNull()
  })
  it('não quebra com 1 segmento (sem pausa)', () => {
    const m = pitchSpeechMetrics([{ start: 0, end: 4, text: 'oi tudo bem pessoal' }])
    expect(m.words).toBe(4)
    expect(m.avgPauseSec).toBe(0)
  })
})

describe('buildDeliverablePrompt (fase3 com transcrição e eixos)', () => {
  const TEAM3 = {
    ...TEAM,
    pitch_transcript: 'Boa noite, somos a Nimbus e usamos IA para o setor têxtil.',
    pitch_segments: [{ start: 0, end: 4, text: 'Boa noite somos a Nimbus' }],
  }
  it('injeta transcrição, métricas e os 3 eixos no schema', () => {
    const p = buildDeliverablePrompt({ unit: UNIT_BY_ID.fase3, team: TEAM3, members: MEMBERS })
    expect(p).toContain('Boa noite, somos a Nimbus')
    expect(p).toContain('palavras/min')
    expect(p).toContain('consistencia_tecnica')
    expect(p).toContain('tom_de_voz')
    expect(p).toContain('viabilidade_mercadologica')
    expect(p).toContain('"axes"')
  })
  it('sinaliza ausência de transcrição', () => {
    const p = buildDeliverablePrompt({ unit: UNIT_BY_ID.fase3, team: TEAM, members: MEMBERS })
    expect(p).toContain('sem transcrição do pitch')
  })
})

describe('parseDeliverableEvaluation (fase3 com eixos)', () => {
  const validFase3 = (over = {}) => JSON.stringify({
    scores: [
      { criterion_key: 'tecnica_ia', score: 70, justification: 'a' },
      { criterion_key: 'escala_negocio', score: 60, justification: 'b' },
      { criterion_key: 'pitch_equipe', score: 80, justification: 'c' },
    ],
    axes: {
      consistencia_tecnica: { score: 75, justification: 'ct' },
      tom_de_voz: { score: 65, justification: 'tv' },
      viabilidade_mercadologica: { score: 55, justification: 'vm' },
    },
    eliminated: false, summary: 's', model: 'm',
    ...over,
  })

  it('aceita scores + axes e normaliza os eixos', () => {
    const r = parseDeliverableEvaluation(validFase3(), UNIT_BY_ID.fase3)
    expect(r.scores).toHaveLength(3)
    expect(r.axes.map(a => a.key)).toEqual(['consistencia_tecnica', 'tom_de_voz', 'viabilidade_mercadologica'])
    expect(r.axes[0]).toMatchObject({ key: 'consistencia_tecnica', label: 'Consistência técnica', score: 75 })
  })

  it('rejeita eixo faltando', () => {
    const json = validFase3({ axes: { consistencia_tecnica: { score: 75 }, tom_de_voz: { score: 65 } } })
    expect(() => parseDeliverableEvaluation(json, UNIT_BY_ID.fase3)).toThrow(/eixo/i)
  })

  it('rejeita score de eixo fora de 0–100', () => {
    const json = validFase3({ axes: {
      consistencia_tecnica: { score: 120 }, tom_de_voz: { score: 65 }, viabilidade_mercadologica: { score: 55 },
    } })
    expect(() => parseDeliverableEvaluation(json, UNIT_BY_ID.fase3)).toThrow(/0 a 100/)
  })

  it('fase1/fase2 ignoram axes (não exigem nem retornam)', () => {
    const json = JSON.stringify({ scores: [{ criterion_key: 'validacao_problema', score: 80 }], axes: { foo: { score: 1 } } })
    const r = parseDeliverableEvaluation(json, UNIT_BY_ID.fase1)
    expect(r.axes).toBeUndefined()
  })
})
