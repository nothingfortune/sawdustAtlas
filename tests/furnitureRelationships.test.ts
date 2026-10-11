import { describe, expect, it } from 'vitest'
import { resolveFurniture } from '../src/domain/furniture/geometry'
import { emptyFurnitureProject } from '../src/domain/furniture/project'
import type { Axis, Box, BoxFace, DimExpr, FurnitureParameter, FurniturePart, FurnitureRelationship, ResolvedFurniture } from '../src/domain/furniture/types'
import { BOOKCASE_BOXES, TABLE_BOXES, furnitureContext, parametricBookcaseProject, parametricTableProject } from './fixtures/furniture'

// ---- Helpers -------------------------------------------------------------------

/** An axis-aligned block: orientation 'xyz', so length, width, and thickness run along
 *  x, y, and z. */
function block(id: string, length: DimExpr, width: number, thickness: number, position: { x?: DimExpr; y?: DimExpr; z?: DimExpr } = {}): FurniturePart {
  return {
    id, label: id.toUpperCase(), name: id.toUpperCase(), role: 'other', kind: 'solid', length, width, thickness, orientation: 'xyz',
    position: { x: 0, y: 0, z: 0, ...position }, speciesId: 'maple', visibleFaces: [],
  }
}

function run(parts: FurniturePart[], relationships: FurnitureRelationship[], parameters: FurnitureParameter[] = []): ResolvedFurniture {
  const project = { ...emptyFurnitureProject('p', 'Test', '2026-10-10T00:00:00.000Z'), parts, relationships, parameters }
  return resolveFurniture(project, furnitureContext())
}

const face = (id: string, partId: string, f: BoxFace, targetId: string, targetFace: BoxFace, offset: DimExpr = 0): FurnitureRelationship =>
  ({ id, kind: 'face', partId, face: f, target: { partId: targetId, face: targetFace }, offset })

const boxOf = (resolved: ResolvedFurniture, id: string): Box => resolved.parts.find(part => part.id === id)!.box
const ids = (resolved: ResolvedFurniture) => resolved.parts.map(part => part.id)
const codes = (resolved: ResolvedFurniture) => resolved.issues.map(issue => issue.code)

function boxesOf(resolved: ResolvedFurniture): Record<string, Box> {
  return Object.fromEntries(resolved.parts.map(part => [part.id, part.box]))
}

// B is a base block at (100, 200, 300) measuring 10 x 20 x 30; M is a 4 x 6 x 8 mover.
const base = () => block('b', 10, 20, 30, { x: 100, y: 200, z: 300 })
const mover = (position: { x?: DimExpr; y?: DimExpr; z?: DimExpr } = {}) => block('m', 4, 6, 8, position)

// ---- Fixtures --------------------------------------------------------------------

