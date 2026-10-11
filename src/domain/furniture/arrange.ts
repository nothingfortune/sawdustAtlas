import { axisDrivers, describeRelationship, partTitle } from './editing'
import { HIGH_FACE, LOW_FACE, faceAxis, isHighFace } from './faces'
import { resolveFurniture } from './geometry'
import type {
  Axis, Box, BoxFace, DimExpr, FaceRef, FurnitureContext, FurnitureProject, FurnitureRelationship, ResolvedFurniture,
} from './types'
import { BOX_FACES } from './types'

// Pure arranging math behind the designer's direct manipulation: grid and face
// snapping, nudges, selection, and the relationship builders for Attach, Align, Center,
// Between, and Distribute. Moving a part only ever writes a literal position; nothing
// here changes a part's size. Ids are inputs because the domain never generates them.

export const GRID_STEPS = [0, 1, 5, 10, 25.4] as const
/** A snapping grid in mm; 0 turns it off. */
export type GridStep = (typeof GRID_STEPS)[number]

/** Arrow-key nudge when the grid is off. */
export const DEFAULT_NUDGE = 1
export const SHIFT_NUDGE_FACTOR = 10
/** Centers closer than this along an axis count as already centered. */
const CENTERED = 1e-6

const AXES: readonly Axis[] = ['x', 'y', 'z']

function minOf(box: Box, axis: Axis): number {
  return box[axis]
}

function sizeOf(box: Box, axis: Axis): number {
  return axis === 'x' ? box.sx : axis === 'y' ? box.sy : box.sz
}

function centerOf(box: Box, axis: Axis): number {
  return minOf(box, axis) + sizeOf(box, axis) / 2
}

function planeAt(box: Box, face: BoxFace): number {
  return minOf(box, faceAxis(face)) + (isHighFace(face) ? sizeOf(box, faceAxis(face)) : 0)
}

// ---- Snapping and nudging --------------------------------------------------------

export interface SnapResult {
  /** The new min coordinate of the part along the axis. */
  value: number
  kind: 'face' | 'grid' | 'none'
  /** The world plane snapped to, when kind is 'face'. */
  plane?: number
}

/** Where a part's min edge should land when dragged to `proposed` along `axis`. Either of
 *  its two faces snaps to the nearest face plane of another part within `tolerance`
 *  mm; failing that the min edge snaps to the grid. Snapping only moves, never resizes. */
export function snapMove(box: Box, axis: Axis, proposed: number, others: readonly Box[], grid: GridStep, tolerance: number): SnapResult {
  const size = sizeOf(box, axis)
  let best: SnapResult | null = null
  let bestDistance = tolerance
  for (const other of others) {
    for (const plane of [minOf(other, axis), minOf(other, axis) + sizeOf(other, axis)]) {
      // Our low face on the plane, or our high face on it.
      for (const value of [plane, plane - size]) {
        const distance = Math.abs(value - proposed)
        if (distance <= bestDistance) {
          bestDistance = distance
          best = { value, kind: 'face', plane }
        }
      }
    }
  }
  if (best) return best
  if (grid > 0) return { value: Math.round(proposed / grid) * grid, kind: 'grid' }
  return { value: proposed, kind: 'none' }
}

/** One nudge, mm: a grid step (1 mm with the grid off), ten times that with Shift. */
export function nudgeDistance(grid: GridStep, shift: boolean): number {
  return (grid > 0 ? grid : DEFAULT_NUDGE) * (shift ? SHIFT_NUDGE_FACTOR : 1)
}

export type NudgeView = 'front' | 'side' | 'top' | 'iso' | 'exploded' | '3d'

export interface NudgeDirection {
  axis: Axis
  sign: 1 | -1
}

/** The axis an arrow or page key moves the selection along in a view. The arrows follow
 *  the screen in the orthographic views (the side view runs front to back left to
 *  right); in the iso, exploded, and 3D views they follow the plan (right is +x, up is
 *  +y). Page Up and Page Down always move up and down. */
