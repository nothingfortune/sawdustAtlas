import { describe, expect, it } from 'vitest'
import { boardPartMarks, sliceLetter } from '../src/domain/instructions/boardMarking'
import { calculateEndGrainMetrics } from '../src/domain/boardGeometry'
import type { BoardProject } from '../src/types'

const allowances = { jointing: 0, planing: 0, routerTable: 0, ripAllowance: 0, lengthTrim: 0, widthTrim: 0 }

function board(patch: Partial<BoardProject> = {}, endGrain: Partial<BoardProject['endGrain']> = {}): BoardProject {
  return {
    id: 'b1', name: 'Test', length: 400, thickness: 40, construction: 'end', allowances, updatedAt: '2026-01-01T00:00:00.000Z',
    endGrain: { sourceLength: 400, stockThickness: 40, sliceThickness: 40, kerf: 3, trimAllowance: 10, rowFlips: [], rowRotations: [], rowOffsets: [], ...endGrain },
    strips: [
      { id: 'st-a', speciesId: 'maple', width: 40, trailingAngle: 0 },
      { id: 'st-b', speciesId: 'walnut', width: 40, trailingAngle: 0 },
      { id: 'st-c', speciesId: 'maple', width: 40, trailingAngle: 0 },
    ],
    ...patch,
  }
}

describe('sliceLetter', () => {
  it.each([
    [0, 'A'], [1, 'B'], [25, 'Z'], [26, 'AA'], [27, 'AB'], [51, 'AZ'], [52, 'BA'], [701, 'ZZ'], [702, 'AAA'],
  ])('%i -> %s', (index, letter) => {
    expect(sliceLetter(index)).toBe(letter)
  })

  it('clamps negative and non-finite input to A', () => {
    expect(sliceLetter(-5)).toBe('A')
    expect(sliceLetter(Number.NaN)).toBe('A')
  })
})

describe('boardPartMarks', () => {
  it('labels strips S1..Sn in design order with their species', () => {
    const marks = boardPartMarks(board())
    expect(marks.strips.map(s => s.label)).toEqual(['S1', 'S2', 'S3'])
    expect(marks.strips.map(s => s.stripId)).toEqual(['st-a', 'st-b', 'st-c'])
    expect(marks.strips.map(s => s.speciesId)).toEqual(['maple', 'walnut', 'maple'])
    expect(marks.panelLabel).toBe('P1')
    expect(marks.boardLabel).toBe('B1')
    expect(marks.referenceMark.length).toBeGreaterThan(0)
  })

  it('edge grain has no slices', () => {
    expect(boardPartMarks(board({ construction: 'edge' })).slices).toEqual([])
  })

  it('end grain with identity order places slice N at position N', () => {
    const project = board()
    const metrics = calculateEndGrainMetrics(project)
    const marks = boardPartMarks(project, metrics)
    expect(metrics.sliceCount).toBeGreaterThan(2)
    expect(marks.slices).toHaveLength(metrics.sliceCount)
    marks.slices.forEach((slice, i) => {
      expect(slice.physicalIndex).toBe(i)
      expect(slice.position).toBe(i)
      expect(slice.label).toBe(sliceLetter(i))
      expect(slice.rotated).toBe(false)
      expect(slice.flipped).toBe(false)
    })
  })

  it('computes metrics itself when none are passed', () => {
    const project = board()
    expect(boardPartMarks(project).slices).toEqual(boardPartMarks(project, calculateEndGrainMetrics(project)).slices)
  })

  it('permuted rowOrder maps physical slices to assembled positions, transforms indexed by position', () => {
    const project = board({}, { rowOrder: [2, 0, 1], rowRotations: [true, false, false], rowFlips: [false, false, true] })
    const marks = boardPartMarks(project, { ...calculateEndGrainMetrics(project), sliceCount: 3 })
    // Position 0 holds physical C (rotated), position 1 holds A, position 2 holds B (flipped).
    expect(marks.slices.map(s => [s.label, s.position, s.rotated, s.flipped])).toEqual([
      ['A', 1, false, false],
      ['B', 2, false, true],
      ['C', 0, true, false],
    ])
  })

  it('every physical slice appears exactly once even with a partial rowOrder', () => {
    const project = board({}, { rowOrder: [1] })
    const marks = boardPartMarks(project, { ...calculateEndGrainMetrics(project), sliceCount: 4 })
    expect(marks.slices.map(s => s.physicalIndex)).toEqual([0, 1, 2, 3])
    expect(new Set(marks.slices.map(s => s.position)).size).toBe(4)
    expect(marks.slices.find(s => s.physicalIndex === 1)?.position).toBe(0)
  })
})
