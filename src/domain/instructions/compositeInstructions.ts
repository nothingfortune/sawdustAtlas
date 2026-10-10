import type { AssemblyCell, BoardProject, CompositeBoard, CompositePanel } from '../../types'
import { assembledSize, croppedLayout, panelPieces } from '../compositeBoard'
import type { Piece } from '../compositeBoard'
import { pieceKey } from '../compositeAssembly'
import { annotation, checklistItem, generateBoardInstructionPlan, measurement, PlanBuilder, TOOLS, visual } from './boardInstructions'
import { withRevision } from './revisions'
import { DEFAULT_GLUE_CLAMP_MINUTES, DEFAULT_TOLERANCES } from './tolerances'
import { INSTRUCTION_PLAN_VERSION } from './types'
import type {
  CutRef, InstructionAssembly, InstructionGenerator, InstructionPlan, InstructionStep, PlanWarning, StockLine, WaitSpec,
} from './types'

// Composite instruction generator (C9). Each panel board is embedded through the board
// generator (key prefix `panel:<panelId>/`, flattened panel only), then the panel is cut
// into wafers, the wafers are arranged and glued row by row, and the rows are glued into
// the finished board. Numbers come from compositeBoard.ts (panelPieces, croppedLayout,
// assembledSize); this module adds no geometry.

const ROTATION_TEXT: Record<AssemblyCell['rotate'], string> = {
  0: 'no rotation',
  90: 'a quarter turn',
  180: 'a half turn',
  270: 'a three-quarter turn',
}

interface PanelResult {
  panel: CompositePanel
  label: string
  /** Final glued panel part of the embedded plan, the input to the wafer cut. */
  panelPartKey: string
  /** Last step of the embedded plan (its glue wait). */
  lastStepKey: string
  cutStepKey?: string
  waferKeys: Map<number, string>
}

function glueWait(partKey: string, after: string, reason: string): { wait: WaitSpec } & Pick<InstructionStep, 'kind' | 'title' | 'instruction' | 'dependsOn' | 'inputs' | 'visual' | 'duration'> {
  return {
    kind: 'wait', title: 'Let the glue set', dependsOn: [after],
    instruction: 'Leave the work clamped until the glue has set.',
    inputs: [{ partKey, quantity: 1, consumed: false }],
    wait: { minimumMinutes: DEFAULT_GLUE_CLAMP_MINUTES, reason, source: 'assumption' },
    duration: { minutes: DEFAULT_GLUE_CLAMP_MINUTES, kind: 'cure' },
    visual: visual('board-face', 'after', [], { ghostPartKeys: [partKey] }),
  }
}

