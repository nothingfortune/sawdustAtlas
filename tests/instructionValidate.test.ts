import { describe, expect, it } from 'vitest'
import { withRevision } from '../src/domain/instructions/revisions'
import type { InstructionPlan, InstructionStep, PlanIssueCode, PlanValidationIssue } from '../src/domain/instructions/types'
import { validatePlan } from '../src/domain/instructions/validate'
import { branchingPlan, makeStep, tinyEdgePlan } from './fixtures/instructionPlans'

/** Mutate a fresh fixture, then re-stamp the revision so only the mutation is at fault. */
function mutate(mutator: (plan: InstructionPlan) => void, base: () => InstructionPlan = tinyEdgePlan): InstructionPlan {
  const plan = base()
  mutator(plan)
  const { revision: _revision, ...rest } = plan
  return withRevision(rest)
}

const stepOf = (plan: InstructionPlan, key: string): InstructionStep => plan.steps.find(s => s.key === key)!

function issuesOf(plan: InstructionPlan, code: PlanIssueCode): PlanValidationIssue[] {
  return validatePlan(plan).issues.filter(issue => issue.code === code)
}

function expectIssue(plan: InstructionPlan, code: PlanIssueCode, where: { stepKey?: string; partKey?: string } = {}) {
  const found = issuesOf(plan, code)
  expect(found.length, `expected a ${code} issue`).toBeGreaterThan(0)
  if (where.stepKey !== undefined) expect(found.map(i => i.stepKey)).toContain(where.stepKey)
  if (where.partKey !== undefined) expect(found.map(i => i.partKey)).toContain(where.partKey)
  return found
}

describe('validatePlan on valid fixtures', () => {
  it.each([
    ['tinyEdgePlan', tinyEdgePlan],
    ['branchingPlan', branchingPlan],
  ])('%s has no issues', (_name, build) => {
    expect(validatePlan(build())).toEqual({ ok: true, issues: [] })
  })
})

