import { describe, expect, it } from 'vitest'
import { boundsOf, contactBetween, facePlane, faceAxis, orientedExtents, overlapVolume, partSurfaceAt, resolveFurniture, TOUCH_TOLERANCE } from '../src/domain/furniture/geometry'
import type { Box, BoxFace, FurnitureProject, PartOrientation } from '../src/domain/furniture/types'
import { BOX_FACES, PART_ORIENTATIONS } from '../src/domain/furniture/types'
import { BOOKCASE_BOXES, TABLE_BOXES, bookcaseProject, furnitureContext, tableProject } from './fixtures/furniture'

const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number): Box => ({ x, y, z, sx, sy, sz })

function boxesOf(project: FurnitureProject): Record<string, Box> {
  const resolved = resolveFurniture(project, furnitureContext())
  return Object.fromEntries(resolved.parts.map(part => [part.id, part.box]))
}

describe('orientedExtents', () => {
  const size = { length: 3, width: 5, thickness: 7 }
  it.each<[PartOrientation, { sx: number; sy: number; sz: number }]>([
    ['xyz', { sx: 3, sy: 5, sz: 7 }],
    ['xzy', { sx: 3, sy: 7, sz: 5 }],
    ['yxz', { sx: 5, sy: 3, sz: 7 }],
    ['yzx', { sx: 7, sy: 3, sz: 5 }],
    ['zxy', { sx: 5, sy: 7, sz: 3 }],
    ['zyx', { sx: 7, sy: 5, sz: 3 }],
  ])('%s puts length, width, and thickness on the named axes', (orientation, expected) => {
    expect(orientedExtents(size, orientation)).toEqual(expected)
  })

  it('covers every orientation and keeps full precision', () => {
    const precise = { length: 1 / 3, width: 0.1 + 0.2, thickness: 445.5 }
    for (const orientation of PART_ORIENTATIONS) {
      const { sx, sy, sz } = orientedExtents(precise, orientation)
      expect([sx, sy, sz].sort()).toEqual([precise.length, precise.width, precise.thickness].sort())
    }
  })
})

describe('faceAxis and facePlane', () => {
  const sample = box(10, 20, 30, 1, 2, 4)
  it.each<[BoxFace, 'x' | 'y' | 'z', number]>([
    ['left', 'x', 10], ['right', 'x', 11], ['front', 'y', 20], ['back', 'y', 22], ['bottom', 'z', 30], ['top', 'z', 34],
  ])('%s is on axis %s at %d', (face, axis, plane) => {
    expect(faceAxis(face)).toBe(axis)
    expect(facePlane(sample, face)).toBe(plane)
  })
})

describe('partSurfaceAt', () => {
  it('names the end, edge, and face from the orientation', () => {
    // zxy: length up, width left to right, thickness front to back.
    expect(partSurfaceAt('zxy', 'top')).toBe('end')
    expect(partSurfaceAt('zxy', 'bottom')).toBe('end')
    expect(partSurfaceAt('zxy', 'left')).toBe('edge')
    expect(partSurfaceAt('zxy', 'right')).toBe('edge')
    expect(partSurfaceAt('zxy', 'front')).toBe('face')
    expect(partSurfaceAt('zxy', 'back')).toBe('face')
  })

  it('agrees with orientedExtents for every orientation and face', () => {
    const size = { length: 3, width: 5, thickness: 7 }
    for (const orientation of PART_ORIENTATIONS) {
      const extents = orientedExtents(size, orientation)
      for (const face of BOX_FACES) {
        const axis = faceAxis(face)
        const along = axis === 'x' ? extents.sx : axis === 'y' ? extents.sy : extents.sz
        const surface = partSurfaceAt(orientation, face)
        expect(along).toBe(surface === 'end' ? 3 : surface === 'edge' ? 5 : 7)
      }
    }
  })
})

