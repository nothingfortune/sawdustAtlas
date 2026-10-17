import { describe, expect, it } from 'vitest'
import { explodeOffsets, isoCamera, projectDrawing } from '../src/domain/furniture/projection'
import type { Drawing, DrawingPolygon, DrawingView } from '../src/domain/furniture/projection'
import type { Box, ResolvedPart } from '../src/domain/furniture/types'
import { BOOKCASE_BOXES, TABLE_BOXES, bookcaseProject, bookcaseResolvedParts, tableProject, tableResolvedParts } from './fixtures/furniture'

const SQRT2 = Math.SQRT2
const SQRT6 = Math.sqrt(6)

type Pt = [number, number]

// Convex polygon intersection by Sutherland-Hodgman clipping; returns the clipped ring.
function clip(subject: Pt[], clipper: Pt[]): Pt[] {
  const orient = signedArea(clipper) >= 0 ? 1 : -1
  let output = subject
  for (let i = 0; i < clipper.length && output.length; i += 1) {
    const a = clipper[i]!, b = clipper[(i + 1) % clipper.length]!
    const inside = (p: Pt) => orient * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) >= -1e-9
    const cross = (p: Pt, q: Pt): Pt => {
      const dp = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
      const dq = (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])
      const t = dp / (dp - dq)
      return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]
    }
    const input = output
    output = []
    input.forEach((current, index) => {
      const previous = input[(index + input.length - 1) % input.length]!
      if (inside(current)) {
        if (!inside(previous)) output.push(cross(previous, current))
        output.push(current)
      } else if (inside(previous)) output.push(cross(previous, current))
    })
  }
  return output
}

function signedArea(points: Pt[]): number {
  return points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length]!
    return sum + (p[0] * q[1] - q[0] * p[1])
  }, 0) / 2
}

function centroid(points: Pt[]): Pt {
  return [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length]
}

// True iso depth (smaller is nearer) of the point of `polygon`'s face plane that lands
// on screen position (X, Y), recomputed from the box rather than read from the drawing.
function isoDepthAt(polygon: DrawingPolygon, box: Box, screen: Pt): number {
  const a = screen[0] * SQRT2, b = screen[1] * SQRT6
  let x: number, y: number, z: number
  if (polygon.face === 'front') {
    y = box.y; x = a - y; z = (b + x - y) / 2
  } else if (polygon.face === 'side') {
    x = box.x + box.sx; y = a - x; z = (b + x - y) / 2
  } else {
    z = box.z + box.sz; x = (a - (b - 2 * z)) / 2; y = (a + (b - 2 * z)) / 2
  }
  return -(x - y + z) / Math.sqrt(3)
}

function expectPainterOrder(drawing: Drawing, boxes: Record<string, Box>) {
  const { polygons } = drawing
  let overlaps = 0
  for (let i = 0; i < polygons.length; i += 1) {
    for (let j = i + 1; j < polygons.length; j += 1) {
      const first = polygons[i]!, second = polygons[j]!
      const shared = clip(first.points, second.points)
      if (shared.length < 3 || Math.abs(signedArea(shared)) < 1e-6) continue
      overlaps += 1
      const spot = centroid(shared)
      const firstDepth = isoDepthAt(first, boxes[first.partId]!, spot)
      const secondDepth = isoDepthAt(second, boxes[second.partId]!, spot)
      // The later polygon must be the nearer one (or level, for coplanar faces).
      expect(secondDepth, `${second.partId}/${second.face} drawn after ${first.partId}/${first.face}`).toBeLessThanOrEqual(firstDepth + 1e-6)
    }
  }
  return overlaps
}

function isoBounds(boxes: Box[]) {
  const xs: number[] = [], ys: number[] = []
  for (const b of boxes) {
    for (const x of [b.x, b.x + b.sx]) for (const y of [b.y, b.y + b.sy]) for (const z of [b.z, b.z + b.sz]) {
      xs.push((x + y) / SQRT2); ys.push((-x + y + 2 * z) / SQRT6)
    }
  }
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }
}

const fixtures = [
  { name: 'table', parts: tableResolvedParts(), boxes: TABLE_BOXES, size: [1200, 700, 750] },
  { name: 'bookcase', parts: bookcaseResolvedParts(), boxes: BOOKCASE_BOXES, size: [800, 300, 1800] },
] as const

