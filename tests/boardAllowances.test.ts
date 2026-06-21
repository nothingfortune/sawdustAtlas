import { describe, expect, it } from 'vitest'
import { DEFAULT_ALLOWANCES, calculateBuildDimensions } from '../src/domain/boardAllowances'
import { calculateEndGrainMetrics } from '../src/domain/boardGeometry'
import type { BoardProject, BoardStrip, BuildAllowances } from '../src/types'

const allowances: BuildAllowances = {
  jointing: 2,
  planing: 1,
  drumSanding: 1.5,
  ripAllowance: 3,
  lengthTrim: 10,
  widthTrim: 6,
}

function makeProject(overrides: Partial<BoardProject> = {}, strips: BoardStrip[] = [
  { id: 'a', speciesId: 'walnut', width: 40, trailingAngle: 0 },
  { id: 'b', speciesId: 'maple', width: 20, trailingAngle: 0 },
]): BoardProject {
  return {
    id: 'project',
    name: 'Test board',
    length: 450,
    thickness: 38,
    construction: 'edge',
    strips,
    updatedAt: '2026-01-01T00:00:00.000Z',
    allowances,
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

describe('edge-grain build allowances', () => {
  it('adds each allowance to the matching finished dimension', () => {
    const build = calculateBuildDimensions(makeProject())
    expect(build.length.finished).toBe(450)
    expect(build.length.rough).toBe(450 + 10)
    expect(build.width.finished).toBe(60)
    // two strips of rip allowance plus the panel width trim
    expect(build.width.rough).toBe(60 + 2 * 3 + 6)
    expect(build.thickness.finished).toBe(38)
    expect(build.thickness.rough).toBe(38 + 2 + 1 + 1.5)
  })

  it('rips each strip oversized by the rip allowance', () => {
    const build = calculateBuildDimensions(makeProject())
    expect(build.stripRoughWidths).toEqual([43, 23])
  })

  it('rough stock always exceeds the finished part volume', () => {
    const build = calculateBuildDimensions(makeProject())
    expect(build.roughBoardFeet).toBeGreaterThan(build.finishedBoardFeet)
    expect(build.removedBoardFeet).toBeCloseTo(build.roughBoardFeet - build.finishedBoardFeet, 12)
  })

  it('collapses to the finished part when every allowance is zero', () => {
    const zero: BuildAllowances = { jointing: 0, planing: 0, drumSanding: 0, ripAllowance: 0, lengthTrim: 0, widthTrim: 0 }
    const build = calculateBuildDimensions(makeProject({ allowances: zero }))
    expect(build.length.rough).toBe(build.length.finished)
    expect(build.width.rough).toBe(build.width.finished)
    expect(build.thickness.rough).toBe(build.thickness.finished)
    expect(build.removedBoardFeet).toBeCloseTo(0, 12)
  })

  it('treats missing allowances as the documented defaults', () => {
    const project = makeProject()
    delete (project as { allowances?: BuildAllowances }).allowances
    const build = calculateBuildDimensions(project)
    expect(build.thickness.rough).toBe(38 + DEFAULT_ALLOWANCES.jointing + DEFAULT_ALLOWANCES.planing + DEFAULT_ALLOWANCES.drumSanding)
  })

  it('ignores negative inputs instead of shrinking rough stock', () => {
    const build = calculateBuildDimensions(makeProject({ allowances: { ...allowances, lengthTrim: -50 } }))
    expect(build.length.rough).toBe(build.length.finished)
  })
})

describe('end-grain build allowances', () => {
  it('reports finished dimensions from the geometry engine', () => {
    const project = makeProject({ construction: 'end' })
    const metrics = calculateEndGrainMetrics(project)
    const build = calculateBuildDimensions(project)
    expect(build.length.finished).toBe(metrics.finalLength)
    expect(build.width.finished).toBeCloseTo(metrics.finishedWidth, 10)
    expect(build.thickness.finished).toBe(project.endGrain.sliceThickness)
    expect(build.thickness.rough).toBe(project.endGrain.sliceThickness + 2 + 1 + 1.5)
  })

  it('defers board-feet to the geometry engine for end grain', () => {
    const project = makeProject({ construction: 'end' })
    const metrics = calculateEndGrainMetrics(project)
    const build = calculateBuildDimensions(project)
    expect(build.roughBoardFeet).toBe(metrics.sourceBoardFeet)
    expect(build.finishedBoardFeet).toBe(metrics.finishedBoardFeet)
  })
})
