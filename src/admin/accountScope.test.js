// src/admin/accountScope.test.js
import { describe, it, expect } from 'vitest'
import { buildScope } from './accountScope'

describe('buildScope', () => {
  it('returns {} when nothing is set (unrestricted)', () => {
    expect(buildScope()).toEqual({})
    expect(buildScope({ readOnly: false, allowedTabs: [] })).toEqual({})
  })
  it('includes read_only only when true', () => {
    expect(buildScope({ readOnly: true })).toEqual({ read_only: true })
  })
  it('includes trimmed, de-duped, non-empty tabs', () => {
    expect(buildScope({ allowedTabs: [' results ', 'results', '', 'payments'] }))
      .toEqual({ allowed_tabs: ['results', 'payments'] })
  })
  it('combines flags and tabs', () => {
    expect(buildScope({ readOnly: true, allowedTabs: ['results'] }))
      .toEqual({ read_only: true, allowed_tabs: ['results'] })
  })
})
