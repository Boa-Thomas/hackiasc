import { describe, it, expect } from 'vitest'
import { parseAccessToken, routeForRole, isExchangeRole } from '../src/lib/grantRouting.js'

describe('parseAccessToken', () => {
  it('extracts the token from a #acesso hash', () => {
    expect(parseAccessToken('#acesso?t=abc123')).toBe('abc123')
  })
  it('returns null when absent', () => {
    expect(parseAccessToken('#admin')).toBeNull()
    expect(parseAccessToken('#acesso')).toBeNull()
  })
})

describe('routeForRole', () => {
  it('maps roles to panel hashes', () => {
    expect(routeForRole('admin')).toBe('#admin')
    expect(routeForRole('viewer')).toBe('#admin')
    expect(routeForRole('checkin')).toBe('#admin')
    expect(routeForRole('staff')).toBe('#admin')
    expect(routeForRole('facilitator')).toBe('#facilitador')
    expect(routeForRole('mentor')).toBe('#mentor')
    expect(routeForRole('juror')).toBe('#jurado')
  })
  it('returns null for unknown roles', () => {
    expect(routeForRole('nope')).toBeNull()
  })
})

describe('isExchangeRole', () => {
  it('classifies JWT vs rpc-token personas', () => {
    expect(isExchangeRole('staff')).toBe(true)
    expect(isExchangeRole('facilitator')).toBe(true)
    expect(isExchangeRole('mentor')).toBe(false)
    expect(isExchangeRole('juror')).toBe(false)
  })
})