describe('parametric fixtures', () => {
  it('the parametric table resolves exactly to TABLE_BOXES with no issues', () => {
    const resolved = resolveFurniture(parametricTableProject(), furnitureContext())
    expect(resolved.issues).toEqual([])
    expect(boxesOf(resolved)).toEqual(TABLE_BOXES)
    expect(resolved.bounds).toEqual({ x: 0, y: 0, z: 0, sx: 1200, sy: 700, sz: 750 })
  })

  it('the parametric table records which axes the relationships drive', () => {
    const resolved = resolveFurniture(parametricTableProject(), furnitureContext())
    const driven = Object.fromEntries(resolved.parts.map(part => [part.id, part.drivenAxes]))
    expect(driven).toEqual({
      'top': [], 'leg-fl': [], 'leg-fr': [], 'leg-bl': [], 'leg-br': [],
      'apron-front': ['x', 'y', 'z'], 'apron-back': ['x', 'y', 'z'], 'apron-left': ['x', 'y', 'z'], 'apron-right': ['x', 'y', 'z'],
    })
  })

  it('the parametric bookcase resolves exactly to BOOKCASE_BOXES with no issues', () => {
    const resolved = resolveFurniture(parametricBookcaseProject(), furnitureContext())
    expect(resolved.issues).toEqual([])
    expect(boxesOf(resolved)).toEqual(BOOKCASE_BOXES)
    expect(resolved.bounds).toEqual({ x: 0, y: 0, z: 0, sx: 800, sy: 300, sz: 1800 })
  })

  it('the parametric bookcase records which axes the relationships drive', () => {
    const resolved = resolveFurniture(parametricBookcaseProject(), furnitureContext())
    const driven = Object.fromEntries(resolved.parts.map(part => [part.id, part.drivenAxes]))
    expect(driven).toEqual({
      'side-l': [], 'side-r': [], 'bottom': ['x'], 'top': ['x', 'z'], 'shelf-1': ['x', 'z'], 'shelf-2': ['x', 'z'], 'shelf-3': ['x', 'z'], 'back': ['x', 'y'],
    })
  })

  it('follows a parameter change through every relationship', () => {
    const project = parametricBookcaseProject()
    project.parameters.find(parameter => parameter.name === 'width')!.value = 1000
    project.parameters.find(parameter => parameter.name === 'height')!.value = 2000
    const resolved = resolveFurniture(project, furnitureContext())
    expect(resolved.issues).toEqual([])
    expect(boxOf(resolved, 'side-r')).toMatchObject({ x: 982, sz: 2000 })
    expect(boxOf(resolved, 'bottom')).toMatchObject({ x: 18, sx: 964 })
    expect(boxOf(resolved, 'top').z).toBe(1982)
    expect(boxOf(resolved, 'shelf-2').z).toBe((18 + (1982 - 18 - 54) / 4 * 2 + 18))
  })

  it('does not depend on relationship order', () => {
    const forward = parametricTableProject()
    const reversed = parametricTableProject()
    reversed.relationships.reverse()
    expect(boxesOf(resolveFurniture(reversed, furnitureContext()))).toEqual(boxesOf(resolveFurniture(forward, furnitureContext())))
    const bookcase = parametricBookcaseProject()
    bookcase.relationships.reverse()
    expect(boxesOf(resolveFurniture(bookcase, furnitureContext()))).toEqual(BOOKCASE_BOXES)
  })

  it('ignores the stored position on a driven axis, even a broken one', () => {
    const project = parametricBookcaseProject()
    project.parts.find(part => part.id === 'bottom')!.position = { x: 'garbage +', y: 0, z: 0 }
    const resolved = resolveFurniture(project, furnitureContext())
    expect(resolved.issues).toEqual([])
    expect(boxesOf(resolved)).toEqual(BOOKCASE_BOXES)
  })
})

// ---- face --------------------------------------------------------------------------

describe('face relationships', () => {
  it.each<[string, BoxFace, BoxFace, DimExpr, Axis, number]>([
    ['x: left against the base right', 'left', 'right', 0, 'x', 110],
    ['x: right against the base left', 'right', 'left', 0, 'x', 96],
    ['x: left flush with the base left plus offset', 'left', 'left', 5, 'x', 105],
    ['x: right flush with the base right minus offset', 'right', 'right', -2, 'x', 104],
    ['y: front against the base back', 'front', 'back', 0, 'y', 220],
    ['y: back against the base front', 'back', 'front', 0, 'y', 194],
    ['y: back flush with the base back', 'back', 'back', 0, 'y', 214],
    ['z: bottom on the base top', 'bottom', 'top', 0, 'z', 330],
    ['z: top flush with the base top plus offset', 'top', 'top', 1, 'z', 323],
    ['z: bottom flush with the base bottom', 'bottom', 'bottom', 0, 'z', 300],
    ['z: top under the base bottom', 'top', 'bottom', 0, 'z', 292],
  ])('%s', (_label, partFace, targetFace, offset, axis, expected) => {
    const resolved = run([base(), mover()], [face('r', 'm', partFace, 'b', targetFace, offset)])
    expect(resolved.issues).toEqual([])
    expect(boxOf(resolved, 'm')[axis]).toBe(expected)
    expect(resolved.parts.find(part => part.id === 'm')!.drivenAxes).toEqual([axis])
  })

  it('leaves the other axes at their stored position', () => {
    const resolved = run([base(), mover({ x: 7, y: 8, z: 9 })], [face('r', 'm', 'left', 'b', 'right')])
    expect(boxOf(resolved, 'm')).toEqual({ x: 110, y: 8, z: 9, sx: 4, sy: 6, sz: 8 })
  })

  it('evaluates the offset as an expression over parameters and units', () => {
    const resolved = run([base(), mover()], [face('r', 'm', 'left', 'b', 'right', 'gap + 1in')], [{ id: 'g', name: 'gap', label: 'Gap', value: 3 }])
    expect(resolved.issues).toEqual([])
    expect(boxOf(resolved, 'm').x).toBe(110 + 3 + 25.4)
  })

  it('follows a chain of relationships whatever the order', () => {
    const parts = [base(), block('c', 2, 2, 2), mover()]
    const rels = [face('r2', 'c', 'left', 'm', 'right'), face('r1', 'm', 'left', 'b', 'right')]
    const resolved = run(parts, rels)
    expect(resolved.issues).toEqual([])
    expect(boxOf(resolved, 'm').x).toBe(110)
    expect(boxOf(resolved, 'c').x).toBe(114)
  })

  it('can drive all three axes of one part', () => {
    const resolved = run([base(), mover()], [face('rx', 'm', 'left', 'b', 'right'), face('ry', 'm', 'front', 'b', 'back'), face('rz', 'm', 'bottom', 'b', 'top')])
    expect(resolved.issues).toEqual([])
    expect(resolved.parts.find(part => part.id === 'm')!.drivenAxes).toEqual(['x', 'y', 'z'])
    expect(boxOf(resolved, 'm')).toEqual({ x: 110, y: 220, z: 330, sx: 4, sy: 6, sz: 8 })
  })

  it('reports an offset that fails to evaluate and leaves the part out', () => {
    const resolved = run([base(), mover()], [face('r', 'm', 'left', 'b', 'right', 'nope * 2')])
    expect(ids(resolved)).toEqual(['b'])
    expect(resolved.issues).toHaveLength(1)
    expect(resolved.issues[0]).toMatchObject({ code: 'unknown-parameter', severity: 'error', relationshipId: 'r', partIds: ['m'], field: 'offset' })
  })

  it('treats a center offset the same way', () => {
    const resolved = run([base(), mover()], [{ id: 'r', kind: 'center', partId: 'm', axis: 'x', targetId: 'b', offset: '1 +' }])
    expect(ids(resolved)).toEqual(['b'])
    expect(resolved.issues[0]).toMatchObject({ code: 'expression-invalid', relationshipId: 'r', field: 'offset' })
  })
})

