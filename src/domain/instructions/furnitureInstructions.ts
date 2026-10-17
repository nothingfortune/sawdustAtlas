import { DEFAULT_ALLOWANCES } from '../boardAllowances'
import { boundsOf, resolveFurniture } from '../furniture/geometry'
import { cutSizes, jointOperations } from '../furniture/joinery'
import { partsList } from '../furniture/partsList'
import type {
  Box, FurnitureContext, FurnitureJoint, FurniturePartsList, FurnitureProject, FurnitureSubassembly, JointKind, JointOperation, PartCutSize, PartsListLine, ResolvedFurniture, ResolvedPart,
} from '../furniture/types'
import { validateFurniture } from '../furniture/validation'
import { PlanBuilder, annotation, checklistItem, measurement, visual } from './boardInstructions'
import { withRevision } from './revisions'
import { DEFAULT_GLUE_CLAMP_MINUTES, DEFAULT_TOLERANCES } from './tolerances'
import { INSTRUCTION_PLAN_VERSION } from './types'
import type {
  CameraPose, ChecklistItem, CutRef, InstructionAssembly, InstructionGenerator, InstructionPlan, Measurement, OperationKind, PartDimensions, PlanWarning, SetupValue, StepInput, StepOutput,
  StepVisual, StockLine, ToolCategory, ToolRequirement, VisualAnnotation,
} from './types'

// Furniture instruction generator (Phase 5). It adds no geometry of its own: sizes come
// from the parts list, cut allowances and operations from joinery.ts, and positions from
// the resolver. Keys derive from part, joint, subassembly, and parts-list-line identity,
// never from list positions, and carry `context.keyPrefix` so a plan can be embedded.
//
// Parts move through one chain: stock -> blank -> part -> transformed part -> assembly.
// Each transformation consumes a part in one state and outputs it in the next, so the
// bench inventory is produced minus consumed with no special cases.

/** Minutes a finish needs to dry before the piece is handled (assumption). */
export const DEFAULT_FINISH_DRY_MINUTES = 240

/** Above this ratio of thinnest to middle extent an assembly is a box, not a flat frame. */
const FRAME_THINNESS_RATIO = 0.5

const TOOL_NAMES: Partial<Record<ToolCategory, string>> = {
  'jointer': 'Jointer',
  'planer': 'Thickness planer',
  'table-saw': 'Table saw',
  'crosscut-sled': 'Crosscut sled',
  'track-saw': 'Track saw',
  'router-table': 'Router table',
  'router': 'Router',
  'drill': 'Drill',
  'mortiser': 'Mortiser',
  'pocket-hole-jig': 'Pocket hole jig',
  'doweling-jig': 'Doweling jig',
  'loose-tenon-joiner': 'Loose tenon joiner',
  'sander': 'Sanding supplies',
  'clamps': 'Bar clamps',
  'glue': 'Wood glue',
  'measuring': 'Tape measure and square',
  'marking': 'Pencil and marking knife',
  'finish': 'Finishing supplies',
  'screwdriver': 'Screwdriver',
}

function tool(category: ToolCategory): ToolRequirement {
  return { key: category, name: TOOL_NAMES[category] ?? category, category }
}

const JOINT_LABELS: Record<JointKind, string> = {
  'mortise-tenon': 'mortise and tenon',
  'loose-tenon': 'loose tenon',
  'dowel': 'dowel',
  'dado': 'dado',
  'rabbet': 'rabbet',
  'groove': 'groove',
  'pocket-screw': 'pocket screw',
  'screw': 'screw',
  'tabletop-fastener': 'tabletop fastener',
  'butt': 'butt',
}

const OPERATION_TITLES: Record<JointOperation['operation'], { title: string; unit: string }> = {
  'tenon': { title: 'Cut the tenons', unit: 'tenon' },
  'mortise': { title: 'Cut the mortises', unit: 'mortise' },
  'dado': { title: 'Cut the dados', unit: 'dado' },
  'rabbet': { title: 'Cut the rabbets', unit: 'rabbet' },
  'groove': { title: 'Cut the grooves', unit: 'groove' },
  'dowel-holes': { title: 'Drill the dowel holes', unit: 'hole' },
  'pocket-holes': { title: 'Drill the pocket holes', unit: 'hole' },
  'pilot-holes': { title: 'Drill the pilot holes', unit: 'hole' },
  'fastener-slots': { title: 'Cut the fastener slots', unit: 'slot' },
}

