import type { CameraPose } from '../instructions/types'
import type { Box, FurnitureProject, ResolvedPart } from './types'

// 2D drawings of a furniture project, computed from resolved boxes so print, the bench,
// and the SVG designer never depend on WebGL (spec FD6). Drawing coordinates are
// millimeters with y up, like geometry2d.ts; the UI flips y for SVG.
//
// World axes follow types.ts: x left to right seen from the front, y front to back,
// z up. Views:
// - front looks along +y: drawing (x, y) = world (x, z).
// - side looks along -x at the right side: drawing (x, y) = world (y, z).
// - top looks down -z: drawing (x, y) = world (x, y), back of the piece at the top.
// - iso and exploded are orthographic from the front-right-top octant.

export type DrawingView = 'front' | 'side' | 'top' | 'iso' | 'exploded'

export interface DrawingPolygon {
  partId: string
  /** The world side drawn: front is -y, side is +x (the right side), top is +z. */
  face: 'front' | 'side' | 'top'
  points: Array<[number, number]>
  /** Distance from the viewer along the view direction at the face's nearest point,
   *  mm from an arbitrary origin. Smaller is nearer; polygons are ordered by it. */
  depth: number
}

export interface DrawingDimension {
  /** Ends of the measured extent. */
  from: [number, number]
  to: [number, number]
  /** Length of the extent, mm. */
  value: number
  /** How far outside the extent the dimension line sits, mm: below a horizontal extent
   *  (which lies on the drawing's bottom edge), right of a vertical one (right edge). */
  offset: number
}

export interface DrawingBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface Drawing {
  view: DrawingView
  /** Painter ordered: farthest first, so drawing in array order is correct. */
  polygons: DrawingPolygon[]
  /** Extent of the polygons. Dimension lines lie outside it. */
  bounds: DrawingBounds
  /** Overall dimensions of the orthographic views; empty for iso and exploded. */
  dimensions: DrawingDimension[]
}

export type ExplodeOffsets = Readonly<Record<string, readonly [number, number, number]>>

export interface ProjectionOptions {
  /** World-space translation per part id, mm. Parts without an entry stay put. */
  explodeOffsets?: ExplodeOffsets
}

type Vec3 = readonly [number, number, number]

const SQRT2 = Math.SQRT2
const SQRT3 = Math.sqrt(3)
const SQRT6 = Math.sqrt(6)
/** Boxes closer than this along an axis count as touching, not overlapping. */
const TOUCH = 1e-6
/** Dimension lines sit this fraction of the larger extent outside the drawing. */
const DIMENSION_OFFSET_RATIO = 0.06

// Iso view direction (toward the viewer): front-right-above, so the front, right side,
// and top faces show. Screen right is (1, 1, 0)/sqrt2 and screen up is (-1, 1, 2)/sqrt6.
const ISO_TO_VIEWER: Vec3 = [1 / SQRT3, -1 / SQRT3, 1 / SQRT3]

function isoPoint(x: number, y: number, z: number): [number, number] {
  return [(x + y) / SQRT2, (-x + y + 2 * z) / SQRT6]
}

function isoDepth(x: number, y: number, z: number): number {
  return -(x * ISO_TO_VIEWER[0] + y * ISO_TO_VIEWER[1] + z * ISO_TO_VIEWER[2])
}

function moved(box: Box, offset: readonly [number, number, number] | undefined): Box {
  if (!offset) return box
  return { ...box, x: box.x + offset[0], y: box.y + offset[1], z: box.z + offset[2] }
}

function rect(x0: number, y0: number, x1: number, y1: number): Array<[number, number]> {
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
}

export function projectDrawing(parts: readonly ResolvedPart[], view: DrawingView, options: ProjectionOptions = {}): Drawing {
  const placed = parts.map(part => ({ id: part.id, box: moved(part.box, options.explodeOffsets?.[part.id]) }))
  const polygons = view === 'iso' || view === 'exploded' ? isoPolygons(placed) : orthographicPolygons(placed, view)
  const bounds = polygonBounds(polygons)
  return { view, polygons, bounds, dimensions: view === 'iso' || view === 'exploded' ? [] : overallDimensions(bounds) }
}

