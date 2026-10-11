import type { Drawing, DrawingDimension, DrawingPolygon, DrawingView } from '../../domain/furniture/projection'

// Pure layout helpers for FurnitureDrawing. The domain draws in millimeters with y up;
// SVG has y down, so every point passes through svgPoint. Text stays upright because
// points are flipped, not the whole group.

type Pt = readonly [number, number]

const NEUTRAL = '#b9a48a'
/** Space around the drawing, as a fraction of its larger extent. */
const PAD_RATIO = 0.05
/** Label size, as a fraction of the larger extent of the drawing. */
const FONT_RATIO = 1 / 42
const EMPTY_BOX = 100

export function svgPoint(point: Pt): [number, number] {
  return [point[0], -point[1]]
}

export function polygonPath(points: readonly Pt[]): string {
  return points.map((point, index) => {
    const [x, y] = svgPoint(point)
    return `${index ? 'L' : 'M'}${x} ${y}`
  }).join('') + 'Z'
}

function parseHex(color: string): [number, number, number] | null {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color)
  if (short) return [short[1]!, short[2]!, short[3]!].map(c => parseInt(c + c, 16)) as [number, number, number]
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color)
  return long ? [long[1]!, long[2]!, long[3]!].map(c => parseInt(c, 16)) as [number, number, number] : null
}

/** Mixes a #rgb or #rrggbb color toward white (amount > 0) or black (amount < 0),
 *  amount in -1..1. An unparseable color falls back to the neutral stock color. */
export function shadeColor(color: string, amount: number): string {
  const [r, g, b] = parseHex(color) ?? parseHex(NEUTRAL)!
  const target = amount >= 0 ? 255 : 0
  const t = Math.min(1, Math.abs(amount))
  return '#' + [r, g, b].map(c => Math.round(c + (target - c) * t).toString(16).padStart(2, '0')).join('')
}

/** Face fill from the part color. The orthographic views show one flat face. Iso and
 *  exploded light the top and shade the right side so the box reads as 3D. */
export function faceFill(color: string, face: DrawingPolygon['face'], view: DrawingView): string {
  if (view !== 'iso' && view !== 'exploded') return shadeColor(color, 0)
  if (face === 'top') return shadeColor(color, 0.3)
  if (face === 'side') return shadeColor(color, -0.28)
  return shadeColor(color, -0.06)
}

export function polygonArea(points: readonly Pt[]): number {
  let twice = 0
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length]!
    twice += p[0] * q[1] - q[0] * p[1]
  })
  return Math.abs(twice) / 2
}

/** Area centroid, in drawing coordinates; the vertex mean for a degenerate polygon. */
export function polygonCenter(points: readonly Pt[]): [number, number] {
  let twice = 0, cx = 0, cy = 0
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length]!
    const cross = p[0] * q[1] - q[0] * p[1]
    twice += cross
    cx += (p[0] + q[0]) * cross
    cy += (p[1] + q[1]) * cross
  })
  if (Math.abs(twice) < 1e-9) return [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length]
  return [cx / (3 * twice), cy / (3 * twice)]
}

/** The face that carries a part's label: its largest polygon. */
export function labelPolygons(polygons: readonly DrawingPolygon[]): Map<string, DrawingPolygon> {
  const largest = new Map<string, { polygon: DrawingPolygon; area: number }>()
  for (const polygon of polygons) {
    const area = polygonArea(polygon.points)
    const current = largest.get(polygon.partId)
    if (!current || area > current.area) largest.set(polygon.partId, { polygon, area })
  }
  return new Map([...largest].map(([id, entry]) => [id, entry.polygon]))
}

/** Approximate rendered width of label text in the DM Mono face. */
export function textWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.62
}

/** Whether `text` fits inside the polygon's bounding box, so plain labels on thin legs
 *  and edge-on panels are left to the badge or the parts list instead of overprinting. */