// ---- center ------------------------------------------------------------------------

describe('center relationships', () => {
  it.each<[Axis, number]>([['x', 103], ['y', 207], ['z', 311]])('centers on the target along %s', (axis, expected) => {
    const resolved = run([base(), mover()], [{ id: 'r', kind: 'center', partId: 'm', axis, targetId: 'b', offset: 0 }])
    expect(resolved.issues).toEqual([])
    expect(boxOf(resolved, 'm')[axis]).toBe(expected)
  })

  it('adds the offset', () => {
    const resolved = run([base(), mover()], [{ id: 'r', kind: 'center', partId: 'm', axis: 'x', targetId: 'b', offset: 10 }])
    expect(boxOf(resolved, 'm').x).toBe(113)
  })

  it('centers a part larger than its target', () => {
    const resolved = run([base(), block('m', 100, 6, 8)], [{ id: 'r', kind: 'center', partId: 'm', axis: 'x', targetId: 'b', offset: 0 }])
    expect(boxOf(resolved, 'm').x).toBe(55)
  })
})

// ---- between -----------------------------------------------------------------------

describe('between relationships', () => {
  const left = () => block('l', 10, 20, 30, { x: 0 })
  const right = () => block('r', 10, 20, 30, { x: 100 })
  const between = (from: BoxFace, to: BoxFace, swap = false): FurnitureRelationship => {
    const a = { partId: 'l', face: from }
    const b = { partId: 'r', face: to }
    return { id: 'rel', kind: 'between', partId: 'm', axis: 'x', from: swap ? b : a, to: swap ? a : b }
  }

  it('centers the part in the gap between two face planes', () => {
    const resolved = run([left(), right(), mover()], [between('right', 'left')])
    expect(resolved.issues).toEqual([])
    expect(boxOf(resolved, 'm').x).toBe(53)
  })

  it('does not care which plane is from and which is to', () => {
    const resolved = run([left(), right(), mover()], [between('right', 'left', true)])
    expect(boxOf(resolved, 'm').x).toBe(53)
  })

  it('works with outer faces too', () => {
    const far = block('r', 10, 20, 30, { x: 200 })
    const resolved = run([left(), far, mover()], [between('left', 'right')])
    expect(boxOf(resolved, 'm').x).toBe(105 - 2)
  })

  it('never resizes: a part too big for the gap is placed centered and keeps its size', () => {
    const resolved = run([left(), right(), block('m', 200, 6, 8)], [between('right', 'left')])
    expect(resolved.issues).toEqual([])
    expect(boxOf(resolved, 'm')).toMatchObject({ x: -45, sx: 200 })
  })

  it('works along y and z', () => {
    const front = block('l', 10, 10, 10, { y: 0 })
    const back = block('r', 10, 10, 10, { y: 50 })
    const resolved = run([front, back, mover()], [{ id: 'rel', kind: 'between', partId: 'm', axis: 'y', from: { partId: 'l', face: 'back' }, to: { partId: 'r', face: 'front' } }])
    expect(boxOf(resolved, 'm').y).toBe(30 - 3)
    const low = block('l', 10, 10, 10, { z: 0 })
    const high = block('r', 10, 10, 10, { z: 90 })
    const stacked = run([low, high, mover()], [{ id: 'rel', kind: 'between', partId: 'm', axis: 'z', from: { partId: 'l', face: 'top' }, to: { partId: 'r', face: 'bottom' } }])
    expect(boxOf(stacked, 'm').z).toBe(50 - 4)
  })
})