function orthographicPolygons(placed: ReadonlyArray<{ id: string; box: Box }>, view: 'front' | 'side' | 'top'): DrawingPolygon[] {
  const polygons = placed.map(({ id, box }): DrawingPolygon => {
    if (view === 'front') return { partId: id, face: 'front', points: rect(box.x, box.z, box.x + box.sx, box.z + box.sz), depth: box.y }
    if (view === 'side') return { partId: id, face: 'side', points: rect(box.y, box.z, box.y + box.sy, box.z + box.sz), depth: -(box.x + box.sx) }
    return { partId: id, face: 'top', points: rect(box.x, box.y, box.x + box.sx, box.y + box.sy), depth: -(box.z + box.sz) }
  })
  // Each part shows its single nearest face, so face-plane depth is an exact order.
  return polygons.map((polygon, index) => ({ polygon, index })).sort((a, b) => b.polygon.depth - a.polygon.depth || a.index - b.index).map(entry => entry.polygon)
}

function isoPolygons(placed: ReadonlyArray<{ id: string; box: Box }>): DrawingPolygon[] {
  return paintOrder(placed).flatMap(({ id, box }) => {
    const { x, y, z, sx, sy, sz } = box
    const x1 = x + sx, y1 = y + sy, z1 = z + sz
    const face = (kind: DrawingPolygon['face'], corners: Array<[number, number, number]>): DrawingPolygon => ({
      partId: id,
      face: kind,
      points: corners.map(([cx, cy, cz]) => isoPoint(cx, cy, cz)),
      depth: Math.min(...corners.map(([cx, cy, cz]) => isoDepth(cx, cy, cz))),
    })
    return [
      face('top', [[x, y, z1], [x1, y, z1], [x1, y1, z1], [x, y1, z1]]),
      face('side', [[x1, y, z], [x1, y1, z], [x1, y1, z1], [x1, y, z1]]),
      face('front', [[x, y, z], [x1, y, z], [x1, y, z1], [x, y, z1]]),
    ]
  })
}

/** A cannot hide any part of B: some axis-aligned plane separates them with B on the
 *  viewer's side (viewer is toward +x, -y, +z). */
function isBehind(a: Box, b: Box): boolean {
  return a.x + a.sx <= b.x + TOUCH || a.y >= b.y + b.sy - TOUCH || a.z + a.sz <= b.z + TOUCH
}

/** Painter order for axis-aligned boxes: a topological sort over "is behind" rather
 *  than a centroid heuristic, so a long part never jumps in front of a small one it
 *  does not actually overlap. Ties and overlapping (colliding) boxes fall back to the
 *  depth of the nearest corner, farthest first, then input order. */
function paintOrder<T extends { box: Box }>(items: readonly T[]): T[] {
  const n = items.length
  const key = items.map(({ box }) => isoDepth(box.x + box.sx, box.y, box.z + box.sz))
  const before: boolean[][] = items.map(() => new Array<boolean>(n).fill(false))
  const waiting = new Array<number>(n).fill(0)
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (i === j) continue
      const a = items[i]!.box, b = items[j]!.box
      if (isBehind(a, b) && !isBehind(b, a)) {
        before[i]![j] = true
        waiting[j] = (waiting[j] ?? 0) + 1
      }
    }
  }
  const remaining = new Set(items.map((_, index) => index))
  const ordered: T[] = []
  const better = (a: number, b: number) => (key[a]! - key[b]! || b - a) > 0
  while (remaining.size) {
    let pick = -1
    for (const index of remaining) {
      if (waiting[index] === 0 && (pick < 0 || better(index, pick))) pick = index
    }
    // Disjoint boxes never form a cycle; this keeps colliding input from hanging.
    if (pick < 0) for (const index of remaining) if (pick < 0 || waiting[index]! < waiting[pick]! || (waiting[index] === waiting[pick] && better(index, pick))) pick = index
    remaining.delete(pick)
    ordered.push(items[pick]!)
    items.forEach((_, j) => { if (before[pick]![j]) waiting[j] = (waiting[j] ?? 0) - 1 })
  }
  return ordered
}

function polygonBounds(polygons: readonly DrawingPolygon[]): DrawingBounds {
  const points = polygons.flatMap(polygon => polygon.points)
  if (!points.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  const xs = points.map(point => point[0]), ys = points.map(point => point[1])
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }
}

function overallDimensions(bounds: DrawingBounds): DrawingDimension[] {
  const width = bounds.maxX - bounds.minX, height = bounds.maxY - bounds.minY
  if (!width && !height) return []
  const offset = Math.max(width, height) * DIMENSION_OFFSET_RATIO
  return [
    { from: [bounds.minX, bounds.minY], to: [bounds.maxX, bounds.minY], value: width, offset },
    { from: [bounds.maxX, bounds.minY], to: [bounds.maxX, bounds.maxY], value: height, offset },
  ]
}

