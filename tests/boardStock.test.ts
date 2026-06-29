import { describe, expect, it } from 'vitest'
import { calculateStockRequirements } from '../src/domain/boardStock'
import { DEFAULT_ALLOWANCES, calculateBuildDimensions } from '../src/domain/boardAllowances'
import { calculateEndGrainMetrics } from '../src/domain/boardGeometry'
import type { BoardProject, WoodSpecies } from '../src/types'

const woods: WoodSpecies[] = [
  { id: 'walnut', name: 'Walnut', color: '#5a3828', accent: '#87614a', pricePerBoardFoot: 12 },
  { id: 'maple', name: 'Maple', color: '#dbc59b', accent: '#f0dfb9', pricePerBoardFoot: 8 },
]
const base = (over: Partial<BoardProject> = {}): BoardProject => ({
  id: 'b', name: 'B', length: 450, thickness: 38, construction: 'edge', updatedAt: '',
  endGrain: { sourceLength: 900, stockThickness: 38, sliceThickness: 45, kerf: 3.2, trimAllowance: 20, rowFlips: [], rowRotations: [] },
  allowances: { ...DEFAULT_ALLOWANCES }, strips: [], ...over,
})
const reqOf = (project: BoardProject) => {
  const metrics = calculateEndGrainMetrics(project)
  return calculateStockRequirements(project, woods, calculateBuildDimensions(project, metrics), metrics)
}

describe('calculateStockRequirements', () => {
  it('groups strips of equal rough rip width and adds the rip allowance', () => {
    // 4 identical strips: the two interior strips share a rough width (group of 2); the
    // two outer strips are each a hair wider (width-trim is split across the outer edges).
    const project = base({ strips: [
      { id: '1', speciesId: 'walnut', width: 40, trailingAngle: 0 },
      { id: '2', speciesId: 'walnut', width: 40, trailingAngle: 0 },
      { id: '3', speciesId: 'walnut', width: 40, trailingAngle: 0 },
      { id: '4', speciesId: 'walnut', width: 40, trailingAngle: 0 },
    ] })
    const r = reqOf(project)
    expect(r.ripGroups.reduce((total, g) => total + g.count, 0)).toBe(4) // every strip accounted for
    expect(r.ripGroups.some(g => g.count === 2)).toBe(true)               // the interior pair groups
    expect(r.ripGroups.every(g => g.roughRipWidthMm > 40)).toBe(true)     // rip allowance added
  })

  it('end-grain angled strips need a wider rough rip than the same edge-grain strip', () => {
    const strip = { id: '1', speciesId: 'walnut', width: 40, trailingAngle: 30 }
    const edge = reqOf(base({ construction: 'edge', strips: [strip] })).ripGroups[0]!
    const end = reqOf(base({ construction: 'end', strips: [strip] })).ripGroups[0]!
    expect(end.roughRipWidthMm).toBeGreaterThan(edge.roughRipWidthMm)
  })

  it('reports per-species purchased board-feet that sum to the total', () => {
    const project = base({ strips: [
      { id: '1', speciesId: 'walnut', width: 40, trailingAngle: 0 },
      { id: '2', speciesId: 'maple', width: 40, trailingAngle: 0 },
    ] })
    const r = reqOf(project)
    expect(r.species.length).toBe(2)
    const sum = r.species.reduce((t, s) => t + s.purchasedBoardFeet, 0)
    expect(r.totalPurchasedBoardFeet).toBeCloseTo(sum, 6)
    expect(r.species.every(s => s.purchasedBoardFeet >= s.finishedBoardFeet)).toBe(true)
  })

  it('includes kerf + slice thickness in assumptions only for end-grain', () => {
    const strips = [{ id: '1', speciesId: 'walnut', width: 40, trailingAngle: 0 }]
    expect(reqOf(base({ construction: 'end', strips })).assumptions.sliceThicknessMm).toBeGreaterThan(0)
    expect(reqOf(base({ construction: 'edge', strips })).assumptions).not.toHaveProperty('sliceThicknessMm')
  })

  it('degrades an unknown wood id to the id and a neutral color instead of throwing', () => {
    const r = reqOf(base({ strips: [{ id: '1', speciesId: 'ghost', width: 40, trailingAngle: 0 }] }))
    const group = r.ripGroups.find(g => g.speciesId === 'ghost')!
    expect(group.speciesName).toBe('ghost')
    expect(typeof group.color).toBe('string')
  })
})