// ---- distribute --------------------------------------------------------------------

describe('distribute relationships', () => {
  const left = () => block('l', 10, 20, 30, { x: 0 })
  const right = () => block('r', 10, 20, 30, { x: 100 })
  const shelf = (id: string, length = 4) => block(id, length, 6, 8)
  const distribute = (partIds: string[], from: BoxFace = 'right', to: BoxFace = 'left', swap = false): FurnitureRelationship => ({
    id: 'rel', kind: 'distribute', partIds, axis: 'x',
    from: { partId: swap ? 'r' : 'l', face: swap ? to : from }, to: { partId: swap ? 'l' : 'r', face: swap ? from : to },
  })

  it('spaces parts with equal clear gaps in array order', () => {
    const resolved = run([left(), right(), shelf('s1'), shelf('s2'), shelf('s3')], [distribute(['s1', 's2', 's3'])])
    expect(resolved.issues).toEqual([])
    expect([boxOf(resolved, 's1').x, boxOf(resolved, 's2').x, boxOf(resolved, 's3').x]).toEqual([29.5, 53, 76.5])
    expect(resolved.parts.find(part => part.id === 's2')!.drivenAxes).toEqual(['x'])
  })

  it('accounts for different part sizes', () => {
    const resolved = run([left(), right(), shelf('s1', 2), shelf('s2', 4)], [distribute(['s1', 's2'])])
    expect([boxOf(resolved, 's1').x, boxOf(resolved, 's2').x]).toEqual([38, 68])
    expect(boxOf(resolved, 's1').sx).toBe(2)
    expect(boxOf(resolved, 's2').sx).toBe(4)
  })

  it('keeps array order meaningful', () => {
    const resolved = run([left(), right(), shelf('s1', 2), shelf('s2', 4)], [distribute(['s2', 's1'])])
    expect(boxOf(resolved, 's2').x).toBeLessThan(boxOf(resolved, 's1').x)
  })

  it('places a single part in the middle of the gap', () => {
    const resolved = run([left(), right(), shelf('s1')], [distribute(['s1'])])
    expect(boxOf(resolved, 's1').x).toBe(53)
  })

  it('runs from the first plane toward the second, so a descending run starts at the far end', () => {
    const resolved = run([left(), right(), shelf('s1'), shelf('s2'), shelf('s3')], [distribute(['s1', 's2', 's3'], 'right', 'left', true)])
    expect(resolved.issues).toEqual([])
    expect([boxOf(resolved, 's1').x, boxOf(resolved, 's2').x, boxOf(resolved, 's3').x]).toEqual([76.5, 53, 29.5])
  })

  it('lets parts crowd when they do not fit: the gap goes negative and nothing resizes', () => {
    const tight = block('r', 10, 20, 30, { x: 14 })
    const resolved = run([left(), tight, shelf('s1'), shelf('s2'), shelf('s3')], [distribute(['s1', 's2', 's3'])])
    expect(resolved.issues).toEqual([])
    expect([boxOf(resolved, 's1').x, boxOf(resolved, 's2').x, boxOf(resolved, 's3').x]).toEqual([8, 10, 12])
    expect(resolved.parts.every(part => part.id === 'l' || part.id === 'r' || part.box.sx === 4)).toBe(true)
  })
})

// ---- conflicts ---------------------------------------------------------------------

