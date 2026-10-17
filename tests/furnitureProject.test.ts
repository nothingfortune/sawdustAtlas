import { describe, expect, it } from 'vitest'
import { DEFAULT_MAX_BOARD_WIDTH, emptyFurnitureProject, normalizeFurnitureProject, remapMissingSpecies } from '../src/domain/furniture/project'
import type { Box, FurniturePart, FurnitureProject, PartOrientation } from '../src/domain/furniture/types'
import { normalizeData } from '../src/storage'
import {
  BOOKCASE_BOXES, TABLE_BOXES, bookcaseProject, bookcaseResolvedParts, parametricBookcaseProject, parametricTableProject, tableProject, tableResolvedParts,
} from './fixtures/furniture'

let nextId = 0
const options = { createId: () => `gen-${++nextId}`, now: '2026-10-10T12:00:00.000Z', fallbackSpeciesId: 'walnut' }

// Extent of a literal part along each world axis, from its orientation. Only for
// checking the fixtures' hand-computed boxes; the real resolver lives in geometry.ts.
function extents(part: FurniturePart): { sx: number; sy: number; sz: number } {
  const dims = [part.length, part.width, part.thickness] as number[]
  const axes = part.orientation.split('') as ('x' | 'y' | 'z')[]
  const at = (axis: 'x' | 'y' | 'z') => dims[axes.indexOf(axis)]!
  return { sx: at('x'), sy: at('y'), sz: at('z') }
}

function overlapVolume(a: Box, b: Box): number {
  const span = (a0: number, as: number, b0: number, bs: number) => Math.max(0, Math.min(a0 + as, b0 + bs) - Math.max(a0, b0))
  return span(a.x, a.sx, b.x, b.sx) * span(a.y, a.sy, b.y, b.sy) * span(a.z, a.sz, b.z, b.sz)
}

describe('furniture fixtures', () => {
  it.each([
    ['table', tableProject(), TABLE_BOXES],
    ['bookcase', bookcaseProject(), BOOKCASE_BOXES],
  ] as const)('%s boxes match each literal part position, size, and orientation', (_name, project, boxes) => {
    expect(Object.keys(boxes).sort()).toEqual(project.parts.map(p => p.id).sort())
    for (const part of project.parts) {
      const box = boxes[part.id]!
      expect({ x: box.x, y: box.y, z: box.z }).toEqual(part.position)
      expect({ sx: box.sx, sy: box.sy, sz: box.sz }).toEqual(extents(part))
    }
  })

  it.each([
    ['table', TABLE_BOXES],
    ['bookcase', BOOKCASE_BOXES],
  ] as const)('%s parts never overlap', (_name, boxes) => {
    const entries = Object.entries(boxes)
    for (const [i, [aId, a]] of entries.entries()) {
      for (const [bId, b] of entries.slice(i + 1)) expect(overlapVolume(a, b), `${aId} vs ${bId}`).toBe(0)
    }
  })

  it('every joint and subassembly references real parts, and every part is jointed', () => {
    for (const project of [tableProject(), bookcaseProject(), parametricTableProject(), parametricBookcaseProject()]) {
      const ids = new Set(project.parts.map(p => p.id))
      for (const joint of project.joints) {
        expect(ids.has(joint.partId), joint.id).toBe(true)
        expect(ids.has(joint.targetId), joint.id).toBe(true)
      }
      for (const sub of project.subassemblies) for (const id of sub.partIds) expect(ids.has(id), sub.id).toBe(true)
      const jointed = new Set(project.joints.flatMap(j => [j.partId, j.targetId]))
      for (const id of ids) expect(jointed.has(id), id).toBe(true)
    }
  })

  it('parametric twins keep the literal part ids, joints, and subassemblies', () => {
    for (const [literal, parametric] of [[tableProject(), parametricTableProject()], [bookcaseProject(), parametricBookcaseProject()]] as const) {
      expect(parametric.parts.map(p => p.id)).toEqual(literal.parts.map(p => p.id))
      expect(parametric.joints).toEqual(literal.joints)
      expect(parametric.subassemblies).toEqual(literal.subassemblies)
      expect(parametric.parameters.length).toBeGreaterThan(0)
      expect(parametric.relationships.length).toBeGreaterThan(0)
    }
  })

  it('resolved fixtures carry the species or sheet color', () => {
    const table = tableResolvedParts()
    expect(table.find(p => p.id === 'top')?.color).toBe('#5a3828')
    expect(table.find(p => p.id === 'leg-fl')?.color).toBe('#dbc59b')
    expect(bookcaseResolvedParts().find(p => p.id === 'back')?.color).toBe('#e3cfa4')
  })
})

