import { evaluateDim, evaluateParameters } from './expressions'
import type {
  Axis, Box, BoxFace, DimExpr, FurnitureContext, FurnitureIssue, FurniturePart, FurnitureProject, PartDims, PartOrientation, ResolvedFurniture, ResolvedPart,
} from './types'

// Box geometry and the resolver that turns a furniture project into boxes. Pure
// millimeter math at full float precision: nothing here rounds.

/** Two planes closer than this are the same plane; a span shorter than this is no span. */
export const TOUCH_TOLERANCE = 1e-6

/** Shown for a part with no color override, species, or sheet material color. */
const NEUTRAL_COLOR = '#b9a48a'

const AXES: readonly Axis[] = ['x', 'y', 'z']

const FACE_AXIS: Readonly<Record<BoxFace, Axis>> = { left: 'x', right: 'x', front: 'y', back: 'y', bottom: 'z', top: 'z' }

const LOW_FACE: Readonly<Record<Axis, BoxFace>> = { x: 'left', y: 'front', z: 'bottom' }
const HIGH_FACE: Readonly<Record<Axis, BoxFace>> = { x: 'right', y: 'back', z: 'top' }

/** Extent along each world axis: the part's length, width, and thickness run along the
 *  axes named by the orientation, in that order. */
export function orientedExtents(size: PartDims, orientation: PartOrientation): { sx: number; sy: number; sz: number } {
  const along: Record<Axis, number> = { x: 0, y: 0, z: 0 }
  along[orientation[0] as Axis] = size.length
  along[orientation[1] as Axis] = size.width
  along[orientation[2] as Axis] = size.thickness
  return { sx: along.x, sy: along.y, sz: along.z }
}

export function faceAxis(face: BoxFace): Axis {
  return FACE_AXIS[face]
}

/** The coordinate of a box face's plane along the face's axis. */
export function facePlane(box: Box, face: BoxFace): number {
  switch (face) {
    case 'left': return box.x
    case 'right': return box.x + box.sx
    case 'front': return box.y
    case 'back': return box.y + box.sy
    case 'bottom': return box.z
    case 'top': return box.z + box.sz
  }
}

function span(box: Box, axis: Axis): { min: number; max: number } {
  const min = axis === 'x' ? box.x : axis === 'y' ? box.y : box.z
  const size = axis === 'x' ? box.sx : axis === 'y' ? box.sy : box.sz
  return { min, max: min + size }
}

/** Shared length of two intervals along one axis; 0 when they only meet or miss. */
function overlapLength(a: Box, b: Box, axis: Axis): number {
  const first = span(a, axis)
  const second = span(b, axis)
  const length = Math.min(first.max, second.max) - Math.max(first.min, second.min)
  return length > TOUCH_TOLERANCE ? length : 0
}

/** Volume shared by two boxes. Boxes that merely touch share none. */
export function overlapVolume(a: Box, b: Box): number {
  return overlapLength(a, b, 'x') * overlapLength(a, b, 'y') * overlapLength(a, b, 'z')
}

/** Two boxes meeting face to face. `u` and `v` run along the two axes other than `axis`,
 *  in x, y, z order, and `rect` is the shared rectangle in that plane. */
export interface Contact {
  axis: Axis
  aFace: BoxFace
  bFace: BoxFace
  plane: number
  area: number
  rect: { u0: number; u1: number; v0: number; v1: number }
}

/** The face contact between two boxes, or null. One face plane must coincide with the
 *  other's opposite plane and the shared rectangle must have positive area, so edge or
 *  corner contact (and overlap) is not contact. */
export function contactBetween(a: Box, b: Box): Contact | null {
  for (const axis of AXES) {
    const first = span(a, axis)
    const second = span(b, axis)
    const aFace = Math.abs(first.max - second.min) <= TOUCH_TOLERANCE ? HIGH_FACE[axis]
      : Math.abs(second.max - first.min) <= TOUCH_TOLERANCE ? LOW_FACE[axis] : null
    if (!aFace) continue
    const [uAxis, vAxis] = AXES.filter(other => other !== axis) as [Axis, Axis]
    const u = sharedInterval(a, b, uAxis)
    const v = sharedInterval(a, b, vAxis)
    if (!u || !v) continue
    const bFace = aFace === HIGH_FACE[axis] ? LOW_FACE[axis] : HIGH_FACE[axis]
    return { axis, aFace, bFace, plane: facePlane(a, aFace), area: (u.max - u.min) * (v.max - v.min), rect: { u0: u.min, u1: u.max, v0: v.min, v1: v.max } }
  }
  return null
}

