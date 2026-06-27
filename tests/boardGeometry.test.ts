import { describe, expect, it } from 'vitest'
import { buildEndGrainTemplate, calculateEndGrainMetrics, calculateWoodUsage } from '../src/domain/boardGeometry'
import type { BoardProject, BoardStrip, WoodSpecies } from '../src/types'

const woods: readonly WoodSpecies[] = [
  { id: 'walnut', name: 'Walnut', color: '#543', accent: '#765', pricePerBoardFoot: 12 },
  { id: 'maple', name: 'Maple', color: '#dc9', accent: '#edb', pricePerBoardFoot: 9 },
]

function makeProject(overrides: Partial<BoardProject> = {}, strips: BoardStrip[] = [{ id: 'a', speciesId: 'walnut', width: 50, trailingAngle: 0 }]): BoardProject {
  return {
    id: 'project',
    name: 'Test board',
    length: 450,
    thickness: 40,
    construction: 'end',
    strips,
    updatedAt: '2026-01-01T00:00:00.000Z',
    allowances: { jointing: 1.5, planing: 1.5, routerTable: 1.5, ripAllowance: 3.2, lengthTrim: 12, widthTrim: 6 },
    endGrain: {
      sourceLength: 96,
      stockThickness: 40,
      sliceThickness: 30,
      kerf: 3,
      trimAllowance: 0,
      rowFlips: [],
      rowRotations: [],
    },
    ...overrides,
  }
}

describe('end-grain crosscut geometry', () => {
  it('fits the last slice when the stock length is exactly consumed', () => {
    const metrics = calculateEndGrainMetrics(makeProject())
    expect(metrics.sliceCount).toBe(3)
    expect(metrics.kerfWaste).toBe(6)
    expect(metrics.offcutWaste).toBeCloseTo(0, 10)
    expect(metrics.finalLength).toBe(120)
  })

  it('does not claim a slice when the stock is just short', () => {
    const project = makeProject()
    project.endGrain.sourceLength = 95.999
    const metrics = calculateEndGrainMetrics(project)
    // A third slice would need 3*30 + 2*3 = 96 mm, just over the 95.999 mm stock.
    expect(metrics.sliceCount).toBe(2)
  })

  it('reserves a final kerf when an offcut must be separated', () => {
    const project = makeProject()
    project.endGrain.sourceLength = 65
    const metrics = calculateEndGrainMetrics(project)
    expect(metrics.sliceCount).toBe(1)
    expect(metrics.crosscutCount).toBe(1)
    expect(metrics.kerfWaste).toBe(3)
    expect(metrics.offcutWaste).toBe(32)
  })

  it('handles a zero-kerf theoretical cut without a phantom loss', () => {
    const project = makeProject()
    project.endGrain.sourceLength = 90
    project.endGrain.kerf = 0
    const metrics = calculateEndGrainMetrics(project)
    expect(metrics.sliceCount).toBe(3)
    expect(metrics.totalWasteBoardFeet).toBeCloseTo(0, 12)
  })
})

describe('angled strip geometry', () => {
  it('uses the smaller face as the square finished width', () => {
    const project = makeProject({}, [{ id: 'a', speciesId: 'walnut', width: 50, trailingAngle: 45 }])
    project.endGrain.stockThickness = 20
    const template = buildEndGrainTemplate(project)
    expect(template.leftFaceWidth).toBeCloseTo(50, 10)
    expect(template.rightFaceWidth).toBeCloseTo(70, 10)
    expect(template.finishedWidth).toBeCloseTo(50, 10)
    expect(template.faceShift).toBeCloseTo(20, 10)
  })

  it('recognizes angles that balance back to a square panel', () => {
    const strips: BoardStrip[] = [
      { id: 'a', speciesId: 'walnut', width: 50, trailingAngle: 45 },
      { id: 'b', speciesId: 'maple', width: 50, trailingAngle: -45 },
    ]
    const project = makeProject({}, strips)
    project.endGrain.stockThickness = 20
    const template = buildEndGrainTemplate(project)
    expect(template.faceShift).toBeCloseTo(0, 10)
    expect(template.finishedWidth).toBeCloseTo(100, 10)
    expect(template.errors).toEqual([])
  })

  it('rejects a trailing angle that makes a strip cross itself', () => {
    const project = makeProject({}, [{ id: 'a', speciesId: 'walnut', width: 10, trailingAngle: -45 }])
    project.endGrain.stockThickness = 20
    expect(buildEndGrainTemplate(project).errors).toHaveLength(1)
  })

  it('reports only the real crossing error, not a spurious conservation failure (C2)', () => {
    const project = makeProject({}, [{ id: 'a', speciesId: 'walnut', width: 10, trailingAngle: -45 }])
    project.endGrain.stockThickness = 20
    const metrics = calculateEndGrainMetrics(project)
    expect(metrics.errors.some(error => error.includes('closes or crosses'))).toBe(true)
    expect(metrics.errors.some(error => error.toLowerCase().includes('conservation'))).toBe(false)
  })

  it('conserves volume for valid angled designs (C2 / TEST6)', () => {
    for (let index = 1; index <= 120; index += 1) {
      const angle = (index % 2 ? 1 : -1) * (5 + index % 35)
      const project = makeProject({}, [
        { id: 'a', speciesId: 'walnut', width: 40 + index % 30, trailingAngle: angle },
        { id: 'b', speciesId: 'maple', width: 40 + index % 30, trailingAngle: -angle },
      ])
      project.endGrain.sourceLength = 200 + index * 2.9
      project.endGrain.stockThickness = 18 + index % 22
      project.endGrain.sliceThickness = 9 + index % 31
      project.endGrain.kerf = (index % 7) * 0.5
      const metrics = calculateEndGrainMetrics(project)
      expect(metrics.errors).toEqual([])
      expect(metrics.sourceBoardFeet).toBeCloseTo(metrics.finishedBoardFeet + metrics.totalWasteBoardFeet, 9)
    }
  })
})