export function nudgeDirection(key: string, view: NudgeView): NudgeDirection | null {
  if (key === 'PageUp') return { axis: 'z', sign: 1 }
  if (key === 'PageDown') return { axis: 'z', sign: -1 }
  const horizontal = view === 'side' ? 'y' : 'x'
  const vertical = view === 'front' || view === 'side' ? 'z' : 'y'
  switch (key) {
    case 'ArrowRight': return { axis: horizontal, sign: 1 }
    case 'ArrowLeft': return { axis: horizontal, sign: -1 }
    case 'ArrowUp': return { axis: vertical, sign: 1 }
    case 'ArrowDown': return { axis: vertical, sign: -1 }
    default: return null
  }
}

/** Why a part cannot be moved along an axis, or null when it can. */
export function moveBlocker(project: FurnitureProject, partId: string, axis: Axis): string | null {
  const driver = axisDrivers(project, partId)[axis]
  if (!driver) return null
  return `${partTitle(project, partId)} is placed along ${axis.toUpperCase()} by a relationship (${describeRelationship(project, driver)}). Remove that relationship to move it by hand.`
}

function withPosition(project: FurnitureProject, partId: string, axis: Axis, value: number): FurnitureProject {
  return {
    ...project,
    parts: project.parts.map(part => part.id === partId ? { ...part, position: { ...part.position, [axis]: value } } : part),
  }
}

/** The project with a part's literal position along one axis set to `value`; null when a
 *  relationship drives that axis or the part does not exist. An expression there is
 *  replaced by the number. */
export function movePart(project: FurnitureProject, partId: string, axis: Axis, value: number): FurnitureProject | null {
  if (!project.parts.some(part => part.id === partId) || moveBlocker(project, partId, axis)) return null
  return withPosition(project, partId, axis, value)
}

export interface NudgeResult {
  project: FurnitureProject
  moved: string[]
  blocked: { partId: string; reason: string }[]
}

/** Moves every part that is free on the axis by `delta` from where it resolved; the rest
 *  are reported with the reason. */
export function nudgeParts(project: FurnitureProject, resolved: ResolvedFurniture, partIds: readonly string[], axis: Axis, delta: number): NudgeResult {
  let next = project
  const moved: string[] = []
  const blocked: NudgeResult['blocked'] = []
  for (const partId of partIds) {
    const box = resolved.parts.find(part => part.id === partId)?.box
    if (!box) continue
    const reason = moveBlocker(project, partId, axis)
    if (reason) {
      blocked.push({ partId, reason })
      continue
    }
    next = withPosition(next, partId, axis, minOf(box, axis) + delta)
    moved.push(partId)
  }
  return { project: next, moved, blocked }
}

// ---- Selection -------------------------------------------------------------------

/** Selection in click order. A plain pick replaces the selection; an additive pick
 *  (Shift, Ctrl, or Cmd) toggles the part. */
export function pickPart(selection: readonly string[], partId: string, additive: boolean): string[] {
  if (!additive) return [partId]
  return selection.includes(partId) ? selection.filter(id => id !== partId) : [...selection, partId]
}

export interface ArrangeAvailability {
  attach: boolean
  align: boolean
  center: boolean
  between: boolean
  distribute: boolean
}

/** Which arranging actions a selection of this size supports: Attach, Align, and Center
 *  take two parts, Between three, Distribute two anchors plus at least two to space. */
export function arrangeAvailability(count: number): ArrangeAvailability {
  return { attach: count === 2, align: count === 2, center: count === 2, between: count === 3, distribute: count >= 4 }
}

// ---- Relationships ---------------------------------------------------------------

export type ArrangeResult = { ok: true; project: FurnitureProject } | { ok: false; message: string }

function claimsOf(relationship: FurnitureRelationship): { partId: string; axis: Axis }[] {
  switch (relationship.kind) {
    case 'face': return [{ partId: relationship.partId, axis: faceAxis(relationship.face) }]
    case 'center':
    case 'between': return [{ partId: relationship.partId, axis: relationship.axis }]
    case 'distribute': return relationship.partIds.map(partId => ({ partId, axis: relationship.axis }))
  }
}

/** Adds a relationship. A part axis has one driver, so a face, center, or between
 *  relationship already placing it is replaced; one that belongs to a distribution is
 *  refused, because replacing it would silently change the other parts' spacing. */
