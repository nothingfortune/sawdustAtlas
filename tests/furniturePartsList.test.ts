import { describe, expect, it } from 'vitest'
import { DEFAULT_ALLOWANCES } from '../src/domain/boardAllowances'
import { resolveFurniture } from '../src/domain/furniture/geometry'
import { SHEET_WASTE_FACTOR, partsList } from '../src/domain/furniture/partsList'
import type { FurniturePart, FurnitureProject, FurniturePartsList } from '../src/domain/furniture/types'
import { toBoardFeet } from '../src/domain/units'
import { bookcaseProject, furnitureContext, parametricBookcaseProject, parametricTableProject, tableProject } from './fixtures/furniture'

const context = furnitureContext()

function listOf(project: FurnitureProject): FurniturePartsList {
  return partsList(resolveFurniture(project, context), context)
}

// One board foot is 144 cubic inches, written out here so the tests do not lean on the
// constant in units.ts.
const BOARD_FOOT_MM3 = 144 * 25.4 ** 3

function line(list: FurniturePartsList, partId: string) {
  const found = list.lines.find(candidate => candidate.partIds.includes(partId))
  if (!found) throw new Error(`no line for ${partId}`)
  return found
}

function price(speciesId: string): number {
  return context.woods.find(wood => wood.id === speciesId)!.pricePerBoardFoot
}

describe('partsList: table', () => {
  const list = listOf(tableProject())

  it('groups the four legs into one line with rough size from the shop allowances', () => {
    const legs = line(list, 'leg-fl')
    expect(legs.partIds).toEqual(['leg-fl', 'leg-fr', 'leg-bl', 'leg-br'])
    expect(legs.labels).toEqual(['L1', 'L2', 'L3', 'L4'])
    expect(legs.quantity).toBe(4)
    expect(legs.name).toBe('Leg')
    expect(legs.allowances).toEqual([])
    expect(DEFAULT_ALLOWANCES).toMatchObject({ jointing: 1.5, planing: 1.5, ripAllowance: 3.2, lengthTrim: 12 })
    expect(legs.rough!.thickness).toBe(48)
    expect(legs.rough!.width).toBeCloseTo(48.2, 12)
    expect(legs.rough!.length).toBe(737)
    expect(legs.boardFeet).toBeCloseTo(4 * 737 * 48.2 * 48 / BOARD_FOOT_MM3, 12)
    expect(legs.panel).toBeUndefined()
  })

  it('groups aprons by cut size, which includes the tenons', () => {
    const front = line(list, 'apron-front')
    expect(front.partIds).toEqual(['apron-front', 'apron-back'])
    expect(front.modeled.length).toBe(1060)
    expect(front.cut).toEqual({ length: 1120, width: 100, thickness: 20 })
    expect(front.allowances.map(allowance => allowance.amount)).toEqual([30, 30])
    expect(line(list, 'apron-left').cut.length).toBe(620)
    expect(line(list, 'apron-left')).not.toBe(front)
  })

  it('makes the top a five-board edge-glued panel', () => {
    const top = line(list, 'top')
    expect(top.panel).toEqual({ boards: 5, boardWidth: 140 })
    // 700 wide + 6 trim + 5 boards x 3.2 rip allowance.
    expect(top.rough!.width).toBeCloseTo(722, 12)
    expect(top.rough!.length).toBe(1212)
    expect(top.rough!.thickness).toBe(28)
    expect(top.boardFeet).toBeCloseTo(1212 * 722 * 28 / BOARD_FOOT_MM3, 12)
  })

  it('totals board feet and cost per species, independently computed', () => {
    const legs = 4 * 737 * 48.2 * 48
    const frontAprons = 2 * 1132 * 103.2 * 23
    const sideAprons = 2 * 632 * 103.2 * 23
    const maple = (legs + frontAprons + sideAprons) / BOARD_FOOT_MM3
    const walnut = 1212 * 722 * 28 / BOARD_FOOT_MM3
    expect(list.species.map(entry => entry.speciesId)).toEqual(['maple', 'walnut'])
    expect(list.species[0]!.boardFeet).toBeCloseTo(maple, 10)
    expect(list.species[0]!.name).toBe('Hard maple')
    expect(list.species[0]!.cost).toBeCloseTo(maple * price('maple'), 8)
    expect(list.species[1]!.boardFeet).toBeCloseTo(walnut, 10)
    expect(list.species[1]!.cost).toBeCloseTo(walnut * price('walnut'), 8)
    expect(list.totalCost).toBeCloseTo(maple * price('maple') + walnut * price('walnut'), 8)
    expect(list.sheets).toEqual([])
  })

  it('takes board feet through toBoardFeet', () => {
    expect(list.lines[0]!.boardFeet).toBeCloseTo(list.lines[0]!.quantity * toBoardFeet(list.lines[0]!.rough!.length * list.lines[0]!.rough!.width * list.lines[0]!.rough!.thickness), 12)
  })

  it('merges joint hardware', () => {
    expect(list.hardware).toEqual([{ key: 'tabletop-fastener', name: 'Tabletop fastener', quantity: 10, sourceIds: ['tf-front', 'tf-back', 'tf-left', 'tf-right'] }])
  })

  it('states its assumptions in plain words', () => {
    expect(list.assumptions.length).toBeGreaterThan(2)
    expect(list.assumptions.join(' ')).toContain('edge-glued')
    expect(list.assumptions.join(' ')).not.toContain('estimate')
  })

  it('orders lines by material, then role, then size', () => {
    expect(list.lines.map(entry => entry.key)).toEqual([
      'solid:maple:1120x100x20',
      'solid:maple:620x100x20',
      'solid:maple:725x45x45',
      'solid:walnut:1200x700x25',
    ])
  })
})

