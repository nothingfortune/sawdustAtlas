import { describe, expect, it } from 'vitest'
import {
  abandonRun, addStepNote, advanceBatch, buildRunAvailability, completeRun, completeStep, pauseRun, resumeRun,
  runProgress, setChecklistItem, startBuildRun, startWait, undoLastCompletion,
} from '../src/domain/buildRuns/progress'
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

/** Complete the tiny plan up to (not including) `until`. */
function advanceTiny(run: BuildRun, until: string): BuildRun {
  let current = run
  let t = 1
  for (const key of ['select-stock', 'mill', 'rip', 'glue', 'cure', 'surface']) {
    if (key === until) break
    if (key === 'rip') {
      current = ok(advanceBatch(current, key, at(t++)))
      current = ok(advanceBatch(current, key, at(t++)))
    } else if (key === 'cure') {
      current = ok(startWait(current, key, at(t)))
      current = ok(completeStep(current, key, at(t + 60)))
      t += 61
    } else current = ok(completeStep(current, key, at(t++)))
  }
  return current
}

describe('startBuildRun', () => {
  it('creates one pending progress entry per step and logs a start event', () => {
    const run = start()
    expect(run.status).toBe('active')
    expect(Object.keys(run.steps)).toHaveLength(6)
    expect(Object.values(run.steps).every(s => s.status === 'pending' && s.batchDone === 0)).toBe(true)
    expect(run.events).toEqual([{ type: 'start', at: T0 }])
  })

  it('is isolated from the source plan (snapshot-on-start)', () => {
    const plan = tinyEdgePlan()
    const run = start(plan)
    plan.steps[0]!.title = 'Changed'
    plan.steps.pop()
    plan.finished.length = 1
    expect(run.plan.steps).toHaveLength(6)
    expect(run.plan.steps[0]!.title).toBe('Select stock')
    expect(run.plan.finished.length).toBe(480)
    expect(run.plan).not.toBe(plan)
  })

  it('copies acknowledged gaps', () => {
    const gaps = [{ dimension: 'tools' as const, message: 'No clamps', acknowledgedAt: T0, stepKeys: ['glue'] }]
    const run = startBuildRun({ id: 'r', plan: tinyEdgePlan(), startedAt: T0, displayUnits: 'imperial', acknowledgedGaps: gaps })
    gaps[0]!.stepKeys.push('x')
    expect(run.acknowledgedGaps[0]!.stepKeys).toEqual(['glue'])
    expect(run.displayUnits).toBe('imperial')
  })
})

describe('completeStep', () => {
  it('completes steps in order, appends events, and does not mutate the input run', () => {
    const run = start()
    const before = structuredClone(run)
    const next = ok(completeStep(run, 'select-stock', at(1)))
    expect(run).toEqual(before)
    expect(next.steps['select-stock']).toMatchObject({ status: 'complete', completedAt: at(1) })
    expect(next.events.at(-1)).toEqual({ type: 'complete-step', at: at(1), stepKey: 'select-stock' })
    expect(buildRunAvailability(next, at(1))['mill']).toBe('available')
  })

  it('refuses a blocked step, naming the blocker, and returns the run unchanged', () => {
    const run = start()
    const result = completeStep(run, 'rip', at(1))
    expect(result.error).toBe('blocked by: Mill stock')
    expect(result.run).toBe(run)
  })

  it('refuses unknown and already-complete steps', () => {
    const run = ok(completeStep(start(), 'select-stock', at(1)))
    expect(completeStep(run, 'nope', at(2)).error).toMatch(/unknown step/)
    const again = completeStep(run, 'select-stock', at(2))
    expect(again.error).toMatch(/already complete/)
    expect(again.run).toBe(run)
  })

  it('refuses while paused, complete, or abandoned', () => {
    const paused = ok(pauseRun(start(), at(1)))
    const result = completeStep(paused, 'select-stock', at(2))
    expect(result.error).toBe('build is paused')
    expect(result.run).toBe(paused)
    expect(completeStep(ok(abandonRun(start(), at(1))), 'select-stock', at(2)).error).toBe('build is abandoned')
  })

  it('sets batchDone to the count when a batch step is completed directly', () => {
    const run = advanceTiny(start(), 'rip')
    expect(ok(completeStep(run, 'rip', at(20))).steps['rip']!.batchDone).toBe(2)
  })
})

