import { describe, it, expect } from 'vitest'
import { validateWorkflowSource } from '../scripts/validate-workflow.mjs'

const GOOD = `export const meta = { name: 'x', description: 'y' }
phase('A')
const r = await agent('hi')
return { r }
`

describe('validateWorkflowSource', () => {
  it('passes a well-formed workflow (top-level await + return + export meta)', () => {
    expect(validateWorkflowSource(GOOD)).toEqual([])
  })

  it('flags a missing meta export', () => {
    expect(validateWorkflowSource(`phase('A')`)).toContain('missing `export const meta`')
  })

  it('flags meta without name/description', () => {
    const errs = validateWorkflowSource(`export const meta = { phases: [] }`)
    expect(errs).toContain('meta missing name')
    expect(errs).toContain('meta missing description')
  })

  it('flags a syntax error in the body', () => {
    const src = `export const meta = { name: 'x', description: 'y' }\nconst =\n`
    expect(validateWorkflowSource(src).some((e) => e.startsWith('syntax error'))).toBe(true)
  })
})