describe('emptyFurnitureProject', () => {
  it('starts with no parts and the default board width', () => {
    const project = emptyFurnitureProject('p1', 'Desk', '2026-10-10T00:00:00.000Z')
    expect(project.parts).toEqual([])
    expect(project.maxBoardWidth).toBe(DEFAULT_MAX_BOARD_WIDTH)
    expect(project.templateId).toBeUndefined()
  })
})

describe('normalizeFurnitureProject', () => {
  it('returns null for something that is not a record', () => {
    expect(normalizeFurnitureProject(null, options)).toBeNull()
    expect(normalizeFurnitureProject('table', options)).toBeNull()
    expect(normalizeFurnitureProject([], options)).toBeNull()
  })

  it('round-trips the fixtures unchanged', () => {
    for (const project of [tableProject(), bookcaseProject(), parametricTableProject(), parametricBookcaseProject()]) {
      expect(normalizeFurnitureProject(JSON.parse(JSON.stringify(project)), options)).toEqual(project)
    }
  })

  it('fills defaults for a bare record', () => {
    const project = normalizeFurnitureProject({}, options)!
    expect(project.name).toBe('Imported furniture')
    expect(project.id).toMatch(/^gen-/)
    expect(project.updatedAt).toBe(options.now)
    expect(project.maxBoardWidth).toBe(DEFAULT_MAX_BOARD_WIDTH)
    expect(project).toMatchObject({ parameters: [], parts: [], relationships: [], joints: [], subassemblies: [], sheetMaterials: [] })
  })

  it('coerces parts: unknown enums fall back, sizes clamp, positions keep their sign, expressions stay', () => {
    const project = normalizeFurnitureProject({
      parts: [{ id: 'a', role: 'throne', kind: 'gold', orientation: 'abc', length: -5, width: 'depth - 2*t', thickness: Number.NaN, position: { x: -12.5, y: 'a + 1', z: null }, visibleFaces: ['top', 'top', 'inside'], color: 'red' }],
    }, options)!
    const part = project.parts[0]!
    expect(part).toMatchObject({ role: 'other', kind: 'solid', orientation: 'xyz' satisfies PartOrientation, length: 0, width: 'depth - 2*t', thickness: 20 })
    expect(part.position).toEqual({ x: -12.5, y: 'a + 1', z: 0 })
    expect(part.visibleFaces).toEqual(['top'])
    expect(part.color).toBeUndefined()
    expect(part.speciesId).toBe('walnut')
  })

  it('caps very long expressions and keeps sheet and hardware fields', () => {
    const project = normalizeFurnitureProject({
      parts: [
        { id: 's', kind: 'sheet', sheetMaterialId: 'ply', length: 'x'.repeat(500) },
        { id: 'h', kind: 'hardware', hardwareName: 'Drawer slide', color: '#123abc' },
      ],
    }, options)!
    const [sheet, hardware] = project.parts as [FurniturePart, FurniturePart]
    expect(sheet.sheetMaterialId).toBe('ply')
    expect(sheet.speciesId).toBeUndefined()
    expect((sheet.length as string).length).toBe(200)
    expect(hardware).toMatchObject({ kind: 'hardware', hardwareName: 'Drawer slide', color: '#123abc' })
    expect(hardware.speciesId).toBeUndefined()
  })

  it('drops relationships and joints it cannot represent, and keeps valid ones', () => {
    const project = normalizeFurnitureProject({
      relationships: [
        { kind: 'face', partId: 'a', face: 'top', target: { partId: 'b', face: 'top' } },
        { kind: 'face', partId: 'a', face: 'up', target: { partId: 'b', face: 'top' } },
        { kind: 'center', partId: 'a', axis: 'x', targetId: 'b', offset: -3 },
        { kind: 'center', partId: 'a', axis: 'w', targetId: 'b' },
        { kind: 'between', partId: 'a', axis: 'z', from: { partId: 'b', face: 'top' }, to: { partId: 'c', face: 'bottom' } },
        { kind: 'between', partId: 'a', axis: 'z', from: { partId: 'b', face: 'top' } },
        { kind: 'distribute', partIds: ['a', 'b'], axis: 'z', from: { partId: 'c', face: 'top' }, to: { partId: 'd', face: 'bottom' } },
        { kind: 'distribute', partIds: [], axis: 'z', from: { partId: 'c', face: 'top' }, to: { partId: 'd', face: 'bottom' } },
        { kind: 'orbit', partId: 'a' },
      ],
      joints: [
        { kind: 'dado', partId: 'a', targetId: 'b', params: { depth: 6, width: -1, count: 2.5 } },
        { kind: 'screw', partId: 'a', targetId: 'b', params: { count: 4 } },
        { kind: 'weld', partId: 'a', targetId: 'b' },
        { kind: 'dowel', partId: 'a' },
      ],
    }, options)!
    expect(project.relationships.map(r => r.kind)).toEqual(['face', 'center', 'between', 'distribute'])
    expect(project.relationships[0]).toMatchObject({ offset: 0 })
    expect(project.relationships[1]).toMatchObject({ offset: -3 })
    expect(project.joints).toHaveLength(2)
    expect(project.joints[0]).toMatchObject({ kind: 'dado', glue: true, params: { depth: 6 } })
    expect(project.joints[1]).toMatchObject({ kind: 'screw', glue: false, params: { count: 4 } })
  })

  it('coerces parameters, subassemblies, and sheet materials', () => {
    const project = normalizeFurnitureProject({
      templateId: 'table',
      maxBoardWidth: -1,
      parameters: [{ id: 'p', name: 'width', value: '2 * leg' }, { label: 'Odd' }],
      subassemblies: [{ name: 'Frame', partIds: ['a', 3], childIds: 'x' }],
      sheetMaterials: [{ name: 'MDF', thickness: 0, pricePerSheet: -4, grain: 'none', color: 'beige' }],
    }, options)!
    expect(project.templateId).toBe('table')
    expect(project.maxBoardWidth).toBe(DEFAULT_MAX_BOARD_WIDTH)
    expect(project.parameters[0]).toMatchObject({ id: 'p', name: 'width', label: 'width', value: '2 * leg' })
    expect(project.parameters[1]).toMatchObject({ name: 'param', label: 'Odd', value: 0 })
    expect(project.subassemblies[0]).toMatchObject({ name: 'Frame', label: '', partIds: ['a'], childIds: [] })
    expect(project.sheetMaterials[0]).toMatchObject({ name: 'MDF', thickness: 18, pricePerSheet: 0, grain: 'none', color: '#d9c08f', sheetLength: 2440, sheetWidth: 1220 })
  })
})

