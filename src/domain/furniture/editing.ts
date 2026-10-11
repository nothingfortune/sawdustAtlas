import { isValidParameterName, referencedNames } from './expressions'
import { faceAxis } from './faces'
import type {
  Axis, DimExpr, FurnitureParameter, FurniturePart, FurniturePartKind, FurnitureProject, FurnitureRelationship, FurnitureJoint, FurnitureSubassembly,
  ResolvedFurniture, SheetMaterial,
} from './types'

// Pure project edits behind the designer's parts, parameters, and settings panels. Each
// function returns a new project and never mutates its input. Ids are inputs because
// the domain never generates them, and nothing here touches the clock (the caller
// stamps updatedAt). Sizes are only ever set by the woodworker; nothing resizes a part.

/** Clear space left between a new or duplicated part and the part it sits next to, mm. */
export const NEW_PART_GAP = 50
const SOLID_DEFAULT = { length: 500, width: 100, thickness: 20 }
const SHEET_DEFAULT = { length: 600, width: 400 }
const HARDWARE_DEFAULT = { length: 60, width: 20, thickness: 20 }
const LABEL_PREFIX: Record<FurniturePartKind, string> = { solid: 'P', sheet: 'S', hardware: 'H' }
const DEFAULT_PARAMETER_VALUE = 100

export interface NewPartIds {
  partId: string
  /** Used only when a sheet part is added to a project with no sheet material yet. */
  sheetMaterialId: string
}

export interface PartEdit {
  project: FurnitureProject
  partId: string
}

/** Where a new part goes: just right of the selected part (or of everything when
 *  nothing is selected), on the same front and bottom edges. */
function spotNextTo(resolved: ResolvedFurniture, selectedId: string | undefined): { x: number; y: number; z: number } {
  const anchor = resolved.parts.find(part => part.id === selectedId)?.box ?? resolved.bounds
  return anchor ? { x: anchor.x + anchor.sx + NEW_PART_GAP, y: anchor.y, z: anchor.z } : { x: 0, y: 0, z: 0 }
}

/** The smallest unused mark with the given prefix: P1, P2, ... */
function nextLabel(project: FurnitureProject, prefix: string): string {
  const taken = new Set(project.parts.map(part => part.label))
  let n = 1
  while (taken.has(`${prefix}${n}`)) n += 1
  return `${prefix}${n}`
}

export function defaultSheetMaterial(id: string): SheetMaterial {
  return { id, name: 'Birch plywood 18 mm', thickness: 18, sheetLength: 2440, sheetWidth: 1220, pricePerSheet: 80, color: '#d9c39a', grain: 'length' }
}

export function addPart(project: FurnitureProject, resolved: ResolvedFurniture, kind: FurniturePartKind, selectedId: string | undefined, ids: NewPartIds, fallbackSpeciesId: string): PartEdit {
  const position = spotNextTo(resolved, selectedId)
  const base = { id: ids.partId, label: nextLabel(project, LABEL_PREFIX[kind]), orientation: 'xyz' as const, position, visibleFaces: [] }
  let sheetMaterials = project.sheetMaterials
  let part: FurniturePart
  if (kind === 'sheet') {
    const material = sheetMaterials[0] ?? defaultSheetMaterial(ids.sheetMaterialId)
    if (!sheetMaterials.includes(material)) sheetMaterials = [...sheetMaterials, material]
    part = { ...base, name: 'New panel', role: 'panel', kind, ...SHEET_DEFAULT, thickness: material.thickness, sheetMaterialId: material.id }
  } else if (kind === 'hardware') {
    part = { ...base, name: 'New hardware', role: 'hardware', kind, ...HARDWARE_DEFAULT, hardwareName: 'Hardware' }
  } else {
    part = { ...base, name: 'New part', role: 'other', kind, ...SOLID_DEFAULT, speciesId: fallbackSpeciesId }
  }
  return { project: { ...project, sheetMaterials, parts: [...project.parts, part] }, partId: part.id }
}

/** A copy placed beside the original, in the same subassemblies. Relationships and
 *  joints are not copied: the copy starts as a plain part at literal positions. */