describe('partsList: bookcase', () => {
  const list = listOf(bookcaseProject())

  it('keeps sheet parts as sheet lines with no rough size', () => {
    expect(list.lines.every(entry => entry.kind === 'sheet' && entry.rough === null && entry.boardFeet === 0)).toBe(true)
    const shelves = line(list, 'shelf-1')
    expect(shelves.partIds).toEqual(['bottom', 'top', 'shelf-1', 'shelf-2', 'shelf-3'])
    expect(shelves.name).toBe('Bottom, Top, Shelf')
    expect(shelves.cut).toEqual({ length: 776, width: 294, thickness: 18 })
  })

  it('estimates sheets from cut area plus the waste factor', () => {
    expect(SHEET_WASTE_FACTOR).toBeCloseTo(0.15, 12)
    const area18 = 5 * 776 * 294 + 2 * 1800 * 300
    const area6 = 1800 * 776
    expect(list.sheets).toHaveLength(2)
    const thick = list.sheets.find(entry => entry.sheetMaterialId === 'birch-ply-18')!
    const thin = list.sheets.find(entry => entry.sheetMaterialId === 'birch-ply-6')!
    expect(thick.partArea).toBe(area18)
    expect(thick.sheets).toBe(Math.ceil(area18 * 1.15 / (2440 * 1220)))
    expect(thick.sheets).toBe(1)
    expect(thick.cost).toBe(95)
    expect(thin.partArea).toBe(area6)
    expect(thin.sheets).toBe(1)
    expect(thin.cost).toBe(45)
    expect(list.totalCost).toBe(140)
    expect(list.species).toEqual([])
  })

  it('rounds the sheet count up and prices it', () => {
    const project = bookcaseProject()
    const source = project.parts.find(candidate => candidate.id === 'shelf-1')!
    for (let n = 0; n < 4; n++) project.parts.push({ ...source, id: `extra-${n}`, label: `X${n}`, position: { ...source.position } })
    const thick = listOf(project).sheets.find(entry => entry.sheetMaterialId === 'birch-ply-18')!
    const area = 9 * 776 * 294 + 2 * 1800 * 300
    expect(thick.sheets).toBe(Math.ceil(area * 1.15 / (2440 * 1220)))
    expect(thick.sheets).toBe(2)
    expect(thick.cost).toBe(190)
  })

  it('lists screws from the joints and no panel or species totals', () => {
    expect(list.hardware.map(entry => [entry.key, entry.quantity])).toEqual([['screw:4', 8]])
    expect(list.lines.some(entry => entry.panel)).toBe(false)
    expect(list.assumptions.join(' ')).toContain('estimate')
  })
})

describe('partsList: hardware parts and missing materials', () => {
  function hardwarePart(id: string, name?: string): FurniturePart {
    return {
      id, label: id.toUpperCase(), name: `Slide ${id}`, role: 'hardware', kind: 'hardware', length: 400, width: 12, thickness: 40, orientation: 'yxz',
      position: { x: 0, y: 0, z: 0 }, visibleFaces: [], ...(name ? { hardwareName: name } : {}),
    }
  }

  it('merges hardware parts by name and keeps them out of the lines', () => {
    const project = tableProject()
    project.parts.push(hardwarePart('hw-1', 'Drawer slide'), hardwarePart('hw-2', 'Drawer slide'), hardwarePart('hw-3'))
    const list = listOf(project)
    expect(list.hardware.map(entry => [entry.key, entry.quantity])).toEqual([['tabletop-fastener', 10], ['hardware:Drawer slide', 2], ['hardware:Slide hw-3', 1]])
    expect(list.hardware[1]!.sourceIds).toEqual(['hw-1', 'hw-2'])
    expect(list.lines.flatMap(entry => entry.partIds)).not.toContain('hw-1')
  })

  it('keeps a part with an unknown species in a line at zero cost', () => {
    const project = tableProject()
    project.parts.find(candidate => candidate.id === 'top')!.speciesId = 'unobtainium'
    const list = listOf(project)
    const top = line(list, 'top')
    expect(top.materialName).toBe('unobtainium')
    expect(list.species.find(entry => entry.speciesId === 'unobtainium')!.cost).toBe(0)
    const none = tableProject()
    delete none.parts.find(candidate => candidate.id === 'top')!.speciesId
    expect(line(listOf(none), 'top').materialName).toBe('Unassigned material')
  })

  it('keeps a sheet part with an unknown material but cannot estimate its sheets', () => {
    const project = bookcaseProject()
    project.sheetMaterials = project.sheetMaterials.filter(material => material.id !== 'birch-ply-6')
    const list = listOf(project)
    expect(line(list, 'back').materialName).toBe('birch-ply-6')
    expect(list.sheets.map(entry => entry.sheetMaterialId)).toEqual(['birch-ply-18'])
  })

  it('treats a part wider than the widest board as one board when it fits', () => {
    const project = tableProject()
    project.maxBoardWidth = 700
    expect(line(listOf(project), 'top').panel).toBeUndefined()
    project.maxBoardWidth = 699
    expect(line(listOf(project), 'top').panel).toEqual({ boards: 2, boardWidth: 350 })
  })

  it('leaves parts that failed to resolve out of the list', () => {
    const project = tableProject()
    project.parts.find(candidate => candidate.id === 'leg-fl')!.length = 'nope +'
    const list = listOf(project)
    expect(list.lines.flatMap(entry => entry.partIds)).not.toContain('leg-fl')
    expect(line(list, 'leg-fr').quantity).toBe(3)
  })
})

