import type { InstructionPlan, ReadinessDimension } from '../instructions/types'

// Build-run contracts: one real-world execution of an instruction plan. Pure types.
//
// Snapshot-on-start (stress test C6): a run embeds a frozen copy of the plan it began
// with, so later design edits, regenerated plans, or shop-wide setting changes can
// never alter an active build. Build-run state lives outside the undoable design
// workspace — designer undo must never roll back bench progress.
//
// Timestamps are ISO-8601 strings supplied by the caller; the domain never reads the
// clock, so every function stays deterministic and testable.

export const BUILD_RUN_VERSION = 1

export type BuildRunStatus = 'active' | 'paused' | 'complete' | 'abandoned'

export type StepProgressStatus = 'pending' | 'complete'

export interface MeasurementRecord {
  measurementKey: string
  actual: number
  recordedAt: string
  withinTolerance: boolean
  /** actual − target, same unit as the measurement. */
  deviation: number
}

export interface StepNote {
  id: string
  text: string
  at: string
}

export type ProblemKind = 'out-of-tolerance' | 'part-ruined' | 'stock-defect' | 'tool-unavailable' | 'instruction-wrong' | 'other'

/** The four outcomes of the report-problem flow (stress test F5). */
export type ProblemOutcome = 'continue-with-note' | 'rework-step' | 'flag-downstream' | 'abandon-build'

export interface ProblemReport {
  id: string
  kind: ProblemKind
  outcome: ProblemOutcome
  note: string
  at: string
  measurementKey?: string
}

/** Decision D6: a step that consumes a deviated output is marked verify-first. */
export interface VerifyFirstFlag {
  reason: string
  sourceStepKey: string
  measurementKey?: string
}

export interface StepProgress {
  stepKey: string
  status: StepProgressStatus
  completedAt?: string
  /** Batch steps: repetitions done so far, 0..batch.count. */
  batchDone: number
  /** Wait steps: timestamp-based timer (stress test F8) — survives sleep and reloads. */
  waitStartedAt?: string
  readyAt?: string
  /** By Measurement.key. */
  measurements: Record<string, MeasurementRecord>
  /** By ChecklistItem.key. */
  checklist: Record<string, boolean>
  notes: StepNote[]
  problems: ProblemReport[]
  verifyFirst?: VerifyFirstFlag
}

/** A soft-gate gap the woodworker acknowledged when starting (decision D5). */
export interface AcknowledgedGap {
  dimension: ReadinessDimension
  message: string
  acknowledgedAt: string
  stepKeys: string[]
}

export type BuildEvent =
  | { type: 'start'; at: string }
  | { type: 'pause'; at: string }
  | { type: 'resume'; at: string }
  | { type: 'complete-step'; at: string; stepKey: string }
  | { type: 'undo-complete'; at: string; stepKey: string }
  | { type: 'reopen-step'; at: string; stepKey: string }
  | { type: 'batch-advance'; at: string; stepKey: string; batchDone: number }
  | { type: 'start-wait'; at: string; stepKey: string; readyAt: string }
  | { type: 'measurement'; at: string; stepKey: string; measurementKey: string }
  | { type: 'problem'; at: string; stepKey: string; problemId: string; outcome: ProblemOutcome }
  | { type: 'complete'; at: string }
  | { type: 'abandon'; at: string }

export interface BuildRun {
  version: typeof BUILD_RUN_VERSION
  id: string
  /** Frozen copy of the plan at start. Never regenerated. */
  plan: InstructionPlan
  status: BuildRunStatus
  /** Display units in effect when the build started; the plan itself is always mm. */
  displayUnits: 'metric' | 'imperial'
  startedAt: string
  pausedAt?: string
  completedAt?: string
  abandonedAt?: string
  acknowledgedGaps: AcknowledgedGap[]
  /** By InstructionStep.key; one entry per plan step. */
  steps: Record<string, StepProgress>
  /** Append-only history, oldest first. */
  events: BuildEvent[]
}

/** Every mutating build-run function returns the next run plus an optional reason the
 *  request was refused (the run is returned unchanged in that case). */
export interface BuildRunResult {
  run: BuildRun
  error?: string
}
