import type { InstructionPlan, InstructionStep, StepAvailability } from './types'

// Dependency graph over instruction steps: ordering, cycle detection, transitive
// prerequisites, part producers and consumers, and step availability against build
// progress. Pure: the clock is an input (`now`), never read.

/** Direct dependencies that name a known step; unknown keys are ignored. */
function knownDependencies(steps: readonly InstructionStep[]): Map<string, string[]> {
  const known = new Set(steps.map(step => step.key))
  const result = new Map<string, string[]>()
  for (const step of steps) result.set(step.key, step.dependsOn.filter(key => known.has(key)))
  return result
}

function compareSteps(a: InstructionStep, b: InstructionStep): number {
  return a.order - b.order || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
}

/** Strongly connected components that contain a cycle (size > 1, or a self-loop). */
function cyclicComponents(sorted: readonly InstructionStep[], deps: Map<string, string[]>): string[][] {
  let counter = 0
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const components: string[][] = []

  const visit = (key: string): void => {
    index.set(key, counter)
    low.set(key, counter)
    counter++
    stack.push(key)
    onStack.add(key)
    for (const dep of deps.get(key) ?? []) {
      if (!index.has(dep)) {
        visit(dep)
        low.set(key, Math.min(low.get(key)!, low.get(dep)!))
      } else if (onStack.has(dep)) {
        low.set(key, Math.min(low.get(key)!, index.get(dep)!))
      }
    }
    if (low.get(key) === index.get(key)) {
      const component: string[] = []
      let member: string | undefined
      do {
        member = stack.pop()
        if (member === undefined) break
        onStack.delete(member)
        component.push(member)
      } while (member !== key)
      if (component.length > 1 || (deps.get(key) ?? []).includes(key)) components.push(component)
    }
  }
  for (const step of sorted) if (!index.has(step.key)) visit(step.key)
  return components
}

/**
 * One dependency cycle, or null. Keys are in dependency order: each key is a
 * prerequisite of the next, and the last is a prerequisite of the first.
 */
export function findCycle(steps: readonly InstructionStep[]): string[] | null {
  const sorted = [...steps].sort(compareSteps)
  const deps = knownDependencies(steps)
  const components = cyclicComponents(sorted, deps)
  if (components.length === 0) return null
  const members = new Set(components.flat())
  const start = sorted.find(step => members.has(step.key))!.key
  const component = new Set(components.find(c => c.includes(start)))

  // Walk dependsOn edges inside the component until the walk returns to `start`.
  const path: string[] = []
  const seen = new Set<string>()
  const walk = (key: string): boolean => {
    path.push(key)
    seen.add(key)
    for (const dep of [...(deps.get(key) ?? [])].sort()) {
      if (!component.has(dep)) continue
      if (dep === start) return true
      if (!seen.has(dep) && walk(dep)) return true
    }
    path.pop()
    return false
  }
  walk(start)
  // path[i] depends on path[i + 1]; reverse so each key is a prerequisite of the next.
  return path.reverse()
}

/**
 * Topological order, ties broken by `order` then key. On a cycle, `order` lists every
 * step that is not on a cycle (ignoring dependencies on cyclic steps) and `cycle` names one.
 */
export function topologicalOrder(steps: readonly InstructionStep[]): { order: string[]; cycle: string[] | null } {
  const sorted = [...steps].sort(compareSteps)
  const deps = knownDependencies(steps)
  const cyclic = new Set(cyclicComponents(sorted, deps).flat())
  const remaining = new Map<string, Set<string>>()
  for (const step of sorted) {
    if (cyclic.has(step.key)) continue
    remaining.set(step.key, new Set((deps.get(step.key) ?? []).filter(dep => !cyclic.has(dep))))
  }
  const order: string[] = []
  while (remaining.size > 0) {
    // Insertion order follows the (order, key) sort, so the first ready entry is the tie-break winner.
    let next: string | undefined
    for (const [key, waitingOn] of remaining) {
      if (waitingOn.size === 0) {
        next = key
        break
      }
    }
    if (next === undefined) break
    remaining.delete(next)
    order.push(next)
    for (const waitingOn of remaining.values()) waitingOn.delete(next)
  }
  return { order, cycle: cyclic.size > 0 ? findCycle(steps) : null }
}

function closure(edges: Map<string, string[]>, start: string): Set<string> {
  const result = new Set<string>()
  const pending = [...(edges.get(start) ?? [])]
  while (pending.length > 0) {
    const key = pending.pop()!
    if (result.has(key)) continue
    result.add(key)
    pending.push(...(edges.get(key) ?? []))
  }
  result.delete(start)
  return result
}

/** Every step that must finish before `stepKey` (transitive, excludes itself). */
export function prerequisitesOf(plan: InstructionPlan, stepKey: string): Set<string> {
  return closure(knownDependencies(plan.steps), stepKey)
}

/** Every step that depends on `stepKey` (transitive, excludes itself). */
export function dependentsOf(plan: InstructionPlan, stepKey: string): Set<string> {
  const reverse = new Map<string, string[]>()
  for (const [key, deps] of knownDependencies(plan.steps)) {
    for (const dep of deps) reverse.set(dep, [...(reverse.get(dep) ?? []), key])
  }
  return closure(reverse, stepKey)
}

/** Keys of steps that output the part, in plan order. */
export function producersOf(plan: InstructionPlan, partKey: string): string[] {
  return plan.steps.filter(step => step.outputs.some(output => output.partKey === partKey)).map(step => step.key)
}

/** Keys of steps that take the part as any input, consumed or not, in plan order. */
export function consumersOf(plan: InstructionPlan, partKey: string): string[] {
  return plan.steps.filter(step => step.inputs.some(input => input.partKey === partKey)).map(step => step.key)
}

export interface ProgressView {
  completed: ReadonlySet<string>
  /** Started wait timers by step key. */
  waits: Readonly<Record<string, { readyAt: string }>>
}

export function stepAvailability(plan: InstructionPlan, progress: ProgressView, now: string): Record<string, StepAvailability> {
  const nowMs = Date.parse(now)
  const deps = knownDependencies(plan.steps)
  const byKey = new Map(plan.steps.map(step => [step.key, step]))
  const result: Record<string, StepAvailability> = {}
  const { order, cycle } = topologicalOrder(plan.steps)

  for (const key of order) {
    const step = byKey.get(key)!
    if (progress.completed.has(key)) {
      result[key] = 'done'
      continue
    }
    const stepDeps = deps.get(key) ?? []
    const allDone = stepDeps.every(dep => progress.completed.has(dep))
    const timer = step.kind === 'wait' ? progress.waits[key] : undefined
    if (timer && nowMs < Date.parse(timer.readyAt)) {
      result[key] = 'waiting'
    } else if (allDone) {
      result[key] = 'available'
    } else {
      const incomplete = stepDeps.filter(dep => !progress.completed.has(dep))
      result[key] = incomplete.every(dep => result[dep] === 'waiting') ? 'waiting' : 'blocked'
    }
  }
  // Steps on a cycle can never start.
  if (cycle) {
    for (const step of plan.steps) {
      if (!(step.key in result)) result[step.key] = progress.completed.has(step.key) ? 'done' : 'blocked'
    }
  }
  return result
}

/** The available step with the lowest `order`, or null. */
export function nextStep(plan: InstructionPlan, progress: ProgressView, now: string): string | null {
  const availability = stepAvailability(plan, progress, now)
  const candidates = plan.steps.filter(step => availability[step.key] === 'available').sort(compareSteps)
  return candidates[0]?.key ?? null
}