describe('overlapVolume', () => {
  it('multiplies the shared span on each axis', () => {
    expect(overlapVolume(box(0, 0, 0, 10, 10, 10), box(5, 5, 5, 10, 10, 10))).toBe(125)
    expect(overlapVolume(box(0, 0, 0, 10, 10, 10), box(2, 2, 2, 2, 2, 2))).toBe(8)
  })

  it('is zero for boxes that only touch, or are apart', () => {
    expect(overlapVolume(box(0, 0, 0, 10, 10, 10), box(10, 0, 0, 10, 10, 10))).toBe(0)
    expect(overlapVolume(box(0, 0, 0, 10, 10, 10), box(10, 10, 10, 1, 1, 1))).toBe(0)
    expect(overlapVolume(box(0, 0, 0, 10, 10, 10), box(11, 0, 0, 1, 1, 1))).toBe(0)
  })

  it('ignores an interpenetration within the tolerance', () => {
    expect(overlapVolume(box(0, 0, 0, 10, 10, 10), box(10 - TOUCH_TOLERANCE / 2, 0, 0, 10, 10, 10))).toBe(0)
    expect(overlapVolume(box(0, 0, 0, 10, 10, 10), box(10 - 1e-4, 0, 0, 10, 10, 10))).toBeGreaterThan(0)
  })

  it('is symmetric', () => {
    const a = box(0, 1, 2, 5, 6, 7)
    const b = box(3, 2, 1, 4, 9, 3)
    expect(overlapVolume(a, b)).toBe(overlapVolume(b, a))
  })
})

