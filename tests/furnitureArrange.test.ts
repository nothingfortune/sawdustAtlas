import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NUDGE, GRID_STEPS, addRelationship, alignRelationship, arrangeAvailability, betweenRelationship, boxOf, centerRelationship, distributeRelationship,
  faceRelationship, movePart, moveBlocker, nudgeDirection, nudgeDistance, nudgeParts, pickPart, placedSelection, relationshipProblem, relationshipsOf,
  removeRelationship, snapMove, suggestAlign, suggestAttach, suggestBetween, suggestCenterAxis, suggestDistribute,
} from '../src/domain/furniture/arrange'
import { resolveFurniture } from '../src/domain/furniture/geometry'
import type { Box } from '../src/domain/furniture/types'
import { TABLE_BOXES, bookcaseProject, furnitureContext, parametricBookcaseProject, parametricTableProject, tableProject } from './fixtures/furniture'

const ctx = furnitureContext()
const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number): Box => ({ x, y, z, sx, sy, sz })

describe('snapMove', () => {
  const part = box(0, 0, 0, 100, 50, 20)
  const others = [box(300, 0, 0, 40, 50, 20)]

  it('snaps the low face to a nearby face plane', () => {
    expect(snapMove(part, 'x', 296, others, 0, 5)).toEqual({ value: 300, kind: 'face', plane: 300 })
  })

  it('snaps the high face to a nearby face plane', () => {
    // High face at 300 means a min of 200.
    expect(snapMove(part, 'x', 203, others, 0, 5)).toEqual({ value: 200, kind: 'face', plane: 300 })
    expect(snapMove(part, 'x', 244, others, 0, 5)).toEqual({ value: 240, kind: 'face', plane: 340 })
  })

  it('takes the nearest plane among several', () => {
    const near = [box(300, 0, 0, 40, 50, 20), box(305, 0, 0, 10, 50, 20)]
    expect(snapMove(part, 'x', 304, near, 0, 10)).toMatchObject({ value: 305, plane: 305 })
  })

  it('prefers a face plane over the grid', () => {
    expect(snapMove(part, 'x', 301, others, 25.4, 5)).toMatchObject({ kind: 'face', value: 300 })
  })

  it('falls back to the grid, then to the raw value', () => {
    expect(snapMove(part, 'x', 12.3, others, 5, 1)).toEqual({ value: 10, kind: 'grid' })
    expect(snapMove(part, 'x', 38.2, others, 25.4, 1).value).toBeCloseTo(50.8, 9)
    expect(snapMove(part, 'x', 12.3, others, 0, 1)).toEqual({ value: 12.3, kind: 'none' })
  })

  it('works along every axis and never reads the moving part as a target', () => {
    expect(snapMove(part, 'z', 19.5, [box(0, 0, 0, 10, 10, 20)], 0, 1)).toMatchObject({ value: 20, kind: 'face' })
    expect(snapMove(part, 'y', 51, [box(0, 0, 0, 10, 50, 10)], 0, 2)).toMatchObject({ value: 50, kind: 'face' })
    expect(snapMove(part, 'x', 1, [], 0, 5)).toEqual({ value: 1, kind: 'none' })
  })

  it('offers the documented grid steps', () => {
    expect(GRID_STEPS).toEqual([0, 1, 5, 10, 25.4])
  })
})

describe('nudges', () => {
  it('moves one grid step, or a millimeter with the grid off, ten times that with shift', () => {
    expect(nudgeDistance(0, false)).toBe(DEFAULT_NUDGE)
    expect(nudgeDistance(0, true)).toBe(10)
    expect(nudgeDistance(5, false)).toBe(5)
    expect(nudgeDistance(25.4, true)).toBeCloseTo(254, 9)
  })

  it('maps arrow keys to the screen axes of each view', () => {
    expect(nudgeDirection('ArrowRight', 'front')).toEqual({ axis: 'x', sign: 1 })
    expect(nudgeDirection('ArrowUp', 'front')).toEqual({ axis: 'z', sign: 1 })
    expect(nudgeDirection('ArrowLeft', 'side')).toEqual({ axis: 'y', sign: -1 })
    expect(nudgeDirection('ArrowDown', 'side')).toEqual({ axis: 'z', sign: -1 })
    expect(nudgeDirection('ArrowUp', 'top')).toEqual({ axis: 'y', sign: 1 })
    expect(nudgeDirection('ArrowLeft', 'iso')).toEqual({ axis: 'x', sign: -1 })
    expect(nudgeDirection('ArrowDown', '3d')).toEqual({ axis: 'y', sign: -1 })
    expect(nudgeDirection('PageUp', 'top')).toEqual({ axis: 'z', sign: 1 })
    expect(nudgeDirection('PageDown', 'front')).toEqual({ axis: 'z', sign: -1 })
    expect(nudgeDirection('a', 'front')).toBeNull()
  })
})

