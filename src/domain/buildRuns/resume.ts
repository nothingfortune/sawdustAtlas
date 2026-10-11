import type { InstructionPlan } from '../instructions/types'
import { buildRunAvailability, runProgress } from './progress'
import type { BuildRun, BuildRunStatus } from './types'

// Bench inventory and the resume summary (stress test F8): what the woodworker needs
// to see when they walk back into the shop. Pure; the clock is the `now` input.

export interface BenchItem {
  partKey: string
  label: string
  name: string
  quantity: number
}

/** Outputs of completed steps minus consumed inputs of completed steps, quantities above zero, in plan.parts order. */
export function benchInventory(plan: InstructionPlan, completed: ReadonlySet<string>): BenchItem[] {
  const quantities = new Map<string, number>()
  for (const step of plan.steps) {
    if (!completed.has(step.key)) continue
    for (const output of step.outputs) quantities.set(output.partKey, (quantities.get(output.partKey) ?? 0) + output.quantity)
    for (const input of step.inputs) {
      if (input.consumed) quantities.set(input.partKey, (quantities.get(input.partKey) ?? 0) - input.quantity)
    }
  }
  const items: BenchItem[] = []
  for (const part of plan.parts) {
    const quantity = quantities.get(part.key) ?? 0
    if (quantity > 0) items.push({ partKey: part.key, label: part.label, name: part.name, quantity })
  }
  return items
}

export interface ResumeSummary {
  status: BuildRunStatus
  lastCompleted: { stepKey: string; title: string; at: string } | null
  pausedMinutes: number | null
  nextStepKey: string | null
  runningWaits: Array<{ stepKey: string; title: string; readyAt: string; ready: boolean }>
  recentNotes: Array<{ stepKey: string; text: string; at: string }>
  flaggedSteps: Array<{ stepKey: string; title: string; reason: string }>
  benchInventory: BenchItem[]
  progress: ReturnType<typeof runProgress>
}

const RECENT_NOTE_LIMIT = 5

export function resumeSummary(run: BuildRun, now: string): ResumeSummary {
  const nowMs = Date.parse(now)
  const steps = run.plan.steps
  const completed = new Set(steps.filter(step => run.steps[step.key]?.status === 'complete').map(step => step.key))

  let lastCompleted: ResumeSummary['lastCompleted'] = null
  let lastMs = Number.NEGATIVE_INFINITY
  for (const step of steps) {
    const completedAt = run.steps[step.key]?.completedAt
    if (completedAt === undefined || !completed.has(step.key)) continue
    const ms = Date.parse(completedAt)
    // Ties go to the later step in plan order.
    if (ms >= lastMs) {
      lastMs = ms
      lastCompleted = { stepKey: step.key, title: step.title, at: completedAt }
    }
  }

  const pausedMinutes = run.status === 'paused' && run.pausedAt !== undefined ? Math.max(0, (nowMs - Date.parse(run.pausedAt)) / 60_000) : null

  let nextStepKey: string | null = null
  if (run.status === 'active' || run.status === 'paused') {
    const availability = buildRunAvailability(run, now)
    nextStepKey = [...steps].filter(step => availability[step.key] === 'available').sort((a, b) => a.order - b.order || (a.key < b.key ? -1 : 1))[0]?.key ?? null
  }

  const runningWaits = steps
    .filter(step => !completed.has(step.key) && run.steps[step.key]?.readyAt !== undefined)
    .map(step => {
      const readyAt = run.steps[step.key]!.readyAt!
      return { stepKey: step.key, title: step.title, readyAt, ready: nowMs >= Date.parse(readyAt) }
    })
    .sort((a, b) => Date.parse(a.readyAt) - Date.parse(b.readyAt))

  const notes = steps.flatMap(step => (run.steps[step.key]?.notes ?? []).map(note => ({ stepKey: step.key, text: note.text, at: note.at })))
  // Array.prototype.sort is stable: equal timestamps keep plan/insertion order.
  const recentNotes = notes.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, RECENT_NOTE_LIMIT)

  const flaggedSteps = steps
    .filter(step => run.steps[step.key]?.verifyFirst !== undefined)
    .map(step => ({ stepKey: step.key, title: step.title, reason: run.steps[step.key]!.verifyFirst!.reason }))

  return {
    status: run.status,
    lastCompleted,
    pausedMinutes,
    nextStepKey,
    runningWaits,
    recentNotes,
    flaggedSteps,
    benchInventory: benchInventory(run.plan, completed),
    progress: runProgress(run),
  }
}
