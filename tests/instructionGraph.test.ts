import { describe, expect, it } from 'vitest'
import {
  consumersOf,
  dependentsOf,
  findCycle,
  nextStep,
  prerequisitesOf,
  producersOf,
  stepAvailability,
  topologicalOrder,
} from '../src/domain/instructions/graph'
import type { ProgressView } from '../src/domain/instructions/graph'
import { branchingPlan, makeStep, tinyEdgePlan } from './fixtures/instructionPlans'

const NOW = '2026-10-10T12:00:00.000Z'
const progress = (completed: string[], waits: ProgressView['waits'] = {}): ProgressView => ({ completed: new Set(completed), waits })
const step = (key: string, order: number, dependsOn: string[] = []) => makeStep({ key, phaseKey: 'p', order, kind: 'mark', dependsOn })

describe('topologicalOrder', () => {
  it('orders a linear chain by dependency', () => {
    const { order, cycle } = topologicalOrder(tinyEdgePlan().steps)
    expect(cycle).toBeNull()
    expect(order).toEqual(['select-stock', 'mill', 'rip', 'glue', 'cure', 'surface'])
  })

  it('breaks ties by order, then by key', () => {
    const steps = [step('c', 3), step('a', 1), step('b2', 2), step('b1', 2)]
    expect(topologicalOrder(steps).order).toEqual(['a', 'b1', 'b2', 'c'])
  })

  it('puts dependencies first even when their order is higher', () => {
    const steps = [step('late', 9), step('early', 1, ['late'])]
    expect(topologicalOrder(steps).order).toEqual(['late', 'early'])
  })

  it('does not depend on the input array order', () => {
    const steps = branchingPlan().steps
    expect(topologicalOrder([...steps].reverse()).order).toEqual(topologicalOrder(steps).order)
  })

  it('ignores dependencies on unknown keys', () => {
    const steps = [step('a', 1, ['ghost']), step('b', 2, ['a'])]
    expect(topologicalOrder(steps)).toEqual({ order: ['a', 'b'], cycle: null })
    expect(findCycle(steps)).toBeNull()
  })

  it('reports a cycle and orders every step not on it', () => {
    const steps = [step('ok', 1), step('x', 2, ['z']), step('y', 3, ['x']), step('z', 4, ['y']), step('after', 5, ['z', 'ok'])]
    const { order, cycle } = topologicalOrder(steps)
    expect(order).toEqual(['ok', 'after'])
    expect(cycle).not.toBeNull()
    expect([...cycle!].sort()).toEqual(['x', 'y', 'z'])
  })
})

describe('empty and degenerate inputs', () => {
  it('handles a plan with no steps', () => {
    const empty = { ...tinyEdgePlan(), steps: [] }
    expect(topologicalOrder([])).toEqual({ order: [], cycle: null })
    expect(findCycle([])).toBeNull()
    expect(stepAvailability(empty, progress([]), NOW)).toEqual({})
    expect(nextStep(empty, progress([]), NOW)).toBeNull()
    expect(prerequisitesOf(empty, 'ghost')).toEqual(new Set())
    expect(dependentsOf(empty, 'ghost')).toEqual(new Set())
  })

  it('does not mutate the steps array it is given', () => {
    const steps = [step('c', 3), step('a', 1), step('b', 2, ['c'])]
    const before = steps.map(s => s.key)
    topologicalOrder(steps)
    findCycle(steps)
    expect(steps.map(s => s.key)).toEqual(before)
  })
})

describe('findCycle', () => {
  it('returns null for acyclic plans', () => {
    expect(findCycle(tinyEdgePlan().steps)).toBeNull()
    expect(findCycle(branchingPlan().steps)).toBeNull()
  })

  it('names a self-dependency as a one-step cycle', () => {
    expect(findCycle([step('a', 1, ['a'])])).toEqual(['a'])
  })

  it('lists the cycle so each key is a prerequisite of the next', () => {
    const steps = [step('a', 1, ['c']), step('b', 2, ['a']), step('c', 3, ['b'])]
    const cycle = findCycle(steps)!
    expect(cycle).toHaveLength(3)
    const byKey = new Map(steps.map(s => [s.key, s]))
    cycle.forEach((key, i) => {
      const next = cycle[(i + 1) % cycle.length]!
      expect(byKey.get(next)!.dependsOn).toContain(key)
    })
  })
})

