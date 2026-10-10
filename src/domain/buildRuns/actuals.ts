import { dependentsOf } from '../instructions/graph'
import type { Measurement } from '../instructions/types'
import type { BuildRun, BuildRunResult, ProblemKind, ProblemOutcome, StepProgress, VerifyFirstFlag } from './types'

// Actual measurements, problem reports, and verify-first flags (decision D6, stress
// tests F5/F6). Pure and immutable, like progress.ts: a refused request returns the
// run unchanged with a human-readable `error`.

const TOLERANCE_EPSILON = 1e-9

/** deviation = actual - target; within tolerance when -minus <= deviation <= plus (inclusive). */
export function evaluateMeasurement(measurement: Measurement, actual: number): { withinTolerance: boolean; deviation: number } {
  const deviation = actual - measurement.target
  const withinTolerance = deviation >= -measurement.tolerance.minus - TOLERANCE_EPSILON && deviation <= measurement.tolerance.plus + TOLERANCE_EPSILON
  return { withinTolerance, deviation }
}

function refuse<T extends object>(run: BuildRun, error: string, extra: T): BuildRunResult & T {
  return { run, error, ...extra }
}

function inactiveReason(run: BuildRun): string | null {
  if (run.status === 'active') return null
  if (run.status === 'paused') return 'build is paused'
  if (run.status === 'complete') return 'build is complete'
  return 'build is abandoned'
}

function titleOf(run: BuildRun, stepKey: string): string {
  return run.plan.steps.find(step => step.key === stepKey)?.title ?? stepKey
}

/** Set a flag on each target step that is not already flagged; returns the targeted keys. */
function flagSteps(steps: Record<string, StepProgress>, targets: readonly string[], flag: VerifyFirstFlag): Record<string, StepProgress> {
  const next = { ...steps }
  for (const key of targets) {
    const current = next[key]
    if (current && !current.verifyFirst) next[key] = { ...current, verifyFirst: { ...flag } }
  }
  return next
}

function incompleteKeys(run: BuildRun, keys: Iterable<string>): string[] {
  const wanted = new Set(keys)
  return run.plan.steps.filter(step => wanted.has(step.key) && run.steps[step.key]?.status !== 'complete').map(step => step.key)
}

function completedKeys(run: BuildRun, keys: Iterable<string>): string[] {
  const wanted = new Set(keys)
  return run.plan.steps.filter(step => wanted.has(step.key) && run.steps[step.key]?.status === 'complete').map(step => step.key)
}

export function recordMeasurement(
  run: BuildRun,
  stepKey: string,
  measurementKey: string,
  actual: number,
  at: string,
): BuildRunResult & { flaggedStepKeys: string[] } {
  const none = { flaggedStepKeys: [] as string[] }
  const inactive = inactiveReason(run)
  if (inactive) return refuse(run, inactive, none)
  const step = run.plan.steps.find(s => s.key === stepKey)
  const progress = run.steps[stepKey]
  if (!step || !progress) return refuse(run, `unknown step: ${stepKey}`, none)
  const measurement = step.measurements.find(m => m.key === measurementKey)
  if (!measurement) return refuse(run, `unknown measurement: ${measurementKey}`, none)
  if (!Number.isFinite(actual)) return refuse(run, 'measurement must be a finite number', none)

  const { withinTolerance, deviation } = evaluateMeasurement(measurement, actual)
  let steps: Record<string, StepProgress> = {
    ...run.steps,
    [stepKey]: { ...progress, measurements: { ...progress.measurements, [measurementKey]: { measurementKey, actual, recordedAt: at, withinTolerance, deviation } } },
  }

  let flaggedStepKeys: string[] = []
  if (measurement.critical && !withinTolerance) {
    const deviatedParts = new Set(measurement.partKey !== undefined ? [measurement.partKey] : step.outputs.map(output => output.partKey))
    const consumers = run.plan.steps
      .filter(candidate => candidate.key !== stepKey && candidate.inputs.some(input => deviatedParts.has(input.partKey)))
      .map(candidate => candidate.key)
    flaggedStepKeys = incompleteKeys(run, consumers)
    steps = flagSteps(steps, flaggedStepKeys, {
      reason: `${measurement.label} on "${step.title}" was out of tolerance`,
      sourceStepKey: stepKey,
      measurementKey,
    })
  }
  return { run: { ...run, steps, events: [...run.events, { type: 'measurement', at, stepKey, measurementKey }] }, flaggedStepKeys }
}

export interface ProblemReportInput {
  id: string
  kind: ProblemKind
  outcome: ProblemOutcome
  note: string
  measurementKey?: string
}