describe('material accounting', () => {
  it('reconciles species totals with project totals', () => {
    const project = makeProject({}, [
      { id: 'a', speciesId: 'walnut', width: 35, trailingAngle: 12 },
      { id: 'b', speciesId: 'maple', width: 42, trailingAngle: -12 },
    ])
    const metrics = calculateEndGrainMetrics(project)
    const usage = calculateWoodUsage(project, woods, metrics)
    expect(usage.reduce((sum, item) => sum + item.requiredBoardFeet, 0)).toBeCloseTo(metrics.sourceBoardFeet, 10)
    expect(usage.reduce((sum, item) => sum + item.wasteBoardFeet, 0)).toBeCloseTo(metrics.totalWasteBoardFeet, 10)
  })

  it('splits usage per species and skips strips whose wood is absent from the library', () => {
    const project = makeProject({}, [
      { id: 'a', speciesId: 'walnut', width: 50, trailingAngle: 0 },
      { id: 'b', speciesId: 'ghost', width: 50, trailingAngle: 0 },
    ])
    const metrics = calculateEndGrainMetrics(project)
    const usage = calculateWoodUsage(project, woods, metrics)
    expect(usage.map(item => item.speciesId)).toEqual(['walnut'])
    expect(usage[0]!.requiredBoardFeet).toBeGreaterThan(0)
    expect(usage[0]!.usedBoardFeet).toBeCloseTo(Math.max(0, usage[0]!.requiredBoardFeet - usage[0]!.wasteBoardFeet), 10)
  })

  it('conserves volume over a broad set of rectangular designs', () => {
    for (let index = 1; index <= 250; index += 1) {
      const project = makeProject({}, [
        { id: 'a', speciesId: 'walnut', width: 10 + index % 63, trailingAngle: 0 },
        { id: 'b', speciesId: 'maple', width: 8 + index % 41, trailingAngle: 0 },
      ])
      project.endGrain.sourceLength = 200 + index * 3.17
      project.endGrain.stockThickness = 12 + index % 39
      project.endGrain.sliceThickness = 8 + index % 47
      project.endGrain.kerf = (index % 9) * 0.4
      project.endGrain.trimAllowance = index % 17
      const metrics = calculateEndGrainMetrics(project)
      expect(metrics.errors).toEqual([])
      expect(metrics.sourceBoardFeet).toBeCloseTo(metrics.finishedBoardFeet + metrics.totalWasteBoardFeet, 9)
      const consumed = metrics.sliceCount * project.endGrain.sliceThickness + metrics.crosscutCount * project.endGrain.kerf
      expect(consumed).toBeLessThanOrEqual(project.endGrain.sourceLength - project.endGrain.trimAllowance + 1e-8)
    }
  })

  it('reports the closing-strip error without a spurious conservation error', () => {
    const project = makeProject({}, [{ id: 'a', speciesId: 'walnut', width: 10, trailingAngle: -45 }])
    project.endGrain.stockThickness = 20 // rightWidth = 10 + 20*tan(-45) = -10 -> strip closes
    const metrics = calculateEndGrainMetrics(project)
    expect(metrics.errors.some(error => /closes or crosses/.test(error))).toBe(true)
    expect(metrics.errors.some(error => /conservation/.test(error))).toBe(false)
  })
})

describe('thin / pointed face warnings (P2)', () => {
  it('warns when an angled strip tapers to a thin sliver without closing', () => {
    const project = makeProject({}, [{ id: 'a', speciesId: 'walnut', width: 40, trailingAngle: -40 }])
    project.endGrain.stockThickness = 40 // trailing face = 40 - 40*tan40 ≈ 6.4mm: thin but > 0
    const metrics = calculateEndGrainMetrics(project)
    expect(metrics.errors.some(error => /closes or crosses/.test(error))).toBe(false)
    expect((metrics.warnings ?? []).some(warning => /thin|sliver|point|taper/i.test(warning))).toBe(true)
  })

  it('does not warn for a healthy rectangular board', () => {
    const metrics = calculateEndGrainMetrics(makeProject())
    expect(metrics.warnings ?? []).toEqual([])
  })

  it('does not warn for a gently angled board', () => {
    const project = makeProject({}, [
      { id: 'a', speciesId: 'walnut', width: 40, trailingAngle: 15 },
      { id: 'b', speciesId: 'maple', width: 40, trailingAngle: -15 },
    ])
    project.endGrain.stockThickness = 20 // faces ≈ 40 ± 5.4 → ratio ~0.87, fine
    const metrics = calculateEndGrainMetrics(project)
    expect(metrics.warnings ?? []).toEqual([])
  })
})