describe('contactBetween', () => {
  it('finds face contact with its plane, area, and rectangle', () => {
    const a = box(0, 0, 0, 10, 10, 10)
    const b = box(10, 2, 3, 5, 4, 20)
    expect(contactBetween(a, b)).toEqual({ axis: 'x', aFace: 'right', bFace: 'left', plane: 10, area: 4 * 7, rect: { u0: 2, u1: 6, v0: 3, v1: 10 } })
  })

  it('flips the faces when the boxes are swapped', () => {
    const a = box(0, 0, 0, 10, 10, 10)
    const b = box(10, 2, 3, 5, 4, 20)
    expect(contactBetween(b, a)).toEqual({ axis: 'x', aFace: 'left', bFace: 'right', plane: 10, area: 28, rect: { u0: 2, u1: 6, v0: 3, v1: 10 } })
  })

  it.each<[string, Box, Box, string, BoxFace, BoxFace]>([
    ['y', box(0, 0, 0, 4, 4, 4), box(1, 4, 1, 2, 2, 2), 'y', 'back', 'front'],
    ['z', box(0, 0, 0, 4, 4, 4), box(1, 1, 4, 2, 2, 2), 'z', 'top', 'bottom'],
  ])('finds contact along %s', (_label, a, b, axis, aFace, bFace) => {
    const contact = contactBetween(a, b)
    expect(contact).toMatchObject({ axis, aFace, bFace, plane: 4, area: 4 })
  })

  it('uses x, y order for the in-plane axes of a y contact and x, y for a z contact', () => {
    expect(contactBetween(box(0, 0, 0, 4, 4, 9), box(1, 4, 2, 2, 2, 3))!.rect).toEqual({ u0: 1, u1: 3, v0: 2, v1: 5 })
    expect(contactBetween(box(0, 0, 0, 4, 6, 4), box(1, 2, 4, 2, 2, 2))!.rect).toEqual({ u0: 1, u1: 3, v0: 2, v1: 4 })
  })

  it('is not contact along an edge or at a corner', () => {
    const a = box(0, 0, 0, 10, 10, 10)
    expect(contactBetween(a, box(10, 10, 0, 5, 5, 10))).toBeNull()
    expect(contactBetween(a, box(10, 10, 10, 5, 5, 5))).toBeNull()
    expect(contactBetween(a, box(10, 0, 10, 5, 10, 5))).toBeNull()
  })

  it('is not contact when separated or overlapping', () => {
    const a = box(0, 0, 0, 10, 10, 10)
    expect(contactBetween(a, box(11, 0, 0, 5, 5, 5))).toBeNull()
    expect(contactBetween(a, box(5, 0, 0, 10, 10, 10))).toBeNull()
    expect(contactBetween(a, a)).toBeNull()
  })

  it('is not contact when the shared rectangle is a sliver within the tolerance', () => {
    expect(contactBetween(box(0, 0, 0, 10, 10, 10), box(10, 10 - TOUCH_TOLERANCE / 2, 0, 5, 5, 10))).toBeNull()
  })

  it('treats planes within the tolerance as coincident and planes beyond it as apart', () => {
    const a = box(0, 0, 0, 10, 10, 10)
    expect(contactBetween(a, box(10 + TOUCH_TOLERANCE / 2, 0, 0, 5, 10, 10))).not.toBeNull()
    expect(contactBetween(a, box(10 + TOUCH_TOLERANCE * 10, 0, 0, 5, 10, 10))).toBeNull()
  })

  it('finds the real contacts in the table: apron end against a leg, top on the aprons', () => {
    const front = contactBetween(TABLE_BOXES['apron-front']!, TABLE_BOXES['leg-fl']!)
    expect(front).toEqual({ axis: 'x', aFace: 'left', bFace: 'right', plane: 70, area: 20 * 100, rect: { u0: 31, u1: 51, v0: 625, v1: 725 } })
    const left = contactBetween(TABLE_BOXES['apron-left']!, TABLE_BOXES['leg-fl']!)
    expect(left).toMatchObject({ axis: 'y', aFace: 'front', bFace: 'back', plane: 70, area: 20 * 100 })
    const top = contactBetween(TABLE_BOXES['top']!, TABLE_BOXES['apron-front']!)
    expect(top).toMatchObject({ axis: 'z', aFace: 'bottom', bFace: 'top', plane: 725, area: 1060 * 20 })
    expect(contactBetween(TABLE_BOXES['leg-fl']!, TABLE_BOXES['leg-fr']!)).toBeNull()
    expect(contactBetween(TABLE_BOXES['apron-front']!, TABLE_BOXES['apron-left']!)).toBeNull()
  })

  it('finds the real contacts in the bookcase: shelf in a side, back against the sides', () => {
    expect(contactBetween(BOOKCASE_BOXES['shelf-1']!, BOOKCASE_BOXES['side-l']!)).toMatchObject({ axis: 'x', aFace: 'left', bFace: 'right', plane: 18, area: 294 * 18 })
    expect(contactBetween(BOOKCASE_BOXES['back']!, BOOKCASE_BOXES['side-r']!)).toMatchObject({ axis: 'x', aFace: 'right', bFace: 'left', plane: 782, area: 6 * 1800 })
    expect(contactBetween(BOOKCASE_BOXES['back']!, BOOKCASE_BOXES['shelf-2']!)).toMatchObject({ axis: 'y', aFace: 'front', bFace: 'back', plane: 294, area: 764 * 18 })
    expect(contactBetween(BOOKCASE_BOXES['shelf-1']!, BOOKCASE_BOXES['shelf-2']!)).toBeNull()
  })

  it('fixtures never overlap', () => {
    for (const boxes of [TABLE_BOXES, BOOKCASE_BOXES]) {
      const all = Object.values(boxes)
      for (const [index, a] of all.entries()) for (const b of all.slice(index + 1)) expect(overlapVolume(a, b)).toBe(0)
    }
  })
})

describe('boundsOf', () => {
  it('is null for no boxes', () => {
    expect(boundsOf([])).toBeNull()
  })

  it('returns a single box unchanged', () => {
    expect(boundsOf([box(1, 2, 3, 4, 5, 6)])).toEqual(box(1, 2, 3, 4, 5, 6))
  })

  it('spans every box, including negative coordinates', () => {
    expect(boundsOf([box(-5, 0, 0, 2, 2, 2), box(10, -3, 4, 5, 5, 5), box(0, 1, -1, 1, 1, 1)])).toEqual(box(-5, -3, -1, 20, 5, 10))
  })

  it('bounds the fixtures to their overall dimensions', () => {
    expect(boundsOf(Object.values(TABLE_BOXES))).toEqual(box(0, 0, 0, 1200, 700, 750))
    expect(boundsOf(Object.values(BOOKCASE_BOXES))).toEqual(box(0, 0, 0, 800, 300, 1800))
  })
})

