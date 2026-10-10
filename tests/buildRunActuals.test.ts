import { describe, expect, it } from 'vitest'
import { clearVerifyFirst, evaluateMeasurement, recordMeasurement, reopenStep, reportProblem } from '../src/domain/buildRuns/actuals'
import { advanceBatch, completeStep, pauseRun, startBuildRun, startWait } from '../src/domain/buildRuns/progress'
import type { BuildRun } from '../src/domain/buildRuns/types'
import type { Measurement } from '../src/domain/instructions/types'
import { branchingPlan, tinyEdgePlan } from './fixtures/instructionPlans'

const T0 = '2026-10-10T08:00:00.000Z'
const at = (minutes: number) => new Date(Date.parse(T0) + minutes * 60_000).toISOString()

function start(plan = tinyEdgePlan()): BuildRun {
  return startBuildRun({ id: 'run1', plan, startedAt: T0, displayUnits: 'metric' })
}
function ok<T extends { run: BuildRun; error?: string }>(result: T): T {
  expect(result.error).toBeUndefined()
  return result
}
function doneThrough(keys: string[], run = start()): BuildRun {
  let t = 1
  let current = run
  for (const key of keys) {
    if (key === 'rip') {
      current = ok(advanceBatch(ok(advanceBatch(current, key, at(t++))).run, key, at(t++))).run
    } else if (key === 'cure') {
      current = ok(startWait(current, key, at(t))).run
      current = ok(completeStep(current, key, at(t + 60))).run
      t += 61
    } else current = ok(completeStep(current, key, at(t++))).run
  }
  return current
}
const tinyThroughMill = () => doneThrough(['select-stock', 'mill'])

const m = (overrides: Partial<Measurement> = {}): Measurement => ({
  key: 'k', label: 'Thing', target: 22, unit: 'mm', tolerance: { minus: 0.25, plus: 0.5 }, critical: true, phase: 'achieve-after', ...overrides,
})

describe('evaluateMeasurement', () => {
  it('reports signed deviation as actual minus target', () => {
    expect(evaluateMeasurement(m(), 22.3).deviation).toBeCloseTo(0.3)
    expect(evaluateMeasurement(m(), 21.9).deviation).toBeCloseTo(-0.1)
    expect(evaluateMeasurement(m(), 22).deviation).toBe(0)
  })

  it('is inclusive at exactly minus and plus', () => {
    expect(evaluateMeasurement(m(), 21.75).withinTolerance).toBe(true)
    expect(evaluateMeasurement(m(), 22.5).withinTolerance).toBe(true)
  })

  it('rejects just outside either bound', () => {
    expect(evaluateMeasurement(m(), 21.74).withinTolerance).toBe(false)
    expect(evaluateMeasurement(m(), 22.51).withinTolerance).toBe(false)
  })

  it('absorbs float error within the epsilon but not beyond it', () => {
    expect(evaluateMeasurement(m(), 22.5 + 1e-10).withinTolerance).toBe(true)
    expect(evaluateMeasurement(m(), 21.75 - 1e-10).withinTolerance).toBe(true)
    expect(evaluateMeasurement(m(), 22.5 + 1e-7).withinTolerance).toBe(false)
    expect(evaluateMeasurement(m(), 21.75 - 1e-7).withinTolerance).toBe(false)
  })

  it('handles a zero tolerance as exact match only', () => {
    const exact = m({ tolerance: { minus: 0, plus: 0 } })
    expect(evaluateMeasurement(exact, 22).withinTolerance).toBe(true)
    expect(evaluateMeasurement(exact, 22.001).withinTolerance).toBe(false)
  })
})

