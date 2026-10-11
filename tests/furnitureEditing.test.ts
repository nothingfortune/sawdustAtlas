import { describe, expect, it } from 'vitest'
import {
  NEW_PART_GAP, addParameter, addPart, addSheetMaterial, axisDrivers, defaultSheetMaterial, describeRelationship, duplicatePart, groupBySubassembly, parameterUsages, partTitle,
  removalImpact, removePart, removeParameter, removeSheetMaterial, renameInExpression, renameParameter, sheetMaterialUsers,
} from '../src/domain/furniture/editing'
import { resolveFurniture } from '../src/domain/furniture/geometry'
import type { FurnitureProject } from '../src/domain/furniture/types'
import { bookcaseProject, furnitureContext, parametricBookcaseProject, parametricTableProject, tableProject } from './fixtures/furniture'

const ctx = furnitureContext()
const ids = { partId: 'new-part', sheetMaterialId: 'new-sheet' }

describe('addPart', () => {
  it('places a solid part just right of the selection, on its front and bottom edges', () => {
    const project = tableProject()
    const resolved = resolveFurniture(project, ctx)
    const { project: next, partId } = addPart(project, resolved, 'solid', 'leg-fl', ids, 'walnut')
    const leg = resolved.parts.find(part => part.id === 'leg-fl')!.box
    const added = next.parts.find(part => part.id === partId)!
    expect(added.position).toEqual({ x: leg.x + leg.sx + NEW_PART_GAP, y: leg.y, z: leg.z })
    expect(added).toMatchObject({ kind: 'solid', speciesId: 'walnut', label: 'P1', orientation: 'xyz' })
    expect(next.parts).toHaveLength(project.parts.length + 1)
    expect(project.parts).toHaveLength(9)
  })

  it('falls back to the right of everything, then to the origin', () => {
    const project = tableProject()
    const resolved = resolveFurniture(project, ctx)
    const beside = addPart(project, resolved, 'solid', undefined, ids, 'walnut').project.parts.at(-1)!
    expect(beside.position).toEqual({ x: 1200 + NEW_PART_GAP, y: 0, z: 0 })
    const empty = { ...project, parts: [], relationships: [], joints: [], subassemblies: [] }
    const first = addPart(empty, resolveFurniture(empty, ctx), 'solid', 'gone', ids, 'walnut').project.parts[0]!
    expect(first.position).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('numbers marks past the ones in use', () => {
    let project = tableProject()
    for (const id of ['a', 'b']) project = addPart(project, resolveFurniture(project, ctx), 'solid', undefined, { partId: id, sheetMaterialId: 's' }, 'walnut').project
    expect(project.parts.slice(-2).map(part => part.label)).toEqual(['P1', 'P2'])
  })

  it('gives a sheet part the first sheet material and its thickness', () => {
    const project = bookcaseProject()
    const added = addPart(project, resolveFurniture(project, ctx), 'sheet', undefined, ids, 'walnut')
    const part = added.project.parts.at(-1)!
    expect(part).toMatchObject({ kind: 'sheet', sheetMaterialId: project.sheetMaterials[0]!.id, thickness: project.sheetMaterials[0]!.thickness })
    expect(added.project.sheetMaterials).toHaveLength(project.sheetMaterials.length)
  })

  it('creates a default sheet material when the project has none', () => {
    const project = tableProject()
    const added = addPart(project, resolveFurniture(project, ctx), 'sheet', undefined, ids, 'walnut')
    expect(added.project.sheetMaterials).toEqual([defaultSheetMaterial('new-sheet')])
    expect(added.project.parts.at(-1)).toMatchObject({ sheetMaterialId: 'new-sheet', thickness: 18 })
  })

  it('adds a hardware part with a purchasable name', () => {
    const project = tableProject()
    const part = addPart(project, resolveFurniture(project, ctx), 'hardware', undefined, ids, 'walnut').project.parts.at(-1)!
    expect(part).toMatchObject({ kind: 'hardware', role: 'hardware', hardwareName: 'Hardware', label: 'H1' })
  })
})

describe('duplicatePart', () => {
  it('copies beside the original with literal positions, a fresh mark, and its subassemblies', () => {
    const project = tableProject()
    const resolved = resolveFurniture(project, ctx)
    const result = duplicatePart(project, resolved, 'leg-fl', 'copy')!
    const index = result.project.parts.findIndex(part => part.id === 'copy')
    expect(result.project.parts[index - 1]!.id).toBe('leg-fl')
    const copy = result.project.parts[index]!
    expect(copy.name).toBe('Front left leg copy')
    expect(copy.label).not.toBe(project.parts.find(part => part.id === 'leg-fl')!.label)
    expect(copy.position).toEqual({ x: 25 + 45 + NEW_PART_GAP, y: 25, z: 0 })
    for (const group of result.project.subassemblies) {
      const original = project.subassemblies.find(candidate => candidate.id === group.id)!
      expect(group.partIds.includes('copy')).toBe(original.partIds.includes('leg-fl'))
    }
    expect(result.project.joints).toEqual(project.joints)
  })

  it('keeps the stored position when the part did not resolve', () => {
    const project = { ...tableProject(), parts: [{ ...tableProject().parts[0]!, length: 'missing_name' }] }
    const result = duplicatePart(project, resolveFurniture(project, ctx), project.parts[0]!.id, 'copy')!
    expect(result.project.parts[1]!.position).toEqual(project.parts[0]!.position)
  })

  it('uses the kind prefix for an unmarked part and returns null for an unknown id', () => {
    const base = tableProject()
    const project = { ...base, parts: base.parts.map((part, i) => i === 0 ? { ...part, label: '' } : part) }
    const resolved = resolveFurniture(project, ctx)
    expect(duplicatePart(project, resolved, project.parts[0]!.id, 'c')!.project.parts[1]!.label).toBe('P1')
    expect(duplicatePart(project, resolved, 'nope', 'c')).toBeNull()
  })
})

describe('removing a part', () => {
  it('lists the joints, relationships, and memberships that go with it', () => {
    const project = parametricTableProject()
    const impact = removalImpact(project, 'leg-fl')
    expect(impact.joints.map(joint => joint.id).sort()).toEqual(['mt-front-fl', 'mt-left-fl'])
    expect(impact.relationships.length).toBeGreaterThan(0)
    expect(impact.subassemblies.length).toBeGreaterThan(0)
  })

  it('removes the part and everything that referenced it', () => {
    const project = parametricTableProject()
    const next = removePart(project, 'leg-fl')
    expect(next.parts.some(part => part.id === 'leg-fl')).toBe(false)
    expect(next.joints.some(joint => joint.partId === 'leg-fl' || joint.targetId === 'leg-fl')).toBe(false)
    expect(JSON.stringify(next.relationships)).not.toContain('leg-fl')
    expect(next.subassemblies.some(group => group.partIds.includes('leg-fl'))).toBe(false)
  })

  it('removes anchored relationships but only shortens a distribute list', () => {
    const project = parametricBookcaseProject()
    const distribute = project.relationships.find(relationship => relationship.kind === 'distribute')!
    if (distribute.kind !== 'distribute') throw new Error('fixture has no distribute relationship')
    const shelf = distribute.partIds[0]!
    const impact = removalImpact(project, shelf)
    expect(impact.adjusted.map(relationship => relationship.id)).toContain(distribute.id)
    const next = removePart(project, shelf)
    const after = next.relationships.find(relationship => relationship.id === distribute.id)
    expect(after?.kind === 'distribute' && after.partIds).toEqual(distribute.partIds.slice(1))
    const bottom = distribute.from.partId
    expect(removalImpact(project, bottom).relationships.map(relationship => relationship.id)).toContain(distribute.id)
    expect(removePart(project, bottom).relationships.some(relationship => relationship.id === distribute.id)).toBe(false)
  })

  it('drops a distribute relationship that loses its only part', () => {
    const project = parametricBookcaseProject()
    const distribute = project.relationships.find(relationship => relationship.kind === 'distribute')!
    if (distribute.kind !== 'distribute') throw new Error('fixture has no distribute relationship')
    const single: FurnitureProject = { ...project, relationships: [{ ...distribute, partIds: [distribute.partIds[0]!] }] }
    expect(removePart(single, distribute.partIds[0]!).relationships).toEqual([])
  })

  it('leaves an unrelated part untouched', () => {
    const project = tableProject()
    expect(removalImpact(project, 'top')).toEqual({ joints: expect.any(Array), relationships: [], adjusted: [], subassemblies: expect.any(Array) })
  })
})

describe('relationship descriptions', () => {
  const project = parametricBookcaseProject()
  it('names each relationship kind in plain words', () => {
    const texts = project.relationships.map(relationship => describeRelationship(project, relationship))
    expect(texts.every(text => text.length > 10 && !text.includes('missing part'))).toBe(true)
    expect(texts.some(text => /spaced between/.test(text))).toBe(true)
  })

  it('describes face, center, and between relationships', () => {
    const table = parametricTableProject()
    const face = table.relationships.find(relationship => relationship.kind === 'face')!
    expect(describeRelationship(table, face)).toMatch(/face (flush with|against)/)
    const base = tableProject()
    expect(describeRelationship(base, { id: 'c', kind: 'center', partId: 'top', axis: 'x', targetId: 'leg-fl', offset: 0 })).toBe(`${partTitle(base, 'top')} centered on ${partTitle(base, 'leg-fl')} along x`)
    expect(describeRelationship(base, { id: 'b', kind: 'between', partId: 'top', axis: 'z', from: { partId: 'leg-fl', face: 'bottom' }, to: { partId: 'leg-fr', face: 'top' } })).toContain('centered between')
  })

  it('reports a missing part by that name', () => {
    expect(partTitle(project, 'nope')).toBe('a missing part')
  })

  it('finds the first relationship driving each axis of a part', () => {
    const table = parametricTableProject()
    const drivers = axisDrivers(table, 'apron-front')
    expect(Object.keys(drivers).length).toBeGreaterThan(0)
    const resolved = resolveFurniture(table, ctx)
    expect(Object.keys(drivers).sort()).toEqual([...resolved.parts.find(part => part.id === 'apron-front')!.drivenAxes].sort())
    expect(axisDrivers(tableProject(), 'top')).toEqual({})
  })

  it('counts a distribute relationship and a between relationship as drivers', () => {
    const drivers = axisDrivers({
      ...tableProject(),
      relationships: [
        { id: 'd', kind: 'distribute', partIds: ['top'], axis: 'z', from: { partId: 'leg-fl', face: 'bottom' }, to: { partId: 'leg-fr', face: 'top' } },
        { id: 'b', kind: 'between', partId: 'top', axis: 'x', from: { partId: 'leg-fl', face: 'left' }, to: { partId: 'leg-fr', face: 'right' } },
        { id: 'late', kind: 'center', partId: 'top', axis: 'z', targetId: 'leg-fl', offset: 0 },
      ],
    }, 'top')
    expect(drivers.z?.id).toBe('d')
    expect(drivers.x?.id).toBe('b')
  })
})

describe('parameters', () => {
  it('adds uniquely named parameters', () => {
    let project = tableProject()
    project = addParameter(project, 'p1')
    project = addParameter(project, 'p2')
    expect(project.parameters.map(parameter => parameter.name)).toEqual(['param_1', 'param_2'])
    expect(project.parameters[0]).toMatchObject({ label: 'New parameter', value: 100 })
  })

  it('finds where a parameter is used', () => {
    const project = parametricTableProject()
    const usages = parameterUsages(project, 'leg')
    expect(usages.length).toBeGreaterThan(0)
    expect(usages.some(usage => usage.kind === 'part')).toBe(true)
    expect(parameterUsages(project, 'not_a_name')).toEqual([])
  })

  it('finds parameter, relationship, and part-position uses and ignores the parameter itself', () => {
    const project: FurnitureProject = {
      ...tableProject(),
      parameters: [{ id: 'a', name: 'a', label: 'A', value: 5 }, { id: 'b', name: 'b', label: 'B', value: 'a * 2' }, { id: 'c', name: 'c', label: 'C', value: 'c + 1' }],
      parts: tableProject().parts.map((part, i) => i === 0 ? { ...part, position: { x: 'a', y: 0, z: 0 } } : part),
      relationships: [{ id: 'r', kind: 'center', partId: 'top', axis: 'x', targetId: 'leg-fl', offset: 'a' }],
    }
    expect(parameterUsages(project, 'a').map(usage => usage.kind).sort()).toEqual(['parameter', 'part', 'relationship'])
    expect(parameterUsages(project, 'c')).toEqual([])
  })

  it('rewrites whole names only', () => {
    expect(renameInExpression('leg * 2 + leg_t', 'leg', 'post')).toBe('post * 2 + leg_t')
    expect(renameInExpression('max(in, 2) + 0.75in', 'in', 'inch')).toBe('max(inch, 2) + 0.75in')
    expect(renameInExpression('max(a, b)', 'max', 'x')).toBe('max(a, b)')
    expect(renameInExpression('2 * width', 'depth', 'd')).toBe('2 * width')
  })

  it('renames a parameter and every expression that uses it', () => {
    const project = parametricTableProject()
    const leg = project.parameters.find(parameter => parameter.name === 'leg')!
    const result = renameParameter(project, leg.id, 'post')
    if (!result.ok) throw new Error(result.message)
    expect(result.project.parameters.find(parameter => parameter.id === leg.id)!.name).toBe('post')
    expect(parameterUsages(result.project, 'leg')).toEqual([])
    expect(parameterUsages(result.project, 'post').length).toBe(parameterUsages(project, 'leg').length)
    const before = resolveFurniture(project, ctx)
    const after = resolveFurniture(result.project, ctx)
    expect(after.parts.map(part => part.box)).toEqual(before.parts.map(part => part.box))
    expect(after.issues).toEqual(before.issues)
  })

  it('rejects an invalid, duplicate, or unknown rename and accepts an unchanged name', () => {
    const project = parametricTableProject()
    const [first, second] = project.parameters
    expect(renameParameter(project, first!.id, '9lives')).toMatchObject({ ok: false })
    expect(renameParameter(project, first!.id, second!.name)).toMatchObject({ ok: false, message: expect.stringContaining(second!.name) })
    expect(renameParameter(project, 'nope', 'x')).toMatchObject({ ok: false })
    expect(renameParameter(project, first!.id, first!.name)).toEqual({ ok: true, project })
  })

  it('removes a parameter, leaving the references for validation to report', () => {
    const project = parametricTableProject()
    const leg = project.parameters.find(parameter => parameter.name === 'leg')!
    const next = removeParameter(project, leg.id)
    expect(next.parameters.some(parameter => parameter.id === leg.id)).toBe(false)
    expect(resolveFurniture(next, ctx).issues.some(issue => issue.code === 'unknown-parameter')).toBe(true)
  })
})

describe('sheet materials', () => {
  it('adds a default material and blocks removing one that parts use', () => {
    const project = bookcaseProject()
    const added = addSheetMaterial(project, 'mat')
    expect(added.sheetMaterials.at(-1)).toEqual(defaultSheetMaterial('mat'))
    const used = project.sheetMaterials[0]!
    expect(sheetMaterialUsers(project, used.id).length).toBeGreaterThan(0)
    expect(removeSheetMaterial(project, used.id)).toBeNull()
    expect(removeSheetMaterial(added, 'mat')!.sheetMaterials).toEqual(project.sheetMaterials)
  })
})

describe('groupBySubassembly', () => {
  it('nests child subassemblies and puts loose parts last', () => {
    const project = tableProject()
    const groups = groupBySubassembly(project)
    const base = groups.find(group => group.subassembly?.id === 'sub-base')!
    expect(base.children.map(child => child.subassembly!.id)).toEqual(['sub-front', 'sub-back'])
    expect(base.children[0]!.parts.map(part => part.id).sort()).toEqual(project.subassemblies.find(group => group.id === 'sub-front')!.partIds.slice().sort())
    expect(groups.at(-1)!.subassembly).toBeUndefined()
    const placed = groups.flatMap(function walk(group): string[] { return [...group.parts.map(part => part.id), ...group.children.flatMap(walk)] })
    expect([...placed].sort()).toEqual(project.parts.map(part => part.id).sort())
  })

  it('shows a part once and survives a cyclic child list', () => {
    const project: FurnitureProject = {
      ...tableProject(),
      subassemblies: [
        { id: 'a', name: 'A', label: 'A', partIds: ['top', 'leg-fl'], childIds: ['b'] },
        { id: 'b', name: 'B', label: 'B', partIds: ['leg-fl'], childIds: ['a'] },
      ],
    }
    const groups = groupBySubassembly(project)
    const listed = groups.flatMap(function walk(group): string[] { return [...group.parts.map(part => part.id), ...group.children.flatMap(walk)] })
    expect(listed.filter(id => id === 'leg-fl')).toHaveLength(1)
    expect(new Set(listed).size).toBe(listed.length)
    expect(listed).toHaveLength(project.parts.length)
  })

  it('drops a child id that names no subassembly', () => {
    const project: FurnitureProject = { ...tableProject(), subassemblies: [{ id: 'a', name: 'A', label: 'A', partIds: ['top'], childIds: ['ghost'] }] }
    expect(groupBySubassembly(project)[0]!.children).toEqual([])
  })
})