describe('moving parts', () => {
  it('writes a literal position and replaces an expression', () => {
    const project = parametricTableProject()
    const leg = project.parts.find(part => part.id === 'leg-fl')!
    expect(typeof leg.position.x).not.toBe('number')
    const moved = movePart(project, 'leg-fl', 'x', 40.5)!
    expect(moved.parts.find(part => part.id === 'leg-fl')!.position.x).toBe(40.5)
    expect(project.parts.find(part => part.id === 'leg-fl')).toBe(leg)
  })

  it('refuses an axis a relationship drives, and says why', () => {
    const project = parametricTableProject()
    expect(moveBlocker(project, 'apron-front', 'x')).toMatch(/placed along X by a relationship/)
    expect(moveBlocker(project, 'apron-front', 'x')).toContain('A1 Front apron')
    expect(movePart(project, 'apron-front', 'x', 1)).toBeNull()
    expect(moveBlocker(project, 'leg-fl', 'x')).toBeNull()
  })

  it('refuses a part that does not exist', () => {
    expect(movePart(tableProject(), 'nope', 'x', 1)).toBeNull()
  })

  it('nudges every free part from its resolved position and reports blocked ones', () => {
    const project = parametricBookcaseProject()
    const resolved = resolveFurniture(project, ctx)
    const result = nudgeParts(project, resolved, ['side-l', 'bottom', 'missing'], 'x', 5)
    expect(result.moved).toEqual(['side-l'])
    expect(result.blocked.map(entry => entry.partId)).toEqual(['bottom'])
    const after = resolveFurniture(result.project, ctx)
    expect(after.parts.find(part => part.id === 'side-l')!.box.x).toBe(5)
    // The bottom stays centered between the sides, so it follows the moved side.
    expect(after.parts.find(part => part.id === 'bottom')!.box.x).toBe(20.5)
  })
})

describe('selection', () => {
  it('replaces on a plain pick and toggles on an additive one, keeping click order', () => {
    expect(pickPart(['a', 'b'], 'c', false)).toEqual(['c'])
    expect(pickPart(['a'], 'b', true)).toEqual(['a', 'b'])
    expect(pickPart(['a', 'b'], 'a', true)).toEqual(['b'])
  })

  it('enables arranging actions by selection size', () => {
    expect(arrangeAvailability(1)).toEqual({ attach: false, align: false, center: false, between: false, distribute: false })
    expect(arrangeAvailability(2)).toEqual({ attach: true, align: true, center: true, between: false, distribute: false })
    expect(arrangeAvailability(3)).toEqual({ attach: false, align: false, center: false, between: true, distribute: false })
    expect(arrangeAvailability(4).distribute).toBe(true)
    expect(arrangeAvailability(6).distribute).toBe(true)
  })

  it('lists the resolved boxes of a selection in order, skipping unresolved ids', () => {
    const resolved = resolveFurniture(tableProject(), ctx)
    expect(placedSelection(resolved, ['top', 'gone', 'leg-fl']).map(entry => entry.id)).toEqual(['top', 'leg-fl'])
    expect(boxOf(resolved, 'top')).toEqual(TABLE_BOXES['top'])
    expect(boxOf(resolved, 'gone')).toBeUndefined()
  })
})

