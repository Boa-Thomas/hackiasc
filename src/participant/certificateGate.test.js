import { describe, it, expect } from 'vitest'
import { gateState } from './certificateGate'

// base = caminho feliz (tudo verdadeiro); cada teste muda só o que importa.
const base = { loaded: true, eventEnded: true, submitted: true, surveyOpen: true }

describe('gateState', () => {
  it('mostra loading enquanto o status da pesquisa não carregou', () => {
    expect(gateState({ ...base, loaded: false })).toBe('loading')
  })

  it('trava por data enquanto o evento não terminou', () => {
    expect(gateState({ ...base, eventEnded: false, submitted: false })).toBe('locked_event')
  })

  it('libera quando o evento terminou E a pesquisa foi respondida', () => {
    expect(gateState({ ...base })).toBe('available')
  })

  it('pede a pesquisa: terminou, não respondeu, pesquisa aberta', () => {
    expect(gateState({ ...base, submitted: false, surveyOpen: true })).toBe('locked_survey')
  })

  it('avisa pesquisa encerrada: terminou, não respondeu, pesquisa fechada', () => {
    expect(gateState({ ...base, submitted: false, surveyOpen: false })).toBe('locked_survey_closed')
  })

  it('degradação pós-evento (erro/sem token) nunca libera → locked_survey_closed', () => {
    expect(gateState({ loaded: true, eventEnded: true, submitted: false, surveyOpen: false }))
      .toBe('locked_survey_closed')
  })
})