export function duplicatePart(project: FurnitureProject, resolved: ResolvedFurniture, partId: string, newId: string): PartEdit | null {
  const index = project.parts.findIndex(part => part.id === partId)
  const source = project.parts[index]
  if (!source) return null
  const box = resolved.parts.find(part => part.id === partId)?.box
  const position = box ? { x: box.x + box.sx + NEW_PART_GAP, y: box.y, z: box.z } : { ...source.position }
  const prefix = /^(.*?)\d*$/.exec(source.label)?.[1] || LABEL_PREFIX[source.kind]
  const copy: FurniturePart = { ...structuredClone(source), id: newId, label: nextLabel(project, prefix), name: `${source.name} copy`, position }
  const parts = [...project.parts.slice(0, index + 1), copy, ...project.parts.slice(index + 1)]
  const subassemblies = project.subassemblies.map(group => group.partIds.includes(partId) ? { ...group, partIds: [...group.partIds, newId] } : group)
  return { project: { ...project, parts, subassemblies }, partId: newId }
}

export interface RemovalImpact {
  joints: FurnitureJoint[]
  /** Relationships that cannot stand without the part and are removed with it. */
  relationships: FurnitureRelationship[]
  /** Distribute relationships that merely lose one of several parts. */
  adjusted: FurnitureRelationship[]
  subassemblies: FurnitureSubassembly[]
}

function mentions(relationship: FurnitureRelationship, partId: string): 'removed' | 'adjusted' | null {
  switch (relationship.kind) {
    case 'face': return relationship.partId === partId || relationship.target.partId === partId ? 'removed' : null
    case 'center': return relationship.partId === partId || relationship.targetId === partId ? 'removed' : null
    case 'between': return relationship.partId === partId || relationship.from.partId === partId || relationship.to.partId === partId ? 'removed' : null
    case 'distribute':
      if (relationship.from.partId === partId || relationship.to.partId === partId) return 'removed'
      if (!relationship.partIds.includes(partId)) return null
      return relationship.partIds.length === 1 ? 'removed' : 'adjusted'
  }
}

/** Everything that goes with a part when it is deleted, for the confirmation. */
export function removalImpact(project: FurnitureProject, partId: string): RemovalImpact {
  return {
    joints: project.joints.filter(joint => joint.partId === partId || joint.targetId === partId),
    relationships: project.relationships.filter(relationship => mentions(relationship, partId) === 'removed'),
    adjusted: project.relationships.filter(relationship => mentions(relationship, partId) === 'adjusted'),
    subassemblies: project.subassemblies.filter(group => group.partIds.includes(partId)),
  }
}

export function removePart(project: FurnitureProject, partId: string): FurnitureProject {
  const relationships = project.relationships.flatMap((relationship): FurnitureRelationship[] => {
    const effect = mentions(relationship, partId)
    if (effect === 'removed') return []
    if (effect === 'adjusted' && relationship.kind === 'distribute') return [{ ...relationship, partIds: relationship.partIds.filter(id => id !== partId) }]
    return [relationship]
  })
  return {
    ...project,
    parts: project.parts.filter(part => part.id !== partId),
    relationships,
    joints: project.joints.filter(joint => joint.partId !== partId && joint.targetId !== partId),
    subassemblies: project.subassemblies.map(group => group.partIds.includes(partId) ? { ...group, partIds: group.partIds.filter(id => id !== partId) } : group),
  }
}

export interface PartGroup {
  /** Absent for the parts that belong to no subassembly. */
  subassembly?: FurnitureSubassembly
  parts: FurniturePart[]
  children: PartGroup[]
}

/** Parts grouped by subassembly: each group lists its own parts (project order) and its
 *  child subassemblies; the parts in none come last. A part in several subassemblies
 *  shows once, in the first group that reaches it, and a cyclic child list is cut off. */
