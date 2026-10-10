import type { BoardProject, WoodSpecies } from '../../types'
import { calculateBuildDimensions } from '../boardAllowances'
import type { BuildDimensions } from '../boardAllowances'
import { generateCuttingBoardPlan } from '../boardCutPlan'
import type { CuttingBoardPlan, StockRequirement } from '../boardCutPlan'
import { calculateEndGrainMetrics } from '../boardGeometry'
import type { EndGrainMetrics } from '../boardGeometry'
import { boardPartMarks } from './boardMarking'
import type { BoardMarks } from './boardMarking'
import { withRevision } from './revisions'
import { DEFAULT_GLUE_CLAMP_MINUTES, DEFAULT_TOLERANCES } from './tolerances'
import { INSTRUCTION_PLAN_VERSION } from './types'
import type {
  ChecklistItem, CutRef, GenerationContext, InstructionAssembly, InstructionGenerator, InstructionPhase, InstructionPlan, InstructionStep,
  Measurement, PartDimensions, PlanPart, PlanWarning, StepViewKind, StepVisual, StockLine, ToolRequirement, VisualAnnotation,
} from './types'
import { clampAngle } from '../units'

// Cutting-board instruction generator (Phase 1). It wraps the existing engines and adds
// no geometry: every number comes from calculateBuildDimensions, calculateEndGrainMetrics,
// generateCuttingBoardPlan, and boardPartMarks. Keys derive from source identity (strip
// id, rip-group identity, board id), never from list position, and carry
// `context.keyPrefix` so a plan can be embedded in a composite.

const TOOLS = {
  jointer: { key: 'jointer', name: 'Jointer', category: 'jointer' },
  planer: { key: 'planer', name: 'Thickness planer', category: 'planer' },
  tableSaw: { key: 'table-saw', name: 'Table saw', category: 'table-saw' },
  clamps: { key: 'clamps', name: 'Bar clamps', category: 'clamps' },
  glue: { key: 'glue', name: 'Wood glue', category: 'glue' },
  measuring: { key: 'measuring', name: 'Tape measure and calipers', category: 'measuring' },
  marking: { key: 'marking', name: 'Pencil and marking knife', category: 'marking' },
  finish: { key: 'finish', name: 'Finishing supplies', category: 'finish' },
} as const satisfies Record<string, ToolRequirement>

interface RipGroupInfo {
  /** Rip-group identity: species, finished width, angle, rough width. */
  key: string
  speciesId: string
  roughWidth: number
  finishedWidth: number
  stripIndexes: number[]
}

interface StockLineInfo {
  lineKey: string
  requirement: StockRequirement
  partKey: string
  milledKey: string
}

export interface BoardPlanInputs {
  project: BoardProject
  woods: readonly WoodSpecies[]
  prefix: string
  asCompositePanel: boolean
  metrics: EndGrainMetrics
  build: BuildDimensions
  legacy: CuttingBoardPlan
  marks: BoardMarks
}

export function boardPlanInputs(project: BoardProject, context: GenerationContext): BoardPlanInputs {
  const metrics = calculateEndGrainMetrics(project)
  const build = calculateBuildDimensions(project, metrics)
  return {
    project,
    woods: context.woods,
    prefix: context.keyPrefix ?? '',
    asCompositePanel: context.asCompositePanel === true,
    metrics,
    build,
    legacy: generateCuttingBoardPlan(project, context.woods, build, metrics),
    marks: boardPartMarks(project, metrics),
  }
}

// ---- Plan builder -----------------------------------------------------------------

type StepDef = Partial<Omit<InstructionStep, 'key' | 'phaseKey' | 'order' | 'kind'>> & Pick<InstructionStep, 'kind' | 'title' | 'instruction'>

export class PlanBuilder {
  readonly phases: InstructionPhase[] = []
  readonly steps: InstructionStep[] = []
  readonly parts: PlanPart[] = []
  readonly assemblies: InstructionAssembly[] = []
  constructor(readonly prefix: string) {}

  key(local: string): string {
    return this.prefix + local
  }

  phase(local: string, title: string): string {
    const key = this.key(local)
    this.phases.push({ key, order: this.phases.length + 1, title })
    return key
  }