function sharedInterval(a: Box, b: Box, axis: Axis): { min: number; max: number } | null {
  if (overlapLength(a, b, axis) === 0) return null
  return { min: Math.max(span(a, axis).min, span(b, axis).min), max: Math.min(span(a, axis).max, span(b, axis).max) }
}

/** What a world face of a part is: an end (across the length axis), an edge (across the
 *  width axis), or a face (across the thickness axis). Joinery decides which dimension a
 *  joint grows from this. */
export function partSurfaceAt(orientation: PartOrientation, face: BoxFace): 'end' | 'edge' | 'face' {
  const index = orientation.indexOf(FACE_AXIS[face])
  return index === 0 ? 'end' : index === 1 ? 'edge' : 'face'
}

export function boundsOf(boxes: readonly Box[]): Box | null {
  const [first, ...rest] = boxes
  if (!first) return null
  let min = { x: first.x, y: first.y, z: first.z }
  let max = { x: first.x + first.sx, y: first.y + first.sy, z: first.z + first.sz }
  for (const box of rest) {
    min = { x: Math.min(min.x, box.x), y: Math.min(min.y, box.y), z: Math.min(min.z, box.z) }
    max = { x: Math.max(max.x, box.x + box.sx), y: Math.max(max.y, box.y + box.sy), z: Math.max(max.z, box.z + box.sz) }
  }
  return { x: min.x, y: min.y, z: min.z, sx: max.x - min.x, sy: max.y - min.y, sz: max.z - min.z }
}

// ---- Resolve -------------------------------------------------------------------

/** Evaluates a project into boxes. A part whose size or position cannot be evaluated is
 *  left out and explained by an issue; nothing is placed "somewhere plausible". */
export function resolveFurniture(project: FurnitureProject, context: FurnitureContext): ResolvedFurniture {
  const { values: parameters, issues } = evaluateParameters(project.parameters)

  const parts: ResolvedPart[] = []
  for (const part of project.parts) {
    // Both are evaluated so one pass reports every bad field of the part.
    const size = resolveSize(part, parameters, issues)
    const position = resolvePosition(part, parameters, issues)
    if (!size || !position) continue
    const box: Box = { ...position, ...orientedExtents(size, part.orientation) }
    parts.push({ id: part.id, part, size, box, color: colorOf(part, project, context), drivenAxes: [] })
  }

  return { project, parameters, parts, issues, bounds: boundsOf(parts.map(resolved => resolved.box)) }
}

function resolveSize(part: FurniturePart, scope: Readonly<Record<string, number>>, issues: FurnitureIssue[]): PartDims | null {
  const size: Partial<PartDims> = {}
  for (const field of ['length', 'width', 'thickness'] as const) {
    const value = evaluateField(part, field, part[field], scope, issues)
    if (value === null) continue
    if (value > 0) size[field] = value
    else issues.push({ code: 'dimension-not-positive', severity: 'error', message: `${part.name}, ${field}: must be greater than zero.`, partIds: [part.id], field })
  }
  return size.length !== undefined && size.width !== undefined && size.thickness !== undefined
    ? { length: size.length, width: size.width, thickness: size.thickness }
    : null
}

function resolvePosition(part: FurniturePart, scope: Readonly<Record<string, number>>, issues: FurnitureIssue[]): { x: number; y: number; z: number } | null {
  const x = evaluateField(part, 'position.x', part.position.x, scope, issues)
  const y = evaluateField(part, 'position.y', part.position.y, scope, issues)
  const z = evaluateField(part, 'position.z', part.position.z, scope, issues)
  return x === null || y === null || z === null ? null : { x, y, z }
}

function evaluateField(part: FurniturePart, field: string, value: DimExpr, scope: Readonly<Record<string, number>>, issues: FurnitureIssue[]): number | null {
  const result = evaluateDim(value, scope)
  if (result.ok) return result.value
  issues.push({ code: result.code, severity: 'error', message: `${part.name}, ${field}: ${result.message}`, partIds: [part.id], field })
  return null
}

function colorOf(part: FurniturePart, project: FurnitureProject, context: FurnitureContext): string {
  return part.color
    ?? context.woods.find(wood => wood.id === part.speciesId)?.color
    ?? project.sheetMaterials.find(material => material.id === part.sheetMaterialId)?.color
    ?? NEUTRAL_COLOR
}