describe('relationship-conflict', () => {
  it('lets the first relationship on a part axis win', () => {
    const resolved = run([base(), mover()], [face('first', 'm', 'left', 'b', 'right'), face('second', 'm', 'left', 'b', 'left', 50)])
    expect(boxOf(resolved, 'm').x).toBe(110)
    expect(resolved.issues).toHaveLength(1)
    expect(resolved.issues[0]).toMatchObject({ code: 'relationship-conflict', severity: 'error', relationshipId: 'second', partIds: ['m'] })
  })

  it('reverses the winner when the array order reverses', () => {
    const resolved = run([base(), mover()], [face('second', 'm', 'left', 'b', 'left', 50), face('first', 'm', 'left', 'b', 'right')])
    expect(boxOf(resolved, 'm').x).toBe(150)
    expect(resolved.issues[0]).toMatchObject({ code: 'relationship-conflict', relationshipId: 'first' })
  })

  it('counts the left and right faces as the same axis', () => {
    const resolved = run([base(), mover()], [face('a', 'm', 'left', 'b', 'right'), face('b2', 'm', 'right', 'b', 'left')])
    expect(codes(resolved)).toEqual(['relationship-conflict'])
  })

  it('conflicts across kinds', () => {
    const resolved = run([base(), mover()], [face('a', 'm', 'left', 'b', 'right'), { id: 'c', kind: 'center', partId: 'm', axis: 'x', targetId: 'b', offset: 0 }])
    expect(boxOf(resolved, 'm').x).toBe(110)
    expect(resolved.issues[0]).toMatchObject({ code: 'relationship-conflict', relationshipId: 'c' })
  })

  it('does not conflict across different axes of one part', () => {
    const resolved = run([base(), mover()], [face('a', 'm', 'left', 'b', 'right'), face('b2', 'm', 'front', 'b', 'back')])
    expect(resolved.issues).toEqual([])
  })

  it('drops a whole distribution when one of its parts is already driven', () => {
    const left = block('l', 10, 20, 30, { x: 0 })
    const right = block('r', 10, 20, 30, { x: 100 })
    const parts = [left, right, block('s1', 4, 6, 8, { x: 1 }), block('s2', 4, 6, 8, { x: 2 })]
    const rels: FurnitureRelationship[] = [
      face('pin', 's2', 'left', 'l', 'right'),
      { id: 'dist', kind: 'distribute', partIds: ['s1', 's2'], axis: 'x', from: { partId: 'l', face: 'right' }, to: { partId: 'r', face: 'left' } },
    ]
    const resolved = run(parts, rels)
    expect(boxOf(resolved, 's2').x).toBe(10)
    expect(boxOf(resolved, 's1').x).toBe(1)
    expect(resolved.issues).toHaveLength(1)
    expect(resolved.issues[0]).toMatchObject({ code: 'relationship-conflict', relationshipId: 'dist', partIds: ['s2'] })
  })
})

// ---- invalid -----------------------------------------------------------------------