// Names the woodworker typed can hold a number and a unit ("Birch plywood 18 mm"). The
// plan validator rejects those in prose, so the unit is dropped where a name is quoted.
const UNIT_AFTER_NUMBER = /(\d+(?:[.,]\d+)?)\s*(?:mm|cm|in|inch(?:es)?|deg(?:rees?)?|["”″°])(?![A-Za-z])/gi

function plain(text: string): string {
  return text.replace(UNIT_AFTER_NUMBER, '$1')
}

// ---- Structure of the design -----------------------------------------------------

interface Structure {
  /** Subassemblies that hold at least one part, children before parents. */
  order: FurnitureSubassembly[]
  /** Parts a subassembly joins itself, after removing parts an earlier one claimed. */
  direct: Map<string, string[]>
  /** Subassemblies joined into each one, in the order they were built. */
  children: Map<string, string[]>
  /** Every part inside a subassembly, including nested ones. */
  within: Map<string, Set<string>>
  parentOf: Map<string, string>
  /** Parts and top-level subassemblies joined by the final assembly. */
  loose: string[]
  topLevel: string[]
}

function structureOf(project: FurnitureProject, assemblable: ReadonlySet<string>): Structure {
  const byId = new Map(project.subassemblies.map(sub => [sub.id, sub]))
  const nested = new Set(project.subassemblies.flatMap(sub => sub.childIds.filter(id => id !== sub.id && byId.has(id))))
  const order: FurnitureSubassembly[] = []
  const seen = new Set<string>()
  const children = new Map<string, string[]>()
  const parentOf = new Map<string, string>()
  const visit = (sub: FurnitureSubassembly): boolean => {
    seen.add(sub.id)
    const built: string[] = []
    for (const childId of sub.childIds) {
      const child = byId.get(childId)
      if (!child || seen.has(childId)) continue
      if (visit(child)) {
        built.push(childId)
        parentOf.set(childId, sub.id)
      }
    }
    children.set(sub.id, built)
    const holdsParts = sub.partIds.some(id => assemblable.has(id)) || built.length > 0
    if (holdsParts) order.push(sub)
    return holdsParts
  }
  // Subassemblies caught in a childIds cycle have no root; they are visited afterwards so
  // nothing the woodworker defined is dropped (validation reports the cycle).
  for (const sub of project.subassemblies) if (!nested.has(sub.id) && !seen.has(sub.id)) visit(sub)
  for (const sub of project.subassemblies) if (!seen.has(sub.id)) visit(sub)

  const claimed = new Set<string>()
  const direct = new Map<string, string[]>()
  const within = new Map<string, Set<string>>()
  for (const sub of order) {
    const own = [...new Set(sub.partIds)].filter(id => assemblable.has(id) && !claimed.has(id))
    for (const id of own) claimed.add(id)
    direct.set(sub.id, own)
    within.set(sub.id, new Set([...own, ...(children.get(sub.id) ?? []).filter(id => direct.has(id)).flatMap(id => [...within.get(id)!])]))
  }
  const built = new Set(order.map(sub => sub.id))
  for (const sub of order) children.set(sub.id, (children.get(sub.id) ?? []).filter(id => built.has(id)))
  const topLevel = order.filter(sub => !parentOf.has(sub.id) || !built.has(parentOf.get(sub.id)!)).map(sub => sub.id)
  const loose = [...assemblable].filter(id => !claimed.has(id))
  return { order, direct, children, within, parentOf, loose, topLevel }
}

/** The lowest subassembly that holds both parts, or null when only the final assembly does. */
function closingAssembly(structure: Structure, joint: FurnitureJoint): string | null {
  let best: string | null = null
  let bestSize = Infinity
  for (const sub of structure.order) {
    const members = structure.within.get(sub.id)!
    if (members.has(joint.partId) && members.has(joint.targetId) && members.size < bestSize) {
      best = sub.id
      bestSize = members.size
    }
  }
  return best
}

// ---- Camera ----------------------------------------------------------------------

/** An isometric view from the front right and above: x runs right, y runs back, z runs up. */
function isometricCamera(bounds: Box): CameraPose {
  const target: [number, number, number] = [bounds.x + bounds.sx / 2, bounds.y + bounds.sy / 2, bounds.z + bounds.sz / 2]
  const radius = Math.hypot(bounds.sx, bounds.sy, bounds.sz) / 2
  const distance = (radius * 3) / Math.sqrt(3)
  return { position: [target[0] + distance, target[1] - distance, target[2] + distance], target, up: [0, 0, 1] }
}

// ---- Generator -------------------------------------------------------------------

export const generateFurniturePlan: InstructionGenerator<FurnitureProject> = (project, context) => {
  const allowancesGiven = context.allowances !== undefined
  const furnitureContext: FurnitureContext = { woods: context.woods, allowances: context.allowances ?? DEFAULT_ALLOWANCES }
  const resolved = resolveFurniture(project, furnitureContext)
  const prefix = context.keyPrefix ?? ''
  const warnings = planWarnings(project, resolved, furnitureContext, prefix, allowancesGiven)
  const bounds = resolved.bounds
  const finished: PartDimensions = bounds ? { length: bounds.sx, width: bounds.sy, thickness: bounds.sz } : { length: 0, width: 0, thickness: 0 }
  const solidOrSheet = resolved.parts.filter(entry => entry.part.kind !== 'hardware')
  if (!bounds || solidOrSheet.length === 0) return emptyPlan(project, finished, warnings, prefix)

  return new Generation(project, resolved, furnitureContext, bounds, prefix, allowancesGiven).build(finished, warnings)
}

function planWarnings(project: FurnitureProject, resolved: ResolvedFurniture, context: FurnitureContext, prefix: string, allowancesGiven: boolean): PlanWarning[] {
  const warnings: PlanWarning[] = validateFurniture(resolved, context).map((issue, index) => {
    const focusId = issue.partIds?.[0]
    return {
      id: `${prefix}furniture-issue-${index + 1}`,
      severity: issue.severity,
      message: issue.message,
      location: { view: 'furniture', targetId: project.id, ...(focusId ? { focusId } : {}) },
    }
  })
  if (!allowancesGiven) {
    warnings.push({
      id: `${prefix}furniture-default-allowances`,
      severity: 'warning',
      message: 'No shop milling allowances were available, so the default allowances were used for rough sizes.',
      location: { view: 'furniture', targetId: project.id },
    })
  }
  return warnings
}

function emptyPlan(project: FurnitureProject, finished: PartDimensions, warnings: PlanWarning[], prefix: string): InstructionPlan {
  const extra: PlanWarning[] = project.parts.length === 0 || warnings.length > 0 ? [] : [{
    id: `${prefix}furniture-unbuildable`,
    severity: 'error',
    message: 'This design has no buildable parts, so no build steps were generated.',
    location: { view: 'furniture', targetId: project.id },
  }]
  return withRevision({
    version: INSTRUCTION_PLAN_VERSION,
    key: `furniture:${project.id}`,
    source: { kind: 'furniture', projectId: project.id, projectName: project.name, designRevision: project.updatedAt },
    units: 'mm',
    finished,
    phases: [], steps: [], parts: [], assemblies: [],
    requirements: { stock: [], cuts: [], tools: [], consumables: [] },
    warnings: [...warnings, ...extra],
  })
}

interface StockInfo {
  /** Local key of the stock part: `stock:<lineKey>`. */
  local: string
  partKey: string
  step: string
  quantity: number
}

class Generation {
  private readonly b: PlanBuilder
  private readonly list: FurniturePartsList
  private readonly cuts: Map<string, PartCutSize>
  private readonly entries: Map<string, ResolvedPart>
  private readonly camera: CameraPose
  /** The key of each part's current state in the chain. */
  private readonly current = new Map<string, string>()
  private readonly jointed = new Set<string>()
  private readonly allowanceSource: SetupValue['source']

  constructor(
    private readonly project: FurnitureProject,
    private readonly resolved: ResolvedFurniture,
    context: FurnitureContext,
    private readonly bounds: Box,
    prefix: string,
    allowancesGiven: boolean,
  ) {
    this.b = new PlanBuilder(prefix)
    this.list = partsList(resolved, context)
    this.cuts = new Map(cutSizes(resolved).map(cut => [cut.partId, cut]))
    this.entries = new Map(resolved.parts.map(entry => [entry.id, entry]))
    this.camera = isometricCamera(bounds)
    this.allowanceSource = allowancesGiven ? 'design' : 'assumption'
    for (const joint of project.joints) {
      this.jointed.add(joint.partId)
      this.jointed.add(joint.targetId)
    }
  }

  build(finished: PartDimensions, warnings: PlanWarning[]): InstructionPlan {
    const { b, project } = this
    const assemblable = new Set(this.list.lines.flatMap(line => line.partIds))
    const structure = structureOf(project, assemblable)

    const stock = this.stockPhase()
    const blanks = this.panelsAndMill(stock)
    const cutSteps = this.cutPhase(stock, blanks)
    const mark = this.markPhase(cutSteps)
    const joined = this.joineryPhase(mark)
    const fitted = this.dryFitPhase(structure, joined)
    const sanded = this.sandPhase(structure, fitted)
    const built = this.assemblyPhase(structure, sanded)
    const finishedAssembly = this.finishPhase(built)

    const assemblies: InstructionAssembly[] = [...built.assemblies, ...finishedAssembly.assemblies]
    const consumables = ['Sandpaper', 'Finish']
    if (project.joints.some(joint => joint.glue)) consumables.unshift('Wood glue')
    for (const line of this.list.hardware) consumables.push(`${line.name} (${line.quantity})`)

    return withRevision({
      version: INSTRUCTION_PLAN_VERSION,
      key: `furniture:${project.id}`,
      source: { kind: 'furniture', projectId: project.id, projectName: project.name, designRevision: project.updatedAt },
      units: 'mm',
      finished,
      phases: b.phases,
      steps: b.steps,
      parts: b.parts,
      assemblies,
      requirements: { stock: stock.lines, cuts: this.cutRefs(), tools: b.tools(), consumables },
      warnings,
    })
  }

  // ---- Helpers ---------------------------------------------------------------------

  private scene(state: StepVisual['state'], highlight: string[], ghost: string[] = [], annotations: VisualAnnotation[] = []): StepVisual {
    return { ...visual('scene-3d', state, highlight, { ghostPartKeys: ghost, annotations }), camera: { ...this.camera, position: [...this.camera.position], target: [...this.camera.target] } }
  }

  private cutKey(partId: string): string {
    return this.b.key(`part:${partId}/cut`)
  }

  private cutKeys(line: PartsListLine): string[] {
    return line.partIds.map(id => this.cutKey(id))
  }

  private isJointed(line: PartsListLine): boolean {
    return line.partIds.some(id => this.jointed.has(id))
  }

  private entry(partId: string): ResolvedPart {
    return this.entries.get(partId)!
  }

  private cutDims(partId: string): PartDimensions {
    return { ...this.cuts.get(partId)!.cut }
  }

  private partState(local: string, partId: string, stage: 'cut' | 'machined' | 'surfaced'): string {
    const { part } = this.entry(partId)
    return this.b.part(local, {
      kind: 'part', stage, label: part.label, name: part.name, sourceId: partId, dimensions: this.cutDims(partId),
      ...(part.kind === 'solid' && part.speciesId ? { speciesId: part.speciesId } : {}),
    })
  }

  private cutRefs(): CutRef[] {
    return this.list.lines.flatMap((line): CutRef[] => line.kind === 'sheet'
      ? [{ id: this.b.key(`cut:${line.key}:sheet`), label: `${line.name} break down`, stage: 'sheet', quantity: line.quantity }]
      : [
        { id: this.b.key(`cut:${line.key}:rip`), label: `${line.name} rip to width`, stage: 'rip', quantity: line.quantity },
        { id: this.b.key(`cut:${line.key}:crosscut`), label: `${line.name} crosscut to length`, stage: 'crosscut', quantity: line.quantity },
      ])
  }

  private unionBounds(partIds: readonly string[]): Box | null {
    return boundsOf(partIds.flatMap(id => this.entries.get(id)?.box ?? []))
  }

  // ---- Stock -----------------------------------------------------------------------

  private stockPhase(): { lines: StockLine[]; byLine: Map<string, StockInfo>; bySheet: Map<string, StockInfo> } {
    const { b, list, project } = this
    const phase = b.phase('stock', 'Select stock')
    const lines: StockLine[] = []
    const byLine = new Map<string, StockInfo>()
    const bySheet = new Map<string, StockInfo>()
    const select = (lineKey: string, title: string, instruction: string, name: string, speciesId: string | undefined, dims: PartDimensions, quantity: number, boardFeet: number, highlight: string[]) => {
      const local = `stock:${lineKey}`
      const partKey = b.part(local, { kind: 'stock', stage: 'rough', label: name, name: `${name} rough stock`, ...(speciesId ? { speciesId } : {}), dimensions: dims })
      const step = b.step(`select:${lineKey}`, phase, {
        kind: 'select-stock', title, instruction,
        outputs: [{ partKey, quantity }],
        tools: [tool('measuring')],
        checklist: [checklistItem('defects', 'Stock is free of checks, wind, and loose knots', false)],
        visual: this.scene('after', highlight),
      })
      lines.push({ key: b.key(lineKey), speciesId: speciesId ?? lineKey, speciesName: name, quantity, length: dims.length, width: dims.width, thickness: dims.thickness, boardFeet, partKey })
      return { local, partKey, step, quantity }
    }

    for (const line of list.lines.filter(candidate => candidate.kind === 'solid')) {
      const rough = line.rough!
      const boards = line.panel?.boards ?? 1
      const quantity = line.quantity * boards
      const dims = { length: rough.length, width: rough.width / boards, thickness: rough.thickness }
      const name = plain(line.materialName)
      byLine.set(line.key, select(
        line.key,
        `Select ${name} for ${line.labels.join(', ')}`,
        line.panel
          ? 'Pull the rough boards for this edge-glued panel and check each one for checks, wind, and loose knots. Choose boards whose grain and color match across the panel.'
          : 'Pull the rough boards for these parts and check each one for checks, wind, and loose knots. Keep the best faces for the parts that show them.',
        name, line.materialId, dims, quantity, line.boardFeet, this.cutKeys(line),
      ))
    }

    const sheetLines = list.lines.filter(candidate => candidate.kind === 'sheet')
    for (const materialId of [...new Set(sheetLines.map(line => line.materialId))]) {
      const lines = sheetLines.filter(line => line.materialId === materialId)
      const material = project.sheetMaterials.find(candidate => candidate.id === materialId)
      const total = list.sheets.find(candidate => candidate.sheetMaterialId === materialId)
      const first = lines[0]!
      const dims = material ? { length: material.sheetLength, width: material.sheetWidth, thickness: material.thickness } : { ...first.cut }
      bySheet.set(materialId, select(
        `sheet:${materialId}`, `Select ${plain(first.materialName)}`,
        'Pull the sheets for these parts and check each one for flatness, edge damage, and the face you want showing.',
        first.materialName, materialId, dims, total?.sheets ?? 1, 0, lines.flatMap(line => this.cutKeys(line)),
      ))
    }
    return { lines, byLine, bySheet }
  }

  // ---- Panels and mill -------------------------------------------------------------

  /** Mills solid blanks and builds panel blanks; returns the steps that produce each line's blank. */
  private panelsAndMill(stock: { byLine: Map<string, StockInfo> }): Map<string, string[]> {
    const { b, list } = this
    const producers = new Map<string, string[]>()
    const tolerance = DEFAULT_TOLERANCES
    const blankPart = (line: PartsListLine): string => {
      const rough = line.rough!
      return b.part(`blank:${line.key}/milled`, {
        kind: 'blank', stage: 'milled', label: line.labels.join(', '), name: `${line.name} blank`, speciesId: line.materialId,
        dimensions: { length: rough.length, width: rough.width, thickness: line.cut.thickness },
      })
    }

    const panelLines = list.lines.filter(line => line.panel)
    if (panelLines.length > 0) {
      const phase = b.phase('panels', 'Edge-glued panels')
      for (const line of panelLines) {
        const info = stock.byLine.get(line.key)!
        const rough = line.rough!
        const { boards } = line.panel!
        const boardWidth = rough.width / boards
        const blankKey = blankPart(line)
        const jointed = this.isJointed(line)
        for (const partId of line.partIds) {
          const name = plain(this.entry(partId).part.name).toLowerCase()
          const boardsKey = b.part(`panel:${partId}/ripped`, { kind: 'board', stage: 'cut', label: this.entry(partId).part.label, name: `${this.entry(partId).part.name} boards`, speciesId: line.materialId, dimensions: { length: rough.length, width: boardWidth, thickness: rough.thickness } })
          const gluedKey = b.part(`panel:${partId}/glued`, { kind: 'panel', stage: 'glued', label: this.entry(partId).part.label, name: `${this.entry(partId).part.name} glued panel`, speciesId: line.materialId, dimensions: { length: rough.length, width: rough.width, thickness: rough.thickness } })
          const highlight = [this.cutKey(partId)]
          const rip = b.step(`panel-rip:${partId}`, phase, {
            kind: 'cut', title: `Rip the boards for the ${name}`, dependsOn: [info.step], irreversible: true,
            instruction: 'Joint one edge of each board, then rip every board to the same width at one fence setting, keeping the best edges for the glue joints.',
            batch: { count: boards, unitLabel: 'board' },
            inputs: [{ partKey: info.partKey, quantity: boards, consumed: true }],
            outputs: [{ partKey: boardsKey, quantity: boards }],
            tools: [tool('jointer'), tool('table-saw'), tool('measuring')],
            machineSetup: { tool: 'table-saw', settings: [{ label: 'Fence to blade', value: boardWidth, unit: 'mm', source: this.allowanceSource }] },
            measurements: [
              measurement('fence', 'Fence to blade', boardWidth, 'mm', tolerance.ripWidthMm, 'verify-before', true),
              measurement('width', 'Board width', boardWidth, 'mm', tolerance.ripWidthMm, 'achieve-after', false, boardsKey),
            ],
            visual: this.scene('before', highlight, [], [annotation('cut-line', 'Rip line')]),
          })
          const glue = b.step(`panel-glue:${partId}`, phase, {
            kind: 'glue-clamp', title: `Glue up the ${name}`, dependsOn: [rip], irreversible: true,
            instruction: 'Arrange the boards for the best grain match, spread glue on each joint, and clamp evenly with the faces flush.',
            inputs: [{ partKey: boardsKey, quantity: boards, consumed: true }],
            outputs: [{ partKey: gluedKey, quantity: 1 }],
            tools: [tool('clamps'), tool('glue')],
            checklist: [checklistItem('joints-close', 'Every joint closes with no gap on a dry clamp', true)],
            visual: this.scene('after', highlight),
          })
          const cure = b.step(`panel-cure:${partId}`, phase, {
            kind: 'wait', title: `Let the ${name} glue set`, dependsOn: [glue],
            instruction: 'Leave the panel clamped until the glue has set.',
            inputs: [{ partKey: gluedKey, quantity: 1, consumed: false }],
            wait: { minimumMinutes: DEFAULT_GLUE_CLAMP_MINUTES, reason: 'Glue clamp time', source: 'assumption' },
            duration: { minutes: DEFAULT_GLUE_CLAMP_MINUTES, kind: 'cure' },
            visual: this.scene('after', [], [this.cutKey(partId)]),
          })
          const flatten = b.step(`panel-flatten:${partId}`, phase, {
            kind: 'surface', title: `Flatten the ${name}`, dependsOn: [cure], irreversible: true,
            instruction: 'Remove the glue squeeze-out and flatten both faces to the milled thickness.',
            inputs: [{ partKey: gluedKey, quantity: 1, consumed: true }],
            outputs: [{ partKey: blankKey, quantity: 1 }],
            tools: [tool('planer'), tool('measuring')],
            machineSetup: { tool: 'planer', settings: [{ label: 'Planer target thickness', value: line.cut.thickness, unit: 'mm', source: 'design' }] },
            measurements: [
              measurement('rough-thickness', 'Thickness before flattening', rough.thickness, 'mm', tolerance.lengthMm, 'verify-before', false, gluedKey),
              measurement('thickness', 'Milled thickness', line.cut.thickness, 'mm', tolerance.thicknessMm, 'achieve-after', jointed, blankKey),
            ],
            visual: this.scene('after', highlight),
          })
          producers.set(line.key, [...(producers.get(line.key) ?? []), flatten])
        }
      }
    }

    // Milling: one batch step per species and target thickness.
    const milled = new Map<string, PartsListLine[]>()
    for (const line of list.lines.filter(candidate => candidate.kind === 'solid' && !candidate.panel)) {
      const setup = `${line.materialId}@${line.cut.thickness}`
      milled.set(setup, [...(milled.get(setup) ?? []), line])
    }
    if (milled.size > 0) {
      const phase = b.phase('mill', 'Mill stock')
      for (const [setup, lines] of milled) {
        const first = lines[0]!
        const thickness = first.cut.thickness
        const blankKeys = lines.map(blankPart)
        const jointed = lines.some(line => this.isJointed(line))
        const step = b.step(`mill:${setup}`, phase, {
          kind: 'mill', title: `Mill the ${plain(first.materialName)} to thickness`, irreversible: true,
          dependsOn: lines.map(line => stock.byLine.get(line.key)!.step),
          instruction: 'Joint one face and one edge of each board, then plane every board to the same milled thickness.',
          batch: { count: lines.reduce((total, line) => total + line.quantity, 0), unitLabel: 'board' },
          inputs: lines.map(line => ({ partKey: stock.byLine.get(line.key)!.partKey, quantity: line.quantity, consumed: true })),
          outputs: lines.map((line, index) => ({ partKey: blankKeys[index]!, quantity: line.quantity })),
          tools: [tool('jointer'), tool('planer'), tool('measuring')],
          machineSetup: { tool: 'planer', settings: [{ label: 'Planer target thickness', value: thickness, unit: 'mm', source: 'design' }] },
          measurements: [
            measurement('rough-thickness', 'Thickness before milling', first.rough!.thickness, 'mm', tolerance.lengthMm, 'verify-before', false, stock.byLine.get(first.key)!.partKey),
            measurement('thickness', 'Milled thickness', thickness, 'mm', tolerance.thicknessMm, 'achieve-after', jointed, blankKeys[0]),
          ],
          checklist: [checklistItem('reference-face', 'Reference face is flat before planing', true)],
          visual: this.scene('before', lines.flatMap(line => this.cutKeys(line))),
        })
        for (const line of lines) producers.set(line.key, [step])
      }
    }
    return producers
  }

  // ---- Cut to size -----------------------------------------------------------------

  /** Returns the steps that produce the cut parts. */
  private cutPhase(stock: { bySheet: Map<string, StockInfo> }, blanks: Map<string, string[]>): string[] {
    const { b, list } = this
    const tolerance = DEFAULT_TOLERANCES
    const solid = list.lines.filter(line => line.kind === 'solid')
    const sheets = list.lines.filter(line => line.kind === 'sheet')
    if (solid.length === 0 && sheets.length === 0) return []
    const phase = b.phase('cut', 'Cut to size')
    const ripped = (line: PartsListLine): string => b.key(`blank:${line.key}/ripped`)
    const produced: string[] = []

    const ripGroups = groupBy(solid, line => String(line.cut.width))
    const ripSteps = new Map<string, string>()
    for (const [setup, lines] of ripGroups) {
      const width = lines[0]!.cut.width
      const jointed = lines.some(line => this.isJointed(line))
      const outputs: StepOutput[] = lines.map(line => ({
        partKey: b.part(`blank:${line.key}/ripped`, {
          kind: 'blank', stage: 'cut', label: line.labels.join(', '), name: `${line.name} ripped blank`, speciesId: line.materialId,
          dimensions: { length: line.rough!.length, width: line.cut.width, thickness: line.cut.thickness },
        }),
        quantity: line.quantity,
      }))
      const step = b.step(`rip:${setup}`, phase, {
        kind: 'cut', title: 'Rip parts to width', irreversible: true,
        dependsOn: unique(lines.flatMap(line => blanks.get(line.key) ?? [])),
        instruction: `Rip ${describe(lines)} at one fence setting, with the jointed edge against the fence.`,
        batch: { count: lines.reduce((total, line) => total + line.quantity, 0), unitLabel: 'piece' },
        inputs: lines.map(line => ({ partKey: b.key(`blank:${line.key}/milled`), quantity: line.quantity, consumed: true })),
        outputs,
        tools: [tool('table-saw'), tool('measuring')],
        machineSetup: { tool: 'table-saw', settings: [{ label: 'Fence to blade', value: width, unit: 'mm', source: 'design' }] },
        measurements: [
          measurement('fence', 'Fence to blade', width, 'mm', tolerance.ripWidthMm, 'verify-before', true),
          measurement('width', 'Part width', width, 'mm', tolerance.ripWidthMm, 'achieve-after', jointed, outputs[0]!.partKey),
        ],
        visual: this.scene('before', lines.flatMap(line => this.cutKeys(line)), [], [annotation('cut-line', 'Rip line')]),
        cutIds: lines.map(line => b.key(`cut:${line.key}:rip`)),
      })
      for (const line of lines) ripSteps.set(line.key, step)
    }

    for (const [setup, lines] of groupBy(solid, line => String(line.cut.length))) {
      const length = lines[0]!.cut.length
      const jointed = lines.some(line => this.isJointed(line))
      const outputs: StepOutput[] = lines.flatMap(line => line.partIds.map(partId => ({
        partKey: this.partState(`part:${partId}/cut`, partId, 'cut'),
        quantity: 1,
      })))
      const step = b.step(`crosscut:${setup}`, phase, {
        kind: 'cut', title: 'Crosscut parts to length', irreversible: true,
        dependsOn: unique(lines.map(line => ripSteps.get(line.key)!)),
        instruction: `Crosscut ${describe(lines)} against a stop block at one setting so every piece matches.`,
        batch: { count: outputs.length, unitLabel: 'part' },
        inputs: lines.map(line => ({ partKey: ripped(line), quantity: line.quantity, consumed: true })),
        outputs,
        tools: [tool('crosscut-sled'), tool('measuring')],
        machineSetup: { tool: 'crosscut-sled', settings: [{ label: 'Stop block distance', value: length, unit: 'mm', source: 'design' }] },
        measurements: [
          measurement('stop', 'Stop block distance', length, 'mm', tolerance.lengthMm, 'verify-before', true),
          measurement('length', 'Part length', length, 'mm', tolerance.lengthMm, 'achieve-after', jointed, outputs[0]!.partKey),
        ],
        visual: this.scene('before', lines.flatMap(line => this.cutKeys(line)), [], [annotation('cut-line', 'Crosscut line')]),
        cutIds: lines.map(line => b.key(`cut:${line.key}:crosscut`)),
      })
      produced.push(step)
    }

    for (const [materialId, lines] of groupBy(sheets, line => line.materialId)) {
      const info = stock.bySheet.get(materialId)!
      const measurements: Measurement[] = lines.flatMap(line => {
        const first = this.cutKey(line.partIds[0]!)
        const critical = this.isJointed(line)
        return [
          measurement(`${line.key}:length`, `${line.name} length`, line.cut.length, 'mm', tolerance.lengthMm, 'achieve-after', critical, first),
          measurement(`${line.key}:width`, `${line.name} width`, line.cut.width, 'mm', tolerance.lengthMm, 'achieve-after', critical, first),
        ]
      })
      const outputs: StepOutput[] = lines.flatMap(line => line.partIds.map(partId => ({ partKey: this.partState(`part:${partId}/cut`, partId, 'cut'), quantity: 1 })))
      const material = this.project.sheetMaterials.find(candidate => candidate.id === materialId)
      const step = b.step(`sheet-cut:${materialId}`, phase, {
        kind: 'cut', title: `Break down the ${plain(lines[0]!.materialName)}`, irreversible: true,
        dependsOn: [info.step],
        instruction: material?.grain === 'length'
          ? 'Break the sheets down into the listed parts with the face grain running along each part length unless the design says otherwise.'
          : 'Break the sheets down into the listed parts, working from the largest to the smallest.',
        batch: { count: outputs.length, unitLabel: 'part' },
        inputs: [{ partKey: info.partKey, quantity: info.quantity, consumed: true }],
        outputs,
        tools: [tool('track-saw'), tool('measuring')],
        measurements,
        checklist: [checklistItem('layout', 'The layout fits the sheet and every part keeps its good face up', true)],
        visual: this.scene('before', lines.flatMap(line => this.cutKeys(line)), [], [annotation('cut-line', 'Sheet cut lines')]),
        cutIds: lines.map(line => b.key(`cut:${line.key}:sheet`)),
      })
      produced.push(step)
    }
    return produced
  }

  // ---- Mark ------------------------------------------------------------------------

  private markPhase(cutSteps: string[]): string {
    const { b } = this
    const phase = b.phase('mark', 'Mark parts')
    const ids = this.list.lines.flatMap(line => line.partIds)
    for (const id of ids) this.current.set(id, this.cutKey(id))
    const keys = ids.map(id => this.cutKey(id))
    return b.step('mark:parts', phase, {
      kind: 'mark', title: 'Mark every part', dependsOn: cutSteps,
      instruction: 'Write each part mark on its reference face, and note which faces show on the finished piece so the best faces end up there.',
      inputs: keys.map(partKey => ({ partKey, quantity: 1, consumed: false })),
      tools: [tool('marking')],
      checklist: ids.map(id => {
        const { part } = this.entry(id)
        const faces = part.visibleFaces.length > 0 ? `; keep the ${part.visibleFaces.join(', ')} ${part.visibleFaces.length === 1 ? 'face' : 'faces'} clean` : ''
        return checklistItem(`mark:${id}`, `Write ${part.label} on the ${plain(part.name)}${faces}`, false)
      }),
      visual: this.scene('after', keys, [], [annotation('label', 'Part marks'), annotation('reference-face', 'Reference faces')]),
    })
  }

  // ---- Joinery ---------------------------------------------------------------------

  private joineryPhase(mark: string): string {
    const { b } = this
    const operations = jointOperations(this.resolved).filter(op => this.current.has(op.partId))
    if (operations.length === 0) return mark
    const phase = b.phase('joinery', 'Cut the joinery')
    let tail = mark
    for (const [setupKey, group] of groupBy(operations, op => op.setupKey)) {
      const first = group[0]!
      const ids = unique(group.map(op => op.partId))
      const local = `joinery:${setupKey}`
      const labels = OPERATION_TITLES[first.operation]
      const inputs: StepInput[] = ids.map(id => ({ partKey: this.current.get(id)!, quantity: 1, consumed: true }))
      const outputs: StepOutput[] = ids.map(id => ({ partKey: this.partState(`part:${id}/${local}`, id, 'machined'), quantity: 1 }))
      const measurements: Measurement[] = first.settings.map((setting, index) => measurement(
        `setting-${index + 1}`, setting.label, setting.value, setting.unit, setting.unit === 'deg' ? DEFAULT_TOLERANCES.angleDeg : DEFAULT_TOLERANCES.thicknessMm, 'verify-before', true,
      ))
      tail = b.step(local, phase, {
        kind: first.kind, title: labels.title, dependsOn: [tail], irreversible: true,
        instruction: `Set up the ${(TOOL_NAMES[first.tool] ?? first.tool).toLowerCase()} from the setup values. Test the setup on scrap and check the fit, then ${first.kind === 'drill' ? 'drill' : 'cut'} each marked part.`,
        batch: { count: group.reduce((total, op) => total + op.count, 0), unitLabel: labels.unit },
        inputs,
        outputs,
        tools: [tool(first.tool), tool('measuring')],
        machineSetup: { tool: first.tool, settings: first.settings.map(setting => ({ ...setting })) },
        measurements,
        checklist: [
          checklistItem('test-cut', 'A test cut on scrap fits the mating part', true),
          ...group.map(op => checklistItem(`op:${op.key}`, `${labels.title.replace('the ', '')} on the ${plain(this.entry(op.partId).part.name)} (${op.jointId})`, false)),
        ],
        visual: this.scene('before', ids.map(id => this.current.get(id)!)),
      })
      for (const [index, id] of ids.entries()) this.current.set(id, outputs[index]!.partKey)
    }
    return tail
  }

  // ---- Dry fit ---------------------------------------------------------------------

  /** Returns every dry-fit step: whatever follows must wait for all of them. */
  private dryFitPhase(structure: Structure, previous: string): string[] {
    const { b } = this
    // A single loose part has nothing to fit together.
    if (structure.order.length === 0 && !this.hasFinalAssembly(structure)) return [previous]
    const phase = b.phase('dry-fit', 'Dry fit')
    const fit = (id: string, title: string, instruction: string, partIds: readonly string[], dependsOn: string[]): string => {
      const keys = partIds.map(partId => this.current.get(partId)!)
      return b.step(`dry-fit:${id}`, phase, {
        kind: 'dry-fit', title, dependsOn,
        instruction,
        inputs: keys.map(partKey => ({ partKey, quantity: 1, consumed: false })),
        tools: [tool('clamps'), tool('measuring')],
        checklist: [checklistItem('joints-close', 'Every joint closes with no gap', true), checklistItem('square', 'The unit sits square and flat', false)],
        visual: this.scene('after', keys),
      })
    }
    const steps = structure.order.map(sub =>
      fit(sub.id, `Dry fit the ${plain(sub.name).toLowerCase()}`, 'Fit the parts together without glue, check that every joint closes and the unit is square, then take it apart and keep the parts in order.', [...structure.within.get(sub.id)!], [previous]))
    if (this.hasFinalAssembly(structure)) {
      const all = this.list.lines.flatMap(line => line.partIds)
      steps.push(fit('final', 'Dry fit the whole piece', 'Fit every assembly and loose part together without glue to confirm the whole piece goes together, then take it apart.', all, [previous, ...steps]))
    }
    return steps
  }

  private hasFinalAssembly(structure: Structure): boolean {
    const inputs = structure.topLevel.length + structure.loose.length
    return inputs > 1 || this.closingJoints(structure, null).length > 0
  }

  private closingJoints(structure: Structure, subId: string | null): FurnitureJoint[] {
    return this.project.joints.filter(joint =>
      this.current.has(joint.partId) && this.current.has(joint.targetId) && closingAssembly(structure, joint) === subId)
  }

  // ---- Sand ------------------------------------------------------------------------

  private sandPhase(structure: Structure, previous: string[]): string[] {
    const { b } = this
    const ids = this.list.lines.flatMap(line => line.partIds).filter(id => structure.order.some(sub => structure.within.get(sub.id)!.has(id)))
    if (ids.length === 0) return previous
    const phase = b.phase('sand', 'Sand before glue-up')
    const local = 'sand:parts'
    const inputs: StepInput[] = ids.map(id => ({ partKey: this.current.get(id)!, quantity: 1, consumed: true }))
    const outputs: StepOutput[] = ids.map(id => ({ partKey: this.partState(`part:${id}/${local}`, id, 'surfaced'), quantity: 1 }))
    const step = b.step(local, phase, {
      kind: 'surface', title: 'Sand the inside faces', dependsOn: previous, irreversible: true,
      instruction: 'Sand the faces that will be hard to reach once the parts are glued, working through the grits and keeping paper off the joint surfaces.',
      batch: { count: ids.length, unitLabel: 'part' },
      inputs, outputs,
      tools: [tool('sander')],
      checklist: [checklistItem('protect-joints', 'Joint surfaces and tenon cheeks stay unsanded so the fits stay tight', true)],
      visual: this.scene('before', inputs.map(input => input.partKey)),
    })
    for (const [index, id] of ids.entries()) this.current.set(id, outputs[index]!.partKey)
    return [step]
  }

  // ---- Assembly --------------------------------------------------------------------

  private assemblyPhase(structure: Structure, gate: string[]): { assemblies: InstructionAssembly[]; finalKey: string; finalStep: string } {
    const { b, project } = this
    const hasFinal = this.hasFinalAssembly(structure)
    const phase = structure.order.length > 0 || hasFinal ? b.phase('assembly', 'Assembly') : ''
    const assemblies: InstructionAssembly[] = []
    const completion = new Map<string, string>()
    const assemblyKey = new Map<string, string>()
    const stepKeys = new Map<string, string[]>()

    const close = (id: string, name: string, noun: string, label: string, subId: string | null, partIds: readonly string[], childIds: readonly string[], dependsOn: string[]): { key: string; done: string; steps: string[] } => {
      const joints = this.closingJoints(structure, subId)
      const glued = joints.some(joint => joint.glue)
      const fasteners = joints.length > 0 && joints.every(joint => joint.kind === 'tabletop-fastener' || joint.kind === 'screw')
      const kind: OperationKind = glued ? 'glue-clamp' : fasteners ? 'install' : 'assemble'
      const direct = partIds.map(partId => this.current.get(partId)!)
      const children = childIds.map(childId => assemblyKey.get(childId)!)
      const scope = [...partIds, ...childIds.flatMap(childId => [...(structure.within.get(childId) ?? [])])]
      const box = this.unionBounds(scope)
      const key = b.part(`assembly:${id}`, {
        kind: 'assembly', stage: glued ? 'glued' : 'assembled', label, name, ...(subId ? { sourceId: subId } : {}),
        ...(box ? { dimensions: { length: box.sx, width: box.sy, thickness: box.sz } } : {}),
      })
      const hardware = this.project.parts.filter(part => part.kind === 'hardware' && this.hardwareClosesAt(structure, part.id, subId))
      const checklist: ChecklistItem[] = [
        ...joints.map(joint => checklistItem(`joint:${joint.id}`, `Close the ${JOINT_LABELS[joint.kind]} joint: ${plain(this.entry(joint.partId).part.name)} to ${plain(this.entry(joint.targetId).part.name)}`, false)),
        ...hardware.map(part => checklistItem(`hardware:${part.id}`, `Fit the ${plain(part.hardwareName?.trim() || part.name)}`, false)),
      ]
      const measurements: Measurement[] = []
      if (glued) {
        checklist.unshift(checklistItem('dry-fit-ok', 'The dry fit closed cleanly', true))
        const extents = box ? [box.sx, box.sy, box.sz].sort((x, y) => y - x) : [0, 0, 0]
        if (box && extents[2]! <= extents[1]! * FRAME_THINNESS_RATIO) {
          const diagonal = Math.hypot(extents[0]!, extents[1]!)
          measurements.push(
            measurement('diagonal-1', 'First diagonal', diagonal, 'mm', DEFAULT_TOLERANCES.lengthMm, 'achieve-after', true, key),
            measurement('diagonal-2', 'Second diagonal', diagonal, 'mm', DEFAULT_TOLERANCES.lengthMm, 'achieve-after', true, key),
          )
        } else {
          checklist.push(checklistItem('square', 'Both diagonals measure the same before the glue sets', true))
        }
      }
      const title = glued ? `Glue and clamp the ${noun}` : kind === 'install' ? `Fasten the ${noun}` : `Assemble the ${noun}`
      const instruction = glued
        ? 'Spread glue on the joints, bring the parts together in the dry-fit order, and clamp evenly, checking the unit stays square.'
        : kind === 'install'
          ? 'Join the parts with the listed fasteners, leaving room for the top to move with the seasons where it is fastened.'
          : 'Bring the parts together in the dry-fit order and fasten them without glue.'
      const done = b.step(`${glued ? 'glue' : 'assemble'}:${id}`, phase, {
        kind, title, dependsOn,
        instruction,
        irreversible: glued,
        inputs: [...direct.map(partKey => ({ partKey, quantity: 1, consumed: true })), ...children.map(partKey => ({ partKey, quantity: 1, consumed: true }))],
        outputs: [{ partKey: key, quantity: 1 }],
        tools: glued ? [tool('clamps'), tool('glue'), tool('measuring')] : [tool('screwdriver'), tool('clamps')],
        measurements,
        checklist,
        visual: this.scene('after', direct, children),
      })
      const steps = [done]
      let finish = done
      if (glued) {
        finish = b.step(`cure:${id}`, phase, {
          kind: 'wait', title: `Let the ${noun} glue set`, dependsOn: [done],
          instruction: 'Leave the assembly clamped until the glue has set.',
          inputs: [{ partKey: key, quantity: 1, consumed: false }],
          wait: { minimumMinutes: DEFAULT_GLUE_CLAMP_MINUTES, reason: 'Glue clamp time', source: 'assumption' },
          duration: { minutes: DEFAULT_GLUE_CLAMP_MINUTES, kind: 'cure' },
          visual: this.scene('after', [], [key]),
        })
        steps.push(finish)
      }
      return { key, done: finish, steps }
    }

    for (const sub of structure.order) {
      const childIds = structure.children.get(sub.id) ?? []
      const dependsOn = unique([...gate, ...childIds.map(childId => completion.get(childId)!)])
      const result = close(sub.id, sub.name, plain(sub.name).toLowerCase(), sub.label, sub.id, structure.direct.get(sub.id) ?? [], childIds, dependsOn)
      assemblyKey.set(sub.id, result.key)
      completion.set(sub.id, result.done)
      stepKeys.set(sub.id, result.steps)
    }

    for (const sub of structure.order) {
      const parent = structure.parentOf.get(sub.id)
      assemblies.push({
        key: assemblyKey.get(sub.id)!, label: sub.label, name: sub.name,
        partKeys: [...(structure.direct.get(sub.id) ?? []).map(id => this.current.get(id)!), assemblyKey.get(sub.id)!],
        stepKeys: stepKeys.get(sub.id)!,
        ...(parent && assemblyKey.has(parent) ? { parentKey: assemblyKey.get(parent)! } : {}),
      })
    }

    let finalKey: string
    let finalStep: string
    if (hasFinal) {
      const result = close('final', project.name, 'whole piece', 'Final', null, structure.loose, structure.topLevel, unique([...gate, ...structure.topLevel.map(id => completion.get(id)!)]))
      finalKey = result.key
      finalStep = result.done
      for (const id of structure.topLevel) {
        const found = assemblies.find(assembly => assembly.key === assemblyKey.get(id))
        if (found) found.parentKey = finalKey
      }
      assemblies.push({ key: finalKey, label: 'Final', name: project.name, partKeys: [...structure.loose.map(id => this.current.get(id)!), ...structure.topLevel.map(id => assemblyKey.get(id)!), finalKey], stepKeys: result.steps })
    } else {
      // One part or one subassembly is the whole piece; there is nothing left to join.
      const only = structure.topLevel[0]
      finalKey = only ? assemblyKey.get(only)! : this.current.get(structure.loose[0]!)!
      finalStep = only ? completion.get(only)! : gate[0]!
    }
    return { assemblies, finalKey, finalStep }
  }

  private hardwareClosesAt(structure: Structure, partId: string, subId: string | null): boolean {
    const owner = structure.order.find(sub => sub.partIds.includes(partId))
    return (owner?.id ?? null) === subId
  }

  // ---- Finish ----------------------------------------------------------------------

  private finishPhase(built: { finalKey: string; finalStep: string; assemblies: InstructionAssembly[] }): { assemblies: InstructionAssembly[] } {
    const { b, project } = this
    const phase = b.phase('finish', 'Finish')
    const finishedKey = b.part('assembly:final/finished', { kind: 'assembly', stage: 'finished', label: 'Final', name: project.name, dimensions: { length: this.bounds.sx, width: this.bounds.sy, thickness: this.bounds.sz } })
    const apply = b.step('finish:apply', phase, {
      kind: 'finish', title: 'Apply the finish', dependsOn: [built.finalStep],
      instruction: 'Do the final sanding through the grits, remove the dust, and apply the finish in thin coats.',
      inputs: [{ partKey: built.finalKey, quantity: 1, consumed: true }],
      outputs: [{ partKey: finishedKey, quantity: 1 }],
      tools: [tool('sander'), tool('finish')],
      visual: this.scene('after', [finishedKey]),
    })
    const dry = b.step('finish:dry', phase, {
      kind: 'wait', title: 'Let the finish dry', dependsOn: [apply],
      instruction: 'Leave the piece undisturbed until the finish has dried hard enough to handle.',
      inputs: [{ partKey: finishedKey, quantity: 1, consumed: false }],
      wait: { minimumMinutes: DEFAULT_FINISH_DRY_MINUTES, reason: 'Finish drying time', source: 'assumption' },
      duration: { minutes: DEFAULT_FINISH_DRY_MINUTES, kind: 'cure' },
      visual: this.scene('after', [], [finishedKey]),
    })
    return { assemblies: [{ key: b.key('assembly:finished'), label: 'Finished', name: project.name, partKeys: [finishedKey], stepKeys: [apply, dry] }] }
  }
}

// ---- Small utilities ---------------------------------------------------------------

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)]
}

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = keyOf(item)
    const list = groups.get(key)
    if (list) list.push(item)
    else groups.set(key, [item])
  }
  return groups
}

/** The part marks the step works on, "A1, A2": short, and what is written on the parts. */
function describe(lines: readonly PartsListLine[]): string {
  return lines.flatMap(line => line.labels).join(', ')
}