export function addRelationship(project: FurnitureProject, relationship: FurnitureRelationship): ArrangeResult {
  const replaced = new Set<string>()
  for (const { partId, axis } of claimsOf(relationship)) {
    const existing = axisDrivers(project, partId)[axis]
    if (!existing) continue
    if (existing.kind === 'distribute') {
      return { ok: false, message: `${partTitle(project, partId)} is already spaced along ${axis.toUpperCase()} by a distribution. Remove that relationship first.` }
    }
    replaced.add(existing.id)
  }
  return { ok: true, project: { ...project, relationships: [...project.relationships.filter(other => !replaced.has(other.id)), relationship] } }
}

/** The first error the resolver raises about a relationship, as a sentence; null when it
 *  resolves cleanly. Lets a dialog refuse a loop before it is committed. */
export function relationshipProblem(project: FurnitureProject, context: FurnitureContext, relationshipId: string): string | null {
  return resolveFurniture(project, context).issues.find(issue => issue.relationshipId === relationshipId && issue.severity === 'error')?.message ?? null
}

/** Every relationship that places a part or reads one of its faces, for the inspector. */
export function relationshipsOf(project: FurnitureProject, partId: string): FurnitureRelationship[] {
  return project.relationships.filter(relationship => {
    switch (relationship.kind) {
      case 'face': return relationship.partId === partId || relationship.target.partId === partId
      case 'center': return relationship.partId === partId || relationship.targetId === partId
      case 'between': return relationship.partId === partId || relationship.from.partId === partId || relationship.to.partId === partId
      case 'distribute': return relationship.partIds.includes(partId) || relationship.from.partId === partId || relationship.to.partId === partId
    }
  })
}

/** Removes a relationship and pins the parts it placed where they are now: each axis it
 *  drove gets the resolved coordinate as a literal position. */
export function removeRelationship(project: FurnitureProject, resolved: ResolvedFurniture, relationshipId: string): FurnitureProject {
  const relationship = project.relationships.find(candidate => candidate.id === relationshipId)
  if (!relationship) return project
  let next: FurnitureProject = { ...project, relationships: project.relationships.filter(candidate => candidate.id !== relationshipId) }
  for (const { partId, axis } of claimsOf(relationship)) {
    const box = resolved.parts.find(part => part.id === partId)?.box
    if (box) next = withPosition(next, partId, axis, minOf(box, axis))
  }
  return next
}

export interface PlacedBox {
  id: string
  box: Box
}

/** The face pair of two boxes, `moving` against `target`, that are closest along their
 *  axis: the moving face meets the opposite face of the target. */
export function suggestAttach(moving: Box, target: Box): { face: BoxFace; targetFace: BoxFace } {
  let best = { face: LOW_FACE.x, targetFace: HIGH_FACE.x }
  let bestGap = Infinity
  for (const face of BOX_FACES) {
    const axis = faceAxis(face)
    const targetFace = isHighFace(face) ? LOW_FACE[axis] : HIGH_FACE[axis]
    const gap = Math.abs(planeAt(moving, face) - planeAt(target, targetFace))
    if (gap < bestGap - CENTERED) {
      bestGap = gap
      best = { face, targetFace }
    }
  }
  return best
}

/** The face of two boxes nearest to flush that is not flush yet: a relationship on a
 *  face that already lines up would change nothing. */
export function suggestAlign(moving: Box, target: Box): BoxFace {
  let best: BoxFace = 'left'
  let bestGap = Infinity
  for (const face of BOX_FACES) {
    const gap = Math.abs(planeAt(moving, face) - planeAt(target, face))
    const effective = gap < CENTERED ? Infinity : gap
    if (effective < bestGap) {
      bestGap = effective
      best = face
    }
  }
  return best
}

/** The axis along which two boxes are least off-center, ignoring axes already centered. */
export function suggestCenterAxis(moving: Box, target: Box): Axis {
  let best: Axis = 'x'
  let bestGap = Infinity
  for (const axis of AXES) {
    const gap = Math.abs(centerOf(moving, axis) - centerOf(target, axis))
    if (gap > CENTERED && gap < bestGap) {
      bestGap = gap
      best = axis
    }
  }
  return best
}