describe('painter ordering', () => {
  for (const { name, parts, boxes } of fixtures) {
    it(`orders ${name} iso polygons so the nearer one is drawn later`, () => {
      expect(expectPainterOrder(projectDrawing(parts, 'iso'), boxes)).toBeGreaterThan(0)
    })

    it(`orders ${name} exploded polygons correctly`, () => {
      const project = name === 'table' ? tableProject() : bookcaseProject()
      const offsets = explodeOffsets(project, parts, 200)
      const moved = Object.fromEntries(parts.map(p => {
        const o = offsets[p.id]!
        return [p.id, { ...p.box, x: p.box.x + o[0], y: p.box.y + o[1], z: p.box.z + o[2] }]
      }))
      expectPainterOrder(projectDrawing(parts, 'exploded', { explodeOffsets: offsets }), moved)
    })

    it(`draws ${name} ortho views nearest-last`, () => {
      for (const view of ['front', 'side', 'top'] as const) {
        const { polygons } = projectDrawing(parts, view)
        // Face-plane distance from the viewer, computed from the boxes.
        const distanceOf = (id: string) => {
          const b = boxes[id]!
          return view === 'front' ? b.y : view === 'side' ? -(b.x + b.sx) : -(b.z + b.sz)
        }
        for (let i = 0; i < polygons.length; i += 1) {
          for (let j = i + 1; j < polygons.length; j += 1) {
            const shared = clip(polygons[i]!.points, polygons[j]!.points)
            if (shared.length < 3 || Math.abs(signedArea(shared)) < 1e-6) continue
            expect(distanceOf(polygons[j]!.partId)).toBeLessThanOrEqual(distanceOf(polygons[i]!.partId))
          }
        }
      }
    })
  }

  it('orders random non-overlapping box layouts correctly', () => {
    let seed = 12345
    const random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
    for (let trial = 0; trial < 25; trial += 1) {
      const boxes: Record<string, Box> = {}
      const parts: ResolvedPart[] = []
      let attempts = 0
      while (parts.length < 9 && attempts < 400) {
        attempts += 1
        const box: Box = { x: Math.floor(random() * 10) * 30, y: Math.floor(random() * 10) * 30, z: Math.floor(random() * 10) * 30, sx: 20 + random() * 100, sy: 20 + random() * 100, sz: 20 + random() * 100 }
        const clashes = Object.values(boxes).some(o => box.x < o.x + o.sx && o.x < box.x + box.sx && box.y < o.y + o.sy && o.y < box.y + box.sy && box.z < o.z + o.sz && o.z < box.z + box.sz)
        if (clashes) continue
        const id = `b${parts.length}`
        boxes[id] = box
        parts.push({ ...tableResolvedParts()[0]!, id, box })
      }
      expectPainterOrder(projectDrawing(parts, 'iso'), boxes)
    }
  })

  it('terminates on colliding boxes and keeps every polygon', () => {
    const parts = tableResolvedParts().slice(0, 3).map((p, i) => ({ ...p, box: { x: i * 5, y: i * 5, z: i * 5, sx: 100, sy: 100, sz: 100 } }))
    expect(projectDrawing(parts, 'iso').polygons).toHaveLength(9)
  })

  it('keeps the order of a cyclic arrangement without hanging', () => {
    const base = tableResolvedParts()[0]!
    // Pinwheel of three boxes: each is behind the next on a different axis.
    const boxes: Box[] = [
      { x: 0, y: 0, z: 0, sx: 10, sy: 30, sz: 10 },
      { x: 10, y: 20, z: 0, sx: 30, sy: 10, sz: 10 },
      { x: 5, y: 10, z: 10, sx: 10, sy: 10, sz: 30 },
    ]
    const parts = boxes.map((box, i) => ({ ...base, id: `c${i}`, box }))
    expect(projectDrawing(parts, 'iso').polygons).toHaveLength(9)
  })
})

