import { describe, expect, it } from 'vitest'
import { summarizeBenchSetup } from '../src/domain/boardBench'
import { DEFAULT_ALLOWANCES, calculateBuildDimensions } from '../src/domain/boardAllowances'
import { calculateEndGrainMetrics } from '../src/domain/boardGeometry'
import { calculateStockRequirements } from '../src/domain/boardStock'
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
const benchOf = (project: BoardProject) => {
  const metrics = calculateEndGrainMetrics(project)
  return summarizeBenchSetup(project, woods, calculateBuildDimensions(project, metrics), metrics)
}

describe('summarizeBenchSetup', () => {
  it('end-grain angled board: rip groups, distinct saw angles, and a crosscut summary', () => {
    const project = base({ construction: 'end', strips: [
      { id: '1', speciesId: 'walnut', width: 40, trailingAngle: 30 },
      { id: '2', speciesId: 'maple', width: 40, trailingAngle: 30 },
      { id: '3', speciesId: 'walnut', width: 40, trailingAngle: -30 },
    ] })
    const metrics = calculateEndGrainMetrics(project)
    const bench = benchOf(project)
    expect(bench.ripGroups.length).toBeGreaterThan(0)
    expect(bench.angles.map(a => a.sawAngleDeg)).toContain(30)
    const plus30 = bench.angles.find(a => a.trailingAngleDeg === 30)!
    expect(plus30.count).toBe(2)
    expect(bench.crosscut).toEqual({ stopBlockMm: 45, slices: metrics.sliceCount, passes: metrics.crosscutCount })
  })

  it('edge-grain board: no crosscut, no angles, but rip groups present', () => {
    const bench = benchOf(base({ construction: 'edge', strips: [
      { id: '1', speciesId: 'walnut', width: 40, trailingAngle: 0 },
      { id: '2', speciesId: 'maple', width: 50, trailingAngle: 0 },
    ] }))
    expect(bench.crosscut).toBeNull()
    expect(bench.angles).toEqual([])
    expect(bench.ripGroups.length).toBeGreaterThan(0)
  })

  it('delegates rip groups and assumptions to calculateStockRequirements (no duplication)', () => {
    const project = base({ construction: 'end', strips: [{ id: '1', speciesId: 'walnut', width: 40, trailingAngle: 0 }] })
    const metrics = calculateEndGrainMetrics(project)
    const stock = calculateStockRequirements(project, woods, calculateBuildDimensions(project, metrics), metrics)
    const bench = summarizeBenchSetup(project, woods, calculateBuildDimensions(project, metrics), metrics)
    expect(bench.ripGroups).toEqual(stock.ripGroups)
    expect(bench.assumptions).toEqual(stock.assumptions)
  })
})