describe('suggestions', () => {
  it('suggests the opposite faces that are closest', () => {
    // The shelf sits just right of the post.
    expect(suggestAttach(box(110, 0, 0, 100, 50, 20), box(0, 0, 0, 100, 50, 20))).toEqual({ face: 'left', targetFace: 'right' })
    expect(suggestAttach(box(0, 0, 0, 100, 50, 20), box(0, 0, 25, 100, 50, 20))).toEqual({ face: 'top', targetFace: 'bottom' })
    expect(suggestAttach(box(0, -60, 0, 100, 50, 20), box(0, 0, 0, 100, 50, 20))).toEqual({ face: 'back', targetFace: 'front' })
  })

  it('suggests the nearest face that is not already flush', () => {
    expect(suggestAlign(box(0, 0, 0, 100, 50, 20), box(3, 0, 0, 100, 50, 20))).toBe('left')
    expect(suggestAlign(box(0, 0, 0, 100, 50, 20), box(0, 0, 0, 100, 50, 20))).toBe('left')
    expect(suggestAlign(box(0, 0, 0, 100, 50, 20), box(0, 0, 4, 100, 50, 20))).toBe('bottom')
  })

  it('suggests the axis that is nearest to centered but not centered', () => {
    expect(suggestCenterAxis(box(0, 0, 0, 100, 50, 20), box(5, 0, 0, 100, 50, 20))).toBe('x')
    expect(suggestCenterAxis(box(0, 0, 0, 100, 50, 20), box(0, 0, 0, 100, 50, 20))).toBe('x')
    expect(suggestCenterAxis(box(0, 0, 0, 100, 50, 20), box(0, 0, 40, 100, 50, 20))).toBe('z')
  })

  it('finds the axis three parts spread along and the one in the middle', () => {
    const parts = [
      { id: 'top', box: box(0, 0, 80, 100, 50, 20) },
      { id: 'mid', box: box(0, 0, 40, 100, 50, 20) },
      { id: 'bottom', box: box(0, 0, 0, 100, 50, 20) },
    ]
    expect(suggestBetween(parts)).toEqual({ axis: 'z', partId: 'mid' })
    const sideways = [
      { id: 'a', box: box(0, 0, 0, 10, 50, 20) },
      { id: 'b', box: box(100, 0, 0, 10, 50, 20) },
      { id: 'c', box: box(300, 0, 0, 10, 50, 20) },
    ]
    expect(suggestBetween(sideways)).toEqual({ axis: 'x', partId: 'b' })
    const deep = [
      { id: 'a', box: box(0, 0, 0, 10, 10, 10) },
      { id: 'b', box: box(0, 200, 0, 10, 10, 10) },
      { id: 'c', box: box(0, 500, 0, 10, 10, 10) },
    ]
    expect(suggestBetween(deep)).toEqual({ axis: 'y', partId: 'b' })
  })

  it('suggests the outermost parts as anchors for a distribution', () => {
    const parts = [
      { id: 'shelf-1', box: box(0, 0, 100, 100, 50, 20) },
      { id: 'top', box: box(0, 0, 400, 100, 50, 20) },
      { id: 'bottom', box: box(0, 0, 0, 100, 50, 20) },
      { id: 'shelf-2', box: box(0, 0, 200, 100, 50, 20) },
    ]
    expect(suggestDistribute(parts)).toEqual({ axis: 'z', fromId: 'bottom', toId: 'top' })
  })
})

describe('relationship builders', () => {
  const anchors = [
    { id: 'top', box: box(0, 0, 400, 100, 50, 20) },
    { id: 'bottom', box: box(0, 0, 0, 100, 50, 20) },
  ] as const

  it('builds attach, align, and center relationships', () => {
    expect(faceRelationship('r1', 'a', 'left', { partId: 'b', face: 'right' }, 2)).toEqual({ id: 'r1', kind: 'face', partId: 'a', face: 'left', target: { partId: 'b', face: 'right' }, offset: 2 })
    expect(alignRelationship('r2', 'a', 'b', 'front', 0)).toMatchObject({ kind: 'face', face: 'front', target: { partId: 'b', face: 'front' } })
    expect(centerRelationship('r3', 'a', 'b', 'y', 1)).toEqual({ id: 'r3', kind: 'center', partId: 'a', axis: 'y', targetId: 'b', offset: 1 })
  })

  it('puts between and distribute anchors in order along the axis whatever the pick order', () => {
    const between = betweenRelationship('r4', 'mid', 'z', anchors)
    expect(between).toMatchObject({ kind: 'between', from: { partId: 'bottom', face: 'top' }, to: { partId: 'top', face: 'bottom' } })
    const shelves = [{ id: 's2', box: box(0, 0, 200, 100, 50, 20) }, { id: 's1', box: box(0, 0, 100, 100, 50, 20) }]
    const distribute = distributeRelationship('r5', 'z', anchors, shelves)
    expect(distribute).toMatchObject({ kind: 'distribute', partIds: ['s1', 's2'], from: { partId: 'bottom', face: 'top' }, to: { partId: 'top', face: 'bottom' } })
  })
})

