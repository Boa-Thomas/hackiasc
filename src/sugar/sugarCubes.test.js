import { describe, it, expect } from 'vitest'
import {
  MESSAGE_MAX,
  ORG_LABEL,
  validateMessage,
  isSelfCompliment,
  buildRecipientOptions,
  errorText,
} from './sugarCubes'

describe('validateMessage', () => {
  it('rejeita mensagem vazia ou só espaços', () => {
    expect(validateMessage('')).toEqual({ ok: false, error: 'message_required' })
    expect(validateMessage('   ')).toEqual({ ok: false, error: 'message_required' })
    expect(validateMessage(null)).toEqual({ ok: false, error: 'message_required' })
  })

  it('faz trim e aceita mensagem válida', () => {
    expect(validateMessage('  oi  ')).toEqual({ ok: true, value: 'oi' })
  })

  it('corta em MESSAGE_MAX caracteres', () => {
    const long = 'a'.repeat(MESSAGE_MAX + 50)
    const r = validateMessage(long)
    expect(r.ok).toBe(true)
    expect(r.value.length).toBe(MESSAGE_MAX)
  })
})

describe('isSelfCompliment', () => {
  it('detecta mesmo tipo e mesma ref', () => {
    expect(isSelfCompliment('participant', 'a', 'participant', 'a')).toBe(true)
  })
  it('organização → organização é auto-elogio (refs nulas)', () => {
    expect(isSelfCompliment('organization', null, 'organization', null)).toBe(true)
  })
  it('tipos ou refs diferentes não são auto-elogio', () => {
    expect(isSelfCompliment('participant', 'a', 'participant', 'b')).toBe(false)
    expect(isSelfCompliment('participant', 'a', 'mentor', 'a')).toBe(false)
  })
})

describe('buildRecipientOptions', () => {
  it('achata roster em opções com type/ref/name, organização incluída', () => {
    const opts = buildRecipientOptions({
      participants: [{ ref: 'p1', name: 'Ana' }],
      mentors: [{ ref: 'm1', name: 'Bia' }],
      organization: true,
    })
    expect(opts).toContainEqual({ type: 'organization', ref: null, name: ORG_LABEL })
    expect(opts).toContainEqual({ type: 'participant', ref: 'p1', name: 'Ana' })
    expect(opts).toContainEqual({ type: 'mentor', ref: 'm1', name: 'Bia' })
  })
  it('tolera roster vazio/parcial', () => {
    expect(buildRecipientOptions({}).length).toBe(1) // só organização
  })
})

describe('errorText', () => {
  it('traduz códigos conhecidos contidos na mensagem de erro', () => {
    expect(errorText('self_compliment')).toMatch(/si mesmo/i)
    expect(errorText('rate_limited')).toMatch(/aguarde/i)
    expect(errorText('message_required')).toMatch(/mensagem/i)
    expect(errorText('new row ... unauthorized')).toMatch(/sessão/i)
  })
  it('usa fallback para erro desconhecido', () => {
    expect(errorText('algo estranho')).toMatch(/não foi possível/i)
  })

  it('mapeia sessão expirada para a mensagem de sessão', () => {
    expect(errorText('payment_not_confirmed')).toMatch(/sessão/i)
    expect(errorText('invalid_or_expired_session')).toMatch(/sessão/i)
  })
})
