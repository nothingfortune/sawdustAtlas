// Pure 2D geometry for the calculator. Math coordinates (x right, y up); the UI flips y
// for SVG. Vec is an object so a z field can be added for true 3D later.

export interface Vec { x: number; y: number }
export interface SketchPoint { id: string; x: number; y: number }
export interface SketchMember { id: string; aId: string; bId: string; widthMm: number }
export interface Sketch { points: SketchPoint[]; members: SketchMember[] }

const EPSILON = 1e-9

export function distance(a: Vec, b: Vec): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

export function bearingDeg(a: Vec, b: Vec): number {
  return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI
}

export function angleBetweenDeg(a1: Vec, a2: Vec, b1: Vec, b2: Vec): number {
  const u = { x: a2.x - a1.x, y: a2.y - a1.y }
  const w = { x: b2.x - b1.x, y: b2.y - b1.y }
  const lu = Math.hypot(u.x, u.y), lw = Math.hypot(w.x, w.y)
  if (lu < EPSILON || lw < EPSILON) return 0
  const cos = Math.min(1, Math.max(-1, (u.x * w.x + u.y * w.y) / (lu * lw)))
  return Math.acos(cos) * 180 / Math.PI
}

export function lineIntersection(a1: Vec, a2: Vec, b1: Vec, b2: Vec): { point: Vec; withinBoth: boolean } | null {
  const r = { x: a2.x - a1.x, y: a2.y - a1.y }
  const s = { x: b2.x - b1.x, y: b2.y - b1.y }
  const denom = r.x * s.y - r.y * s.x
  if (Math.abs(denom) < EPSILON) return null // parallel or degenerate
  const qp = { x: b1.x - a1.x, y: b1.y - a1.y }
  const t = (qp.x * s.y - qp.y * s.x) / denom
  const u = (qp.x * r.y - qp.y * r.x) / denom
  const point = { x: a1.x + t * r.x, y: a1.y + t * r.y }
  return { point, withinBoth: t >= 0 && t <= 1 && u >= 0 && u <= 1 }
}

// Acute angles (0..90) a segment makes with the horizontal and vertical axes — the
// "cut off square / off plumb" numbers for a member measured against a reference.
// Sign-independent (a leg leaning either way reads the same).
export function angleToAxes(a: Vec, b: Vec): { fromHorizontalDeg: number; fromVerticalDeg: number } {
  const fromHorizontalDeg = Math.atan2(Math.abs(b.y - a.y), Math.abs(b.x - a.x)) * 180 / Math.PI
  return { fromHorizontalDeg, fromVerticalDeg: 90 - fromHorizontalDeg }
}

export function memberRectangle(a: Vec, b: Vec, widthMm: number): [Vec, Vec, Vec, Vec] {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const dir = len < EPSILON ? { x: 1, y: 0 } : { x: (b.x - a.x) / len, y: (b.y - a.y) / len }
  const half = Math.max(0, widthMm) / 2
  const nx = -dir.y * half, ny = dir.x * half // perpendicular * half width
  return [
    { x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny },
    { x: b.x - nx, y: b.y - ny }, { x: a.x - nx, y: a.y - ny },
  ]
}
