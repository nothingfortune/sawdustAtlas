import { findCycle, prerequisitesOf } from './graph'
import { planRevision } from './revisions'
import { INSTRUCTION_PLAN_VERSION, IRREVERSIBLE_KINDS } from './types'
import type { InstructionPlan, InstructionStep, OperationKind, PlanIssueCode, PlanValidation, PlanValidationIssue } from './types'
import type { WarningSeverity } from '../workspaceWarnings'

// Independent plan validator. It reads only the plan (plus IRREVERSIBLE_KINDS and
// planRevision) and never imports a generator, so a generator bug cannot hide itself.
// Issues are produced in an order that does not depend on the order of `plan.steps`.

/** Kinds that observe or position material without producing a new part. */
const OUTPUTLESS_KINDS: readonly OperationKind[] = ['wait', 'mark', 'dry-fit']

// A number followed by a unit. `in` is also an ordinary preposition, so it only counts
// when the next word is not a common function word ("2 in the list", "3 in order"); a
// real dimension such as "12 in wide" is still flagged.
const DIMENSION_IN_PROSE = new RegExp(
  '(?:\\d+\\/\\d+|\\d+(?:[.,]\\d+)?)\\s*(?:' +
    'mm(?![A-Za-z])|cm(?![A-Za-z])|' +
    'in(?![A-Za-z])(?!\\s+(?:the|a|an|this|that|these|those|each|every|order|sequence|turn|total|case|your|its|their|any|all|one)\\b)|' +
    'inch(?:es)?(?![A-Za-z])|deg(?:rees?)?(?![A-Za-z])|["\u201d\u2033\u00b0])',
  'i',
)

function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0
}