describe('relationship-invalid', () => {
  const stored = () => mover({ x: 7 })

  it.each<[string, FurnitureRelationship]>([
    ['an unknown part', face('r', 'ghost', 'left', 'b', 'right')],
    ['an unknown target', face('r', 'm', 'left', 'ghost', 'right')],
    ['a self reference', face('r', 'm', 'left', 'm', 'right')],
    ['faces on different axes', face('r', 'm', 'left', 'b', 'top')],
    ['a center on an unknown target', { id: 'r', kind: 'center', partId: 'm', axis: 'x', targetId: 'ghost', offset: 0 }],
    ['a center on itself', { id: 'r', kind: 'center', partId: 'm', axis: 'x', targetId: 'm', offset: 0 }],
    ['a between with an unknown plane part', { id: 'r', kind: 'between', partId: 'm', axis: 'x', from: { partId: 'ghost', face: 'right' }, to: { partId: 'b', face: 'left' } }],
    ['a between against itself', { id: 'r', kind: 'between', partId: 'm', axis: 'x', from: { partId: 'm', face: 'right' }, to: { partId: 'b', face: 'left' } }],
    ['a between with a face on the wrong axis', { id: 'r', kind: 'between', partId: 'm', axis: 'x', from: { partId: 'b', face: 'top' }, to: { partId: 'b', face: 'left' } }],
    ['a distribution of an unknown part', { id: 'r', kind: 'distribute', partIds: ['m', 'ghost'], axis: 'x', from: { partId: 'b', face: 'right' }, to: { partId: 'b', face: 'left' } }],
    ['a distribution listing a part twice', { id: 'r', kind: 'distribute', partIds: ['m', 'm'], axis: 'x', from: { partId: 'b', face: 'right' }, to: { partId: 'b', face: 'left' } }],
    ['a distribution with one of its own parts as an end', { id: 'r', kind: 'distribute', partIds: ['m'], axis: 'x', from: { partId: 'm', face: 'right' }, to: { partId: 'b', face: 'left' } }],
    ['a distribution with a face on the wrong axis', { id: 'r', kind: 'distribute', partIds: ['m'], axis: 'x', from: { partId: 'b', face: 'right' }, to: { partId: 'b', face: 'back' } }],
  ])('flags %s and ignores the relationship', (_label, relationship) => {
    const resolved = run([base(), stored()], [relationship])
    expect(resolved.issues).toHaveLength(1)
    expect(resolved.issues[0]).toMatchObject({ code: 'relationship-invalid', severity: 'error', relationshipId: 'r' })
    expect(resolved.issues[0]!.message.length).toBeGreaterThan(10)
    expect(boxOf(resolved, 'm').x).toBe(7)
    expect(resolved.parts.find(part => part.id === 'm')!.drivenAxes).toEqual([])
  })

  it('does not let an invalid relationship claim an axis', () => {
    const resolved = run([base(), stored()], [face('bad', 'm', 'left', 'm', 'right'), face('good', 'm', 'left', 'b', 'right')])
    expect(codes(resolved)).toEqual(['relationship-invalid'])
    expect(boxOf(resolved, 'm').x).toBe(110)
  })

  it('names the parts in the message', () => {
    const resolved = run([base(), stored()], [face('r', 'm', 'left', 'm', 'right')])
    expect(resolved.issues[0]!.message).toContain('"M"')
    expect(resolved.issues[0]!.partIds).toEqual(['m'])
  })
})

// ---- cycles ------------------------------------------------------------------------

describe('relationship-cycle', () => {
  it('keeps stored positions for a two-part loop and reports every relationship in it', () => {
    const a = block('a', 10, 5, 5, { x: 1 })
    const b = block('b', 10, 5, 5, { x: 2 })
    const resolved = run([a, b], [face('r1', 'a', 'left', 'b', 'right'), face('r2', 'b', 'left', 'a', 'right')])
    expect(boxOf(resolved, 'a').x).toBe(1)
    expect(boxOf(resolved, 'b').x).toBe(2)
    expect(resolved.parts.every(part => part.drivenAxes.length === 0)).toBe(true)
    expect(codes(resolved)).toEqual(['relationship-cycle', 'relationship-cycle'])
    expect(resolved.issues.map(issue => issue.relationshipId)).toEqual(['r1', 'r2'])
    expect(resolved.issues[0]!.partIds).toEqual(['a', 'b'])
    expect(resolved.issues[0]!.severity).toBe('error')
  })

  it('finds a three-part loop', () => {
    const parts = [block('a', 10, 5, 5, { x: 1 }), block('b', 10, 5, 5, { x: 2 }), block('c', 10, 5, 5, { x: 3 })]
    const resolved = run(parts, [face('r1', 'a', 'left', 'b', 'right'), face('r2', 'b', 'left', 'c', 'right'), face('r3', 'c', 'left', 'a', 'right')])
    expect(codes(resolved)).toEqual(['relationship-cycle', 'relationship-cycle', 'relationship-cycle'])
    expect(parts.map(part => boxOf(resolved, part.id).x)).toEqual([1, 2, 3])
  })

  it('lets a part outside the loop follow a member at its stored position', () => {
    const parts = [block('a', 10, 5, 5, { x: 1 }), block('b', 10, 5, 5, { x: 2 }), block('c', 4, 5, 5)]
    const resolved = run(parts, [face('r1', 'a', 'left', 'b', 'right'), face('r2', 'b', 'left', 'a', 'right'), face('r3', 'c', 'left', 'a', 'right')])
    expect(codes(resolved)).toEqual(['relationship-cycle', 'relationship-cycle'])
    expect(boxOf(resolved, 'c').x).toBe(11)
    expect(resolved.parts.find(part => part.id === 'c')!.drivenAxes).toEqual(['x'])
  })

  it('reports a loop through a between relationship once per relationship', () => {
    const parts = [block('a', 10, 5, 5, { x: 0 }), block('b', 10, 5, 5, { x: 100 }), block('c', 4, 5, 5, { x: 3 })]
    const rels: FurnitureRelationship[] = [
      { id: 'mid', kind: 'between', partId: 'c', axis: 'x', from: { partId: 'a', face: 'right' }, to: { partId: 'b', face: 'left' } },
      face('back', 'a', 'left', 'c', 'right'),
    ]
    const resolved = run(parts, rels)
    expect(resolved.issues.map(issue => [issue.code, issue.relationshipId]).sort()).toEqual([['relationship-cycle', 'back'], ['relationship-cycle', 'mid']])
    expect(boxOf(resolved, 'c').x).toBe(3)
  })

  it('does not call opposite-axis references a loop', () => {
    const parts = [block('a', 10, 5, 5), block('b', 10, 5, 5, { x: 50 })]
    const resolved = run(parts, [face('r1', 'a', 'left', 'b', 'right'), face('r2', 'b', 'front', 'a', 'back')])
    expect(resolved.issues).toEqual([])
    expect(boxOf(resolved, 'a').x).toBe(60)
    expect(boxOf(resolved, 'b').y).toBe(5)
  })

  it('still reports a broken stored position on a loop member', () => {
    const parts = [block('a', 10, 5, 5, { x: '1 +' }), block('b', 10, 5, 5, { x: 2 })]
    const resolved = run(parts, [face('r1', 'a', 'left', 'b', 'right'), face('r2', 'b', 'left', 'a', 'right')])
    expect(ids(resolved)).toEqual(['b'])
    expect(codes(resolved)).toContain('expression-invalid')
  })
})