describe('recordMeasurement', () => {
  it('stores the record with deviation and tolerance result and logs an event', () => {
    const run = start()
    const result = ok(recordMeasurement(run, 'mill', 'thickness', 22.1, at(1)))
    expect(result.run.steps['mill']!.measurements['thickness']).toMatchObject({ actual: 22.1, withinTolerance: true, recordedAt: at(1) })
    expect(result.flaggedStepKeys).toEqual([])
    expect(result.run.events.at(-1)).toEqual({ type: 'measurement', at: at(1), stepKey: 'mill', measurementKey: 'thickness' })
    expect(run.steps['mill']!.measurements).toEqual({})
  })

  it('flags consumers of the deviated part for a critical out-of-tolerance measurement', () => {
    const run = doneThrough(['select-stock'])
    const result = ok(recordMeasurement(run, 'mill', 'thickness', 23, at(5)))
    expect(result.run.steps['mill']!.measurements['thickness']).toMatchObject({ withinTolerance: false, deviation: 1 })
    // thickness measures stock:walnut/milled, consumed only by rip.
    expect(result.flaggedStepKeys).toEqual(['rip'])
    expect(result.run.steps['rip']!.verifyFirst).toMatchObject({ sourceStepKey: 'mill', measurementKey: 'thickness' })
    expect(result.run.steps['rip']!.verifyFirst!.reason).toMatch(/out of tolerance/)
    expect(result.run.steps['glue']!.verifyFirst).toBeUndefined()
  })

  it('uses the step outputs when the measurement has no partKey', () => {
    // fence on rip has no partKey; rip outputs strips s1 and s2, consumed by glue.
    const result = ok(recordMeasurement(tinyThroughMill(), 'rip', 'fence', 31, at(5)))
    expect(result.flaggedStepKeys).toEqual(['glue'])
    expect(result.run.steps['glue']!.verifyFirst).toMatchObject({ sourceStepKey: 'rip', measurementKey: 'fence' })
  })

  it('does not flag for a non-critical deviation or an in-tolerance critical one', () => {
    const base = doneThrough(['select-stock', 'mill', 'rip', 'glue', 'cure'])
    const nonCritical = ok(recordMeasurement(base, 'surface', 'start-thickness', 30, at(500)))
    expect(nonCritical.run.steps['surface']!.measurements['start-thickness']!.withinTolerance).toBe(false)
    expect(nonCritical.flaggedStepKeys).toEqual([])
    const inside = ok(recordMeasurement(tinyThroughMill(), 'rip', 'fence', 30.25, at(5)))
    expect(inside.flaggedStepKeys).toEqual([])
  })

  it('only flags incomplete consumers', () => {
    const run = doneThrough(['select-stock', 'mill', 'rip', 'glue'])
    const result = ok(recordMeasurement(run, 'rip', 'width', 35, at(500)))
    // width is on strip:s1, consumed by glue, which is already complete.
    expect(result.flaggedStepKeys).toEqual([])
  })

  it('does not flag the measuring step itself when it consumes the measured part', () => {
    const run = doneThrough(['select-stock', 'mill', 'rip', 'glue', 'cure'])
    const result = ok(recordMeasurement(run, 'surface', 'start-thickness', 30, at(500)))
    expect(result.run.steps['surface']!.verifyFirst).toBeUndefined()
  })

  it('flags consumers in the branching plan and keeps an existing flag', () => {
    const run = start(branchingPlan())
    // stop has no partKey; b-cut outputs wafer:b, consumed by join.
    const first = ok(recordMeasurement(run, 'b-cut', 'stop', 30, at(1)))
    expect(first.flaggedStepKeys).toEqual(['join'])
    const second = ok(recordMeasurement(first.run, 'b-cut', 'stop', 31, at(2)))
    expect(second.flaggedStepKeys).toEqual(['join'])
    expect(second.run.steps['join']!.verifyFirst).toEqual(first.run.steps['join']!.verifyFirst)
  })

  it('refuses unknown steps and measurements, non-finite values, and inactive runs', () => {
    const run = start()
    expect(recordMeasurement(run, 'nope', 'thickness', 1, at(1)).error).toMatch(/unknown step/)
    expect(recordMeasurement(run, 'mill', 'nope', 1, at(1)).error).toMatch(/unknown measurement/)
    const nan = recordMeasurement(run, 'mill', 'thickness', Number.NaN, at(1))
    expect(nan.error).toMatch(/finite/)
    expect(nan.run).toBe(run)
    const paused = ok(pauseRunResult(run))
    expect(recordMeasurement(paused.run, 'mill', 'thickness', 22, at(2)).error).toBe('build is paused')
  })
})