export function validatePlan(plan: InstructionPlan): PlanValidation {
  const issues: PlanValidationIssue[] = []
  const report = (code: PlanIssueCode, message: string, where: { stepKey?: string; partKey?: string } = {}, severity: WarningSeverity = 'error') => {
    const issue: PlanValidationIssue = { code, severity, message }
    if (where.stepKey !== undefined) issue.stepKey = where.stepKey
    if (where.partKey !== undefined) issue.partKey = where.partKey
    issues.push(issue)
  }

  if (plan.version !== INSTRUCTION_PLAN_VERSION) {
    report('unsupported-version', `Plan version ${String(plan.version)} is not supported (expected ${INSTRUCTION_PLAN_VERSION}).`)
  }

  const steps = [...plan.steps].sort((a, b) => compareKeys(a.key, b.key))
  const phaseKeys = new Set(plan.phases.map(phase => phase.key))
  const stepKeys = new Set(plan.steps.map(step => step.key))
  const partKeys = new Set(plan.parts.map(part => part.key))
  const cutIds = new Set(plan.requirements.cuts.map(cut => cut.id))

  checkDuplicates(plan, steps, report)

  // Produced and consumed totals per part, for over-consumption and coverage checks.
  const produced = new Map<string, number>()
  const consumed = new Map<string, number>()
  const consumedAnywhere = new Set<string>()
  for (const step of steps) {
    for (const output of step.outputs) produced.set(output.partKey, (produced.get(output.partKey) ?? 0) + output.quantity)
    for (const input of step.inputs) {
      if (!input.consumed) continue
      consumed.set(input.partKey, (consumed.get(input.partKey) ?? 0) + input.quantity)
      consumedAnywhere.add(input.partKey)
    }
  }

  // Order validity: positive integers, unique.
  const orderCounts = new Map<number, number>()
  for (const step of steps) orderCounts.set(step.order, (orderCounts.get(step.order) ?? 0) + 1)
  const stepsByKey = new Map(plan.steps.map(step => [step.key, step]))

  const coveredCuts = new Set<string>()
  for (const step of steps) {
    const at = { stepKey: step.key }

    if (!phaseKeys.has(step.phaseKey)) report('unknown-phase', `Step "${step.key}" is in unknown phase "${step.phaseKey}".`, at)

    if (!isPositiveInteger(step.order)) {
      report('order-invalid', `Step "${step.key}" has order ${String(step.order)}; it must be a positive integer.`, at)
    } else if ((orderCounts.get(step.order) ?? 0) > 1) {
      report('order-invalid', `Step "${step.key}" shares order ${step.order} with another step.`, at)
    }

    for (const dep of step.dependsOn) {
      if (dep === step.key) {
        report('self-dependency', `Step "${step.key}" depends on itself.`, at)
        continue
      }
      const depStep = stepsByKey.get(dep)
      if (!stepKeys.has(dep) || !depStep) {
        report('unknown-dependency', `Step "${step.key}" depends on unknown step "${dep}".`, at)
        continue
      }
      if (!(depStep.order < step.order)) {
        report('order-violates-dependency', `Step "${step.key}" (order ${step.order}) must come after its dependency "${dep}" (order ${depStep.order}).`, at)
      }
    }

    checkParts(step, partKeys, report)
    checkInputsAvailable(plan, step, partKeys, report)

    for (const cutId of step.cutIds) {
      coveredCuts.add(cutId)
      if (!cutIds.has(cutId)) report('unknown-cut', `Step "${step.key}" references unknown cut "${cutId}".`, at)
    }

    checkOutputs(step, report)
    checkIrreversible(step, report)

    if (step.batch && (!isPositiveInteger(step.batch.count) || step.batch.unitLabel.trim() === '')) {
      report('invalid-batch', `Step "${step.key}" has an invalid batch: count must be an integer of at least 1 and the unit label must not be empty.`, at)
    }

    for (const measurement of step.measurements) {
      const { target, tolerance, unit } = measurement
      const bad =
        !Number.isFinite(target) ||
        !Number.isFinite(tolerance.minus) ||
        !Number.isFinite(tolerance.plus) ||
        tolerance.minus < 0 ||
        tolerance.plus < 0 ||
        (unit === 'count' && !Number.isInteger(target))
      if (bad) report('invalid-measurement', `Measurement "${measurement.key}" on step "${step.key}" has an invalid target or tolerance.`, at)
    }

    checkWait(step, report)
    checkVisual(step, report)

    for (const [label, text] of [['title', step.title], ['instruction', step.instruction]] as const) {
      const match = DIMENSION_IN_PROSE.exec(text)
      if (match) report('dimension-in-prose', `Step "${step.key}" ${label} carries a dimension ("${match[0].trim()}"); move it to a measurement or setup value.`, at)
    }

    for (const warning of step.warnings) {
      if (warning.stepKey !== undefined && !stepKeys.has(warning.stepKey)) {
        report('unknown-step', `Warning "${warning.id}" on step "${step.key}" names unknown step "${warning.stepKey}".`, at)
      }
    }
  }

  // Cycles: reported once. Self-dependencies already have their own code.
  const cycle = findCycle(plan.steps.map(step => ({ ...step, dependsOn: step.dependsOn.filter(dep => dep !== step.key) })))
  if (cycle) report('dependency-cycle', `Steps form a dependency cycle: ${cycle.join(' -> ')}.`, { stepKey: cycle[0]! })

  // Part-level rules.
  for (const part of [...plan.parts].sort((a, b) => compareKeys(a.key, b.key))) {
    if (!produced.has(part.key)) report('part-never-produced', `No step produces part "${part.key}".`, { partKey: part.key })
  }
  for (const [partKey, total] of [...consumed].sort(([a], [b]) => compareKeys(a, b))) {
    const made = produced.get(partKey)
    if (made !== undefined && total > made) {
      report('over-consumed', `Part "${partKey}" is consumed ${total} times but produced ${made}.`, { partKey })
    }
  }

  for (const line of [...plan.requirements.stock].sort((a, b) => compareKeys(a.key, b.key))) {
    if (!partKeys.has(line.partKey)) {
      report('unknown-part', `Stock line "${line.key}" supplies unknown part "${line.partKey}".`, { partKey: line.partKey })
    } else if (!consumedAnywhere.has(line.partKey)) {
      report('stock-not-consumed', `Stock part "${line.partKey}" is never consumed by any step.`, { partKey: line.partKey })
    }
  }

  for (const assembly of [...plan.assemblies].sort((a, b) => compareKeys(a.key, b.key))) {
    for (const partKey of assembly.partKeys) {
      if (!partKeys.has(partKey)) report('unknown-part', `Assembly "${assembly.key}" includes unknown part "${partKey}".`, { partKey })
    }
    for (const stepKey of assembly.stepKeys) {
      if (!stepKeys.has(stepKey)) report('unknown-step', `Assembly "${assembly.key}" names unknown step "${stepKey}".`, { stepKey })
    }
  }

  for (const cut of plan.requirements.cuts) {
    if (!coveredCuts.has(cut.id)) report('cut-not-covered', `Cut "${cut.id}" is not executed by any step.`)
  }

  for (const warning of plan.warnings) {
    if (warning.stepKey !== undefined && !stepKeys.has(warning.stepKey)) {
      report('unknown-step', `Warning "${warning.id}" names unknown step "${warning.stepKey}".`, { stepKey: warning.stepKey })
    }
  }

  if (plan.revision !== planRevision(plan)) {
    report('revision-mismatch', 'The plan revision does not match its content.')
  }

  // Errors first; Array.prototype.sort is stable, so the rest keeps generation order.
  issues.sort((a, b) => Number(b.severity === 'error') - Number(a.severity === 'error'))
  return { ok: !issues.some(issue => issue.severity === 'error'), issues }
}

type Report = (code: PlanIssueCode, message: string, where?: { stepKey?: string; partKey?: string }, severity?: WarningSeverity) => void

