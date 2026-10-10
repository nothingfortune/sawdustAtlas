import { stepAvailability } from '../instructions/graph'
import type { InstructionPlan, InstructionStep, StepAvailability } from '../instructions/types'
import { BUILD_RUN_VERSION } from './types'
import type { AcknowledgedGap, BuildEvent, BuildRun, BuildRunResult, StepProgress } from './types'

// Build-run lifecycle: start, complete, undo, batches, waits, pause, finish. Pure and
// immutable — every mutation returns a new run with an appended event. A refused
// request returns the run unchanged plus a human-readable `error`. The clock is an
// input (`at`, `now`), never read.

export interface StartBuildRunInput {
  id: string
  plan: InstructionPlan
  startedAt: string
  displayUnits: 'metric' | 'imperial'
  acknowledgedGaps?: AcknowledgedGap[]
}

function pendingProgress(step: InstructionStep): StepProgress {
  return { stepKey: step.key, status: 'pending', batchDone: 0, measurements: {}, checklist: {}, notes: [], problems: [] }
}

/** Begin a run on a frozen deep copy of the plan (snapshot-on-start). */
export function startBuildRun(input: StartBuildRunInput): BuildRun {
  const plan = structuredClone(input.plan)
  const steps: Record<string, StepProgress> = {}
  for (const step of plan.steps) steps[step.key] = pendingProgress(step)
  return {
    version: BUILD_RUN_VERSION,
    id: input.id,
    plan,
    status: 'active',
    displayUnits: input.displayUnits,
    startedAt: input.startedAt,
    acknowledgedGaps: structuredClone(input.acknowledgedGaps ?? []),
    steps,
    events: [{ type: 'start', at: input.startedAt }],
  }
}

function refuse(run: BuildRun, error: string): BuildRunResult {
  return { run, error }
}

function findStep(run: BuildRun, stepKey: string): InstructionStep | undefined {
  return run.plan.steps.find(step => step.key === stepKey)
}

function titleOf(run: BuildRun, stepKey: string): string {
  return findStep(run, stepKey)?.title ?? stepKey
}

/** Why the run cannot take step actions right now, or null when it is active. */
function inactiveReason(run: BuildRun): string | null {
  if (run.status === 'active') return null
  if (run.status === 'paused') return 'build is paused'
  if (run.status === 'complete') return 'build is complete'
  return 'build is abandoned'
}

function progressView(run: BuildRun) {
  const completed = new Set<string>()
  const waits: Record<string, { readyAt: string }> = {}
  for (const [key, progress] of Object.entries(run.steps)) {
    if (progress.status === 'complete') completed.add(key)
    if (progress.readyAt !== undefined) waits[key] = { readyAt: progress.readyAt }
  }
  return { completed, waits }
}

export function buildRunAvailability(run: BuildRun, now: string): Record<string, StepAvailability> {
  return stepAvailability(run.plan, progressView(run), now)
}

function withStep(run: BuildRun, stepKey: string, patch: Partial<StepProgress>, event?: BuildEvent): BuildRun {
  const current = run.steps[stepKey]
  const next: BuildRun = { ...run, events: event ? [...run.events, event] : run.events }
  if (current) next.steps = { ...run.steps, [stepKey]: { ...current, ...patch } }
  return next
}

/** Shared guard: active run, known step, step currently available. */
function requireAvailable(run: BuildRun, stepKey: string, now: string): { step: InstructionStep; progress: StepProgress } | string {
  const inactive = inactiveReason(run)
  if (inactive) return inactive
  const step = findStep(run, stepKey)
  const progress = run.steps[stepKey]
  if (!step || !progress) return `unknown step: ${stepKey}`
  if (progress.status === 'complete') return `already complete: ${step.title}`
  const availability = buildRunAvailability(run, now)[stepKey]
  if (availability === 'waiting') {
    if (step.kind === 'wait' && progress.readyAt !== undefined) return `curing until ${progress.readyAt}`
    const holding = step.dependsOn.filter(dep => run.steps[dep]?.status !== 'complete').map(dep => titleOf(run, dep))
    return `waiting on: ${holding.join(', ')}`
  }
  if (availability !== 'available') {
    const blockers = step.dependsOn.filter(dep => run.steps[dep] && run.steps[dep].status !== 'complete').map(dep => titleOf(run, dep))
    return `blocked by: ${blockers.join(', ')}`
  }
  return { step, progress }
}

function finishStep(run: BuildRun, step: InstructionStep, at: string, batchDone: number): BuildRun {
  return withStep(run, step.key, { status: 'complete', completedAt: at, batchDone }, { type: 'complete-step', at, stepKey: step.key })
}

export function completeStep(run: BuildRun, stepKey: string, at: string): BuildRunResult {
  const check = requireAvailable(run, stepKey, at)
  if (typeof check === 'string') return refuse(run, check)
  const { step } = check
  return { run: finishStep(run, step, at, step.batch ? step.batch.count : check.progress.batchDone) }
}

export function advanceBatch(run: BuildRun, stepKey: string, at: string): BuildRunResult {
  const check = requireAvailable(run, stepKey, at)
  if (typeof check === 'string') return refuse(run, check)
  const { step, progress } = check
  if (!step.batch) return refuse(run, `not a batch step: ${step.title}`)
  const batchDone = progress.batchDone + 1
  const advanced = withStep(run, stepKey, { batchDone }, { type: 'batch-advance', at, stepKey, batchDone })
  return { run: batchDone >= step.batch.count ? finishStep(advanced, step, at, step.batch.count) : advanced }
}