describe('adding and removing relationships', () => {
  it('adds a relationship and replaces the one already placing that axis', () => {
    const project = bookcaseProject()
    const first = addRelationship(project, faceRelationship('a', 'back', 'back', { partId: 'side-l', face: 'back' }, 0))
    expect(first).toMatchObject({ ok: true })
    const second = addRelationship((first as { project: typeof project }).project, faceRelationship('b', 'back', 'front', { partId: 'side-l', face: 'front' }, 0))
    expect(second.ok && second.project.relationships.map(relationship => relationship.id)).toEqual(['b'])
  })

  it('keeps unrelated relationships and other axes', () => {
    const project = parametricBookcaseProject()
    const result = addRelationship(project, centerRelationship('new', 'side-l', 'back', 'x', 0))
    expect(result.ok && result.project.relationships).toHaveLength(project.relationships.length + 1)
  })

  it('refuses to replace a distribution', () => {
    const project = parametricBookcaseProject()
    const result = addRelationship(project, centerRelationship('new', 'shelf-1', 'side-l', 'z', 0))
    expect(result.ok).toBe(false)
    expect(!result.ok && result.message).toMatch(/spaced along .* by a distribution/)
  })

  it('reports a loop before it is committed', () => {
    const project = tableProject()
    const first = addRelationship(project, faceRelationship('r1', 'leg-fl', 'left', { partId: 'leg-fr', face: 'right' }, 0))
    if (!first.ok) throw new Error(first.message)
    const looped = addRelationship(first.project, faceRelationship('r2', 'leg-fr', 'right', { partId: 'leg-fl', face: 'left' }, 0))
    if (!looped.ok) throw new Error(looped.message)
    expect(relationshipProblem(looped.project, ctx, 'r2')).toMatch(/loop/)
    expect(relationshipProblem(first.project, ctx, 'r1')).toBeNull()
  })

  it('lists relationships by the parts they place or read', () => {
    const table = parametricTableProject()
    const front = table.relationships.find(relationship => relationship.id === 'r-front-x')!
    expect(relationshipsOf(table, 'apron-front')).toContain(front)
    expect(relationshipsOf(table, 'leg-fl')).toContain(front)
    expect(relationshipsOf(table, 'no-such-part')).toEqual([])
    const bookcase = parametricBookcaseProject()
    const distribution = bookcase.relationships.find(relationship => relationship.id === 'r-shelves-z')!
    expect(relationshipsOf(bookcase, 'shelf-2')).toContain(distribution)
    expect(relationshipsOf(bookcase, 'bottom')).toContain(distribution)
    const between = bookcase.relationships.find(relationship => relationship.id === 'r-bottom-x')!
    expect(relationshipsOf(bookcase, 'side-r')).toContain(between)
    const center = centerRelationship('ct', 'back', 'side-l', 'x', 0)
    expect(relationshipsOf({ ...bookcase, relationships: [center] }, 'side-l')).toEqual([center])
  })

  it('removes a relationship and pins the part where it resolved', () => {
    const project = parametricTableProject()
    const resolved = resolveFurniture(project, ctx)
    const one = removeRelationship(project, resolved, 'r-front-x')
    expect(one.relationships.map(relationship => relationship.id)).not.toContain('r-front-x')
    expect(one.parts.find(part => part.id === 'apron-front')!.position.x).toBe(70)
    expect(resolveFurniture(one, ctx).parts.map(part => part.box)).toEqual(resolved.parts.map(part => part.box))

    let pinned = project
    for (const relationship of project.relationships) pinned = removeRelationship(pinned, resolved, relationship.id)
    expect(pinned.relationships).toEqual([])
    expect(resolveFurniture(pinned, ctx).parts.map(part => part.box)).toEqual(resolved.parts.map(part => part.box))
  })

  it('leaves the project alone for an unknown relationship and skips unresolved parts', () => {
    const project = parametricTableProject()
    const resolved = resolveFurniture(project, ctx)
    expect(removeRelationship(project, resolved, 'nope')).toBe(project)
    const partial = { ...resolved, parts: [] }
    const id = project.relationships[0]!.id
    const next = removeRelationship(project, partial, id)
    expect(next.relationships).toHaveLength(project.relationships.length - 1)
    expect(next.parts).toEqual(project.parts)
  })
})