describe('validatePlan rules', () => {
  it('unsupported-version', () => {
    const plan = mutate(p => { (p as { version: number }).version = 2 })
    expectIssue(plan, 'unsupported-version')
    expect(validatePlan(plan).ok).toBe(false)
  })

  describe('duplicate-key', () => {
    it('phases', () => expectIssue(mutate(p => { p.phases.push({ ...p.phases[0]! }) }), 'duplicate-key'))
    it('steps', () => expectIssue(mutate(p => { p.steps.push(makeStep({ key: 'mill', phaseKey: 'prepare', order: 99, kind: 'mark' })) }), 'duplicate-key', { stepKey: 'mill' }))
    it('parts', () => expectIssue(mutate(p => { p.parts.push({ ...p.parts[0]! }) }), 'duplicate-key', { partKey: 'stock:walnut' }))
    it('assemblies', () => expectIssue(mutate(p => { p.assemblies.push({ ...p.assemblies[0]! }) }), 'duplicate-key'))
    it('stock lines', () => expectIssue(mutate(p => { p.requirements.stock.push({ ...p.requirements.stock[0]! }) }), 'duplicate-key'))
    it('cut ids', () => expectIssue(mutate(p => { p.requirements.cuts.push({ ...p.requirements.cuts[0]! }) }), 'duplicate-key'))
    it('requirement tools', () => expectIssue(mutate(p => { p.requirements.tools.push({ ...p.requirements.tools[0]! }) }), 'duplicate-key'))
    it('measurement keys within a step', () => {
      expectIssue(mutate(p => { const s = stepOf(p, 'rip'); s.measurements.push({ ...s.measurements[0]! }) }), 'duplicate-key', { stepKey: 'rip' })
    })
    it('checklist keys within a step', () => {
      expectIssue(mutate(p => { const s = stepOf(p, 'mill'); s.checklist.push({ ...s.checklist[0]! }) }), 'duplicate-key', { stepKey: 'mill' })
    })
    it('a part in both inputs and outputs of one step', () => {
      expectIssue(mutate(p => { stepOf(p, 'mill').outputs.push({ partKey: 'stock:walnut', quantity: 1 }) }), 'duplicate-key', { stepKey: 'mill', partKey: 'stock:walnut' })
    })
    it('allows the same measurement key in different steps', () => {
      // `thickness` already appears in both mill and surface in the fixture.
      expect(issuesOf(tinyEdgePlan(), 'duplicate-key')).toEqual([])
    })
  })

  it('unknown-phase', () => {
    expectIssue(mutate(p => { stepOf(p, 'rip').phaseKey = 'nowhere' }), 'unknown-phase', { stepKey: 'rip' })
  })

  it('unknown-dependency', () => {
    expectIssue(mutate(p => { stepOf(p, 'rip').dependsOn.push('ghost') }), 'unknown-dependency', { stepKey: 'rip' })
  })

  it('self-dependency (and no separate cycle report)', () => {
    const plan = mutate(p => { stepOf(p, 'rip').dependsOn.push('rip') })
    expectIssue(plan, 'self-dependency', { stepKey: 'rip' })
    expect(issuesOf(plan, 'dependency-cycle')).toEqual([])
  })

  it('dependency-cycle is reported once and names the cycle', () => {
    const plan = mutate(p => { stepOf(p, 'select-stock').dependsOn.push('glue') })
    const found = expectIssue(plan, 'dependency-cycle')
    expect(found).toHaveLength(1)
    for (const key of ['select-stock', 'mill', 'rip', 'glue']) expect(found[0]!.message).toContain(key)
  })

  describe('order-invalid', () => {
    it('non-positive', () => expectIssue(mutate(p => { stepOf(p, 'rip').order = 0 }), 'order-invalid', { stepKey: 'rip' }))
    it('fractional', () => expectIssue(mutate(p => { stepOf(p, 'rip').order = 3.5 }), 'order-invalid', { stepKey: 'rip' }))
    it('duplicated', () => {
      const found = expectIssue(mutate(p => { stepOf(p, 'glue').order = 3 }), 'order-invalid')
      expect(found.map(i => i.stepKey).sort()).toEqual(['glue', 'rip'])
    })
  })

  it('order-violates-dependency', () => {
    expectIssue(mutate(p => { stepOf(p, 'mill').order = 20 }), 'order-violates-dependency', { stepKey: 'rip' })
  })

  describe('unknown-part', () => {
    it('input', () => expectIssue(mutate(p => { stepOf(p, 'mill').inputs[0]!.partKey = 'nope' }), 'unknown-part', { stepKey: 'mill', partKey: 'nope' }))
    it('output', () => expectIssue(mutate(p => { stepOf(p, 'mill').outputs[0]!.partKey = 'nope' }), 'unknown-part', { stepKey: 'mill', partKey: 'nope' }))
    it('visual highlight', () => expectIssue(mutate(p => { stepOf(p, 'mill').visual.highlightPartKeys.push('nope') }), 'unknown-part', { stepKey: 'mill', partKey: 'nope' }))
    it('visual annotation', () => {
      expectIssue(mutate(p => { stepOf(p, 'mill').visual.annotations.push({ kind: 'label', text: 'x', partKey: 'nope' }) }), 'unknown-part', { partKey: 'nope' })
    })
    it('measurement', () => expectIssue(mutate(p => { stepOf(p, 'mill').measurements[0]!.partKey = 'nope' }), 'unknown-part', { stepKey: 'mill', partKey: 'nope' }))
    it('stock line', () => expectIssue(mutate(p => { p.requirements.stock[0]!.partKey = 'nope' }), 'unknown-part', { partKey: 'nope' }))
    it('assembly', () => expectIssue(mutate(p => { p.assemblies[0]!.partKeys.push('nope') }), 'unknown-part', { partKey: 'nope' }))
  })

  it('input-not-available when the producer is not a prerequisite', () => {
    // b-cut takes stock:b from b-prep; point it at stock:a, produced on the other branch.
    const plan = mutate(p => { stepOf(p, 'b-cut').inputs[0]!.partKey = 'stock:a' }, branchingPlan)
    expectIssue(plan, 'input-not-available', { stepKey: 'b-cut', partKey: 'stock:a' })
  })

  it('input-not-available when nothing produces the part', () => {
    const plan = mutate(p => { stepOf(p, 'select-stock').outputs = [] })
    expectIssue(plan, 'input-not-available', { stepKey: 'mill', partKey: 'stock:walnut' })
  })

  it('over-consumed', () => {
    const plan = mutate(p => { stepOf(p, 'mill').inputs[0]!.quantity = 2 })
    expectIssue(plan, 'over-consumed', { partKey: 'stock:walnut' })
  })

  it('does not call a part over-consumed when it is not consumed past its supply', () => {
    expect(issuesOf(tinyEdgePlan(), 'over-consumed')).toEqual([])
  })

  it('part-never-produced', () => {
    const plan = mutate(p => { p.parts.push({ key: 'orphan', kind: 'offcut', stage: 'cut', label: 'O', name: 'Orphan' }) })
    expectIssue(plan, 'part-never-produced', { partKey: 'orphan' })
  })

  it('stock-not-consumed', () => {
    const plan = mutate(p => { stepOf(p, 'mill').inputs[0]!.consumed = false })
    expectIssue(plan, 'stock-not-consumed', { partKey: 'stock:walnut' })
  })

  it('unknown-cut', () => {
    expectIssue(mutate(p => { stepOf(p, 'rip').cutIds.push('mystery') }), 'unknown-cut', { stepKey: 'rip' })
  })

  it('cut-not-covered', () => {
    const plan = mutate(p => { p.requirements.cuts.push({ id: 'extra', label: 'Extra', stage: 'rip', quantity: 1 }) })
    expect(expectIssue(plan, 'cut-not-covered')[0]!.message).toContain('extra')
  })

  describe('missing-output', () => {
    it('a producing step without outputs', () => {
      expectIssue(mutate(p => { stepOf(p, 'rip').outputs = [] }), 'missing-output', { stepKey: 'rip' })
    })
    it('a wait step without inputs', () => {
      expectIssue(mutate(p => { stepOf(p, 'cure').inputs = [] }), 'missing-output', { stepKey: 'cure' })
    })
    it('a wait step that consumes', () => {
      expectIssue(mutate(p => { stepOf(p, 'cure').inputs[0]!.consumed = true }), 'missing-output', { stepKey: 'cure' })
    })
    it('accepts a mark step with an unconsumed input and no output', () => {
      const plan = mutate(p => {
        p.steps.push(makeStep({ key: 'mark-panel', phaseKey: 'finish', order: 7, kind: 'mark', dependsOn: ['surface'], inputs: [{ partKey: 'board:tiny', quantity: 1, consumed: false }] }))
      })
      expect(issuesOf(plan, 'missing-output')).toEqual([])
    })
  })

  it('irreversible-not-flagged', () => {
    expectIssue(mutate(p => { stepOf(p, 'rip').irreversible = false }), 'irreversible-not-flagged', { stepKey: 'rip' })
  })

  describe('irreversible-without-check', () => {
    it('no verify-before measurement and no critical checklist item', () => {
      const plan = mutate(p => {
        const s = stepOf(p, 'rip')
        s.measurements = s.measurements.filter(m => m.phase !== 'verify-before')
      })
      expectIssue(plan, 'irreversible-without-check', { stepKey: 'rip' })
    })
    it('a non-critical checklist item does not count', () => {
      const plan = mutate(p => { stepOf(p, 'glue').checklist[0]!.critical = false })
      expectIssue(plan, 'irreversible-without-check', { stepKey: 'glue' })
    })
    it('an achieve-after measurement does not count', () => {
      const plan = mutate(p => { stepOf(p, 'mill').checklist = [] })
      expectIssue(plan, 'irreversible-without-check', { stepKey: 'mill' })
    })
  })

  describe('invalid-batch', () => {
    it('zero count', () => expectIssue(mutate(p => { stepOf(p, 'rip').batch = { count: 0, unitLabel: 'strip' } }), 'invalid-batch', { stepKey: 'rip' }))
    it('fractional count', () => expectIssue(mutate(p => { stepOf(p, 'rip').batch = { count: 1.5, unitLabel: 'strip' } }), 'invalid-batch', { stepKey: 'rip' }))
    it('empty unit label', () => expectIssue(mutate(p => { stepOf(p, 'rip').batch = { count: 2, unitLabel: ' ' } }), 'invalid-batch', { stepKey: 'rip' }))
  })

  describe('invalid-measurement', () => {
    it('non-finite target', () => expectIssue(mutate(p => { stepOf(p, 'mill').measurements[0]!.target = Number.NaN }), 'invalid-measurement', { stepKey: 'mill' }))
    it('negative tolerance', () => expectIssue(mutate(p => { stepOf(p, 'mill').measurements[0]!.tolerance.minus = -0.1 }), 'invalid-measurement', { stepKey: 'mill' }))
    it('non-finite tolerance', () => expectIssue(mutate(p => { stepOf(p, 'mill').measurements[0]!.tolerance.plus = Infinity }), 'invalid-measurement', { stepKey: 'mill' }))
    it('fractional count target', () => {
      expectIssue(mutate(p => { Object.assign(stepOf(p, 'mill').measurements[0]!, { unit: 'count', target: 2.5 }) }), 'invalid-measurement', { stepKey: 'mill' })
    })
    it('accepts an integer count target', () => {
      expect(issuesOf(mutate(p => { Object.assign(stepOf(p, 'mill').measurements[0]!, { unit: 'count', target: 3 }) }), 'invalid-measurement')).toEqual([])
    })
  })

  describe('invalid-wait', () => {
    it('wait step without wait', () => {
      const found = expectIssue(mutate(p => { delete stepOf(p, 'cure').wait }), 'invalid-wait', { stepKey: 'cure' })
      expect(found[0]!.severity).toBe('error')
    })
    it('non-positive minimum', () => {
      expectIssue(mutate(p => { stepOf(p, 'cure').wait!.minimumMinutes = 0 }), 'invalid-wait', { stepKey: 'cure' })
    })
    it('non-finite minimum', () => {
      expectIssue(mutate(p => { stepOf(p, 'cure').wait!.minimumMinutes = Number.NaN }), 'invalid-wait', { stepKey: 'cure' })
    })
    it('a non-wait step carrying wait is only a warning', () => {
      const plan = mutate(p => { stepOf(p, 'rip').wait = { minimumMinutes: 5, reason: 'x', source: 'design' } })
      const found = expectIssue(plan, 'invalid-wait', { stepKey: 'rip' })
      expect(found[0]!.severity).toBe('warning')
      expect(validatePlan(plan).ok).toBe(true)
    })
  })

  describe('invalid-visual', () => {
    it('highlighted and ghosted at once (warning)', () => {
      const plan = mutate(p => { stepOf(p, 'mill').visual.ghostPartKeys.push('stock:walnut/milled') })
      const found = expectIssue(plan, 'invalid-visual', { stepKey: 'mill', partKey: 'stock:walnut/milled' })
      expect(found[0]!.severity).toBe('warning')
      expect(validatePlan(plan).ok).toBe(true)
    })
    it('camera on a 2D view (warning)', () => {
      const plan = mutate(p => { stepOf(p, 'mill').visual.camera = { position: [0, 0, 1], target: [0, 0, 0] } })
      expect(expectIssue(plan, 'invalid-visual', { stepKey: 'mill' })[0]!.severity).toBe('warning')
    })
    it('camera on scene-3d is fine', () => {
      const plan = mutate(p => { Object.assign(stepOf(p, 'mill').visual, { view: 'scene-3d', camera: { position: [0, 0, 1], target: [0, 0, 0] } }) })
      expect(issuesOf(plan, 'invalid-visual')).toEqual([])
    })
  })

  describe('dimension-in-prose', () => {
    it.each(['Cut to 30 mm', 'Plane to 22mm', 'About 2.5 cm', 'Set 45°', 'Tilt to 45 deg', 'Make it 3/4 in.', 'Trim to 12"', 'Leave 1 inch'])('flags %s in an instruction', text => {
      expectIssue(mutate(p => { stepOf(p, 'rip').instruction = text }), 'dimension-in-prose', { stepKey: 'rip' })
    })
    it('flags a title', () => {
      expectIssue(mutate(p => { stepOf(p, 'rip').title = 'Rip to 30 mm' }), 'dimension-in-prose', { stepKey: 'rip' })
    })
    it.each(['Step 2 in the sequence', 'Mark the 3 strips', 'Use the mm scale', 'Pass 2 times', 'Check the machine setup'])('does not flag %s', text => {
      expect(issuesOf(mutate(p => { stepOf(p, 'rip').instruction = text }), 'dimension-in-prose')).toEqual([])
    })
  })

  describe('unknown-step', () => {
    it('plan warning', () => {
      expectIssue(mutate(p => { p.warnings.push({ id: 'w', severity: 'warning', message: 'm', stepKey: 'ghost' }) }), 'unknown-step', { stepKey: 'ghost' })
    })
    it('step warning', () => {
      expectIssue(mutate(p => { stepOf(p, 'rip').warnings.push({ id: 'w', severity: 'warning', message: 'm', stepKey: 'ghost' }) }), 'unknown-step', { stepKey: 'rip' })
    })
    it('assembly', () => {
      expectIssue(mutate(p => { p.assemblies[0]!.stepKeys.push('ghost') }), 'unknown-step', { stepKey: 'ghost' })
    })
  })

  it('revision-mismatch', () => {
    const plan = tinyEdgePlan()
    plan.finished.length = 481
    expectIssue(plan, 'revision-mismatch')
  })
})