describe('prerequisitesOf / dependentsOf', () => {
  const plan = branchingPlan()

  it('collects transitive prerequisites and excludes the step itself', () => {
    expect(prerequisitesOf(plan, 'join')).toEqual(new Set(['a-prep', 'a-glue', 'a-cure', 'b-prep', 'b-cut']))
    expect(prerequisitesOf(plan, 'a-prep')).toEqual(new Set())
    expect(prerequisitesOf(plan, 'b-cut')).toEqual(new Set(['b-prep']))
  })

  it('collects transitive dependents and excludes the step itself', () => {
    expect(dependentsOf(plan, 'a-prep')).toEqual(new Set(['a-glue', 'a-cure', 'join']))
    expect(dependentsOf(plan, 'join')).toEqual(new Set())
  })

  it('terminates and excludes self on a cycle', () => {
    const cyclic = { ...plan, steps: [step('a', 1, ['b']), step('b', 2, ['a'])] }
    expect(prerequisitesOf(cyclic, 'a')).toEqual(new Set(['b']))
    expect(dependentsOf(cyclic, 'a')).toEqual(new Set(['b']))
  })
})

describe('producersOf / consumersOf', () => {
  const plan = tinyEdgePlan()

  it('finds the steps that output a part', () => {
    expect(producersOf(plan, 'stock:walnut')).toEqual(['select-stock'])
    expect(producersOf(plan, 'strip:s1')).toEqual(['rip'])
    expect(producersOf(plan, 'nothing')).toEqual([])
  })

  it('counts any input, consumed or not', () => {
    expect(consumersOf(plan, 'panel:tiny')).toEqual(['cure', 'surface'])
    expect(consumersOf(plan, 'stock:walnut')).toEqual(['mill'])
    expect(consumersOf(plan, 'board:tiny')).toEqual([])
  })
})

