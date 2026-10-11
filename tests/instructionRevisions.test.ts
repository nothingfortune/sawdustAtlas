import { describe, expect, it } from 'vitest'
import { planRevision, stableStringify, withRevision } from '../src/domain/instructions/revisions'
import { branchingPlan, tinyEdgePlan } from './fixtures/instructionPlans'

describe('stableStringify', () => {
  it('sorts object keys at every level', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}')
  })

  it('skips undefined properties and keeps array order', () => {
    expect(stableStringify({ a: undefined, b: [3, undefined, 1] })).toBe('{"b":[3,null,1]}')
  })

  it('keeps full float precision', () => {
    expect(stableStringify({ x: 0.1 + 0.2 })).toBe('{"x":0.30000000000000004}')
  })

  it('renders primitives and null like JSON', () => {
    expect(stableStringify(null)).toBe('null')
    expect(stableStringify('mm')).toBe('"mm"')
    expect(stableStringify(undefined)).toBe('null')
  })
})

describe('planRevision', () => {
  it('ignores the revision field itself', () => {
    const plan = tinyEdgePlan()
    expect(planRevision(plan)).toBe(plan.revision)
    const stale: typeof plan = { ...plan, revision: 'stale' }
    expect(planRevision(stale)).toBe(plan.revision)
  })

  it('does not depend on key order', () => {
    const plan = tinyEdgePlan()
    const reordered = Object.fromEntries(Object.entries(plan).reverse()) as typeof plan
    expect(planRevision(reordered)).toBe(plan.revision)
  })

  it('changes when any value changes, however small', () => {
    const plan = tinyEdgePlan()
    const nudged = { ...plan, finished: { ...plan.finished, thickness: plan.finished.thickness + 1e-9 } }
    expect(planRevision(nudged)).not.toBe(plan.revision)
  })

  it('tells different plans apart and is stable across calls', () => {
    expect(tinyEdgePlan().revision).toBe(tinyEdgePlan().revision)
    expect(branchingPlan().revision).not.toBe(tinyEdgePlan().revision)
    expect(tinyEdgePlan().revision).toMatch(/^r-[0-9a-f]{14}$/)
  })

  it('withRevision stamps a matching revision', () => {
    const { revision: _revision, ...content } = tinyEdgePlan()
    expect(withRevision(content).revision).toBe(planRevision(content))
  })
})
