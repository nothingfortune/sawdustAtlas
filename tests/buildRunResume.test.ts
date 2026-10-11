import { describe, expect, it } from 'vitest'
import { recordMeasurement } from '../src/domain/buildRuns/actuals'
import { abandonRun, addStepNote, advanceBatch, completeStep, pauseRun, startBuildRun, startWait } from '../src/domain/buildRuns/progress'
import { benchInventory, resumeSummary } from '../src/domain/buildRuns/resume'
import type { BuildRun } from '../src/domain/buildRuns/types'
import { branchingPlan, tinyEdgePlan } from './fixtures/instructionPlans'

const T0 = '2026-10-10T08:00:00.000Z'
const at = (minutes: number) => new Date(Date.parse(T0) + minutes * 60_000).toISOString()

function start(plan = tinyEdgePlan()): BuildRun {
  return startBuildRun({ id: 'run1', plan, startedAt: T0, displayUnits: 'metric' })
}
function ok(result: { run: BuildRun; error?: string }): BuildRun {
  expect(result.error).toBeUndefined()
  return result.run
}
const keysOf = (items: Array<{ partKey: string }>) => items.map(i => i.partKey)
const done = (...keys: string[]) => new Set(keys)

describe('benchInventory', () => {
  const plan = tinyEdgePlan()

  it('is empty before anything is done', () => {
    expect(benchInventory(plan, done())).toEqual([])
  })

  it('lists produced parts and drops consumed ones as steps complete', () => {
    expect(keysOf(benchInventory(plan, done('select-stock')))).toEqual(['stock:walnut'])
    expect(keysOf(benchInventory(plan, done('select-stock', 'mill')))).toEqual(['stock:walnut/milled'])
    expect(keysOf(benchInventory(plan, done('select-stock', 'mill', 'rip')))).toEqual(['strip:s1', 'strip:s2'])
    expect(keysOf(benchInventory(plan, done('select-stock', 'mill', 'rip', 'glue')))).toEqual(['panel:tiny'])
  })

  it('leaves inventory unchanged for a step with non-consumed inputs', () => {
    const before = benchInventory(plan, done('select-stock', 'mill', 'rip', 'glue'))
    const after = benchInventory(plan, done('select-stock', 'mill', 'rip', 'glue', 'cure'))
    expect(after).toEqual(before)
    expect(keysOf(benchInventory(plan, done('select-stock', 'mill', 'rip', 'glue', 'cure', 'surface')))).toEqual(['board:tiny'])
  })

  it('returns label, name, and quantity, in plan.parts order', () => {
    const items = benchInventory(plan, done('select-stock', 'mill', 'rip'))
    expect(items).toEqual([
      { partKey: 'strip:s1', label: 'S1', name: 'Walnut strip S1', quantity: 1 },
      { partKey: 'strip:s2', label: 'S2', name: 'Walnut strip S2', quantity: 1 },
    ])
  })

  it('handles the branching plan with parallel branches', () => {
    const branch = branchingPlan()
    expect(keysOf(benchInventory(branch, done('a-prep', 'b-prep')))).toEqual(['stock:a', 'stock:b'])
    expect(keysOf(benchInventory(branch, done('a-prep', 'a-glue', 'a-cure', 'b-prep', 'b-cut')))).toEqual(['panel:a', 'wafer:b'])
    expect(keysOf(benchInventory(branch, done('a-prep', 'a-glue', 'a-cure', 'b-prep', 'b-cut', 'join')))).toEqual(['board:branch'])
  })

  it('ignores steps that are not completed even when later steps are listed', () => {
    // mill alone consumes a part that was never produced: the quantity goes negative and is omitted.
    expect(benchInventory(plan, done('mill'))).toEqual([{ partKey: 'stock:walnut/milled', label: 'W', name: 'Milled walnut blank', quantity: 1 }])
  })
})