/** Per-part translations for an exploded view. Every top-level subassembly and every
 *  loose part moves `distance` mm away from the center of the whole piece along the
 *  axis it is furthest off-center; a child subassembly moves again, relative to its
 *  parent's center, on top of the parent's move. A unit sitting exactly at its
 *  reference center stays put. Every resolved part gets an entry. */
export function explodeOffsets(project: FurnitureProject, parts: readonly ResolvedPart[], distance: number): Record<string, [number, number, number]> {
  const offsets: Record<string, [number, number, number]> = {}
  for (const part of parts) offsets[part.id] = [0, 0, 0]
  const boxes = new Map(parts.map(part => [part.id, part.box]))
  const center = centerOf([...boxes.values()])
  if (!center) return offsets

  const subassemblies = new Map(project.subassemblies.map(sub => [sub.id, sub]))
  const childIds = new Set(project.subassemblies.flatMap(sub => sub.childIds))
  const claimed = new Set<string>()

  const gather = (id: string, seen: Set<string>): string[] => {
    const sub = subassemblies.get(id)
    if (!sub || seen.has(id)) return []
    seen.add(id)
    return [...sub.partIds.filter(partId => boxes.has(partId)), ...sub.childIds.flatMap(child => gather(child, seen))]
  }

  const push = (partIds: readonly string[], extra: readonly [number, number, number]) => {
    for (const partId of partIds) {
      const offset = offsets[partId]
      if (offset) { offset[0] += extra[0]; offset[1] += extra[1]; offset[2] += extra[2] }
    }
  }

  // Walks a subassembly: moves its parts (including descendants) away from `reference`,
  // then recurses so children move relative to this unit's own center.
  const explodeUnit = (id: string, reference: Vec3, seen: Set<string>) => {
    if (seen.has(id)) return
    const members = [...new Set(gather(id, new Set()))]
    members.forEach(partId => claimed.add(partId))
    const unitCenter = centerOf(members.map(partId => boxes.get(partId)!))
    if (!unitCenter) return
    push(members, awayFrom(reference, unitCenter, distance))
    seen.add(id)
    for (const child of subassemblies.get(id)?.childIds ?? []) explodeUnit(child, unitCenter, seen)
  }

  const seen = new Set<string>()
  for (const sub of project.subassemblies) if (!childIds.has(sub.id)) explodeUnit(sub.id, center, seen)
  for (const part of parts) {
    if (claimed.has(part.id)) continue
    push([part.id], awayFrom(center, centerOf([part.box])!, distance))
  }
  return offsets
}

function centerOf(boxes: readonly Box[]): Vec3 | null {
  if (!boxes.length) return null
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for (const box of boxes) {
    min[0] = Math.min(min[0]!, box.x); max[0] = Math.max(max[0]!, box.x + box.sx)
    min[1] = Math.min(min[1]!, box.y); max[1] = Math.max(max[1]!, box.y + box.sy)
    min[2] = Math.min(min[2]!, box.z); max[2] = Math.max(max[2]!, box.z + box.sz)
  }
  return [(min[0]! + max[0]!) / 2, (min[1]! + max[1]!) / 2, (min[2]! + max[2]!) / 2]
}

function awayFrom(reference: Vec3, point: Vec3, distance: number): [number, number, number] {
  const delta = [point[0] - reference[0], point[1] - reference[1], point[2] - reference[2]]
  let axis = 0
  for (let i = 1; i < 3; i += 1) if (Math.abs(delta[i]!) > Math.abs(delta[axis]!)) axis = i
  const along = delta[axis]!
  if (Math.abs(along) < TOUCH) return [0, 0, 0]
  const offset: [number, number, number] = [0, 0, 0]
  offset[axis] = Math.sign(along) * distance
  return offset
}

/** Isometric camera for a piece in world coordinates (z up): looks at the center of
 *  the bounds from the same front-right-above direction the 2D iso drawing uses, far
 *  enough back that the bounding sphere fits a 40 degree field of view. */
export function isoCamera(bounds: Box): CameraPose {
  const target: [number, number, number] = [bounds.x + bounds.sx / 2, bounds.y + bounds.sy / 2, bounds.z + bounds.sz / 2]
  const radius = Math.max(Math.hypot(bounds.sx, bounds.sy, bounds.sz) / 2, 1)
  const distance = radius / Math.sin((20 * Math.PI) / 180)
  return {
    position: [target[0] + ISO_TO_VIEWER[0] * distance, target[1] + ISO_TO_VIEWER[1] * distance, target[2] + ISO_TO_VIEWER[2] * distance],
    target,
    up: [0, 0, 1],
  }
}