describe('projectDrawing', () => {
  for (const { name, parts, boxes, size } of fixtures) {
    const [width, depth, height] = size

    it(`gives ${name} one polygon per part in the orthographic views`, () => {
      const faceOf: Record<string, string> = { front: 'front', side: 'side', top: 'top' }
      for (const view of ['front', 'side', 'top'] as const) {
        const drawing = projectDrawing(parts, view)
        expect(drawing.view).toBe(view)
        expect(drawing.polygons).toHaveLength(parts.length)
        expect(new Set(drawing.polygons.map(p => p.partId))).toEqual(new Set(parts.map(p => p.id)))
        expect(new Set(drawing.polygons.map(p => p.face))).toEqual(new Set([faceOf[view]]))
        expect(drawing.polygons.every(p => p.points.length === 4)).toBe(true)
      }
    })

    it(`gives ${name} three faces per part in iso and exploded`, () => {
      for (const view of ['iso', 'exploded'] as const) {
        const drawing = projectDrawing(parts, view)
        expect(drawing.polygons).toHaveLength(parts.length * 3)
        for (const part of parts) {
          expect(drawing.polygons.filter(p => p.partId === part.id).map(p => p.face).sort()).toEqual(['front', 'side', 'top'])
        }
        expect(drawing.dimensions).toEqual([])
      }
    })

    it(`measures ${name} bounds in each view`, () => {
      expect(projectDrawing(parts, 'front').bounds).toEqual({ minX: 0, minY: 0, maxX: width, maxY: height })
      expect(projectDrawing(parts, 'side').bounds).toEqual({ minX: 0, minY: 0, maxX: depth, maxY: height })
      expect(projectDrawing(parts, 'top').bounds).toEqual({ minX: 0, minY: 0, maxX: width, maxY: depth })
      const iso = projectDrawing(parts, 'iso').bounds
      const expected = isoBounds(Object.values(boxes))
      for (const key of ['minX', 'minY', 'maxX', 'maxY'] as const) expect(iso[key]).toBeCloseTo(expected[key], 9)
    })

    it(`puts the overall ${name} dimensions on the orthographic views`, () => {
      const expected = { front: [width, height], side: [depth, height], top: [width, depth] } as const
      for (const view of ['front', 'side', 'top'] as const) {
        const { dimensions, bounds } = projectDrawing(parts, view)
        expect(dimensions.map(d => d.value)).toEqual(expected[view])
        const [horizontal, vertical] = dimensions as [typeof dimensions[number], typeof dimensions[number]]
        expect(horizontal.from).toEqual([bounds.minX, bounds.minY])
        expect(horizontal.to).toEqual([bounds.maxX, bounds.minY])
        expect(vertical.from).toEqual([bounds.maxX, bounds.minY])
        expect(vertical.to).toEqual([bounds.maxX, bounds.maxY])
        expect(horizontal.offset).toBeGreaterThan(0)
      }
    })
  }

  it('keeps the front view in math coordinates, y up', () => {
    const top = projectDrawing(tableResolvedParts(), 'front').polygons.find(p => p.partId === 'top')!
    expect(top.points).toEqual([[0, 725], [1200, 725], [1200, 750], [0, 750]])
  })

  it('draws the side view from the right with the back of the piece to the right', () => {
    const polygons = projectDrawing(bookcaseResolvedParts(), 'side').polygons
    expect(polygons[polygons.length - 1]!.partId).toBe('side-r')
    expect(polygons.find(p => p.partId === 'back')!.points[0]).toEqual([294, 0])
  })

  it('draws the top view with the back of the piece at the top', () => {
    const back = projectDrawing(bookcaseResolvedParts(), 'top').polygons.find(p => p.partId === 'back')!
    expect(back.points[0]).toEqual([18, 294])
  })

  it('applies explode offsets in world space', () => {
    const parts = tableResolvedParts()
    const plain = projectDrawing(parts, 'front')
    const lifted = projectDrawing(parts, 'front', { explodeOffsets: { top: [0, 0, 100] } })
    expect(lifted.polygons.find(p => p.partId === 'top')!.points[0]).toEqual([0, 825])
    expect(lifted.polygons.find(p => p.partId === 'leg-fl')).toEqual(plain.polygons.find(p => p.partId === 'leg-fl'))
    expect(lifted.bounds.maxY).toBe(850)
    expect(projectDrawing(parts, 'top', { explodeOffsets: { top: [10, 20, 0] } }).bounds).toEqual({ minX: 10, minY: 20, maxX: 1210, maxY: 720 })
  })

  it('draws an empty piece as an empty drawing', () => {
    expect(projectDrawing([], 'iso')).toEqual({ view: 'iso', polygons: [], bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 }, dimensions: [] })
    expect(projectDrawing([], 'front').dimensions).toEqual([])
  })

  it('is deterministic and does not mutate its input', () => {
    const parts = tableResolvedParts()
    const snapshot = JSON.stringify(parts)
    const views: DrawingView[] = ['front', 'side', 'top', 'iso', 'exploded']
    for (const view of views) expect(projectDrawing(parts, view)).toEqual(projectDrawing(parts, view))
    expect(JSON.stringify(parts)).toBe(snapshot)
  })
})