// ---- failed targets ------------------------------------------------------------------

describe('targets that did not resolve', () => {
  it('leaves a dependent out with an explanation naming the target', () => {
    const target = block('t', 0, 5, 5)
    const resolved = run([target, mover()], [face('r', 'm', 'left', 't', 'right')])
    expect(ids(resolved)).toEqual([])
    expect(resolved.issues.map(issue => issue.code)).toEqual(['dimension-not-positive', 'relationship-invalid'])
    expect(resolved.issues[1]).toMatchObject({ severity: 'error', relationshipId: 'r', partIds: ['m', 't'] })
    expect(resolved.issues[1]!.message).toContain('"M"')
    expect(resolved.issues[1]!.message).toContain('"T"')
  })

  it('cascades down a chain, one explanation per dependent', () => {
    const resolved = run([block('t', 0, 5, 5), mover(), block('n', 2, 2, 2)], [face('r1', 'm', 'left', 't', 'right'), face('r2', 'n', 'left', 'm', 'right')])
    expect(ids(resolved)).toEqual([])
    expect(resolved.issues.filter(issue => issue.code === 'relationship-invalid').map(issue => [issue.relationshipId, issue.partIds])).toEqual([['r1', ['m', 't']], ['r2', ['n', 'm']]])
  })

  it('leaves out a dependent of a target whose stored position failed on another axis', () => {
    const target = block('t', 5, 5, 5, { y: '1 +' })
    const resolved = run([target, mover()], [face('r', 'm', 'left', 't', 'right')])
    expect(ids(resolved)).toEqual([])
    expect(codes(resolved)).toEqual(['expression-invalid', 'relationship-invalid'])
  })

  it('leaves out a dependent of a target whose own relationship failed', () => {
    const resolved = run([base(), mover(), block('n', 2, 2, 2)], [face('r1', 'm', 'left', 'b', 'right', 'ghost'), face('r2', 'n', 'left', 'm', 'right')])
    expect(ids(resolved)).toEqual(['b'])
    expect(codes(resolved)).toEqual(['unknown-parameter', 'relationship-invalid'])
  })

  it('does not add an explanation for a dependent that has its own size error', () => {
    const resolved = run([base(), block('m', 0, 6, 8)], [face('r', 'm', 'left', 'b', 'right')])
    expect(codes(resolved)).toEqual(['dimension-not-positive'])
  })

  it('leaves out every part of a distribution when one cannot resolve', () => {
    const left = block('l', 10, 20, 30, { x: 0 })
    const right = block('r', 10, 20, 30, { x: 100 })
    const resolved = run([left, right, block('s1', 4, 6, 8), block('s2', 0, 6, 8)], [{ id: 'd', kind: 'distribute', partIds: ['s1', 's2'], axis: 'x', from: { partId: 'l', face: 'right' }, to: { partId: 'r', face: 'left' } }])
    expect(ids(resolved)).toEqual(['l', 'r'])
    expect(resolved.issues.map(issue => issue.code)).toEqual(['dimension-not-positive', 'relationship-invalid'])
    expect(resolved.issues[1]).toMatchObject({ relationshipId: 'd', partIds: ['s1', 's2'] })
  })

  it('leaves out a part between planes of a target that failed', () => {
    const resolved = run([block('l', 10, 20, 30, { x: 0 }), block('r', -1, 1, 1), mover()], [{ id: 'rel', kind: 'between', partId: 'm', axis: 'x', from: { partId: 'l', face: 'right' }, to: { partId: 'r', face: 'left' } }])
    expect(ids(resolved)).toEqual(['l'])
    expect(resolved.issues[1]).toMatchObject({ code: 'relationship-invalid', partIds: ['m', 'r'] })
  })

  it('keeps unrelated parts', () => {
    const resolved = run([block('t', 0, 5, 5), mover(), base()], [face('r', 'm', 'left', 't', 'right')])
    expect(ids(resolved)).toEqual(['b'])
  })
})