describe('advanceBatch', () => {
  it('increments, then auto-completes at the count', () => {
    const run = advanceTiny(start(), 'rip')
    const once = ok(advanceBatch(run, 'rip', at(10)))
    expect(once.steps['rip']).toMatchObject({ status: 'pending', batchDone: 1 })
    expect(once.events.at(-1)).toEqual({ type: 'batch-advance', at: at(10), stepKey: 'rip', batchDone: 1 })
    const twice = ok(advanceBatch(once, 'rip', at(11)))
    expect(twice.steps['rip']).toMatchObject({ status: 'complete', batchDone: 2, completedAt: at(11) })
    expect(twice.events.slice(-2).map(e => e.type)).toEqual(['batch-advance', 'complete-step'])
  })

  it('refuses a non-batch step and a blocked batch step', () => {
    expect(advanceBatch(start(), 'select-stock', at(1)).error).toMatch(/not a batch step/)
    expect(advanceBatch(start(), 'rip', at(1)).error).toMatch(/blocked by/)
  })
})

describe('undoLastCompletion', () => {
  it('reverts a mis-tapped completion and restores availability', () => {
    const done = ok(completeStep(start(), 'select-stock', at(1)))
    const undone = ok(undoLastCompletion(done, at(2)))
    expect(undone.steps['select-stock']!.status).toBe('pending')
    expect(undone.steps['select-stock']!.completedAt).toBeUndefined()
    expect(undone.events.at(-1)).toEqual({ type: 'undo-complete', at: at(2), stepKey: 'select-stock' })
    expect(buildRunAvailability(undone, at(2))['mill']).toBe('blocked')
  })

  it('undoes the most recent completion first, repeatedly', () => {
    let run = advanceTiny(start(), 'glue')
    run = ok(undoLastCompletion(run, at(50)))
    expect(run.steps['rip']!.status).toBe('pending')
    run = ok(undoLastCompletion(run, at(51)))
    expect(run.steps['mill']!.status).toBe('pending')
    expect(run.steps['select-stock']!.status).toBe('complete')
  })

  it('returns a batch step to count minus one', () => {
    const run = advanceTiny(start(), 'glue')
    const undone = ok(undoLastCompletion(run, at(50)))
    expect(undone.steps['rip']).toMatchObject({ status: 'pending', batchDone: 1 })
    const redone = ok(advanceBatch(undone, 'rip', at(51)))
    expect(redone.steps['rip']!.status).toBe('complete')
  })

  it('refuses with nothing to undo and while paused', () => {
    const fresh = start()
    expect(undoLastCompletion(fresh, at(1))).toEqual({ run: fresh, error: 'nothing to undo' })
    const paused = ok(pauseRun(ok(completeStep(fresh, 'select-stock', at(1))), at(2)))
    expect(undoLastCompletion(paused, at(3)).error).toBe('build is paused')
  })
})

describe('waits', () => {
  it('sets readyAt from the minimum minutes and refuses completion while curing', () => {
    const run = advanceTiny(start(), 'cure')
    const waiting = ok(startWait(run, 'cure', at(100)))
    expect(waiting.steps['cure']).toMatchObject({ waitStartedAt: at(100), readyAt: at(145) })
    expect(buildRunAvailability(waiting, at(120))['cure']).toBe('waiting')
    expect(buildRunAvailability(waiting, at(120))['surface']).toBe('waiting')
    const early = completeStep(waiting, 'cure', at(120))
    expect(early.error).toBe(`curing until ${at(145)}`)
    expect(early.run).toBe(waiting)
    expect(completeStep(waiting, 'surface', at(120)).error).toMatch(/waiting on: Let the glue set/)
  })

  it('completes at and after readyAt', () => {
    const waiting = ok(startWait(advanceTiny(start(), 'cure'), 'cure', at(100)))
    expect(completeStep(waiting, 'cure', at(145)).run.steps['cure']!.status).toBe('complete')
    expect(completeStep(waiting, 'cure', at(300)).error).toBeUndefined()
  })

  it('refuses startWait on non-wait or blocked steps', () => {
    expect(startWait(start(), 'select-stock', at(1)).error).toMatch(/not a wait step/)
    expect(startWait(start(), 'cure', at(1)).error).toMatch(/blocked by/)
  })

  it('survives a branching plan: the other branch stays workable during a cure', () => {
    let run = start(branchingPlan())
    run = ok(completeStep(run, 'a-prep', at(1)))
    run = ok(completeStep(run, 'a-glue', at(2)))
    run = ok(startWait(run, 'a-cure', at(3)))
    run = ok(completeStep(run, 'b-prep', at(4)))
    run = ok(completeStep(run, 'b-cut', at(5)))
    const avail = buildRunAvailability(run, at(6))
    expect(avail['a-cure']).toBe('waiting')
    expect(avail['join']).toBe('waiting')
    expect(completeStep(run, 'join', at(6)).error).toMatch(/waiting on: a-cure/)
    run = ok(completeStep(run, 'a-cure', at(40)))
    expect(ok(completeStep(run, 'join', at(41))).steps['join']!.status).toBe('complete')
  })
})

