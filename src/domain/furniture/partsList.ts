import { toBoardFeet } from '../units'
import { cutSizes, jointHardware } from './joinery'
import type {
  FurnitureContext, FurniturePartRole, FurniturePartsList, HardwareLine, PartCutSize, PartDims, PartsListLine, ResolvedFurniture, ResolvedPart, SheetTotal, SpeciesTotal,
} from './types'

// The reconciled cut list: resolved parts grouped into lines with cut size, rough size,
// board feet, and cost. Material is estimated, not nested (spec FD10): board feet come
// from rough volume and sheets from area plus a stated waste factor.

/** Share added to the cut area of sheet parts before dividing by the sheet area. A
 *  stand-in for kerf and unusable offcuts, since no nesting is done. */
export const SHEET_WASTE_FACTOR = 0.15

const ROLE_NAMES: Record<FurniturePartRole, string> = {
  'leg': 'Leg',
  'apron': 'Apron',
  'rail': 'Rail',
  'stile': 'Stile',
  'stretcher': 'Stretcher',
  'top': 'Top',
  'side': 'Side',
  'bottom': 'Bottom',
  'shelf': 'Shelf',
  'back': 'Back',
  'divider': 'Divider',
  'face-frame': 'Face frame',
  'door': 'Door',
  'drawer-front': 'Drawer front',
  'cleat': 'Cleat',
  'kick': 'Kick',
  'panel': 'Panel',
  'hardware': 'Hardware',
  'other': 'Part',
}

const UNASSIGNED = 'unassigned'

interface Group {
  key: string
  kind: 'solid' | 'sheet'
  materialId: string
  materialName: string
  members: Array<{ resolved: ResolvedPart; cut: PartCutSize }>
}

export function partsList(resolved: ResolvedFurniture, context: FurnitureContext): FurniturePartsList {
  const { project } = resolved
  const cutById = new Map(cutSizes(resolved).map(cut => [cut.partId, cut]))
  const groups = new Map<string, Group>()

  for (const entry of resolved.parts) {
    const { part } = entry
    const cut = cutById.get(entry.id)
    if (part.kind === 'hardware' || !cut) continue
    const solid = part.kind === 'solid'
    const materialId = (solid ? part.speciesId : part.sheetMaterialId) || UNASSIGNED
    const materialName = solid
      ? context.woods.find(wood => wood.id === materialId)?.name
      : project.sheetMaterials.find(material => material.id === materialId)?.name
    const key = `${part.kind}:${materialId}:${cut.cut.length}x${cut.cut.width}x${cut.cut.thickness}`
    const group = groups.get(key) ?? { key, kind: part.kind, materialId, materialName: materialName ?? (materialId === UNASSIGNED ? 'Unassigned material' : materialId), members: [] }
    group.members.push({ resolved: entry, cut })
    groups.set(key, group)
  }

  const lines = [...groups.values()].map(group => toLine(group, resolved, context)).sort(compareLines)

  const species = new Map<string, SpeciesTotal>()
  const sheetArea = new Map<string, number>()
  for (const line of lines) {
    if (line.kind === 'solid') {
      const total = species.get(line.materialId) ?? { speciesId: line.materialId, name: line.materialName, boardFeet: 0, cost: 0 }
      const price = context.woods.find(wood => wood.id === line.materialId)?.pricePerBoardFoot ?? 0
      total.boardFeet += line.boardFeet
      total.cost += line.boardFeet * price
      species.set(line.materialId, total)
    } else {
      sheetArea.set(line.materialId, (sheetArea.get(line.materialId) ?? 0) + line.quantity * line.cut.length * line.cut.width)
    }
  }

  const sheets: SheetTotal[] = []
  for (const [sheetMaterialId, partArea] of sheetArea) {
    const material = project.sheetMaterials.find(candidate => candidate.id === sheetMaterialId)
    if (!material) continue
    const count = Math.ceil(partArea * (1 + SHEET_WASTE_FACTOR) / (material.sheetLength * material.sheetWidth))
    sheets.push({ sheetMaterialId, name: material.name, partArea, sheets: count, cost: count * material.pricePerSheet })
  }

  const speciesTotals = [...species.values()]
  return {
    lines,
    species: speciesTotals,
    sheets,
    hardware: mergeHardware(jointHardware(resolved), hardwareParts(resolved)),
    totalCost: speciesTotals.reduce((total, entry) => total + entry.cost, 0) + sheets.reduce((total, entry) => total + entry.cost, 0),
    assumptions: assumptionsFor(lines, context),
  }
}