function pauseRunResult(run: BuildRun) {
  return pauseRun(run, at(1))
}

describe('reportProblem', () => {
  const report = (outcome: Parameters<typeof reportProblem>[2]['outcome']) => ({ id: 'p1', kind: 'part-ruined' as const, outcome, note: 'Tore out the edge' })

  it('continue-with-note records the problem without changing progress', () => {
    const run = tinyThroughMill()
    const result = ok(reportProblem(run, 'rip', { ...report('continue-with-note'), kind: 'other' }, at(10)))
    expect(result.run.steps['rip']!.problems).toEqual([{ id: 'p1', kind: 'other', outcome: 'continue-with-note', note: 'Tore out the edge', at: at(10) }])
    expect(result.run.status).toBe('active')
    expect(result.flaggedStepKeys).toEqual([])
    expect(result.reviewStepKeys).toEqual([])
    expect(result.run.events.at(-1)).toEqual({ type: 'problem', at: at(10), stepKey: 'rip', problemId: 'p1', outcome: 'continue-with-note' })
  })

  it('rework-step returns the step to pending and flags completed dependents for review', () => {
    const run = doneThrough(['select-stock', 'mill', 'rip', 'glue'])
    const result = ok(reportProblem(run, 'rip', report('rework-step'), at(10)))
    expect(result.run.steps['rip']).toMatchObject({ status: 'pending', batchDone: 0 })
    expect(result.run.steps['rip']!.completedAt).toBeUndefined()
    expect(result.reviewStepKeys).toEqual(['glue'])
    expect(result.flaggedStepKeys).toEqual(['glue'])
    // Dependents are flagged, not reopened.
    expect(result.run.steps['glue']!.status).toBe('complete')
    expect(result.run.steps['glue']!.verifyFirst).toMatchObject({ sourceStepKey: 'rip' })
    expect(result.run.steps['mill']!.verifyFirst).toBeUndefined()
    expect(result.run.events.slice(-2).map(e => e.type)).toEqual(['reopen-step', 'problem'])
  })

  it('rework-step on a pending step resets the batch and flags nothing', () => {
    const run = ok(advanceBatch(tinyThroughMill(), 'rip', at(5))).run
    const result = ok(reportProblem(run, 'rip', report('rework-step'), at(10)))
    expect(result.run.steps['rip']!.batchDone).toBe(0)
    expect(result.reviewStepKeys).toEqual([])
  })

  it('flag-downstream flags every incomplete transitive dependent', () => {
    const run = tinyThroughMill()
    const result = ok(reportProblem(run, 'rip', report('flag-downstream'), at(10)))
    expect(result.flaggedStepKeys).toEqual(['glue', 'cure', 'surface'])
    expect(result.reviewStepKeys).toEqual([])
    expect(result.run.steps['cure']!.verifyFirst).toMatchObject({ sourceStepKey: 'rip' })
    expect(result.run.steps['rip']!.verifyFirst).toBeUndefined()
    expect(result.run.steps['rip']!.status).toBe('pending')
  })

  it('flag-downstream skips completed dependents', () => {
    const run = doneThrough(['select-stock', 'mill', 'rip', 'glue'])
    const result = ok(reportProblem(run, 'mill', report('flag-downstream'), at(10)))
    expect(result.flaggedStepKeys).toEqual(['cure', 'surface'])
  })

  it('abandon-build abandons the run and records the problem', () => {
    const result = ok(reportProblem(tinyThroughMill(), 'rip', report('abandon-build'), at(10)))
    expect(result.run).toMatchObject({ status: 'abandoned', abandonedAt: at(10) })
    expect(result.run.steps['rip']!.problems).toHaveLength(1)
    expect(result.run.events.slice(-2).map(e => e.type)).toEqual(['problem', 'abandon'])
  })

  it('carries the measurement key onto the problem and flags', () => {
    const result = ok(reportProblem(tinyThroughMill(), 'rip', { ...report('flag-downstream'), kind: 'out-of-tolerance', measurementKey: 'fence' }, at(10)))
    expect(result.run.steps['rip']!.problems[0]!.measurementKey).toBe('fence')
    expect(result.run.steps['glue']!.verifyFirst!.measurementKey).toBe('fence')
  })

  it('refuses unknown steps, unknown measurements, duplicate ids, and inactive runs', () => {
    const run = start()
    expect(reportProblem(run, 'nope', report('continue-with-note'), at(1)).error).toMatch(/unknown step/)
    expect(reportProblem(run, 'rip', { ...report('continue-with-note'), measurementKey: 'nope' }, at(1)).error).toMatch(/unknown measurement/)
    const first = ok(reportProblem(run, 'rip', report('continue-with-note'), at(1)))
    const dupe = reportProblem(first.run, 'rip', report('continue-with-note'), at(2))
    expect(dupe.error).toMatch(/already reported/)
    expect(dupe.run).toBe(first.run)
    const abandoned = ok(reportProblem(run, 'rip', report('abandon-build'), at(3)))
    expect(reportProblem(abandoned.run, 'rip', { ...report('continue-with-note'), id: 'p2' }, at(4)).error).toBe('build is abandoned')
  })
})