/** Completed steps, oldest completion first, honouring undo and reopen events. */
function completionStack(run: BuildRun): string[] {
  const stack: string[] = []
  for (const event of run.events) {
    if (event.type === 'complete-step') stack.push(event.stepKey)
    else if (event.type === 'undo-complete' || event.type === 'reopen-step') {
      const index = stack.lastIndexOf(event.stepKey)
      if (index >= 0) stack.splice(index, 1)
    }
  }
  return stack.filter(key => run.steps[key]?.status === 'complete')
}

/** Revert the most recent completion (a mis-tap). Rework goes through reportProblem. */
export function undoLastCompletion(run: BuildRun, at: string): BuildRunResult {
  const inactive = inactiveReason(run)
  if (inactive) return refuse(run, inactive)
  const stepKey = completionStack(run).at(-1)
  const progress = stepKey === undefined ? undefined : run.steps[stepKey]
  if (stepKey === undefined || !progress) return refuse(run, 'nothing to undo')
  const step = findStep(run, stepKey)
  const { completedAt: _completedAt, ...rest } = progress
  const batchDone = step?.batch ? Math.max(0, step.batch.count - 1) : progress.batchDone
  const next: BuildRun = {
    ...run,
    steps: { ...run.steps, [stepKey]: { ...rest, status: 'pending', batchDone } },
    events: [...run.events, { type: 'undo-complete', at, stepKey }],
  }
  return { run: next }
}

export function startWait(run: BuildRun, stepKey: string, at: string): BuildRunResult {
  const check = requireAvailable(run, stepKey, at)
  if (typeof check === 'string') return refuse(run, check)
  const { step } = check
  if (step.kind !== 'wait' || !step.wait) return refuse(run, `not a wait step: ${step.title}`)
  const readyAt = new Date(Date.parse(at) + step.wait.minimumMinutes * 60_000).toISOString()
  return { run: withStep(run, stepKey, { waitStartedAt: at, readyAt }, { type: 'start-wait', at, stepKey, readyAt }) }
}

export function setChecklistItem(run: BuildRun, stepKey: string, itemKey: string, checked: boolean, _at: string): BuildRunResult {
  const inactive = inactiveReason(run)
  if (inactive) return refuse(run, inactive)
  const step = findStep(run, stepKey)
  const progress = run.steps[stepKey]
  if (!step || !progress) return refuse(run, `unknown step: ${stepKey}`)
  if (!step.checklist.some(item => item.key === itemKey)) return refuse(run, `unknown checklist item: ${itemKey}`)
  return { run: withStep(run, stepKey, { checklist: { ...progress.checklist, [itemKey]: checked } }) }
}

/** Notes are allowed while paused (shop observations) but not once the run is over. */
export function addStepNote(run: BuildRun, stepKey: string, note: { id: string; text: string }, at: string): BuildRunResult {
  if (run.status === 'complete' || run.status === 'abandoned') return refuse(run, inactiveReason(run) ?? '')
  const progress = run.steps[stepKey]
  if (!progress) return refuse(run, `unknown step: ${stepKey}`)
  if (note.text.trim() === '') return refuse(run, 'note is empty')
  return { run: withStep(run, stepKey, { notes: [...progress.notes, { id: note.id, text: note.text, at }] }) }
}

export function pauseRun(run: BuildRun, at: string): BuildRunResult {
  if (run.status !== 'active') return refuse(run, inactiveReason(run) ?? 'build is not active')
  return { run: { ...run, status: 'paused', pausedAt: at, events: [...run.events, { type: 'pause', at }] } }
}

export function resumeRun(run: BuildRun, at: string): BuildRunResult {
  if (run.status !== 'paused') return refuse(run, 'build is not paused')
  const { pausedAt: _pausedAt, ...rest } = run
  return { run: { ...rest, status: 'active', events: [...run.events, { type: 'resume', at }] } }
}

export function completeRun(run: BuildRun, at: string): BuildRunResult {
  const inactive = inactiveReason(run)
  if (inactive) return refuse(run, inactive)
  const remaining = run.plan.steps.filter(step => run.steps[step.key]?.status !== 'complete')
  if (remaining.length > 0) return refuse(run, `steps remaining: ${remaining.map(step => step.title).join(', ')}`)
  return { run: { ...run, status: 'complete', completedAt: at, events: [...run.events, { type: 'complete', at }] } }
}

export function abandonRun(run: BuildRun, at: string): BuildRunResult {
  if (run.status === 'complete' || run.status === 'abandoned') return refuse(run, inactiveReason(run) ?? '')
  const { pausedAt: _pausedAt, ...rest } = run
  return { run: { ...rest, status: 'abandoned', abandonedAt: at, events: [...run.events, { type: 'abandon', at }] } }
}

export function runProgress(run: BuildRun): { done: number; total: number; phases: Array<{ phaseKey: string; title: string; done: number; total: number }> } {
  const isDone = (key: string) => run.steps[key]?.status === 'complete'
  const phases = [...run.plan.phases]
    .sort((a, b) => a.order - b.order)
    .map(phase => {
      const inPhase = run.plan.steps.filter(step => step.phaseKey === phase.key)
      return { phaseKey: phase.key, title: phase.title, done: inPhase.filter(step => isDone(step.key)).length, total: inPhase.length }
    })
  return { done: run.plan.steps.filter(step => isDone(step.key)).length, total: run.plan.steps.length, phases }
}