function toLine(group: Group, resolved: ResolvedFurniture, context: FurnitureContext): PartsListLine {
  const { allowances } = context
  const [first] = group.members
  if (!first) throw new Error('A parts list group is never empty')
  const quantity = group.members.length
  const cut: PartDims = { ...first.cut.cut }
  const line: PartsListLine = {
    key: group.key,
    partIds: group.members.map(member => member.resolved.id),
    labels: group.members.map(member => member.resolved.part.label),
    name: lineName(group),
    role: first.resolved.part.role,
    kind: group.kind,
    materialId: group.materialId,
    materialName: group.materialName,
    quantity,
    modeled: { ...first.cut.modeled },
    allowances: first.cut.allowances.map(allowance => ({ ...allowance })),
    cut,
    rough: null,
    boardFeet: 0,
  }
  if (group.kind === 'sheet') return line

  // A solid part wider than the widest board is glued up from equal boards. Each board
  // is ripped from rougher stock, and the whole panel is trimmed square after glue-up.
  const boards = Math.max(1, Math.ceil(cut.width / resolved.project.maxBoardWidth))
  const rough: PartDims = {
    length: cut.length + allowances.lengthTrim,
    width: boards === 1 ? cut.width + allowances.ripAllowance : cut.width + allowances.widthTrim + boards * allowances.ripAllowance,
    thickness: cut.thickness + allowances.jointing + allowances.planing,
  }
  if (boards > 1) line.panel = { boards, boardWidth: cut.width / boards }
  line.rough = rough
  line.boardFeet = toBoardFeet(rough.length * rough.width * rough.thickness) * quantity
  return line
}

// One part keeps its own name; equal parts share their role name; a mixed group (a top,
// a bottom, and shelves cut to one size) lists each role once, in project order.
function lineName(group: Group): string {
  const [only] = group.members
  if (group.members.length === 1 && only) return only.resolved.part.name
  return [...new Set(group.members.map(member => ROLE_NAMES[member.resolved.part.role]))].join(', ')
}

function compareLines(a: PartsListLine, b: PartsListLine): number {
  return compareText(a.materialName, b.materialName)
    || compareText(a.materialId, b.materialId)
    || compareText(a.kind, b.kind)
    || compareText(a.role, b.role)
    || b.cut.length - a.cut.length
    || b.cut.width - a.cut.width
    || b.cut.thickness - a.cut.thickness
}

// Code-unit order, not locale order, so the sort never depends on the runtime's locale.
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function hardwareParts(resolved: ResolvedFurniture): HardwareLine[] {
  return resolved.parts
    .filter(entry => entry.part.kind === 'hardware')
    .map(entry => {
      const name = entry.part.hardwareName?.trim() || entry.part.name
      return { key: `hardware:${name}`, name, quantity: 1, sourceIds: [entry.id] }
    })
}

function mergeHardware(...sources: HardwareLine[][]): HardwareLine[] {
  const merged = new Map<string, HardwareLine>()
  for (const line of sources.flat()) {
    const existing = merged.get(line.key)
    if (existing) {
      existing.quantity += line.quantity
      existing.sourceIds.push(...line.sourceIds)
    } else {
      merged.set(line.key, { ...line, sourceIds: [...line.sourceIds] })
    }
  }
  return [...merged.values()]
}

function assumptionsFor(lines: readonly PartsListLine[], context: FurnitureContext): string[] {
  const { allowances } = context
  const notes: string[] = []
  if (lines.some(line => line.kind === 'solid')) {
    notes.push(`Rough solid stock adds ${allowances.jointing} mm for jointing and ${allowances.planing} mm for planing to the thickness, ${allowances.ripAllowance} mm per ripped board to the width, and ${allowances.lengthTrim} mm to the length for squaring the ends.`)
    notes.push('Board feet are measured on rough volume, so they include milling waste but not defects or offcuts.')
  }
  if (lines.some(line => line.panel)) {
    notes.push(`Parts wider than the widest board are edge-glued panels, and each panel adds ${allowances.widthTrim} mm to the width to square its long edges after glue-up.`)
  }
  if (lines.some(line => line.kind === 'sheet')) {
    notes.push(`Sheet counts are an estimate: cut area plus ${SHEET_WASTE_FACTOR * 100} percent for waste, divided by the sheet area. No cutting layout is nested.`)
  }
  if (lines.some(line => line.allowances.length > 0)) {
    notes.push('Cut sizes include the joint allowances listed on each line; the modeled size is the finished size.')
  }
  return notes
}
