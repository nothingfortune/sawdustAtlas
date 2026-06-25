import { describe, expect, it } from 'vitest'
import { calculateBuildDimensions } from '../src/domain/boardAllowances'
import { generateCuttingBoardPlan } from '../src/domain/boardCutPlan'
import type { BoardProject, BoardStrip, WoodSpecies } from '../src/types'

const woods: WoodSpecies[] = [
  { id: 'walnut', name: 'Walnut', color: '#543', accent: '#765', pricePerBoardFoot: 12 },
  { id: 'maple', name: 'Maple', color: '#dc9', accent: '#edb', pricePerBoardFoot: 9 },
]

function makeProject(construction: 'edge' | 'end', strips: BoardStrip[]): BoardProject {
  return {
    id: 'project', name: 'Plan test', length: 450, thickness: 38, construction, strips, updatedAt: '2026-01-01T00:00:00.000Z',
    allowances: { jointing: 2, planing: 1, routerTable: 1, ripAllowance: 3, lengthTrim: 10, widthTrim: 6 },
    endGrain: { sourceLength: 96, stockThickness: 40, sliceThickness: 30, kerf: 3, trimAllowance: 0, rowFlips: [], rowRotations: [] },
  }
}

describe('cutting-board stock plan', () => {
  it('reconciles edge-grain BOM stock with rough board feet', () => {
    const project = makeProject('edge', [
      { id: 'a', speciesId: 'walnut', width: 40, trailingAngle: 0 },
      { id: 'b', speciesId: 'maple', width: 20, trailingAngle: 0 },
    ])
    const plan = generateCuttingBoardPlan(project, woods)
    expect(plan.stock.reduce((sum, row) => sum + row.boardFeet, 0)).toBeCloseTo(calculateBuildDimensions(project).roughBoardFeet, 12)
    expect(plan.cuts.filter(cut => cut.stage === 'rip')).toHaveLength(2)
  })

  it('aggregates identical stock requirements by species and dimensions', () => {
    const project = makeProject('edge', [
      { id: 'a', speciesId: 'walnut', width: 40, trailingAngle: 0 },
      { id: 'b', speciesId: 'walnut', width: 40, trailingAngle: 0 },
      { id: 'c', speciesId: 'maple', width: 15, trailingAngle: 0 },
    ])
    project.allowances.widthTrim = 0
    const plan = generateCuttingBoardPlan(project, woods)
    expect(plan.stock.find(row => row.speciesId === 'walnut')?.quantity).toBe(2)
  })

  it('allocates outside-edge trim into stock widths', () => {
    const project = makeProject('edge', [
      { id: 'a', speciesId: 'walnut', width: 40, trailingAngle: 0 },
      { id: 'b', speciesId: 'maple', width: 20, trailingAngle: 0 },
    ])
    const plan = generateCuttingBoardPlan(project, woods)
    expect(plan.stock.map(row => row.width)).toEqual([46, 26])
  })

  it('uses the verified end-grain slice and saw-pass counts', () => {
    const project = makeProject('end', [{ id: 'a', speciesId: 'walnut', width: 50, trailingAngle: 0 }])
    project.endGrain.sourceLength = 65
    const plan = generateCuttingBoardPlan(project, woods)
    const crosscut = plan.cuts.find(cut => cut.stage === 'crosscut')
    expect(crosscut?.quantity).toBe(1)
    expect(crosscut?.passes).toBe(1)
    expect(plan.summary.crosscutPasses).toBe(1)
  })

  it('warns when angled faces require side squaring', () => {
    const project = makeProject('end', [{ id: 'a', speciesId: 'walnut', width: 50, trailingAngle: 45 }])
    expect(generateCuttingBoardPlan(project, woods).warnings.some(warning => warning.includes('side squaring'))).toBe(true)
  })

  it('falls back to default allowances when a board has none (C3)', () => {
    const project = makeProject('edge', [
      { id: 'a', speciesId: 'walnut', width: 40, trailingAngle: 0 },
      { id: 'b', speciesId: 'maple', width: 20, trailingAngle: 0 },
    ])
    delete (project as { allowances?: unknown }).allowances
    const plan = generateCuttingBoardPlan(project, woods)
    expect(plan.cuts.map(cut => cut.note).join(' ')).not.toMatch(/NaN/)
    expect(plan.cuts.find(cut => cut.id === 'trim-length')?.note).toContain('12')
    expect(plan.summary.crosscutPasses).toBe(2)
  })
})