describe('resolveFurniture', () => {
  it.each([
    ['table', tableProject, TABLE_BOXES],
    ['bookcase', bookcaseProject, BOOKCASE_BOXES],
  ] as const)('resolves the literal %s exactly to its boxes with no issues', (_name, build, expected) => {
    const resolved = resolveFurniture(build(), furnitureContext())
    expect(resolved.issues).toEqual([])
    expect(boxesOf(build())).toEqual(expected)
    expect(resolved.parts.map(part => part.id)).toEqual(build().parts.map(part => part.id))
    expect(resolved.parts.every(part => part.drivenAxes.length === 0)).toBe(true)
    expect(resolved.bounds).toEqual(boundsOf(Object.values(expected)))
  })

  it('evaluates sizes and carries the source part', () => {
    const project = tableProject()
    const resolved = resolveFurniture(project, furnitureContext())
    const apron = resolved.parts.find(part => part.id === 'apron-front')!
    expect(apron.size).toEqual({ length: 1060, width: 100, thickness: 20 })
    expect(apron.part).toBe(project.parts.find(part => part.id === 'apron-front'))
    expect(resolved.project).toBe(project)
  })

  it('evaluates parameters, expression sizes, and expression positions', () => {
    const project = tableProject()
    project.parameters = [{ id: 'p1', name: 'span', label: 'Span', value: '1000 + 1in' }]
    const apron = project.parts.find(part => part.id === 'apron-front')!
    apron.length = 'span - 40'
    apron.position = { x: 70, y: 'span / 40', z: '600 + 25' }
    const resolved = resolveFurniture(project, furnitureContext())
    expect(resolved.parameters).toEqual({ span: 1025.4 })
    expect(resolved.issues).toEqual([])
    const part = resolved.parts.find(item => item.id === 'apron-front')!
    expect(part.size.length).toBe(1025.4 - 40)
    expect(part.box).toEqual({ x: 70, y: 1025.4 / 40, z: 625, sx: 1025.4 - 40, sy: 20, sz: 100 })
  })

  it('uses the part orientation for the box extents', () => {
    const project = tableProject()
    const leg = project.parts.find(part => part.id === 'leg-fl')!
    leg.orientation = 'xyz'
    const resolved = resolveFurniture(project, furnitureContext())
    expect(resolved.parts.find(part => part.id === 'leg-fl')!.box).toMatchObject({ sx: 725, sy: 45, sz: 45 })
  })

  describe('colors', () => {
    it('prefers the override, then the species, then the sheet material, then a neutral', () => {
      const project = bookcaseProject()
      const context = furnitureContext()
      const [side, bottom, top, shelf] = project.parts
      side!.color = '#112233'
      bottom!.kind = 'solid'
      bottom!.speciesId = 'walnut'
      top!.sheetMaterialId = 'missing-material'
      shelf!.sheetMaterialId = 'birch-ply-6'
      const resolved = resolveFurniture(project, context)
      const color = (id: string) => resolved.parts.find(part => part.id === id)!.color
      expect(color(side!.id)).toBe('#112233')
      expect(color(bottom!.id)).toBe(context.woods.find(wood => wood.id === 'walnut')!.color)
      expect(color(top!.id)).toBe('#b9a48a')
      expect(color(shelf!.id)).toBe('#e3cfa4')
    })

    it('lets an override beat the species', () => {
      const project = tableProject()
      project.parts[0]!.color = '#abcdef'
      expect(resolveFurniture(project, furnitureContext()).parts[0]!.color).toBe('#abcdef')
    })

    it('falls back to the sheet material when the species is unknown', () => {
      const project = bookcaseProject()
      project.parts[0]!.speciesId = 'no-such-wood'
      expect(resolveFurniture(project, furnitureContext()).parts[0]!.color).toBe('#d9c08f')
    })
  })

  describe('issues', () => {
    it('leaves a part with an unknown parameter out and says which field', () => {
      const project = tableProject()
      project.parts.find(part => part.id === 'top')!.thickness = 'missing + 1'
      const resolved = resolveFurniture(project, furnitureContext())
      expect(resolved.parts.map(part => part.id)).not.toContain('top')
      expect(resolved.parts).toHaveLength(8)
      expect(resolved.issues).toHaveLength(1)
      expect(resolved.issues[0]).toMatchObject({ code: 'unknown-parameter', severity: 'error', partIds: ['top'], field: 'thickness' })
      expect(resolved.issues[0]!.message).toContain('Top')
      expect(resolved.issues[0]!.message).toContain('"missing"')
    })

    it('reports an invalid expression in a position axis', () => {
      const project = tableProject()
      project.parts.find(part => part.id === 'leg-fl')!.position = { x: 25, y: '25 +', z: 0 }
      const resolved = resolveFurniture(project, furnitureContext())
      expect(resolved.parts.map(part => part.id)).not.toContain('leg-fl')
      expect(resolved.issues).toEqual([expect.objectContaining({ code: 'expression-invalid', partIds: ['leg-fl'], field: 'position.y' })])
    })

    it.each(['length', 'width', 'thickness'] as const)('flags a zero %s as dimension-not-positive with the field', field => {
      const project = tableProject()
      project.parts.find(part => part.id === 'apron-front')![field] = 0
      const resolved = resolveFurniture(project, furnitureContext())
      expect(resolved.parts.map(part => part.id)).not.toContain('apron-front')
      expect(resolved.issues).toEqual([expect.objectContaining({ code: 'dimension-not-positive', severity: 'error', partIds: ['apron-front'], field })])
    })

    it('flags a negative expression result and a tiny positive one differently', () => {
      const project = tableProject()
      project.parameters = [{ id: 'p', name: 'gap', label: 'Gap', value: 30 }]
      project.parts.find(part => part.id === 'leg-fl')!.width = 'gap - 40'
      project.parts.find(part => part.id === 'leg-fr')!.width = 1e-9
      const resolved = resolveFurniture(project, furnitureContext())
      expect(resolved.issues).toEqual([expect.objectContaining({ code: 'dimension-not-positive', partIds: ['leg-fl'], field: 'width' })])
      expect(resolved.parts.map(part => part.id)).toContain('leg-fr')
    })

    it('reports every bad field of a part, not just the first', () => {
      const project = tableProject()
      const top = project.parts.find(part => part.id === 'top')!
      top.length = 'a'
      top.width = -5
      top.position = { x: 'b', y: 0, z: 0 }
      const resolved = resolveFurniture(project, furnitureContext())
      expect(resolved.issues.map(issue => issue.field)).toEqual(['length', 'width', 'position.x'])
    })

    it('puts parameter issues first and keeps parts that do not use the failed parameter', () => {
      const project = tableProject()
      project.parameters = [
        { id: 'a', name: 'a', label: 'A', value: 'b' },
        { id: 'b', name: 'b', label: 'B', value: 'a' },
        { id: 'c', name: 'c', label: 'C', value: 10 },
      ]
      project.parts.find(part => part.id === 'top')!.length = 'a'
      const resolved = resolveFurniture(project, furnitureContext())
      expect(resolved.parameters).toEqual({ c: 10 })
      expect(resolved.issues.map(issue => issue.code)).toEqual(['parameter-cycle', 'parameter-cycle', 'unknown-parameter'])
      expect(resolved.parts).toHaveLength(8)
    })

    it('has no bounds when no part resolves', () => {
      const project = tableProject()
      project.parts = project.parts.slice(0, 2)
      for (const part of project.parts) part.length = 0
      const resolved = resolveFurniture(project, furnitureContext())
      expect(resolved.parts).toEqual([])
      expect(resolved.bounds).toBeNull()
      expect(resolved.issues).toHaveLength(2)
    })

    it('resolves an empty project', () => {
      const project = tableProject()
      project.parts = []
      project.parameters = []
      expect(resolveFurniture(project, furnitureContext())).toMatchObject({ parts: [], issues: [], parameters: {}, bounds: null })
    })

    it('rejects a non-finite literal size', () => {
      const project = tableProject()
      project.parts[0]!.length = Number.NaN
      expect(resolveFurniture(project, furnitureContext()).issues[0]).toMatchObject({ code: 'expression-invalid', field: 'length' })
    })
  })

  it('does not mutate the project', () => {
    const project = tableProject()
    const snapshot = structuredClone(project)
    resolveFurniture(project, furnitureContext())
    expect(project).toEqual(snapshot)
  })
})