describe('partsList: determinism', () => {
  it('gives the same lines for the literal and parametric twins', () => {
    expect(listOf(parametricTableProject()).lines).toEqual(listOf(tableProject()).lines)
    expect(listOf(parametricBookcaseProject()).lines).toEqual(listOf(bookcaseProject()).lines)
  })

  it('does not depend on part order for line keys, order, or totals', () => {
    const forward = listOf(tableProject())
    const reversed = tableProject()
    reversed.parts.reverse()
    const backward = listOf(reversed)
    expect(backward.lines.map(entry => entry.key)).toEqual(forward.lines.map(entry => entry.key))
    expect(backward.species.map(entry => entry.speciesId)).toEqual(forward.species.map(entry => entry.speciesId))
    expect(backward.totalCost).toBeCloseTo(forward.totalCost, 9)
  })

  it('is stable across repeated calls', () => {
    expect(listOf(bookcaseProject())).toEqual(listOf(bookcaseProject()))
  })
})

// A small seeded generator keeps the mutations reproducible.
function random(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

function mutate(base: FurnitureProject, next: () => number): FurnitureProject {
  const project = structuredClone(base)
  project.maxBoardWidth = 60 + Math.floor(next() * 300)
  for (const entry of project.parts) {
    if (next() < 0.4) entry.length = (entry.length as number) * (0.5 + next())
    if (next() < 0.4) entry.width = (entry.width as number) * (0.5 + next())
    if (next() < 0.2) entry.thickness = (entry.thickness as number) * (0.5 + next())
  }
  const copies = Math.floor(next() * 4)
  for (let n = 0; n < copies; n++) {
    const source = project.parts[Math.floor(next() * project.parts.length)]!
    project.parts.push({ ...structuredClone(source), id: `copy-${n}`, label: `C${n}` })
  }
  if (next() < 0.3) project.parts.splice(Math.floor(next() * project.parts.length), 1)
  return project
}

describe('partsList: reconciliation invariant', () => {
  function assertReconciles(project: FurnitureProject): void {
    const resolved = resolveFurniture(project, context)
    const list = partsList(resolved, context)
    const counted = resolved.parts.filter(entry => entry.part.kind !== 'hardware')
    const listed = list.lines.flatMap(entry => entry.partIds)
    expect([...listed].sort()).toEqual(counted.map(entry => entry.id).sort())
    expect(new Set(listed).size).toBe(listed.length)
    expect(list.lines.reduce((total, entry) => total + entry.quantity, 0)).toBe(counted.length)
    for (const entry of list.lines) {
      expect(entry.partIds).toHaveLength(entry.quantity)
      expect(entry.labels).toHaveLength(entry.quantity)
      if (entry.kind !== 'solid') continue
      const cutBoardFeet = toBoardFeet(entry.cut.length * entry.cut.width * entry.cut.thickness) * entry.quantity
      expect(entry.boardFeet).toBeGreaterThanOrEqual(cutBoardFeet)
    }
    expect(new Set(list.lines.map(entry => entry.key)).size).toBe(list.lines.length)
    const speciesFeet = list.species.reduce((total, entry) => total + entry.boardFeet, 0)
    expect(speciesFeet).toBeCloseTo(list.lines.reduce((total, entry) => total + entry.boardFeet, 0), 9)
  }

  it.each([
    ['table', tableProject],
    ['parametric table', parametricTableProject],
    ['bookcase', bookcaseProject],
    ['parametric bookcase', parametricBookcaseProject],
  ])('holds for the %s fixture', (_name, build) => {
    assertReconciles(build())
  })

  it('holds over mutated fixtures', () => {
    const next = random(20261010)
    for (let run = 0; run < 60; run++) {
      assertReconciles(mutate(run % 2 === 0 ? tableProject() : bookcaseProject(), next))
    }
  })
})
