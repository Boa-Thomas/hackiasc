import { describe, it, expect } from 'vitest'
import { isIOS, isStandalone, urlBase64ToUint8Array, shouldShowPrompt } from './push'

describe('isIOS', () => {
  it('detects iPhone', () => {
    expect(isIOS('Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X)')).toBe(true)
  })
  it('false on Android', () => {
    expect(isIOS('Mozilla/5.0 (Linux; Android 13)')).toBe(false)
  })
})

describe('urlBase64ToUint8Array', () => {
  it('decodes base64url to Uint8Array', () => {
    const out = urlBase64ToUint8Array('BBBB')
    expect(out).toBeInstanceOf(Uint8Array)
    expect(out.length).toBeGreaterThan(0)
  })
})

describe('shouldShowPrompt', () => {
  it('shows when permission=default and no snooze', () => {
    expect(shouldShowPrompt('default', 0, 1000)).toBe(true)
  })
  it('hidden when granted', () => {
    expect(shouldShowPrompt('granted', 0, 1000)).toBe(false)
  })
  it('hidden when denied', () => {
    expect(shouldShowPrompt('denied', 0, 1000)).toBe(false)
  })
  it('respects active snooze', () => {
    const now = 1000000
    expect(shouldShowPrompt('default', now + 60000, now)).toBe(false)
  })
  it('shows after snooze expires', () => {
    const now = 1000000
    expect(shouldShowPrompt('default', now - 1, now)).toBe(true)
  })
})

describe('isStandalone', () => {
  it('true when navigator.standalone', () => {
    expect(isStandalone({ standalone: true }, () => false)).toBe(true)
  })
  it('true when matchMedia standalone', () => {
    expect(isStandalone({}, (q) => q.includes('standalone'))).toBe(true)
  })
  it('false otherwise', () => {
    expect(isStandalone({}, () => false)).toBe(false)
  })
})