describe('stepAvailability', () => {
  it('starts with only root steps available', () => {
    const result = stepAvailability(tinyEdgePlan(), progress([]), NOW)
    expect(result).toEqual({
      'select-stock': 'available',
      mill: 'blocked',
      rip: 'blocked',
      glue: 'blocked',
      cure: 'blocked',
      surface: 'blocked',
    })
  })

  it('marks completed steps done and releases the next', () => {
    const result = stepAvailability(tinyEdgePlan(), progress(['select-stock']), NOW)
    expect(result['select-stock']).toBe('done')
    expect(result['mill']).toBe('available')
    expect(result['rip']).toBe('blocked')
  })

  it('makes a wait step available until its timer starts, then waiting while it runs', () => {
    const done = ['select-stock', 'mill', 'rip', 'glue']
    expect(stepAvailability(tinyEdgePlan(), progress(done), NOW)['cure']).toBe('available')
    const running = stepAvailability(tinyEdgePlan(), progress(done, { cure: { readyAt: '2026-10-10T12:30:00.000Z' } }), NOW)
    expect(running['cure']).toBe('waiting')
    expect(running['surface']).toBe('waiting')
  })

  it('treats an elapsed timer as available, and the dependent as blocked until the wait is completed', () => {
    const done = ['select-stock', 'mill', 'rip', 'glue']
    const result = stepAvailability(tinyEdgePlan(), progress(done, { cure: { readyAt: '2026-10-10T11:00:00.000Z' } }), NOW)
    expect(result['cure']).toBe('available')
    expect(result['surface']).toBe('blocked')
  })

  it('treats a timer ending exactly now as elapsed', () => {
    const done = ['select-stock', 'mill', 'rip', 'glue']
    expect(stepAvailability(tinyEdgePlan(), progress(done, { cure: { readyAt: NOW } }), NOW)['cure']).toBe('available')
  })

  it('releases the step after the wait once the wait is completed', () => {
    const done = ['select-stock', 'mill', 'rip', 'glue', 'cure']
    expect(stepAvailability(tinyEdgePlan(), progress(done), NOW)['surface']).toBe('available')
  })

  it('holds the join as waiting when a-cure runs and b-cut is done', () => {
    const done = ['a-prep', 'a-glue', 'b-prep', 'b-cut']
    const result = stepAvailability(branchingPlan(), progress(done, { 'a-cure': { readyAt: '2026-10-10T12:30:00.000Z' } }), NOW)
    expect(result['a-cure']).toBe('waiting')
    expect(result['join']).toBe('waiting')
  })

  it('keeps the join blocked while a branch is incomplete and not merely waiting', () => {
    const done = ['a-prep', 'a-glue', 'b-prep']
    const result = stepAvailability(branchingPlan(), progress(done, { 'a-cure': { readyAt: '2026-10-10T12:30:00.000Z' } }), NOW)
    expect(result['b-cut']).toBe('available')
    expect(result['join']).toBe('blocked')
  })

  it('makes the join available once the cure and the cut are done', () => {
    const done = ['a-prep', 'a-glue', 'a-cure', 'b-prep', 'b-cut']
    expect(stepAvailability(branchingPlan(), progress(done), NOW)['join']).toBe('available')
  })

  it('ignores a timer recorded for a non-wait step', () => {
    const result = stepAvailability(tinyEdgePlan(), progress([], { 'select-stock': { readyAt: '2030-01-01T00:00:00.000Z' } }), NOW)
    expect(result['select-stock']).toBe('available')
  })

  it('blocks steps on a cycle and steps downstream of it', () => {
    const plan = { ...tinyEdgePlan(), steps: [step('a', 1, ['b']), step('b', 2, ['a']), step('c', 3, ['b']), step('free', 4)] }
    expect(stepAvailability(plan, progress([]), NOW)).toEqual({ a: 'blocked', b: 'blocked', c: 'blocked', free: 'available' })
  })

  it('ignores unknown dependencies', () => {
    const plan = { ...tinyEdgePlan(), steps: [step('a', 1, ['ghost'])] }
    expect(stepAvailability(plan, progress([]), NOW)['a']).toBe('available')
  })
})

describe('nextStep', () => {
  it('returns the first step initially', () => {
    expect(nextStep(tinyEdgePlan(), progress([]), NOW)).toBe('select-stock')
  })

  it('chooses the available step with the lowest order', () => {
    expect(nextStep(branchingPlan(), progress(['a-prep']), NOW)).toBe('a-glue')
    // b-prep (order 4) and a-glue (order 2) both available: lowest order wins.
    expect(nextStep(branchingPlan(), progress(['a-prep']), NOW)).not.toBe('b-prep')
  })

  it('prefers the lower order over the alphabetically earlier key', () => {
    const plan = { ...tinyEdgePlan(), steps: [step('a-late', 9), step('z-early', 1)] }
    expect(nextStep(plan, progress([]), NOW)).toBe('z-early')
  })

  it('moves to the other branch while a timer runs', () => {
    const done = ['a-prep', 'a-glue']
    expect(nextStep(branchingPlan(), progress(done, { 'a-cure': { readyAt: '2026-10-10T12:30:00.000Z' } }), NOW)).toBe('b-prep')
  })

  it('returns null when everything is waiting, blocked, or done', () => {
    const done = ['select-stock', 'mill', 'rip', 'glue']
    expect(nextStep(tinyEdgePlan(), progress(done, { cure: { readyAt: '2026-10-10T12:30:00.000Z' } }), NOW)).toBeNull()
    expect(nextStep(tinyEdgePlan(), progress([...done, 'cure', 'surface']), NOW)).toBeNull()
  })
})
