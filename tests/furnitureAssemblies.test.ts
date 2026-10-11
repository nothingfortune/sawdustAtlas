import { describe, expect, it } from 'vitest'
import {
  addPartsToSubassembly, assemblyRows, canNest, createSubassembly, descendantIds, labelSubassembly, moveSubassembly, nestSubassembly, nextAssemblyLabel, parentOf,
  removePartFromSubassembly, removeSubassembly, renameSubassembly,
} from '../src/domain/furniture/assemblies'
import { resolveFurniture } from '../src/domain/furniture/geometry'
import type { FurnitureProject } from '../src/domain/furniture/types'
import { validateFurniture } from '../src/domain/furniture/validation'
import { furnitureContext, tableProject } from './fixtures/furniture'

const ctx = furnitureContext()
const subassemblyErrors = (project: FurnitureProject) => validateFurniture(resolveFurniture(project, ctx), ctx).filter(issue => issue.code === 'subassembly-invalid')

// Three top-level subassemblies a, b, c; b has children b1 and b2.
function nested(): FurnitureProject {
  const base = tableProject()
  const sub = (id: string, partIds: string[], childIds: string[] = []) => ({ id, name: id.toUpperCase(), label: id.toUpperCase(), partIds, childIds })
  return {
    ...base,
    subassemblies: [sub('a', ['leg-fl']), sub('b', [], ['b1', 'b2']), sub('c', ['leg-fr']), sub('b1', ['leg-bl']), sub('b2', ['leg-br'])],
  }
}