export function groupBySubassembly(project: FurnitureProject): PartGroup[] {
  const byId = new Map(project.subassemblies.map(group => [group.id, group]))
  const childIds = new Set(project.subassemblies.flatMap(group => group.childIds))
  const placed = new Set<string>()
  const visited = new Set<string>()
  const build = (subassembly: FurnitureSubassembly): PartGroup => {
    visited.add(subassembly.id)
    const parts = project.parts.filter(part => subassembly.partIds.includes(part.id) && !placed.has(part.id))
    for (const part of parts) placed.add(part.id)
    const children = subassembly.childIds.flatMap(id => {
      const child = byId.get(id)
      return child && !visited.has(id) ? [build(child)] : []
    })
    return { subassembly, parts, children }
  }
  const roots = project.subassemblies.filter(group => !childIds.has(group.id)).map(build)
  // A cycle with no root would otherwise hide its members: surface what is left.
  const rest = project.subassemblies.filter(group => !visited.has(group.id)).map(build)
  const loose = project.parts.filter(part => !placed.has(part.id))
  return [...roots, ...rest, ...(loose.length ? [{ parts: loose, children: [] }] : [])]
}

/** "L1 Front left leg", or just the name when the part has no mark. */
export function partTitle(project: FurnitureProject, partId: string): string {
  const part = project.parts.find(candidate => candidate.id === partId)
  if (!part) return 'a missing part'
  return part.label ? `${part.label} ${part.name}` : part.name
}

export function describeRelationship(project: FurnitureProject, relationship: FurnitureRelationship): string {
  const title = (id: string) => partTitle(project, id)
  switch (relationship.kind) {
    case 'face': {
      const how = relationship.target.face === relationship.face ? 'flush with' : 'against'
      return `${title(relationship.partId)} ${relationship.face} face ${how} ${title(relationship.target.partId)} ${relationship.target.face} face`
    }
    case 'center': return `${title(relationship.partId)} centered on ${title(relationship.targetId)} along ${relationship.axis}`
    case 'between': return `${title(relationship.partId)} centered between ${title(relationship.from.partId)} ${relationship.from.face} face and ${title(relationship.to.partId)} ${relationship.to.face} face`
    case 'distribute': return `${relationship.partIds.length} part${relationship.partIds.length === 1 ? '' : 's'} spaced between ${title(relationship.from.partId)} ${relationship.from.face} face and ${title(relationship.to.partId)} ${relationship.to.face} face`
  }
}

/** The first relationship that drives each position axis of a part. */
export function axisDrivers(project: FurnitureProject, partId: string): Partial<Record<Axis, FurnitureRelationship>> {
  const drivers: Partial<Record<Axis, FurnitureRelationship>> = {}
  for (const relationship of project.relationships) {
    let axis: Axis | null = null
    if (relationship.kind === 'face' && relationship.partId === partId) axis = faceAxis(relationship.face)
    else if ((relationship.kind === 'center' || relationship.kind === 'between') && relationship.partId === partId) axis = relationship.axis
    else if (relationship.kind === 'distribute' && relationship.partIds.includes(partId)) axis = relationship.axis
    if (axis && !drivers[axis]) drivers[axis] = relationship
  }
  return drivers
}

// ---- Parameters ----------------------------------------------------------------

export function addParameter(project: FurnitureProject, id: string): FurnitureProject {
  const taken = new Set(project.parameters.map(parameter => parameter.name))
  let n = 1
  while (taken.has(`param_${n}`)) n += 1
  const parameter: FurnitureParameter = { id, name: `param_${n}`, label: 'New parameter', value: DEFAULT_PARAMETER_VALUE }
  return { ...project, parameters: [...project.parameters, parameter] }
}

export interface ParameterUsage {
  kind: 'part' | 'parameter' | 'relationship'
  id: string
  /** Plain words, e.g. "L1 Front left leg length". */
  description: string
}

