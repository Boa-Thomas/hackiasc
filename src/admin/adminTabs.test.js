// src/admin/adminTabs.test.js
import { describe, it, expect } from 'vitest'
import { ALL_TABS, tabsForRole, tabsForScope } from './adminTabs'

const ids = (tabs) => tabs.map((t) => t.id)

describe('tabsForRole', () => {
  it('admin sees every tab', () => {
    expect(tabsForRole('admin')).toHaveLength(ALL_TABS.length)
  })
  it('viewer sees only non-adminOnly tabs', () => {
    expect(ids(tabsForRole('viewer'))).not.toContain('mentors')
    expect(ids(tabsForRole('viewer'))).toContain('registrations')
    expect(tabsForRole('viewer').every((t) => !t.adminOnly)).toBe(true)
  })
  it('checkin sees only check-in', () => {
    expect(ids(tabsForRole('checkin'))).toEqual(['checkin'])
  })
  it('staff sees wall + check-in', () => {
    expect(ids(tabsForRole('staff')).sort()).toEqual(['checkin', 'wall'])
  })
})

describe('tabsForScope', () => {
  const roleTabs = tabsForRole('admin')

  it('empty/absent allowed_tabs => unrestricted', () => {
    expect(tabsForScope(roleTabs, null)).toBe(roleTabs)
    expect(tabsForScope(roleTabs, {})).toBe(roleTabs)
    expect(tabsForScope(roleTabs, { allowed_tabs: [] })).toBe(roleTabs)
    expect(tabsForScope(roleTabs, { read_only: true })).toBe(roleTabs) // read_only doesn't narrow tabs
  })

  it('restricts to the allowed ∩ role tabs', () => {
    expect(ids(tabsForScope(roleTabs, { allowed_tabs: ['dashboard', 'access'] })))
      .toEqual(['dashboard', 'access'])
  })

  it('unknown entries are no-ops (ignored, not blanked)', () => {
    expect(ids(tabsForScope(roleTabs, { allowed_tabs: ['dashboard', 'not-a-real-tab'] })))
      .toEqual(['dashboard'])
  })

  it('all-unknown allowed_tabs => treated as unrestricted', () => {
    expect(tabsForScope(roleTabs, { allowed_tabs: ['nope', 'zzz'] })).toBe(roleTabs)
  })

  it('never blanks the panel: allowed naming only tabs the role lacks falls back to role tabs', () => {
    // viewer lacks 'mentors'; a grant scoped to ['mentors'] must not empty the nav.
    const viewerTabs = tabsForRole('viewer')
    expect(tabsForScope(viewerTabs, { allowed_tabs: ['mentors'] })).toBe(viewerTabs)
  })
})