  part(local: string, part: Omit<PlanPart, 'key'>): string {
    const key = this.key(local)
    this.parts.push({ key, ...part })
    return key
  }

  /** Adds a step; `key` and `phaseKey` are local and get the prefix. Returns the full step key. */
  step(local: string, phaseKey: string, def: StepDef): string {
    const key = this.key(local)
    this.steps.push({
      dependsOn: [],
      irreversible: false,
      inputs: [],
      outputs: [],
      tools: [],
      measurements: [],
      checklist: [],
      warnings: [],
      visual: visual('board-face', 'after', []),
      cutIds: [],
      ...def,
      key,
      phaseKey,
      order: this.steps.length + 1,
    })
    return key
  }

  tools(): ToolRequirement[] {
    const seen = new Map<string, ToolRequirement>()
    for (const step of this.steps) for (const tool of step.tools) if (!seen.has(tool.key)) seen.set(tool.key, tool)
    return [...seen.values()]
  }
}

export function visual(view: StepViewKind, state: StepVisual['state'], highlight: string[], extra: Partial<Pick<StepVisual, 'ghostPartKeys' | 'annotations'>> = {}): StepVisual {
  return { view, state, highlightPartKeys: highlight, ghostPartKeys: extra.ghostPartKeys ?? [], annotations: extra.annotations ?? [] }
}

export function measurement(
  key: string, label: string, target: number, unit: Measurement['unit'], tolerance: Measurement['tolerance'], phase: Measurement['phase'], critical: boolean, partKey?: string,
): Measurement {
  return { key, label, target, unit, tolerance: { ...tolerance }, critical, phase, ...(partKey !== undefined ? { partKey } : {}) }
}

export function checklistItem(key: string, text: string, critical: boolean): ChecklistItem {
  return { key, text, critical }
}

export function annotation(kind: VisualAnnotation['kind'], text: string): VisualAnnotation {
  return { kind, text }
}

// ---- Shared helpers ---------------------------------------------------------------

/** Rip groups in first-appearance (design) order. */
function ripGroups(inputs: BoardPlanInputs): RipGroupInfo[] {
  const { project, build } = inputs
  const groups = new Map<string, RipGroupInfo>()
  project.strips.forEach((strip, index) => {
    const roughWidth = build.stripRoughWidths[index] ?? strip.width
    const key = [strip.speciesId, strip.width, strip.trailingAngle, roughWidth].join('|')
    const existing = groups.get(key)
    if (existing) existing.stripIndexes.push(index)
    else groups.set(key, { key, speciesId: strip.speciesId, roughWidth, finishedWidth: strip.width, stripIndexes: [index] })
  })
  return [...groups.values()]
}

function speciesName(inputs: BoardPlanInputs, speciesId: string): string {
  return inputs.woods.find(wood => wood.id === speciesId)?.name ?? speciesId
}

function warningsFor(inputs: BoardPlanInputs): PlanWarning[] {
  const { project, legacy, metrics, prefix } = inputs
  const errorMessages = new Set(project.construction === 'end' ? metrics.errors : [])
  return legacy.warnings.map((message, index) => ({
    id: `${prefix}board-warning-${index + 1}`,
    severity: errorMessages.has(message) ? 'error' : 'warning',
    message,
    location: { view: 'boards', targetId: project.id },
  }))
}

function cutRefs(inputs: BoardPlanInputs): CutRef[] {
  return inputs.legacy.cuts
    .filter(cut => !(inputs.asCompositePanel && cut.stage === 'trim'))
    .map(cut => ({ id: inputs.prefix + cut.id, label: cut.label, stage: cut.stage, quantity: cut.quantity }))
}

// ---- Edge grain -------------------------------------------------------------------

export const generateEdgeGrainPlan: InstructionGenerator<BoardProject> = (project, context) => {
  return buildEdgeGrainPlan(boardPlanInputs(project, context))
}