export const generateCompositeInstructionPlan: InstructionGenerator<CompositeBoard> = (composite, context) => {
  const boards = context.boards
  const b = new PlanBuilder('')
  const location = { view: 'boards' as const, targetId: composite.id }
  const warnings: PlanWarning[] = []
  const stock: StockLine[] = []
  const cuts: CutRef[] = []
  const consumables = new Set<string>(['Wood glue'])
  const assemblies: InstructionAssembly[] = []
  const boardAssemblyKey = 'assembly:board'
  const size = assembledSize(composite, boards)
  const finished = { length: size.lengthMm, width: size.widthMm, thickness: size.thicknessMm }
  const layout = croppedLayout(composite, boards)

  // ---- Panels: embed each board plan, then cut it into wafers
  const results = new Map<string, PanelResult>()
  const piecesByPanel = new Map<string, Piece[]>()
  composite.panels.forEach((panel, panelIndex) => {
    const label = `P${panelIndex + 1}`
    const board: BoardProject | undefined = boards.find(candidate => candidate.id === panel.boardId)
    if (!board) {
      warnings.push({ id: `composite-panel-missing:${panel.id}`, severity: 'error', message: `Panel ${label} uses a board that no longer exists, so it was left out of the build steps.`, location })
      return
    }
    const embedded = generateBoardInstructionPlan(board, { ...context, keyPrefix: `panel:${panel.id}/`, asCompositePanel: true })
    warnings.push(...embedded.warnings)
    const lastWait = [...embedded.steps].reverse().find(step => step.kind === 'wait')
    const panelPartKey = lastWait?.inputs[0]?.partKey
    if (embedded.steps.length === 0 || !lastWait || panelPartKey === undefined) {
      warnings.push({ id: `composite-panel-empty:${panel.id}`, severity: 'error', message: `Panel ${label} (${board.name}) has no buildable steps, so it was left out of the build steps.`, location })
      return
    }

    for (const phase of embedded.phases) b.phases.push({ ...phase, order: b.phases.length + 1, title: `${label}: ${phase.title}` })
    for (const step of embedded.steps) b.steps.push({ ...step, order: b.steps.length + 1 })
    for (const part of embedded.parts) b.parts.push(part.key === panelPartKey ? { ...part, label, name: `Glued panel ${label}` } : part)
    stock.push(...embedded.requirements.stock)
    cuts.push(...embedded.requirements.cuts)
    for (const item of embedded.requirements.consumables) consumables.add(item)

    const pieces = panelPieces(panel, boards)
    piecesByPanel.set(panel.id, pieces)
    const result: PanelResult = { panel, label, panelPartKey, lastStepKey: lastWait.key, waferKeys: new Map() }
    results.set(panel.id, result)

    const panelAssemblyKey = `assembly:panel:${panel.id}`
    const panelPartKeys = embedded.parts.map(part => part.key)
    const panelStepKeys = embedded.steps.map(step => step.key)
    assemblies.push({ key: panelAssemblyKey, label, name: `Panel ${label}`, partKeys: panelPartKeys, stepKeys: panelStepKeys, parentKey: boardAssemblyKey })

    if (pieces.length === 0) {
      warnings.push({ id: `composite-panel-no-wafers:${panel.id}`, severity: 'warning', message: `Panel ${label} (${board.name}) yields no wafers with this cut, so there is nothing to cut from it.`, location })
      return
    }

    // Wafer parts, the reference triangle, and one batch cut.
    const phase = b.phase(`wafers:${panel.id}`, `${label}: Cut wafers`)
    const waferKeys = pieces.map(piece => {
      const key = b.part(`wafer:${panel.id}:${piece.index}`, {
        kind: 'wafer', stage: 'cut', label: `${label}-${piece.index + 1}`, name: `Wafer ${label}-${piece.index + 1}`, sourceId: panel.id,
        dimensions: { length: piece.widthMm, width: piece.heightMm, thickness: piece.thicknessMm },
      })
      result.waferKeys.set(piece.index, key)
      return key
    })
    const cutId = `wafers:${panel.id}`
    const verb = panel.cut.axis === 'x' ? 'crosscut' : 'rip'
    cuts.push({ id: cutId, label: `${label} wafers (${verb})`, stage: 'wafers', quantity: pieces.length })
    const sourceMm = pieces.length * (panel.cut.stripWidthMm + panel.cut.kerfMm)
    const markStep = b.step(`wafers:${panel.id}/mark`, phase, {
      kind: 'mark', title: `Mark the reference triangle on panel ${label}`, dependsOn: [lastWait.key],
      instruction: 'Draw a triangle across the panel face so every wafer keeps its order and orientation after cutting.',
      inputs: [{ partKey: panelPartKey, quantity: 1, consumed: false }],
      tools: [TOOLS.marking],
      visual: visual('board-face', 'after', [panelPartKey], { annotations: [annotation('reference-face', 'Reference triangle')] }),
    })
    result.cutStepKey = b.step(`wafers:${panel.id}/cut`, phase, {
      kind: 'cut', title: `${panel.cut.axis === 'x' ? 'Crosscut' : 'Rip'} wafers from panel ${label}`, dependsOn: [markStep], irreversible: true,
      instruction: panel.cut.axis === 'x'
        ? 'Set the stop block from the setup values and crosscut the panel into wafers, one cut per wafer.'
        : 'Set the fence from the setup values and rip the panel into wafers, one cut per wafer.',
      batch: { count: pieces.length, unitLabel: 'wafer' },
      inputs: [{ partKey: panelPartKey, quantity: 1, consumed: true }],
      outputs: waferKeys.map(partKey => ({ partKey, quantity: 1 })),
      tools: [panel.cut.axis === 'x' ? TOOLS.crosscutSled : TOOLS.tableSaw, TOOLS.measuring],
      machineSetup: {
        tool: panel.cut.axis === 'x' ? 'crosscut-sled' : 'table-saw',
        settings: [
          { label: panel.cut.axis === 'x' ? 'Stop block distance' : 'Fence to blade', value: panel.cut.stripWidthMm, unit: 'mm', source: 'design' },
          { label: 'Blade kerf', value: panel.cut.kerfMm, unit: 'mm', source: 'design' },
        ],
      },
      measurements: [
        measurement('stop', panel.cut.axis === 'x' ? 'Stop block distance' : 'Fence to blade', panel.cut.stripWidthMm, 'mm', DEFAULT_TOLERANCES.sliceThicknessMm, 'verify-before', true, panelPartKey),
        measurement('source-length', 'Panel length consumed by the cuts', sourceMm, 'mm', DEFAULT_TOLERANCES.lengthMm, 'verify-before', false, panelPartKey),
        measurement('wafer-width', 'Wafer width', panel.cut.stripWidthMm, 'mm', DEFAULT_TOLERANCES.sliceThicknessMm, 'achieve-after', true, waferKeys[0]),
      ],
      visual: visual('cut-diagram', 'before', [panelPartKey], { annotations: [annotation('cut-line', panel.cut.axis === 'x' ? 'Crosscut lines' : 'Rip lines')] }),
      cutIds: [cutId],
    })
    panelStepKeys.push(markStep, result.cutStepKey)
    panelPartKeys.push(...waferKeys)
  })

  // ---- Rows: arrange, glue, wait
  const rowsPhase = b.phase('rows', 'Assemble rows')
  const placed = new Set<string>()
  const rowParts: string[] = []
  const rowWaits: string[] = []
  const rowAssemblies: InstructionAssembly[] = []
  composite.rows.forEach((row, rowIndex) => {
    const cells: Array<{ cell: AssemblyCell; result: PanelResult; waferKey: string; piece: Piece }> = []
    for (const cell of row.wafers) {
      const result = results.get(cell.panelId)
      const piece = piecesByPanel.get(cell.panelId)?.[cell.pieceIndex]
      const waferKey = result?.waferKeys.get(cell.pieceIndex)
      if (!result || !piece || waferKey === undefined) {
        warnings.push({ id: `composite-wafer-missing:${row.id}:${cell.panelId}:${cell.pieceIndex}`, severity: 'warning', message: `Row ${rowIndex + 1} places a wafer that does not exist, so it was left out of the build steps.`, location })
        continue
      }
      const id = pieceKey(cell.panelId, cell.pieceIndex)
      if (placed.has(id)) {
        warnings.push({ id: `composite-wafer-duplicate:${row.id}:${id}`, severity: 'warning', message: `Row ${rowIndex + 1} places a wafer that is already used in another position, so the repeat was left out of the build steps.`, location })
        continue
      }
      placed.add(id)
      cells.push({ cell, result, waferKey, piece })
    }
    if (cells.length === 0) return

    const rowLayout = layout.rows.find(candidate => candidate.rowId === row.id)
    const waferKeys = cells.map(entry => entry.waferKey)
    const arrangedKey = b.part(`row:${row.id}/arranged`, { kind: 'row', stage: 'arranged', label: `R${rowIndex + 1}`, name: `Row ${rowIndex + 1} laid out`, sourceId: row.id })
    const rowKey = b.part(`row:${row.id}`, {
      kind: 'row', stage: 'glued', label: `R${rowIndex + 1}`, name: `Row ${rowIndex + 1}`, sourceId: row.id,
      ...(rowLayout ? { dimensions: { length: cells.reduce((total, entry) => total + (entry.cell.rotate === 90 || entry.cell.rotate === 270 ? entry.piece.heightMm : entry.piece.widthMm), 0), width: rowLayout.heightMm, thickness: Math.max(...cells.map(entry => entry.piece.thicknessMm)) } } : {}),
    })
    const cutSteps = [...new Set(cells.map(entry => entry.result.cutStepKey).filter((key): key is string => key !== undefined))]
    const arrange = b.step(`row:${row.id}/arrange`, rowsPhase, {
      kind: 'arrange', title: `Arrange row ${rowIndex + 1}`, dependsOn: cutSteps,
      instruction: 'Lay the wafers out left to right in the order below, applying each rotation and flip.',
      inputs: waferKeys.map(partKey => ({ partKey, quantity: 1, consumed: true })),
      outputs: [{ partKey: arrangedKey, quantity: 1 }],
      checklist: cells.map((entry, position) => {
        const moves = [ROTATION_TEXT[entry.cell.rotate], entry.cell.flip ? 'flipped over' : '']
        return checklistItem(`wafer-${entry.cell.panelId}-${entry.cell.pieceIndex}`, `Position ${position + 1}: wafer ${entry.result.label}-${entry.cell.pieceIndex + 1}, ${moves.filter(Boolean).join(' and ')}`, false)
      }),
      visual: visual('assembly-layout', 'after', [arrangedKey], { ghostPartKeys: waferKeys }),
    })
    const glue = b.step(`row:${row.id}/glue-up`, rowsPhase, {
      kind: 'glue-clamp', title: `Glue and clamp row ${rowIndex + 1}`, dependsOn: [arrange], irreversible: true,
      instruction: 'Spread glue on each joint, assemble the wafers in order, and clamp evenly.',
      inputs: [{ partKey: arrangedKey, quantity: 1, consumed: true }], outputs: [{ partKey: rowKey, quantity: 1 }],
      tools: [TOOLS.clamps, TOOLS.glue],
      checklist: [checklistItem('arrangement-ok', 'The arrangement matches the list for this row', true)],
      visual: visual('assembly-layout', 'after', [rowKey]),
    })
    const wait = b.step(`row:${row.id}/glue-wait`, rowsPhase, glueWait(rowKey, glue, 'Glue clamp time'))
    rowParts.push(rowKey)
    rowWaits.push(wait)
    rowAssemblies.push({ key: `assembly:row:${row.id}`, label: `R${rowIndex + 1}`, name: `Row ${rowIndex + 1}`, partKeys: [...waferKeys, arrangedKey, rowKey], stepKeys: [arrange, glue, wait], parentKey: boardAssemblyKey })
  })
  assemblies.push(...rowAssemblies)

  if (rowParts.length === 0) {
    warnings.push({ id: 'composite-no-rows', severity: 'error', message: 'No wafers are placed in any row, so the assembly and finishing steps could not be generated.', location })
    return finishPlan()
  }

  // ---- Final glue-up, square, surface, finish
  const finalPhase = b.phase('final-glue', 'Final glue-up')
  const finishPhase = b.phase('finish', 'Square and surface')
  const maxThickness = Math.max(...[...placed].map(id => {
    const [panelId, index] = [id.slice(0, id.lastIndexOf(':')), Number(id.slice(id.lastIndexOf(':') + 1))]
    return piecesByPanel.get(panelId)?.[index]?.thicknessMm ?? 0
  }))
  const gluedKey = b.part(`board:${composite.id}/glued`, { kind: 'board', stage: 'glued', label: 'B1', name: 'Glued board', sourceId: composite.id, dimensions: { length: finished.length, width: finished.width, thickness: maxThickness } })
  const squaredKey = b.part(`board:${composite.id}/squared`, { kind: 'board', stage: 'cut', label: 'B1', name: 'Squared board', sourceId: composite.id, dimensions: { length: finished.length, width: finished.width, thickness: maxThickness } })
  const surfacedKey = b.part(`board:${composite.id}/surfaced`, { kind: 'board', stage: 'surfaced', label: 'B1', name: 'Surfaced board', sourceId: composite.id, dimensions: { ...finished } })
  const boardKey = b.part(`board:${composite.id}`, { kind: 'board', stage: 'finished', label: 'B1', name: 'Finished board', sourceId: composite.id, dimensions: { ...finished } })

  const finalGlue = b.step('final-glue-up', finalPhase, {
    kind: 'glue-clamp', title: 'Glue the rows together', dependsOn: rowWaits, irreversible: true,
    instruction: 'Stack the rows in design order, top to bottom, spread glue on each joint, and clamp against a flat reference.',
    inputs: rowParts.map(partKey => ({ partKey, quantity: 1, consumed: true })), outputs: [{ partKey: gluedKey, quantity: 1 }],
    tools: [TOOLS.clamps, TOOLS.glue],
    checklist: [checklistItem('rows-in-order', 'The rows are in design order', true)],
    visual: visual('assembly-layout', 'after', [gluedKey], { ghostPartKeys: rowParts }),
  })
  const finalWait = b.step('final-glue-wait', finalPhase, glueWait(gluedKey, finalGlue, 'Glue clamp time'))
  cuts.push({ id: `trim:${composite.id}`, label: 'Square the glued board', stage: 'trim', quantity: 1 })
  const square = b.step('square-board', finishPhase, {
    kind: 'cut', title: 'Square the board', dependsOn: [finalWait], irreversible: true,
    instruction: 'Trim the ends and sides square, removing the overhang, to reach the finished length and width.',
    inputs: [{ partKey: gluedKey, quantity: 1, consumed: true }], outputs: [{ partKey: squaredKey, quantity: 1 }],
    tools: [TOOLS.tableSaw, TOOLS.measuring],
    measurements: [
      measurement('length', 'Finished length', finished.length, 'mm', DEFAULT_TOLERANCES.lengthMm, 'achieve-after', false, squaredKey),
      measurement('width', 'Finished width', finished.width, 'mm', DEFAULT_TOLERANCES.lengthMm, 'achieve-after', false, squaredKey),
    ],
    checklist: [checklistItem('trim-lines', 'The trim lines sit inside the glued board on every side', true)],
    visual: visual('cut-diagram', 'before', [gluedKey], { annotations: [annotation('cut-line', 'Squaring cuts')] }),
    cutIds: [`trim:${composite.id}`],
  })
  const surface = b.step('surface', finishPhase, {
    kind: 'surface', title: 'Surface to thickness', dependsOn: [square], irreversible: true,
    instruction: 'Flatten and smooth both faces down to the thickness of the thinnest wafer.',
    inputs: [{ partKey: squaredKey, quantity: 1, consumed: true }], outputs: [{ partKey: surfacedKey, quantity: 1 }],
    tools: [TOOLS.planer, TOOLS.measuring],
    machineSetup: { tool: 'planer', settings: [{ label: 'Planer target thickness', value: finished.thickness, unit: 'mm', source: 'design' }] },
    measurements: [
      measurement('start-thickness', 'Thickness before surfacing', maxThickness, 'mm', DEFAULT_TOLERANCES.thicknessMm, 'verify-before', false, squaredKey),
      measurement('thickness', 'Finished thickness', finished.thickness, 'mm', DEFAULT_TOLERANCES.thicknessMm, 'achieve-after', false, surfacedKey),
    ],
    visual: visual('cross-section', 'after', [surfacedKey]),
  })
  const finish = b.step('finish', finishPhase, {
    kind: 'finish', title: 'Finish the board', dependsOn: [surface],
    instruction: 'Sand through the grits and apply food-safe finish.',
    inputs: [{ partKey: surfacedKey, quantity: 1, consumed: true }], outputs: [{ partKey: boardKey, quantity: 1 }],
    tools: [TOOLS.finish],
    visual: visual('board-face', 'after', [boardKey]),
  })
  consumables.add('Food-safe finish')
  consumables.add('Sandpaper')
  assemblies.push({ key: boardAssemblyKey, label: 'B1', name: 'Finished board', partKeys: [gluedKey, squaredKey, surfacedKey, boardKey], stepKeys: [finalGlue, finalWait, square, surface, finish] })
  return finishPlan()

  function finishPlan(): InstructionPlan {
    return withRevision({
      version: INSTRUCTION_PLAN_VERSION,
      key: `composite:${composite.id}`,
      source: { kind: 'composite', projectId: composite.id, projectName: composite.name, designRevision: composite.updatedAt },
      construction: composite.construction,
      units: 'mm',
      finished,
      phases: b.phases,
      steps: b.steps,
      parts: b.parts,
      assemblies,
      requirements: { stock, cuts, tools: b.tools(), consumables: [...consumables] },
      warnings,
    })
  }
}