describe('validatePlan result shape', () => {
  it('sorts errors before warnings and keeps ok false when errors exist', () => {
    const plan = mutate(p => {
      stepOf(p, 'mill').visual.ghostPartKeys.push('stock:walnut/milled') // warning, earlier step
      stepOf(p, 'surface').phaseKey = 'nowhere' // error, later step
    })
    const { issues, ok } = validatePlan(plan)
    expect(ok).toBe(false)
    const severities = issues.map(i => i.severity)
    expect(severities).toEqual([...severities].sort((a, b) => Number(b === 'error') - Number(a === 'error')))
    expect(severities[0]).toBe('error')
    expect(severities.at(-1)).toBe('warning')
  })

  it('is not changed by shuffling the steps array', () => {
    const broken = (steps: (a: InstructionStep[]) => InstructionStep[]) =>
      mutate(p => {
        stepOf(p, 'rip').dependsOn.push('ghost')
        stepOf(p, 'mill').visual.ghostPartKeys.push('stock:walnut/milled')
        stepOf(p, 'glue').order = 3
        stepOf(p, 'surface').title = 'Surface to 20 mm'
        stepOf(p, 'cure').wait!.minimumMinutes = 0
        p.steps = steps(p.steps)
      })
    const expected = validatePlan(broken(s => s))
    expect(expected.issues.length).toBeGreaterThan(4)
    expect(validatePlan(broken(s => [...s].reverse()))).toEqual(expected)
    expect(validatePlan(broken(s => [s[3]!, s[0]!, s[5]!, s[2]!, s[4]!, s[1]!]))).toEqual(expected)
  })
})