describe('resumeSummary', () => {
  it('describes a fresh run', () => {
    const summary = resumeSummary(start(), at(5))
    expect(summary).toMatchObject({
      status: 'active', lastCompleted: null, pausedMinutes: null, nextStepKey: 'select-stock',
      runningWaits: [], recentNotes: [], flaggedSteps: [], benchInventory: [],
    })
    expect(summary.progress).toMatchObject({ done: 0, total: 6 })
  })

  it('reports the last completed step and the next step', () => {
    let run = ok(completeStep(start(), 'select-stock', at(1)))
    run = ok(completeStep(run, 'mill', at(2)))
    const summary = resumeSummary(run, at(10))
    expect(summary.lastCompleted).toEqual({ stepKey: 'mill', title: 'Mill stock', at: at(2) })
    expect(summary.nextStepKey).toBe('rip')
    expect(keysOf(summary.benchInventory)).toEqual(['stock:walnut/milled'])
    expect(summary.progress.done).toBe(2)
  })

  it('reports pausedMinutes only while paused, at full precision', () => {
    const run = start()
    const paused = ok(pauseRun(run, at(10)))
    expect(resumeSummary(run, at(20)).pausedMinutes).toBeNull()
    expect(resumeSummary(paused, at(100)).pausedMinutes).toBe(90)
    expect(resumeSummary(paused, new Date(Date.parse(at(10)) + 90_000).toISOString()).pausedMinutes).toBe(1.5)
    expect(resumeSummary(paused, at(5)).pausedMinutes).toBe(0)
    expect(resumeSummary(paused, at(100)).status).toBe('paused')
  })

  it('lists running waits as not ready, then ready once the timer passes', () => {
    let run = start()
    for (const key of ['select-stock', 'mill']) run = ok(completeStep(run, key, at(1)))
    run = ok(advanceBatch(ok(advanceBatch(run, 'rip', at(2))), 'rip', at(3)))
    run = ok(completeStep(run, 'glue', at(4)))
    run = ok(startWait(run, 'cure', at(10)))
    const during = resumeSummary(run, at(30))
    expect(during.runningWaits).toEqual([{ stepKey: 'cure', title: 'Let the glue set', readyAt: at(55), ready: false }])
    expect(during.nextStepKey).toBeNull()
    expect(resumeSummary(run, at(55)).runningWaits[0]!.ready).toBe(true)
    expect(resumeSummary(run, at(56)).nextStepKey).toBe('cure')
    const finished = ok(completeStep(run, 'cure', at(60)))
    expect(resumeSummary(finished, at(61)).runningWaits).toEqual([])
    expect(resumeSummary(finished, at(61)).nextStepKey).toBe('surface')
  })

  it('orders multiple running waits by readyAt and leaves the other branch workable', () => {
    let run = start(branchingPlan())
    run = ok(completeStep(run, 'a-prep', at(1)))
    run = ok(completeStep(run, 'a-glue', at(2)))
    run = ok(startWait(run, 'a-cure', at(3)))
    const summary = resumeSummary(run, at(4))
    expect(summary.runningWaits.map(w => w.stepKey)).toEqual(['a-cure'])
    expect(summary.nextStepKey).toBe('b-prep')
  })

  it('keeps only the five newest notes, newest first', () => {
    let run = start()
    for (let i = 1; i <= 7; i++) run = ok(addStepNote(run, i % 2 ? 'mill' : 'rip', { id: `n${i}`, text: `note ${i}` }, at(i)))
    const summary = resumeSummary(run, at(20))
    expect(summary.recentNotes.map(n => n.text)).toEqual(['note 7', 'note 6', 'note 5', 'note 4', 'note 3'])
    expect(summary.recentNotes[0]).toEqual({ stepKey: 'mill', text: 'note 7', at: at(7) })
  })

  it('lists flagged steps with their reasons', () => {
    let run = ok(completeStep(start(), 'select-stock', at(1)))
    run = ok(completeStep(run, 'mill', at(2)))
    run = ok(recordMeasurement(run, 'rip', 'fence', 31, at(3)))
    const summary = resumeSummary(run, at(4))
    expect(summary.flaggedSteps).toHaveLength(1)
    expect(summary.flaggedSteps[0]).toMatchObject({ stepKey: 'glue', title: 'Glue-up' })
    expect(summary.flaggedSteps[0]!.reason).toMatch(/out of tolerance/)
  })

  it('has no next step once the run is abandoned or every step is done', () => {
    const abandoned = ok(abandonRun(start(), at(1)))
    expect(resumeSummary(abandoned, at(2))).toMatchObject({ status: 'abandoned', nextStepKey: null })
    let run = start(branchingPlan())
    for (const key of ['a-prep', 'a-glue']) run = ok(completeStep(run, key, at(1)))
    run = ok(startWait(run, 'a-cure', at(2)))
    for (const key of ['b-prep', 'b-cut']) run = ok(completeStep(run, key, at(3)))
    run = ok(completeStep(run, 'a-cure', at(40)))
    run = ok(completeStep(run, 'join', at(41)))
    const summary = resumeSummary(run, at(42))
    expect(summary.nextStepKey).toBeNull()
    expect(summary.lastCompleted?.stepKey).toBe('join')
    expect(summary.progress).toMatchObject({ done: 6, total: 6 })
  })

  it('picks the latest completion by time, not by plan order', () => {
    let run = start(branchingPlan())
    run = ok(completeStep(run, 'b-prep', at(1)))
    run = ok(completeStep(run, 'a-prep', at(2)))
    expect(resumeSummary(run, at(3)).lastCompleted).toEqual({ stepKey: 'a-prep', title: 'a-prep', at: at(2) })
  })
})
