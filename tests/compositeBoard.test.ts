import { describe, expect, it } from 'vitest'
import { panelPieces, placedFootprint, assembledSize, boardVolumeBySpecies, materialBySpecies } from '../src/domain/compositeBoard'
import { CUBIC_MM_PER_BOARD_FOOT } from '../src/domain/units'
import type { BoardProject, CompositeBoard, CompositePanel, AssemblyCell } from '../src/types'

const board = (over: Partial<BoardProject> = {}): BoardProject => ({
  id: 'b1', name: 'Board', length: 300, thickness: 20, construction: 'edge',
  endGrain: { sourceLength: 900, stockThickness: 20, sliceThickness: 45, kerf: 3, trimAllowance: 20, rowFlips: [], rowRotations: [] },
  allowances: { jointing: 0, planing: 0, routerTable: 0, ripAllowance: 0, lengthTrim: 0, widthTrim: 0 },
  strips: [
    { id: 's1', speciesId: 'maple', width: 30, trailingAngle: 0 },
    { id: 's2', speciesId: 'walnut', width: 10, trailingAngle: 0 },
  ],
  updatedAt: '2026-06-26T00:00:00.000Z', ...over,
})
const panel = (over: Partial<CompositePanel> = {}): CompositePanel => ({ id: 'A', boardId: 'b1', crosscut: { stripWidthMm: 25, kerfMm: 3, count: 4 }, ...over })
const cell = (over: Partial<AssemblyCell> = {}): AssemblyCell => ({ panelId: 'A', pieceIndex: 0, rotate: 0, flip: false, ...over })
const composite = (over: Partial<CompositeBoard> = {}): CompositeBoard => ({
  id: 'c1', name: 'Composite', panels: [panel()], rows: 2, cols: 1,
  cells: [cell({ pieceIndex: 0 }), cell({ pieceIndex: 1 })], updatedAt: '2026-06-26T00:00:00.000Z', ...over,
})

describe('panelPieces (board-backed)', () => {
  it('crosscuts an edge board into N pieces with the strip-stack cross-section', () => {
    const pieces = panelPieces(panel(), [board()])
    expect(pieces).toHaveLength(4)
    expect(pieces[0]).toMatchObject({ panelId: 'A', index: 0, widthMm: 25, heightMm: 40, thicknessMm: 20, construction: 'edge' })
    expect(pieces[0]?.bySpecies).toEqual({ maple: 30 * 25 * 20, walnut: 10 * 25 * 20 })
  })
  it('returns [] when the referenced board is missing', () => {
    expect(panelPieces(panel({ boardId: 'gone' }), [board()])).toEqual([])
  })
  it('marks pieces from an end-grain board with construction "end"', () => {
    const pieces = panelPieces(panel(), [board({ construction: 'end' })])
    expect(pieces[0]?.construction).toBe('end')
  })
})

describe('placedFootprint', () => {
  it('swaps width/height for 90/270', () => {
    const [p] = panelPieces(panel(), [board()])
    expect(placedFootprint(p!, cell({ rotate: 0 }))).toEqual({ widthMm: 25, heightMm: 40 })
    expect(placedFootprint(p!, cell({ rotate: 90 }))).toEqual({ widthMm: 40, heightMm: 25 })
  })
})

describe('assembledSize', () => {
  it('stacks a 2x1 grid: length = sum heights, width = max row width', () => {
    expect(assembledSize(composite(), [board()])).toEqual({ lengthMm: 80, widthMm: 25, thicknessMm: 20 })
  })
})

describe('material accounting', () => {
  it('sums placed-piece volume by species', () => {
    expect(boardVolumeBySpecies(composite(), [board()])).toEqual({ maple: 2 * 30 * 25 * 20, walnut: 2 * 10 * 25 * 20 })
  })
  it('reports board-feet per species, sorted', () => {
    expect(materialBySpecies(composite(), [board()])).toEqual([
      { speciesId: 'maple', boardFeet: (2 * 30 * 25 * 20) / CUBIC_MM_PER_BOARD_FOOT },
      { speciesId: 'walnut', boardFeet: (2 * 10 * 25 * 20) / CUBIC_MM_PER_BOARD_FOOT },
    ])
  })
})
