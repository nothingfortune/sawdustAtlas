import type { WarningSeverity, WorkspaceWarning } from '../workspaceWarnings'
import type {
  InstructionPlan,
  InstructionStep,
  PendingDecision,
  PlanValidation,
  ProjectReadiness,
  ReadinessAttestations,
  ReadinessChip,
  ReadinessDimension,
  ReadinessReason,
  StartGate,
} from './types'

// Readiness chips and the start gate (decisions D3 and D5). Pure: the caller supplies
// the validation result, the project's workspace warnings, and the woodworker's
// attestations. Readiness is computed on demand and never stored (C11).

export interface ReadinessInput {
  plan: InstructionPlan
  validation: PlanValidation
  /** Workspace warnings already filtered to this project by the caller. */
  designWarnings: readonly WorkspaceWarning[]
  attestations: ReadinessAttestations
  decisions?: readonly PendingDecision[]
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function bySeverity(reasons: readonly ReadinessReason[], severity: WarningSeverity): ReadinessReason[] {
  return reasons.filter((reason) => reason.severity === severity)
}

function stepKeysUsingPart(plan: InstructionPlan, partKey: string): string[] {
  return plan.steps.filter((step) => step.inputs.some((input) => input.partKey === partKey)).map((step) => step.key)
}

function stepKeysUsingTool(plan: InstructionPlan, toolKey: string): string[] {
  return plan.steps.filter((step: InstructionStep) => step.tools.some((tool) => tool.key === toolKey)).map((step) => step.key)
}

function chip(dimension: ReadinessDimension, status: ReadinessChip['status'], summary: string, reasons: ReadinessReason[]): ReadinessChip {
  return { dimension, status, summary, reasons }
}

function severityCounts(reasons: readonly ReadinessReason[]): string {
  const errors = bySeverity(reasons, 'error').length
  const warnings = bySeverity(reasons, 'warning').length
  const parts: string[] = []
  if (errors > 0) parts.push(plural(errors, 'error'))
  if (warnings > 0) parts.push(plural(warnings, 'warning'))
  return parts.join(', ')
}

function designChip(input: ReadinessInput): ReadinessChip {
  const reasons: ReadinessReason[] = []
  for (const warning of input.designWarnings) {
    reasons.push({ message: warning.message, severity: warning.severity, ...(warning.location ? { location: warning.location } : {}) })
  }
  // Plan-level and step-level errors are design errors too; plan warnings belong to the warnings chip.
  const planWarnings = [...input.plan.warnings, ...input.plan.steps.flatMap((step) => step.warnings)]
  for (const warning of planWarnings) {
    if (warning.severity !== 'error') continue
    reasons.push({ message: warning.message, severity: 'error', ...(warning.location ? { location: warning.location } : {}), ...(warning.stepKey ? { stepKeys: [warning.stepKey] } : {}) })
  }
  if (reasons.length === 0) return chip('design', 'ready', 'Ready', reasons)
  const status = bySeverity(reasons, 'error').length > 0 ? 'blocked' : 'attention'
  return chip('design', status, severityCounts(reasons), reasons)
}

function instructionsChip(input: ReadinessInput): ReadinessChip {
  const reasons: ReadinessReason[] = input.validation.issues.map((issue) => ({
    message: issue.message,
    severity: issue.severity,
    ...(issue.stepKey ? { stepKeys: [issue.stepKey] } : {}),
  }))
  if (reasons.length === 0) return chip('instructions', 'ready', 'Ready', reasons)
  const status = bySeverity(reasons, 'error').length > 0 ? 'blocked' : 'attention'
  return chip('instructions', status, severityCounts(reasons), reasons)
}

interface RequirementLine {
  key: string
  label: string
  stepKeys: string[]
}

function attestedChip(dimension: 'material' | 'tools', lines: readonly RequirementLine[], attestations: Record<string, 'have' | 'need'>): ReadinessChip {
  if (lines.length === 0) return chip(dimension, 'ready', 'Ready', [])
  // Own-property lookup so a line key such as "constructor" can never read an inherited value.
  const attested = (key: string) => (Object.hasOwn(attestations, key) ? attestations[key] : undefined)
  const needed = lines.filter((line) => attested(line.key) === 'need')
  if (needed.length > 0) {
    const reasons = needed.map((line): ReadinessReason => ({ message: `Need: ${line.label}`, severity: 'warning', stepKeys: line.stepKeys }))
    return chip(dimension, 'attention', `${needed.length} of ${plural(lines.length, 'line')} needed`, reasons)
  }
  if (lines.some((line) => attested(line.key) === undefined)) {
    const noun = dimension === 'material' ? 'Material' : 'Tools'
    return chip(dimension, 'not-tracked', 'Not tracked', [{ message: `${noun} not tracked: confirm what you have before you start`, severity: 'warning' }])
  }
  return chip(dimension, 'ready', 'Ready', [])
}

function warningsChip(plan: InstructionPlan): ReadinessChip {
  const reasons: ReadinessReason[] = []
  for (const warning of [...plan.warnings, ...plan.steps.flatMap((step) => step.warnings)]) {
    if (warning.severity !== 'warning') continue
    reasons.push({ message: warning.message, severity: 'warning', ...(warning.location ? { location: warning.location } : {}), ...(warning.stepKey ? { stepKeys: [warning.stepKey] } : {}) })
  }
  if (reasons.length === 0) return chip('warnings', 'ready', 'Ready', reasons)
  return chip('warnings', 'attention', plural(reasons.length, 'warning'), reasons)
}

function decisionsChip(decisions: readonly PendingDecision[]): ReadinessChip {
  if (decisions.length === 0) return chip('decisions', 'ready', 'Ready', [])
  const reasons = decisions.map((decision): ReadinessReason => ({ message: decision.message, severity: 'warning' }))
  return chip('decisions', 'attention', `${plural(decisions.length, 'decision')} pending`, reasons)
}

export function computeReadiness(input: ReadinessInput): ProjectReadiness {
  const { plan, attestations } = input
  const stockLines = plan.requirements.stock.map((line): RequirementLine => ({
    key: line.key,
    label: `${line.speciesName} stock (${line.key})`,
    stepKeys: stepKeysUsingPart(plan, line.partKey),
  }))
  const toolLines = plan.requirements.tools.map((tool): RequirementLine => ({ key: tool.key, label: tool.name, stepKeys: stepKeysUsingTool(plan, tool.key) }))

  const design = designChip(input)
  const instructions = instructionsChip(input)
  const material = attestedChip('material', stockLines, attestations.stock)
  const tools = attestedChip('tools', toolLines, attestations.tools)
  const warnings = warningsChip(plan)
  const decisions = decisionsChip(input.decisions ?? [])
  const chips = [design, instructions, material, tools, warnings, decisions]

  const hardBlocks = [...bySeverity(design.reasons, 'error'), ...bySeverity(instructions.reasons, 'error')]
  const softGaps = [...material.reasons, ...tools.reasons, ...warnings.reasons, ...decisions.reasons]
  const startGate: StartGate = { allowed: hardBlocks.length === 0, hardBlocks, softGaps }
  return { chips, startGate }
}