export function reportProblem(
  run: BuildRun,
  stepKey: string,
  report: ProblemReportInput,
  at: string,
): BuildRunResult & { flaggedStepKeys: string[]; reviewStepKeys: string[] } {
  const none = { flaggedStepKeys: [] as string[], reviewStepKeys: [] as string[] }
  const inactive = inactiveReason(run)
  if (inactive) return refuse(run, inactive, none)
  const step = run.plan.steps.find(s => s.key === stepKey)
  const progress = run.steps[stepKey]
  if (!step || !progress) return refuse(run, `unknown step: ${stepKey}`, none)
  if (progress.problems.some(problem => problem.id === report.id)) return refuse(run, `problem already reported: ${report.id}`, none)
  if (report.measurementKey !== undefined && !step.measurements.some(m => m.key === report.measurementKey)) {
    return refuse(run, `unknown measurement: ${report.measurementKey}`, none)
  }

  const problem = {
    id: report.id,
    kind: report.kind,
    outcome: report.outcome,
    note: report.note,
    at,
    ...(report.measurementKey !== undefined ? { measurementKey: report.measurementKey } : {}),
  }
  let steps: Record<string, StepProgress> = { ...run.steps, [stepKey]: { ...progress, problems: [...progress.problems, problem] } }
  const events: BuildRun['events'] = [...run.events]
  let flaggedStepKeys: string[] = []
  let reviewStepKeys: string[] = []
  let status = run.status
  let abandonedAt: string | undefined

  const flagBase = { sourceStepKey: stepKey, ...(report.measurementKey !== undefined ? { measurementKey: report.measurementKey } : {}) }
  const dependents = dependentsOf(run.plan, stepKey)

  switch (report.outcome) {
    case 'continue-with-note':
      break
    case 'rework-step': {
      const { completedAt: _completedAt, waitStartedAt: _waitStartedAt, readyAt: _readyAt, ...rest } = steps[stepKey]!
      steps[stepKey] = { ...rest, status: 'pending', batchDone: 0 }
      reviewStepKeys = completedKeys(run, dependents)
      flaggedStepKeys = reviewStepKeys
      steps = flagSteps(steps, reviewStepKeys, { ...flagBase, reason: `"${step.title}" is being reworked; check this step's result` })
      events.push({ type: 'reopen-step', at, stepKey })
      break
    }
    case 'flag-downstream':
      flaggedStepKeys = incompleteKeys(run, dependents)
      steps = flagSteps(steps, flaggedStepKeys, { ...flagBase, reason: `Problem reported on "${step.title}": ${report.note}` })
      break
    case 'abandon-build':
      status = 'abandoned'
      abandonedAt = at
      break
  }

  events.push({ type: 'problem', at, stepKey, problemId: report.id, outcome: report.outcome })
  if (status === 'abandoned') events.push({ type: 'abandon', at })
  const { pausedAt: _pausedAt, ...base } = run
  const next: BuildRun = { ...base, steps, events, status, ...(abandonedAt !== undefined ? { abandonedAt } : {}) }
  return { run: next, flaggedStepKeys, reviewStepKeys }
}

/** Send a completed step back to pending (physical rework); its completed dependents are returned for review. */
export function reopenStep(run: BuildRun, stepKey: string, at: string): BuildRunResult & { reviewStepKeys: string[] } {
  const none = { reviewStepKeys: [] as string[] }
  const inactive = inactiveReason(run)
  if (inactive) return refuse(run, inactive, none)
  const progress = run.steps[stepKey]
  if (!progress) return refuse(run, `unknown step: ${stepKey}`, none)
  if (progress.status !== 'complete') return refuse(run, `not complete: ${titleOf(run, stepKey)}`, none)
  const { completedAt: _completedAt, waitStartedAt: _waitStartedAt, readyAt: _readyAt, ...rest } = progress
  return {
    run: {
      ...run,
      steps: { ...run.steps, [stepKey]: { ...rest, status: 'pending', batchDone: 0 } },
      events: [...run.events, { type: 'reopen-step', at, stepKey }],
    },
    reviewStepKeys: completedKeys(run, dependentsOf(run.plan, stepKey)),
  }
}

/** The woodworker has checked the flagged step and accepts it. */
export function clearVerifyFirst(run: BuildRun, stepKey: string): BuildRunResult {
  const progress = run.steps[stepKey]
  if (!progress) return { run, error: `unknown step: ${stepKey}` }
  if (!progress.verifyFirst) return { run, error: `not flagged: ${titleOf(run, stepKey)}` }
  const { verifyFirst: _verifyFirst, ...rest } = progress
  return { run: { ...run, steps: { ...run.steps, [stepKey]: rest } } }
}