describe('normalizeData furniture', () => {
  it('keeps furniture projects and drops entries that are not records', () => {
    const data = normalizeData({ shops: [], boards: [], furniture: [tableProject(), 'junk', null] as unknown as FurnitureProject[] })
    expect(data.furniture).toHaveLength(1)
    expect(data.furniture[0]).toEqual(tableProject())
  })

  it('gives older data an empty furniture list', () => {
    expect(normalizeData({ schemaVersion: 2, shops: [], boards: [] }).furniture).toEqual([])
  })
})

describe('remapMissingSpecies', () => {
  const project = tableProject()
  const species = (p: FurnitureProject) => [...new Set(p.parts.map(part => part.speciesId))]

  it('returns the project untouched when every species exists', () => {
    const ids = species(project).filter((id): id is string => id !== undefined)
    expect(remapMissingSpecies(project, ids)).toBe(project)
  })
  it('points parts with a missing species at the first available wood', () => {
    const remapped = remapMissingSpecies(project, ['ash', 'elm'])
    expect(species(remapped)).toEqual(['ash'])
  })
  it('keeps species that still exist', () => {
    const [keep] = species(project)
    const remapped = remapMissingSpecies(project, ['ash', ...(keep ? [keep] : [])])
    expect(species(remapped)).toContain(keep)
  })
  it('leaves the project for validation to report when there are no woods', () => {
    expect(remapMissingSpecies(project, [])).toBe(project)
  })
})