export function labelFits(points: readonly Pt[], text: string, fontSize: number): boolean {
  const xs = points.map(p => p[0]), ys = points.map(p => p[1])
  return Math.max(...xs) - Math.min(...xs) >= textWidth(text, fontSize) && Math.max(...ys) - Math.min(...ys) >= fontSize * 1.1
}

function insidePolygon(point: Pt, polygon: readonly Pt[]): boolean {
  let sign = 0
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!
    const cross = (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0])
    if (Math.abs(cross) < 1e-9) continue
    const side = Math.sign(cross)
    if (sign && side !== sign) return false
    sign = side
  }
  return true
}

/** Whether a nearer polygon of another part, drawn after `polygons[index]`, covers the
 *  point, so a plain label there would print on top of the wrong part. Faces are convex. */
export function isCoveredAt(point: Pt, polygons: readonly DrawingPolygon[], index: number): boolean {
  const owner = polygons[index]?.partId
  return polygons.some((polygon, i) => i > index && polygon.partId !== owner && insidePolygon(point, polygon.points))
}

export interface DrawingLayout {
  /** SVG viewBox, y flipped. */
  viewBox: { x: number; y: number; width: number; height: number }
  /** Label size in drawing units, so text scales with the drawing. */
  fontSize: number
}

export function drawingLayout(drawing: Drawing, showDimensions: boolean): DrawingLayout {
  const { minX, minY, maxX, maxY } = drawing.bounds
  const extent = Math.max(maxX - minX, maxY - minY)
  if (!drawing.polygons.length || extent <= 0) return { viewBox: { x: 0, y: 0, width: EMPTY_BOX, height: EMPTY_BOX }, fontSize: EMPTY_BOX / 20 }
  const fontSize = extent * FONT_RATIO
  const pad = extent * PAD_RATIO + fontSize
  // Dimension lines sit outside the bottom and right edges, with text beyond them.
  const reach = showDimensions && drawing.dimensions.length ? Math.max(...drawing.dimensions.map(d => d.offset)) + fontSize * 2.4 : 0
  return {
    viewBox: { x: minX - pad, y: -maxY - pad, width: maxX - minX + pad * 2 + reach, height: maxY - minY + pad * 2 + reach },
    fontSize,
  }
}

export function viewBoxAttribute(layout: DrawingLayout): string {
  const { x, y, width, height } = layout.viewBox
  return `${x} ${y} ${width} ${height}`
}

export interface DimensionGeometry {
  /** The dimension line and the two extension lines to it, SVG coordinates. */
  line: [[number, number], [number, number]]
  extensions: Array<[[number, number], [number, number]]>
  /** End ticks. */
  ticks: Array<[[number, number], [number, number]]>
  text: { x: number; y: number; rotate: number }
}

/** Geometry for one overall dimension, as produced by projectDrawing: a horizontal
 *  extent gets its line below it, a vertical one gets its line to its right. */
export function dimensionGeometry(dimension: DrawingDimension, fontSize: number): DimensionGeometry {
  const [fx, fy] = svgPoint(dimension.from)
  const [tx, ty] = svgPoint(dimension.to)
  const tick = fontSize * 0.4
  const beyond = fontSize * 0.5
  if (fy === ty) {
    const y = fy + dimension.offset
    return {
      line: [[fx, y], [tx, y]],
      extensions: [[[fx, fy], [fx, y + beyond]], [[tx, ty], [tx, y + beyond]]],
      ticks: [[[fx - tick, y + tick], [fx + tick, y - tick]], [[tx - tick, y + tick], [tx + tick, y - tick]]],
      text: { x: (fx + tx) / 2, y: y + fontSize * 1.25, rotate: 0 },
    }
  }
  const x = fx + dimension.offset
  const textX = x + fontSize * 1.25
  return {
    line: [[x, fy], [x, ty]],
    extensions: [[[fx, fy], [x + beyond, fy]], [[tx, ty], [x + beyond, ty]]],
    ticks: [[[x - tick, fy + tick], [x + tick, fy - tick]], [[x - tick, ty + tick], [x + tick, ty - tick]]],
    text: { x: textX, y: (fy + ty) / 2, rotate: -90 },
  }
}