function spreadAxis(boxes: readonly Box[]): Axis {
  let best: Axis = 'z'
  let bestSpread = -Infinity
  for (const axis of ['z', 'x', 'y'] as const) {
    const centers = boxes.map(box => centerOf(box, axis))
    const spread = Math.max(...centers) - Math.min(...centers)
    if (spread > bestSpread + CENTERED) {
      bestSpread = spread
      best = axis
    }
  }
  return best
}

/** For three boxes: the axis they spread along the most and the part in the middle of
 *  the other two, which is the one to center between them. */
export function suggestBetween(parts: readonly PlacedBox[]): { axis: Axis; partId: string } {
  const axis = spreadAxis(parts.map(part => part.box))
  const sorted = [...parts].sort((a, b) => centerOf(a.box, axis) - centerOf(b.box, axis))
  return { axis, partId: sorted[Math.floor(sorted.length / 2)]!.id }
}

/** For several boxes: the axis they spread along the most, the two outermost parts as
 *  anchors, and the rest in order along that axis. */
export function suggestDistribute(parts: readonly PlacedBox[]): { axis: Axis; fromId: string; toId: string } {
  const axis = spreadAxis(parts.map(part => part.box))
  const sorted = [...parts].sort((a, b) => centerOf(a.box, axis) - centerOf(b.box, axis))
  return { axis, fromId: sorted[0]!.id, toId: sorted[sorted.length - 1]!.id }
}

/** Part `partId`'s `face` plane sits at the target's `targetFace` plane plus `offset`. */
export function faceRelationship(id: string, partId: string, face: BoxFace, target: FaceRef, offset: DimExpr): FurnitureRelationship {
  return { id, kind: 'face', partId, face, target, offset }
}

/** Flush: the same face of both parts on one plane. */
export function alignRelationship(id: string, partId: string, targetId: string, face: BoxFace, offset: DimExpr): FurnitureRelationship {
  return faceRelationship(id, partId, face, { partId: targetId, face }, offset)
}

export function centerRelationship(id: string, partId: string, targetId: string, axis: Axis, offset: DimExpr): FurnitureRelationship {
  return { id, kind: 'center', partId, axis, targetId, offset }
}

/** Centers `partId` in the gap between the two others along the axis: the lower one's
 *  high face to the higher one's low face. */
export function betweenRelationship(id: string, partId: string, axis: Axis, anchors: readonly [PlacedBox, PlacedBox]): FurnitureRelationship {
  const [lower, upper] = [...anchors].sort((a, b) => centerOf(a.box, axis) - centerOf(b.box, axis)) as [PlacedBox, PlacedBox]
  return { id, kind: 'between', partId, axis, from: { partId: lower.id, face: HIGH_FACE[axis] }, to: { partId: upper.id, face: LOW_FACE[axis] } }
}

/** Spaces `parts` evenly between two anchors, in their current order along the axis. */
export function distributeRelationship(id: string, axis: Axis, anchors: readonly [PlacedBox, PlacedBox], parts: readonly PlacedBox[]): FurnitureRelationship {
  const [lower, upper] = [...anchors].sort((a, b) => centerOf(a.box, axis) - centerOf(b.box, axis)) as [PlacedBox, PlacedBox]
  const ordered = [...parts].sort((a, b) => centerOf(a.box, axis) - centerOf(b.box, axis))
  return { id, kind: 'distribute', partIds: ordered.map(part => part.id), axis, from: { partId: lower.id, face: HIGH_FACE[axis] }, to: { partId: upper.id, face: LOW_FACE[axis] } }
}

/** The part's current resolved box, for suggestions. */
export function boxOf(resolved: ResolvedFurniture, partId: string): Box | undefined {
  return resolved.parts.find(part => part.id === partId)?.box
}

/** Parts in selection order that resolved, for the arranging dialogs. */
export function placedSelection(resolved: ResolvedFurniture, selection: readonly string[]): PlacedBox[] {
  return selection.flatMap(id => {
    const box = boxOf(resolved, id)
    return box ? [{ id, box }] : []
  })
}