describe('reopenStep', () => {
  it('returns a completed step to pending and lists completed dependents for review', () => {
    const run = doneThrough(['select-stock', 'mill', 'rip', 'glue'])
    const result = ok(reopenStep(run, 'mill', at(100)))
    expect(result.run.steps['mill']).toMatchObject({ status: 'pending', batchDone: 0 })
    expect(result.run.steps['mill']!.completedAt).toBeUndefined()
    expect(result.reviewStepKeys).toEqual(['rip', 'glue'])
    expect(result.run.steps['rip']!.status).toBe('complete')
    expect(result.run.steps['rip']!.verifyFirst).toBeUndefined()
    expect(result.run.events.at(-1)).toEqual({ type: 'reopen-step', at: at(100), stepKey: 'mill' })
  })

  it('resets a batch step and clears a wait timer', () => {
    const run = doneThrough(['select-stock', 'mill', 'rip', 'glue', 'cure'])
    const batch = ok(reopenStep(run, 'rip', at(500)))
    expect(batch.run.steps['rip']!.batchDone).toBe(0)
    const wait = ok(reopenStep(run, 'cure', at(500)))
    expect(wait.run.steps['cure']!.readyAt).toBeUndefined()
    expect(wait.run.steps['cure']!.waitStartedAt).toBeUndefined()
    expect(wait.reviewStepKeys).toEqual([])
  })

  it('refuses a step that is not complete, unknown, or in an inactive run', () => {
    const run = start()
    const pending = reopenStep(run, 'mill', at(1))
    expect(pending.error).toBe('not complete: Mill stock')
    expect(pending.run).toBe(run)
    expect(pending.reviewStepKeys).toEqual([])
    expect(reopenStep(run, 'nope', at(1)).error).toMatch(/unknown step/)
    expect(reopenStep(pauseRun(doneThrough(['select-stock']), at(5)).run, 'select-stock', at(6)).error).toBe('build is paused')
  })
})

describe('clearVerifyFirst', () => {
  it('removes the flag from a flagged step', () => {
    const flagged = ok(recordMeasurement(tinyThroughMill(), 'rip', 'fence', 31, at(5))).run
    expect(flagged.steps['glue']!.verifyFirst).toBeDefined()
    const cleared = ok(clearVerifyFirst(flagged, 'glue'))
    expect(cleared.run.steps['glue']!.verifyFirst).toBeUndefined()
    expect('verifyFirst' in cleared.run.steps['glue']!).toBe(false)
    expect(flagged.steps['glue']!.verifyFirst).toBeDefined()
  })

  it('refuses an unflagged or unknown step', () => {
    const run = start()
    expect(clearVerifyFirst(run, 'glue')).toEqual({ run, error: 'not flagged: Glue-up' })
    expect(clearVerifyFirst(run, 'nope').error).toMatch(/unknown step/)
  })
})
