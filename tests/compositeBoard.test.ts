import { describe, expect, it } from 'vitest'
import { panelPieces, placedFootprint, assembledSize, boardVolumeBySpecies, materialBySpecies, panelSourceLengthMm, stockBySpecies, compositeCutPlan } from '../src/domain/compositeBoard'
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

describe('panelPieces (board-backed, true end-grain wafer)', () => {
  it('crosscuts a board into wafers whose face is boardWidth × boardThickness, ordered strips', () => {
    // strips maple30 + walnut10 (board width 40), thickness 20, crosscut slice 25mm x4
    const pieces = panelPieces(panel(), [board()])
    expect(pieces).toHaveLength(4)
    // wafer face = W(40) × T(20); slice thickness (25) is the wafer depth
    expect(pieces[0]).toMatchObject({ panelId: 'A', index: 0, widthMm: 40, heightMm: 20, thicknessMm: 25 })
    expect(pieces[0]?.strips).toEqual([{ speciesId: 'maple', widthMm: 30 }, { speciesId: 'walnut', widthMm: 10 }])
    expect(pieces[0]?.bySpecies).toEqual({ maple: 30 * 20 * 25, walnut: 10 * 20 * 25 })
  })
  it('returns [] when the referenced board is missing', () => {
    expect(panelPieces(panel({ boardId: 'gone' }), [board()])).toEqual([])
  })
})

describe('placedFootprint', () => {
  it('swaps width/height for 90/270', () => {
    const [p] = panelPieces(panel(), [board()])
    expect(placedFootprint(p!, cell({ rotate: 0 }))).toEqual({ widthMm: 40, heightMm: 20 })
    expect(placedFootprint(p!, cell({ rotate: 90 }))).toEqual({ widthMm: 20, heightMm: 40 })
  })
})

describe('assembledSize', () => {
  it('stacks a 2x1 grid of W×T wafers: length = sum heights, width = max row width, thickness = slice', () => {
    expect(assembledSize(composite(), [board()])).toEqual({ lengthMm: 40, widthMm: 40, thicknessMm: 25 })
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

describe('kerf accounting', () => {
  it('source length per panel = count*(width+kerf)', () => {
    expect(panelSourceLengthMm(panel())).toBe(4 * (25 + 3)) // 112
  })
  it('stock includes all cut pieces plus kerf waste, by species', () => {
    // strips maple30+walnut10 (height 40), thickness 20, crosscut 25mm x4, kerf 3
    // finished per species: maple 30*25*20=15000, walnut 10*25*20=5000 ; x4 cut pieces
    // kerf waste total = 4*3*40*20 = 9600, split maple:walnut 30:10 => maple 7200, walnut 2400
    const cf = CUBIC_MM_PER_BOARD_FOOT
    expect(stockBySpecies(composite(), [board()])).toEqual([
      { speciesId: 'maple', boardFeet: (4 * 15000 + 7200) / cf },
      { speciesId: 'walnut', boardFeet: (4 * 5000 + 2400) / cf },
    ])
  })
  it('cut plan names the kerf-inclusive source length', () => {
    const plan = compositeCutPlan(composite(), [board()])
    expect(plan.stages[0]?.steps.some(s => /112\s*mm/.test(s))).toBe(true)
  })
})