export function buildEdgeGrainPlan(inputs: BoardPlanInputs): InstructionPlan {
  const { project, build, legacy, marks, prefix, asCompositePanel } = inputs
  const b = new PlanBuilder(prefix)
  const warnings = warningsFor(inputs)
  const finished: PartDimensions = { length: build.length.finished, width: build.width.finished, thickness: build.thickness.finished }
  const source = { kind: 'board' as const, projectId: project.id, projectName: project.name, designRevision: project.updatedAt }

  if (project.strips.length === 0) {
    // Nothing to build; the legacy warning explains why. No cuts either, since none are executable.
    return withRevision({
      version: INSTRUCTION_PLAN_VERSION, key: `board:${project.id}`, source, construction: 'edge', units: 'mm', finished,
      phases: [], steps: [], parts: [], assemblies: [],
      requirements: { stock: [], cuts: [], tools: [], consumables: [] },
      warnings,
    })
  }

  const milledThickness = build.thickness.rough - build.thickness.jointing - build.thickness.planing
  const prepare = b.phase('prepare', 'Prepare stock')
  const ripPhase = b.phase('rip', 'Rip strips')
  const gluePhase = b.phase('glue', 'Glue-up')
  const finishPhase = asCompositePanel ? undefined : b.phase('finish', 'Square and surface')

  // Stock lines: one per legacy StockRequirement, with the strips that draw on it.
  const lines: StockLineInfo[] = legacy.stock.map(requirement => {
    const lineKey = [requirement.speciesId, requirement.length, requirement.width, requirement.thickness, requirement.trailingAngle].join('|')
    return { lineKey, requirement, partKey: b.key(`stock:${lineKey}`), milledKey: b.key(`stock:${lineKey}/milled`) }
  })
  const lineForGroup = (group: RipGroupInfo): StockLineInfo => {
    const first = project.strips[group.stripIndexes[0]!]!
    const rough = group.roughWidth
    const found = lines.find(line =>
      line.requirement.speciesId === first.speciesId &&
      line.requirement.trailingAngle === clampAngle(first.trailingAngle) &&
      line.requirement.width === rough)
    if (!found) throw new Error(`No stock line for rip group ${group.key}`)
    return found
  }
  const groups = ripGroups(inputs)

  for (const line of lines) {
    const r = line.requirement
    const name = speciesName(inputs, r.speciesId)
    b.part(`stock:${line.lineKey}`, { kind: 'stock', stage: 'rough', label: name, name: `${name} rough stock`, speciesId: r.speciesId, dimensions: { length: r.length, width: r.width, thickness: r.thickness } })
    b.part(`stock:${line.lineKey}/milled`, { kind: 'stock', stage: 'milled', label: name, name: `${name} milled stock`, speciesId: r.speciesId, dimensions: { length: r.length, width: r.width, thickness: milledThickness } })
  }

  const stripKeys: string[] = []
  project.strips.forEach((strip, index) => {
    const mark = marks.strips[index]!
    const name = speciesName(inputs, strip.speciesId)
    const roughWidth = build.stripRoughWidths[index] ?? strip.width
    stripKeys.push(b.part(`strip:${strip.id}`, {
      kind: 'strip', stage: 'cut', label: mark.label, name: `${name} strip ${mark.label}`, speciesId: strip.speciesId, sourceId: strip.id,
      dimensions: { length: build.length.rough, width: roughWidth, thickness: milledThickness },
    }))
  })
  const panelKey = b.part(`panel:${project.id}`, {
    kind: 'panel', stage: 'glued', label: marks.panelLabel, name: 'Glued panel', sourceId: project.id,
    dimensions: { length: build.length.rough, width: build.width.rough, thickness: milledThickness },
  })

  // --- Prepare stock
  const stockKeys = lines.map(line => line.partKey)
  const milledKeys = lines.map(line => line.milledKey)
  const totalBoards = lines.reduce((total, line) => total + line.requirement.quantity, 0)
  const select = b.step('select-stock', prepare, {
    kind: 'select-stock', title: 'Select stock',
    instruction: 'Pull the rough boards for every species in the design and check each one for checks, wind, and loose knots.',
    outputs: lines.map(line => ({ partKey: line.partKey, quantity: line.requirement.quantity })),
    tools: [TOOLS.measuring],
    checklist: [checklistItem('defects', 'Boards are free of checks and loose knots', false)],
    visual: visual('cut-diagram', 'after', stockKeys),
  })
  const mill = b.step('mill', prepare, {
    kind: 'mill', title: 'Mill stock', dependsOn: [select], irreversible: true,
    instruction: 'Joint one face and one edge, then plane every board to the same milled thickness.',
    batch: { count: totalBoards, unitLabel: 'board' },
    inputs: lines.map(line => ({ partKey: line.partKey, quantity: line.requirement.quantity, consumed: true })),
    outputs: lines.map(line => ({ partKey: line.milledKey, quantity: line.requirement.quantity })),
    tools: [TOOLS.jointer, TOOLS.planer, TOOLS.measuring],
    machineSetup: { tool: 'planer', settings: [{ label: 'Planer target thickness', value: milledThickness, unit: 'mm', source: 'design' }] },
    measurements: [measurement('thickness', 'Milled thickness', milledThickness, 'mm', DEFAULT_TOLERANCES.thicknessMm, 'achieve-after', true)],
    checklist: [checklistItem('reference-face', 'Reference face is flat before planing', true)],
    visual: visual('cross-section', 'after', milledKeys),
  })

  // --- Rip strips: one step per rip group (one fence setting)
  const ripSteps: string[] = []
  groups.forEach(group => {
    const line = lineForGroup(group)
    const name = speciesName(inputs, group.speciesId)
    const groupStripKeys = group.stripIndexes.map(index => stripKeys[index]!)
    const labels = group.stripIndexes.map(index => marks.strips[index]!.label)
    ripSteps.push(b.step(`rip:${group.key}`, ripPhase, {
      kind: 'cut', title: `Rip ${name} strips`, dependsOn: [mill], irreversible: true,
      instruction: `Rip the ${name} strips (${labels.join(', ')}) at one fence setting, with the jointed edge against the fence.`,
      batch: { count: group.stripIndexes.length, unitLabel: 'strip' },
      inputs: [{ partKey: line.milledKey, quantity: group.stripIndexes.length, consumed: true }],
      outputs: groupStripKeys.map(partKey => ({ partKey, quantity: 1 })),
      tools: [TOOLS.tableSaw, TOOLS.measuring],
      machineSetup: { tool: 'table-saw', settings: [{ label: 'Fence to blade', value: group.roughWidth, unit: 'mm', source: 'design' }] },
      measurements: [
        measurement('fence', 'Fence to blade', group.roughWidth, 'mm', DEFAULT_TOLERANCES.ripWidthMm, 'verify-before', true),
        measurement('width', 'Strip width', group.roughWidth, 'mm', DEFAULT_TOLERANCES.ripWidthMm, 'achieve-after', true, groupStripKeys[0]),
      ],
      visual: visual('cut-diagram', 'before', groupStripKeys, { annotations: [annotation('cut-line', 'Rip line')] }),
      cutIds: group.stripIndexes.map(index => prefix + legacyRipId(inputs, index)),
    }))
  })
  const markStrips = b.step('mark-strips', ripPhase, {
    kind: 'mark', title: 'Mark the strips', dependsOn: ripSteps,
    instruction: 'Write each strip label on its reference face so the design order survives handling.',
    inputs: stripKeys.map(partKey => ({ partKey, quantity: 1, consumed: false })),
    tools: [TOOLS.marking],
    checklist: marks.strips.map(mark => checklistItem(`mark-${mark.stripId}`, `Write ${mark.label} on the ${speciesName(inputs, mark.speciesId)} strip`, false)),
    visual: visual('board-face', 'after', stripKeys, { annotations: [annotation('label', 'Strip labels')] }),
  })

  // --- Glue-up
  const dryFit = b.step('dry-fit', gluePhase, {
    kind: 'dry-fit', title: 'Arrange and dry fit', dependsOn: [markStrips],
    instruction: 'Lay the strips out in design order with reference faces up, then dry clamp to check the joints.',
    inputs: stripKeys.map(partKey => ({ partKey, quantity: 1, consumed: false })),
    tools: [TOOLS.clamps],
    checklist: [
      ...marks.strips.map(mark => checklistItem(`place-${mark.stripId}`, `Position ${mark.index + 1}: ${mark.label}`, false)),
      checklistItem('joints-close', 'Every joint closes with no gap', true),
    ],
    visual: visual('assembly-layout', 'after', stripKeys),
  })
  const glueUp = b.step('glue-up', gluePhase, {
    kind: 'glue-clamp', title: 'Glue and clamp', dependsOn: [dryFit], irreversible: true,
    instruction: 'Spread glue on each joint, assemble the strips in order, and clamp evenly.',
    inputs: stripKeys.map(partKey => ({ partKey, quantity: 1, consumed: true })),
    outputs: [{ partKey: panelKey, quantity: 1 }],
    tools: [TOOLS.clamps, TOOLS.glue],
    checklist: [checklistItem('dry-fit-ok', 'The dry fit closed cleanly', true)],
    visual: visual('assembly-layout', 'after', [panelKey]),
  })
  const cure = b.step('glue-wait', gluePhase, {
    kind: 'wait', title: 'Let the glue set', dependsOn: [glueUp],
    instruction: 'Leave the panel clamped until the glue has set.',
    inputs: [{ partKey: panelKey, quantity: 1, consumed: false }],
    wait: { minimumMinutes: DEFAULT_GLUE_CLAMP_MINUTES, reason: 'Glue clamp time', source: 'assumption' },
    duration: { minutes: DEFAULT_GLUE_CLAMP_MINUTES, kind: 'cure' },
    visual: visual('board-face', 'after', [], { ghostPartKeys: [panelKey] }),
  })

  const assemblies: InstructionAssembly[] = [{ key: b.key('assembly:panel'), label: marks.panelLabel, name: 'Glued panel', partKeys: [...stripKeys, panelKey], stepKeys: [dryFit, glueUp, cure] }]
  const consumables = ['Wood glue']

  // --- Square and surface (omitted for composite panels)
  if (finishPhase !== undefined) {
    const allowanceTrimLength = legacy.cuts.some(cut => cut.id === 'trim-length')
    const allowanceTrimWidth = legacy.cuts.some(cut => cut.id === 'trim-width')
    let currentKey = panelKey
    let previousStep = cure
    const finalSteps: string[] = []

    if (allowanceTrimLength) {
      const out = b.part(`board:${project.id}/ends-squared`, { kind: 'board', stage: 'cut', label: marks.boardLabel, name: 'Board with squared ends', sourceId: project.id, dimensions: { length: build.length.finished, width: build.width.rough, thickness: milledThickness } })
      previousStep = b.step('trim-length', finishPhase, {
        kind: 'cut', title: 'Square the ends', dependsOn: [previousStep], irreversible: true,
        instruction: 'Trim both ends square to reach the finished length.',
        inputs: [{ partKey: currentKey, quantity: 1, consumed: true }], outputs: [{ partKey: out, quantity: 1 }],
        tools: [TOOLS.tableSaw, TOOLS.measuring],
        measurements: [
          measurement('length-before', 'Panel length before trimming', build.length.rough, 'mm', DEFAULT_TOLERANCES.lengthMm, 'verify-before', false, currentKey),
          measurement('length', 'Finished length', build.length.finished, 'mm', DEFAULT_TOLERANCES.lengthMm, 'achieve-after', false, out),
        ],
        visual: visual('cut-diagram', 'before', [currentKey], { annotations: [annotation('cut-line', 'End trim')] }),
        cutIds: [prefix + 'trim-length'],
      })
      finalSteps.push(previousStep)
      currentKey = out
    }
    if (allowanceTrimWidth) {
      const out = b.part(`board:${project.id}/squared`, { kind: 'board', stage: 'cut', label: marks.boardLabel, name: 'Squared board', sourceId: project.id, dimensions: { length: build.length.finished, width: build.width.finished, thickness: milledThickness } })
      previousStep = b.step('trim-width', finishPhase, {
        kind: 'cut', title: 'Square the edges', dependsOn: [previousStep], irreversible: true,
        instruction: 'Trim both outside edges square to reach the finished width.',
        inputs: [{ partKey: currentKey, quantity: 1, consumed: true }], outputs: [{ partKey: out, quantity: 1 }],
        tools: [TOOLS.tableSaw, TOOLS.measuring],
        measurements: [
          measurement('width-before', 'Panel width before trimming', build.width.rough, 'mm', DEFAULT_TOLERANCES.lengthMm, 'verify-before', false, currentKey),
          measurement('width', 'Finished width', build.width.finished, 'mm', DEFAULT_TOLERANCES.lengthMm, 'achieve-after', false, out),
        ],
        visual: visual('cut-diagram', 'before', [currentKey], { annotations: [annotation('cut-line', 'Edge trim')] }),
        cutIds: [prefix + 'trim-width'],
      })
      finalSteps.push(previousStep)
      currentKey = out
    }

    const surfaced = b.part(`board:${project.id}/surfaced`, { kind: 'board', stage: 'surfaced', label: marks.boardLabel, name: 'Surfaced board', sourceId: project.id, dimensions: { ...finished } })
    const surfaceMeasurements = [
      measurement('start-thickness', 'Thickness before surfacing', milledThickness, 'mm', DEFAULT_TOLERANCES.thicknessMm, 'verify-before', false, currentKey),
      measurement('thickness', 'Finished thickness', build.thickness.finished, 'mm', DEFAULT_TOLERANCES.thicknessMm, 'achieve-after', false, surfaced),
    ]
    if (!allowanceTrimLength) surfaceMeasurements.push(measurement('length', 'Finished length', build.length.finished, 'mm', DEFAULT_TOLERANCES.lengthMm, 'achieve-after', false, surfaced))
    const surface = b.step('surface', finishPhase, {
      kind: 'surface', title: 'Surface to thickness', dependsOn: [previousStep], irreversible: true,
      instruction: 'Flatten and smooth both faces down to the finished thickness.',
      inputs: [{ partKey: currentKey, quantity: 1, consumed: true }], outputs: [{ partKey: surfaced, quantity: 1 }],
      tools: [TOOLS.planer, TOOLS.measuring],
      machineSetup: { tool: 'planer', settings: [{ label: 'Planer target thickness', value: build.thickness.finished, unit: 'mm', source: 'design' }] },
      measurements: surfaceMeasurements,
      visual: visual('cross-section', 'after', [surfaced]),
    })
    finalSteps.push(surface)

    const boardKey = b.part(`board:${project.id}`, { kind: 'board', stage: 'finished', label: marks.boardLabel, name: 'Finished board', sourceId: project.id, dimensions: { ...finished } })
    const finish = b.step('finish', finishPhase, {
      kind: 'finish', title: 'Finish the board', dependsOn: [surface],
      instruction: 'Sand through the grits and apply food-safe finish.',
      inputs: [{ partKey: surfaced, quantity: 1, consumed: true }], outputs: [{ partKey: boardKey, quantity: 1 }],
      tools: [TOOLS.finish],
      visual: visual('board-face', 'after', [boardKey]),
    })
    finalSteps.push(finish)
    consumables.push('Food-safe finish', 'Sandpaper')
    const boardAssembly: InstructionAssembly = { key: b.key('assembly:board'), label: marks.boardLabel, name: 'Finished board', partKeys: [boardKey], stepKeys: finalSteps }
    assemblies[0] = { ...assemblies[0]!, parentKey: boardAssembly.key }
    assemblies.push(boardAssembly)
  }

  const stock: StockLine[] = lines.map(line => {
    const r = line.requirement
    return { key: b.key(line.lineKey), speciesId: r.speciesId, speciesName: r.speciesName, quantity: r.quantity, length: r.length, width: r.width, thickness: r.thickness, boardFeet: r.boardFeet, partKey: line.partKey }
  })

  return withRevision({
    version: INSTRUCTION_PLAN_VERSION,
    key: `board:${project.id}`,
    source,
    construction: 'edge',
    units: 'mm',
    finished,
    phases: b.phases,
    steps: b.steps,
    parts: b.parts,
    assemblies,
    requirements: { stock, cuts: cutRefs(inputs), tools: b.tools(), consumables },
    warnings,
  })
}

function legacyRipId(inputs: BoardPlanInputs, stripIndex: number): string {
  const rips = inputs.legacy.cuts.filter(cut => cut.stage === 'rip')
  return rips[stripIndex]?.id ?? `rip-${stripIndex + 1}`
}