function checkDuplicates(plan: InstructionPlan, steps: readonly InstructionStep[], report: Report): void {
  const dupes = (label: string, keys: readonly string[], where: (key: string) => { stepKey?: string; partKey?: string } = () => ({})) => {
    const seen = new Set<string>()
    const reported = new Set<string>()
    for (const key of keys) {
      if (seen.has(key) && !reported.has(key)) {
        reported.add(key)
        report('duplicate-key', `Duplicate ${label} key "${key}".`, where(key))
      }
      seen.add(key)
    }
  }
  dupes('phase', plan.phases.map(phase => phase.key))
  dupes('step', steps.map(step => step.key), key => ({ stepKey: key }))
  dupes('part', plan.parts.map(part => part.key), key => ({ partKey: key }))
  dupes('assembly', plan.assemblies.map(assembly => assembly.key))
  dupes('stock line', plan.requirements.stock.map(line => line.key))
  dupes('cut', plan.requirements.cuts.map(cut => cut.id))
  dupes('tool', plan.requirements.tools.map(tool => tool.key))
  for (const step of steps) {
    dupes(`measurement on step "${step.key}"`, step.measurements.map(m => m.key), () => ({ stepKey: step.key }))
    dupes(`checklist item on step "${step.key}"`, step.checklist.map(item => item.key), () => ({ stepKey: step.key }))
    const outputs = new Set(step.outputs.map(output => output.partKey))
    const reported = new Set<string>()
    for (const input of step.inputs) {
      if (outputs.has(input.partKey) && !reported.has(input.partKey)) {
        reported.add(input.partKey)
        report('duplicate-key', `Step "${step.key}" both takes and outputs part "${input.partKey}".`, { stepKey: step.key, partKey: input.partKey })
      }
    }
  }
}

function checkParts(step: InstructionStep, partKeys: ReadonlySet<string>, report: Report): void {
  const unknown = (where: string, partKey: string) => {
    if (!partKeys.has(partKey)) report('unknown-part', `Step "${step.key}" ${where} unknown part "${partKey}".`, { stepKey: step.key, partKey })
  }
  for (const input of step.inputs) unknown('takes', input.partKey)
  for (const output of step.outputs) unknown('outputs', output.partKey)
  for (const partKey of step.visual.highlightPartKeys) unknown('highlights', partKey)
  for (const partKey of step.visual.ghostPartKeys) unknown('ghosts', partKey)
  for (const annotation of step.visual.annotations) if (annotation.partKey !== undefined) unknown('annotates', annotation.partKey)
  for (const measurement of step.measurements) if (measurement.partKey !== undefined) unknown('measures', measurement.partKey)
}

function checkInputsAvailable(plan: InstructionPlan, step: InstructionStep, partKeys: ReadonlySet<string>, report: Report): void {
  if (step.inputs.length === 0) return
  const prerequisites = prerequisitesOf(plan, step.key)
  for (const input of step.inputs) {
    if (!partKeys.has(input.partKey)) continue
    const available = plan.steps.some(other => prerequisites.has(other.key) && other.outputs.some(output => output.partKey === input.partKey))
    if (!available) {
      report('input-not-available', `Step "${step.key}" needs part "${input.partKey}", which no prerequisite step produces.`, { stepKey: step.key, partKey: input.partKey })
    }
  }
}

function checkOutputs(step: InstructionStep, report: Report): void {
  const at = { stepKey: step.key }
  if (OUTPUTLESS_KINDS.includes(step.kind)) {
    if (step.inputs.length === 0) report('missing-output', `A ${step.kind} step ("${step.key}") must take at least one input.`, at)
    if (step.inputs.some(input => input.consumed)) report('missing-output', `A ${step.kind} step ("${step.key}") may not consume anything.`, at)
  } else if (step.outputs.length === 0) {
    report('missing-output', `Step "${step.key}" produces no output.`, at)
  }
}

function checkIrreversible(step: InstructionStep, report: Report): void {
  const at = { stepKey: step.key }
  if (IRREVERSIBLE_KINDS.includes(step.kind) && !step.irreversible) {
    report('irreversible-not-flagged', `A ${step.kind} step ("${step.key}") must be flagged irreversible.`, at)
  }
  if (step.irreversible) {
    const hasCheck = step.measurements.some(m => m.phase === 'verify-before') || step.checklist.some(item => item.critical)
    if (!hasCheck) report('irreversible-without-check', `Irreversible step "${step.key}" needs a verify-before measurement or a critical checklist item.`, at)
  }
}

function checkWait(step: InstructionStep, report: Report): void {
  const at = { stepKey: step.key }
  if (step.kind === 'wait') {
    if (!step.wait) report('invalid-wait', `Wait step "${step.key}" has no wait specification.`, at)
    else if (!Number.isFinite(step.wait.minimumMinutes) || step.wait.minimumMinutes <= 0) {
      report('invalid-wait', `Wait step "${step.key}" needs a finite, positive minimum time.`, at)
    }
  } else if (step.wait) {
    report('invalid-wait', `Step "${step.key}" is not a wait step but carries a wait specification.`, at, 'warning')
  }
}

function checkVisual(step: InstructionStep, report: Report): void {
  const ghosted = new Set(step.visual.ghostPartKeys)
  for (const partKey of step.visual.highlightPartKeys) {
    if (ghosted.has(partKey)) {
      report('invalid-visual', `Step "${step.key}" both highlights and ghosts part "${partKey}".`, { stepKey: step.key, partKey }, 'warning')
    }
  }
  if (step.visual.camera && step.visual.view !== 'scene-3d') {
    report('invalid-visual', `Step "${step.key}" sets a camera on a ${step.visual.view} view.`, { stepKey: step.key }, 'warning')
  }
}