describe('checklist and notes', () => {
  it('toggles a known checklist item and refuses unknown ones', () => {
    const run = start()
    const checked = ok(setChecklistItem(run, 'select-stock', 'defects', true, at(1)))
    expect(checked.steps['select-stock']!.checklist).toEqual({ defects: true })
    expect(ok(setChecklistItem(checked, 'select-stock', 'defects', false, at(2))).steps['select-stock']!.checklist).toEqual({ defects: false })
    expect(setChecklistItem(run, 'select-stock', 'nope', true, at(1)).error).toMatch(/unknown checklist item/)
    expect(setChecklistItem(run, 'nope', 'defects', true, at(1)).error).toMatch(/unknown step/)
  })

  it('adds notes, allows them while paused, and refuses empty notes or finished runs', () => {
    const run = ok(addStepNote(start(), 'mill', { id: 'n1', text: 'Knot near end' }, at(1)))
    expect(run.steps['mill']!.notes).toEqual([{ id: 'n1', text: 'Knot near end', at: at(1) }])
    const paused = ok(pauseRun(run, at(2)))
    expect(addStepNote(paused, 'mill', { id: 'n2', text: 'More' }, at(3)).error).toBeUndefined()
    expect(addStepNote(run, 'mill', { id: 'n3', text: '  ' }, at(3)).error).toBe('note is empty')
    expect(addStepNote(ok(abandonRun(run, at(3))), 'mill', { id: 'n4', text: 'x' }, at(4)).error).toBe('build is abandoned')
  })
})

describe('pause, resume, complete, abandon', () => {
  it('pauses and resumes, recording pausedAt only while paused', () => {
    const paused = ok(pauseRun(start(), at(5)))
    expect(paused.status).toBe('paused')
    expect(paused.pausedAt).toBe(at(5))
    expect(pauseRun(paused, at(6)).error).toBe('build is paused')
    const resumed = ok(resumeRun(paused, at(30)))
    expect(resumed.status).toBe('active')
    expect(resumed.pausedAt).toBeUndefined()
    expect(resumed.events.map(e => e.type)).toEqual(['start', 'pause', 'resume'])
    expect(resumeRun(resumed, at(31)).error).toBe('build is not paused')
  })

  it('completes the run only when every step is done', () => {
    const partial = advanceTiny(start(), 'surface')
    const refused = completeRun(partial, at(500))
    expect(refused.error).toBe('steps remaining: Square and surface')
    expect(refused.run).toBe(partial)
    const full = ok(completeStep(partial, 'surface', at(500)))
    const finished = ok(completeRun(full, at(501)))
    expect(finished).toMatchObject({ status: 'complete', completedAt: at(501) })
    expect(finished.events.at(-1)).toEqual({ type: 'complete', at: at(501) })
    expect(completeRun(finished, at(502)).error).toBe('build is complete')
  })

  it('abandons an active or paused run, but not a finished one', () => {
    const abandoned = ok(abandonRun(ok(pauseRun(start(), at(1))), at(2)))
    expect(abandoned).toMatchObject({ status: 'abandoned', abandonedAt: at(2) })
    expect(abandoned.pausedAt).toBeUndefined()
    expect(abandonRun(abandoned, at(3)).error).toBe('build is abandoned')
    expect(abandonRun(abandoned, at(3)).run).toBe(abandoned)
  })
})

describe('runProgress', () => {
  it('reports totals and per-phase counts in phase order', () => {
    const run = advanceTiny(start(), 'cure')
    const progress = runProgress(run)
    expect(progress.total).toBe(6)
    expect(progress.done).toBe(4)
    expect(progress.phases).toEqual([
      { phaseKey: 'prepare', title: 'Prepare stock', done: 2, total: 2 },
      { phaseKey: 'rip', title: 'Rip strips', done: 1, total: 1 },
      { phaseKey: 'glue', title: 'Glue-up', done: 1, total: 2 },
      { phaseKey: 'finish', title: 'Square and surface', done: 0, total: 1 },
    ])
  })

  it('works on the branching plan', () => {
    const run = ok(completeStep(start(branchingPlan()), 'b-prep', at(1)))
    const progress = runProgress(run)
    expect(progress).toMatchObject({ done: 1, total: 6 })
    expect(progress.phases.map(p => [p.phaseKey, p.done, p.total])).toEqual([['panels', 1, 5], ['assembly', 0, 1]])
  })
})