// ---- sizes are never changed ------------------------------------------------------------

describe('sizes are never read for writing', () => {
  // Deterministic pseudo-random numbers: a linear congruential generator.
  function random(seed: number): () => number {
    let state = seed
    return () => {
      state = (state * 1664525 + 1013904223) % 4294967296
      return state / 4294967296
    }
  }

  const sizesOf = (resolved: ResolvedFurniture) => resolved.parts.map(part => ({ id: part.id, size: part.size, sx: part.box.sx, sy: part.box.sy, sz: part.box.sz }))

  it.each([
    ['table', parametricTableProject],
    ['bookcase', parametricBookcaseProject],
  ] as const)('varying relationship offsets never changes a %s part size', (_name, build) => {
    const baseline = sizesOf(resolveFurniture(build(), furnitureContext()))
    const next = random(1)
    for (let run = 0; run < 100; run += 1) {
      const project = build()
      for (const relationship of project.relationships) {
        if ('offset' in relationship) relationship.offset = (next() - 0.5) * 1000
      }
      const resolved = resolveFurniture(project, furnitureContext())
      expect(resolved.issues).toEqual([])
      expect(sizesOf(resolved)).toEqual(baseline)
    }
  })

  it('moves exactly the dependent part by exactly the offset change', () => {
    const next = random(7)
    const reference = boxesOf(resolveFurniture(parametricTableProject(), furnitureContext()))
    for (let run = 0; run < 50; run += 1) {
      const delta = (next() - 0.5) * 200
      const project = parametricTableProject()
      const relationship = project.relationships.find(item => item.id === 'r-front-y')
      if (relationship?.kind !== 'face') throw new Error('fixture changed')
      relationship.offset = 6 + delta
      const boxes = boxesOf(resolveFurniture(project, furnitureContext()))
      for (const [id, box] of Object.entries(boxes)) {
        if (id === 'apron-front') expect(box).toEqual({ ...reference[id]!, y: expect.closeTo(reference[id]!.y + delta, 9) })
        else expect(box).toEqual(reference[id])
      }
    }
  })

  it('places driven axes the same wherever the stored position was', () => {
    const next = random(11)
    const reference = boxesOf(resolveFurniture(parametricBookcaseProject(), furnitureContext()))
    for (let run = 0; run < 50; run += 1) {
      const project = parametricBookcaseProject()
      for (const part of project.parts) {
        const driven = resolveFurniture(parametricBookcaseProject(), furnitureContext()).parts.find(resolved => resolved.id === part.id)!.drivenAxes
        for (const axis of driven) part.position[axis] = (next() - 0.5) * 5000
      }
      expect(boxesOf(resolveFurniture(project, furnitureContext()))).toEqual(reference)
    }
  })

  it('does not let a relationship rescue or alter a size that fails', () => {
    const resolved = run([base(), block('m', 'nope', 6, 8)], [face('r', 'm', 'left', 'b', 'right')])
    expect(ids(resolved)).toEqual(['b'])
    expect(codes(resolved)).toEqual(['unknown-parameter'])
  })

  it('does not mutate the project', () => {
    const project = parametricTableProject()
    const snapshot = structuredClone(project)
    resolveFurniture(project, furnitureContext())
    expect(project).toEqual(snapshot)
  })
})