describe('creating and editing', () => {
  it('creates a top-level subassembly from the parts, taking them out of their old one', () => {
    const project = tableProject()
    const before = project.subassemblies.find(sub => sub.partIds.includes('apron-front'))!
    const next = createSubassembly(project, 'new', ['apron-front', 'top', 'missing', 'top'])
    const made = next.subassemblies.at(-1)!
    expect(made).toMatchObject({ id: 'new', partIds: ['apron-front', 'top'], childIds: [] })
    expect(made.name).toBe(`Assembly ${project.subassemblies.length + 1}`)
    expect(next.subassemblies.find(sub => sub.id === before.id)!.partIds).not.toContain('apron-front')
    expect(subassemblyErrors(next)).toEqual([])
    expect(before.partIds).toContain('apron-front')
  })

  it('picks the first unused letter', () => {
    const project = tableProject()
    expect(nextAssemblyLabel(project)).toBe('A')
    const taken = { ...project, subassemblies: [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map(letter => ({ id: letter, name: letter, label: letter, partIds: [], childIds: [] })) }
    expect(nextAssemblyLabel(taken)).toBe('')
  })

  it('names a new subassembly so it does not repeat an existing name', () => {
    const project = { ...tableProject(), subassemblies: [{ id: 'one', name: 'Assembly 2', label: 'Z', partIds: [], childIds: [] }] }
    expect(createSubassembly(project, 'two', []).subassemblies.at(-1)!.name).toBe('Assembly 3')
  })

  it('renames, labels, adds parts, and removes a part', () => {
    let project = tableProject()
    const id = project.subassemblies[0]!.id
    project = renameSubassembly(project, id, 'Legs')
    project = labelSubassembly(project, id, 'L')
    expect(project.subassemblies[0]).toMatchObject({ name: 'Legs', label: 'L' })
    project = addPartsToSubassembly(project, id, ['top', 'apron-back', 'top', 'missing'])
    expect(project.subassemblies[0]!.partIds).toEqual(expect.arrayContaining(['top', 'apron-back']))
    expect(project.subassemblies.slice(1).some(sub => sub.partIds.includes('apron-back'))).toBe(false)
    expect(subassemblyErrors(project)).toEqual([])
    project = removePartFromSubassembly(project, id, 'top')
    expect(project.subassemblies[0]!.partIds).not.toContain('top')
    expect(addPartsToSubassembly(project, id, ['apron-back']).subassemblies[0]!.partIds.filter(part => part === 'apron-back')).toHaveLength(1)
  })
})

describe('nesting', () => {
  it('finds parents and descendants', () => {
    const project = nested()
    expect(parentOf(project, 'b1')!.id).toBe('b')
    expect(parentOf(project, 'a')).toBeUndefined()
    expect([...descendantIds(project, 'b')].sort()).toEqual(['b1', 'b2'])
    expect([...descendantIds(project, 'a')]).toEqual([])
  })

  it('refuses a subassembly inside itself or its own descendant', () => {
    const project = nested()
    expect(canNest(project, 'b', 'b')).toBe(false)
    expect(canNest(project, 'b', 'b1')).toBe(false)
    expect(canNest(project, 'a', 'b')).toBe(true)
    expect(nestSubassembly(project, 'b', 'b2')).toBeNull()
  })

  it('moves a subassembly into a parent, out of its old one, and back to the top', () => {
    const project = nested()
    const into = nestSubassembly(project, 'a', 'b1')!
    expect(parentOf(into, 'a')!.id).toBe('b1')
    expect(subassemblyErrors(into)).toEqual([])
    const across = nestSubassembly(project, 'b2', 'c')!
    expect(across.subassemblies.find(sub => sub.id === 'b')!.childIds).toEqual(['b1'])
    expect(across.subassemblies.find(sub => sub.id === 'c')!.childIds).toEqual(['b2'])
    const top = nestSubassembly(project, 'b1', null)!
    expect(parentOf(top, 'b1')).toBeUndefined()
    expect(top.subassemblies.find(sub => sub.id === 'b')!.childIds).toEqual(['b2'])
  })
})

describe('ordering', () => {
  it('moves a top-level subassembly past its sibling roots, skipping children in the list', () => {
    const project = nested()
    const down = moveSubassembly(project, 'b', 1)
    expect(assemblyRows(down).filter(row => row.depth === 0).map(row => row.subassembly.id)).toEqual(['a', 'c', 'b'])
    const up = moveSubassembly(project, 'c', -1)
    expect(assemblyRows(up).filter(row => row.depth === 0).map(row => row.subassembly.id)).toEqual(['a', 'c', 'b'])
    expect(moveSubassembly(project, 'a', -1)).toBe(project)
    expect(moveSubassembly(project, 'c', 1)).toBe(project)
    expect(moveSubassembly(project, 'nope', 1)).toBe(project)
  })

  it('reorders children within their parent', () => {
    const project = nested()
    const swapped = moveSubassembly(project, 'b1', 1)
    expect(swapped.subassemblies.find(sub => sub.id === 'b')!.childIds).toEqual(['b2', 'b1'])
    expect(moveSubassembly(project, 'b1', -1)).toBe(project)
    expect(moveSubassembly(project, 'b2', 1)).toBe(project)
  })
})

describe('removing', () => {
  it('releases the parts and lifts the children into the parent\'s place', () => {
    const project = nested()
    const nestedDeeper = nestSubassembly(project, 'b', 'a')!
    const removed = removeSubassembly(nestedDeeper, 'b')
    expect(removed.subassemblies.some(sub => sub.id === 'b')).toBe(false)
    expect(removed.subassemblies.find(sub => sub.id === 'a')!.childIds).toEqual(['b1', 'b2'])
    expect(subassemblyErrors(removed)).toEqual([])
    const topLevel = removeSubassembly(project, 'b')
    expect(assemblyRows(topLevel).filter(row => row.depth === 0).map(row => row.subassembly.id)).toEqual(['a', 'c', 'b1', 'b2'])
    expect(removeSubassembly(project, 'nope')).toBe(project)
  })
})

describe('assemblyRows', () => {
  it('lists build order depth first with the depth', () => {
    expect(assemblyRows(nested()).map(row => [row.subassembly.id, row.depth])).toEqual([['a', 0], ['b', 0], ['b1', 1], ['b2', 1], ['c', 0]])
  })

  it('still lists members of a cycle so they can be fixed', () => {
    const cyclic = { ...tableProject(), subassemblies: [
      { id: 'x', name: 'X', label: 'X', partIds: [], childIds: ['y'] },
      { id: 'y', name: 'Y', label: 'Y', partIds: [], childIds: ['x', 'ghost'] },
    ] }
    expect(assemblyRows(cyclic).map(row => row.subassembly.id).sort()).toEqual(['x', 'y'])
  })
})