/** Rebuilds the project with every dimension expression passed through `change`. */
function mapExpressions(project: FurnitureProject, change: (value: DimExpr) => DimExpr): FurnitureProject {
  return {
    ...project,
    parameters: project.parameters.map(parameter => ({ ...parameter, value: change(parameter.value) })),
    parts: project.parts.map(part => ({
      ...part,
      length: change(part.length),
      width: change(part.width),
      thickness: change(part.thickness),
      position: { x: change(part.position.x), y: change(part.position.y), z: change(part.position.z) },
    })),
    relationships: project.relationships.map(relationship => relationship.kind === 'face' || relationship.kind === 'center' ? { ...relationship, offset: change(relationship.offset) } : relationship),
  }
}

export function parameterUsages(project: FurnitureProject, name: string): ParameterUsage[] {
  const usages: ParameterUsage[] = []
  const uses = (value: DimExpr) => typeof value === 'string' && referencedNames(value).includes(name)
  for (const parameter of project.parameters) {
    if (parameter.name !== name && uses(parameter.value)) usages.push({ kind: 'parameter', id: parameter.id, description: `parameter ${parameter.name}` })
  }
  for (const part of project.parts) {
    const fields: [string, DimExpr][] = [['length', part.length], ['width', part.width], ['thickness', part.thickness], ['position x', part.position.x], ['position y', part.position.y], ['position z', part.position.z]]
    for (const [field, value] of fields) if (uses(value)) usages.push({ kind: 'part', id: part.id, description: `${partTitle(project, part.id)} ${field}` })
  }
  for (const relationship of project.relationships) {
    if ((relationship.kind === 'face' || relationship.kind === 'center') && uses(relationship.offset)) usages.push({ kind: 'relationship', id: relationship.id, description: `offset of ${describeRelationship(project, relationship)}` })
  }
  return usages
}

/** Replaces whole-name uses of `from` in an expression. Digits before a name are a unit
 *  suffix ("0.75in"), and a name followed by "(" is a function, so neither is touched. */
export function renameInExpression(source: string, from: string, to: string): string {
  if (!referencedNames(source).includes(from)) return source
  return source.replace(/(\d+\.?\d*|\.\d+)?([A-Za-z_][A-Za-z0-9_]*)/g, (match, digits: string | undefined, word: string, offset: number, whole: string) => {
    if (digits !== undefined || word !== from) return match
    return /^\s*\(/.test(whole.slice(offset + match.length)) ? match : to
  })
}

export type RenameResult = { ok: true; project: FurnitureProject } | { ok: false; message: string }

/** Renames a parameter and rewrites every expression that mentions it. */
export function renameParameter(project: FurnitureProject, parameterId: string, name: string): RenameResult {
  const parameter = project.parameters.find(candidate => candidate.id === parameterId)
  if (!parameter) return { ok: false, message: 'That parameter no longer exists.' }
  if (name === parameter.name) return { ok: true, project }
  if (!isValidParameterName(name)) return { ok: false, message: 'Use letters, digits, and underscores, starting with a letter or underscore.' }
  if (project.parameters.some(other => other.name === name)) return { ok: false, message: `Another parameter is already named ${name}.` }
  const rewritten = mapExpressions(project, value => typeof value === 'string' ? renameInExpression(value, parameter.name, name) : value)
  return { ok: true, project: { ...rewritten, parameters: rewritten.parameters.map(other => other.id === parameterId ? { ...other, name } : other) } }
}

export function removeParameter(project: FurnitureProject, parameterId: string): FurnitureProject {
  return { ...project, parameters: project.parameters.filter(parameter => parameter.id !== parameterId) }
}

// ---- Sheet materials -----------------------------------------------------------

export function addSheetMaterial(project: FurnitureProject, id: string): FurnitureProject {
  return { ...project, sheetMaterials: [...project.sheetMaterials, defaultSheetMaterial(id)] }
}

export function sheetMaterialUsers(project: FurnitureProject, materialId: string): FurniturePart[] {
  return project.parts.filter(part => part.sheetMaterialId === materialId)
}

/** Null when parts still use the material: removing it would silently strand them. */
export function removeSheetMaterial(project: FurnitureProject, materialId: string): FurnitureProject | null {
  if (sheetMaterialUsers(project, materialId).length > 0) return null
  return { ...project, sheetMaterials: project.sheetMaterials.filter(material => material.id !== materialId) }
}