describe('explodeOffsets', () => {
  const centerOf = (boxes: Box[]) => {
    const lo = [Math.min(...boxes.map(b => b.x)), Math.min(...boxes.map(b => b.y)), Math.min(...boxes.map(b => b.z))]
    const hi = [Math.max(...boxes.map(b => b.x + b.sx)), Math.max(...boxes.map(b => b.y + b.sy)), Math.max(...boxes.map(b => b.z + b.sz))]
    return lo.map((v, i) => (v + hi[i]!) / 2)
  }

  it('moves the table top up, the base down, and the leg frames out front and back', () => {
    const offsets = explodeOffsets(tableProject(), tableResolvedParts(), 150)
    expect(offsets['top']).toEqual([0, 0, 150])
    // The base unit sits slightly below the overall center, so it drops; its children
    // then move out relative to it.
    expect(offsets['apron-left']).toEqual([0, 0, -150])
    expect(offsets['apron-right']).toEqual([0, 0, -150])
    for (const id of ['leg-fl', 'leg-fr', 'apron-front']) expect(offsets[id]).toEqual([0, -150, -150])
    for (const id of ['leg-bl', 'leg-br', 'apron-back']) expect(offsets[id]).toEqual([0, 150, -150])
  })

  it('moves every table unit away from the assembly center', () => {
    const parts = tableResolvedParts()
    const offsets = explodeOffsets(tableProject(), parts, 150)
    const center = centerOf(parts.map(p => p.box))
    const units = [['top'], ['leg-fl', 'leg-fr', 'apron-front'], ['leg-bl', 'leg-br', 'apron-back']]
    for (const ids of units) {
      const boxes = ids.map(id => parts.find(p => p.id === id)!.box)
      const unit = centerOf(boxes)
      const offset = offsets[ids[0]!]!
      const outward = offset.reduce((sum, v, i) => sum + v * (unit[i]! - center[i]!), 0)
      expect(outward).toBeGreaterThan(0)
    }
  })

  it('leaves a carcass at the center and pushes the loose back away', () => {
    const offsets = explodeOffsets(bookcaseProject(), bookcaseResolvedParts(), 120)
    for (const id of ['side-l', 'side-r', 'bottom', 'top', 'shelf-1', 'shelf-2', 'shelf-3']) expect(offsets[id]).toEqual([0, 0, 0])
    expect(offsets['back']).toEqual([0, 120, 0])
  })

  it('moves each loose part from the center on its dominant axis', () => {
    const project = { ...tableProject(), subassemblies: [] }
    const offsets = explodeOffsets(project, tableResolvedParts(), 100)
    expect(offsets['top']).toEqual([0, 0, 100])
    expect(offsets['leg-fl']).toEqual([-100, 0, 0])
    expect(offsets['leg-br']).toEqual([100, 0, 0])
    expect(offsets['apron-front']).toEqual([0, -100, 0])
    expect(offsets['apron-right']).toEqual([100, 0, 0])
  })

  it('tolerates subassembly cycles, unknown ids, and unresolved parts', () => {
    const project = tableProject()
    project.subassemblies = [
      { id: 'a', name: 'A', label: 'A', partIds: ['leg-fl', 'ghost'], childIds: ['b', 'missing'] },
      { id: 'b', name: 'B', label: 'B', partIds: ['leg-br'], childIds: ['a'] },
    ]
    const parts = tableResolvedParts().filter(p => p.id !== 'top')
    const offsets = explodeOffsets(project, parts, 100)
    expect(Object.keys(offsets).sort()).toEqual(parts.map(p => p.id).sort())
    expect(offsets['top']).toBeUndefined()
  })

  it('returns no offsets for an empty piece', () => {
    expect(explodeOffsets(tableProject(), [], 100)).toEqual({})
  })

  it('does nothing at distance zero', () => {
    const offsets = explodeOffsets(tableProject(), tableResolvedParts(), 0)
    expect(Object.values(offsets).every(o => o.every(v => v === 0))).toBe(true)
  })
})

describe('isoCamera', () => {
  const bounds: Box = { x: 0, y: 0, z: 0, sx: 1200, sy: 700, sz: 750 }

  it('targets the center of the bounds with z up', () => {
    const camera = isoCamera(bounds)
    expect(camera.target).toEqual([600, 350, 375])
    expect(camera.up).toEqual([0, 0, 1])
  })

  it('looks from the front-right-above direction used by the iso drawing', () => {
    const { position, target } = isoCamera(bounds)
    const d = position.map((v, i) => v - target[i]!)
    expect(d[0]!).toBeGreaterThan(0)
    expect(d[1]!).toBeLessThan(0)
    expect(d[2]!).toBeGreaterThan(0)
    expect(d[0]!).toBeCloseTo(-d[1]!, 9)
    expect(d[0]!).toBeCloseTo(d[2]!, 9)
  })

  it('keeps the bounding sphere inside a 40 degree field of view', () => {
    const { position, target } = isoCamera(bounds)
    const distance = Math.hypot(...position.map((v, i) => v - target[i]!))
    const radius = Math.hypot(1200, 700, 750) / 2
    expect(Math.asin(radius / distance) * 180 / Math.PI).toBeCloseTo(20, 6)
  })

  it('stays finite for a degenerate box', () => {
    const { position } = isoCamera({ x: 5, y: 5, z: 5, sx: 0, sy: 0, sz: 0 })
    expect(position.every(Number.isFinite)).toBe(true)
    expect(position).not.toEqual([5, 5, 5])
  })
})
