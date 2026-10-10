import type { LifecycleEvent, ProjectLifecycle } from './types'

// Project lifecycle (stress test C11). Readiness is computed, never stored here.

const TRANSITIONS: Readonly<Record<LifecycleEvent, Readonly<Partial<Record<ProjectLifecycle, ProjectLifecycle>>>>> = {
  'mark-planned': { draft: 'planned' },
  'build-started': { draft: 'building', planned: 'building', complete: 'building' },
  'reopen-design': { planned: 'draft', complete: 'draft' },
  'build-paused': { building: 'paused' },
  'build-resumed': { paused: 'building' },
  'build-completed': { building: 'complete' },
  'build-abandoned': { building: 'planned', paused: 'planned' },
}

/** Apply a lifecycle event. An invalid (state, event) pair returns the current state
 *  unchanged plus an error naming both. */
export function applyLifecycleEvent(current: ProjectLifecycle, event: LifecycleEvent): { lifecycle: ProjectLifecycle; error?: string } {
  const next = TRANSITIONS[event][current]
  if (next === undefined) return { lifecycle: current, error: `Cannot apply "${event}" while the project is ${current}.` }
  return { lifecycle: next }
}
