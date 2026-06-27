import { describe, expect, it } from 'vitest'
import { panelPieces, placedFootprint, croppedLayout, deskLayout, assembledSize, materialBySpecies, stockBySpecies, panelSourceLengthMm, compositeCutPlan, boardFaceSize, maxWafers } from '../src/domain/compositeBoard'
import { CUBIC_MM_PER_BOARD_FOOT } from '../src/domain/units'
import type { BoardProject, CompositeBoard, CompositePanel, AssemblyCell } from '../src/types'

const board = (over: Partial<BoardProject> = {}): BoardProject => ({
  id: 'b1', name: 'Board', length: 300, thickness: 20, construction: 'edge',
  endGrain: { sourceLength: 900, stockThickness: 20, sliceThickness: 45, kerf: 3, trimAllowance: 20, rowFlips: [], rowRotations: [] },
  allowances: { jointing: 0, planing: 0, routerTable: 0, ripAllowance: 0, lengthTrim: 0, widthTrim: 0 },
  strips: [{ id: 's1', speciesId: 'maple', width: 30, trailingAngle: 0 }, { id: 's2', speciesId: 'walnut', width: 10, trailingAngle: 0 }],
  updatedAt: '2026-06-27T00:00:00.000Z', ...over,
})
const panelX = (over: Partial<CompositePanel> = {}): CompositePanel => ({ id: 'A', boardId: 'b1', cut: { axis: 'x', stripWidthMm: 25, kerfMm: 3, count: 4 }, ...over })
const w = (pieceIndex: number, over: Partial<AssemblyCell> = {}): AssemblyCell => ({ panelId: 'A', pieceIndex, rotate: 0, flip: false, ...over })
const composite = (over: Partial<CompositeBoard> = {}): CompositeBoard => ({
  id: 'c1', name: 'Composite', construction: 'edge', panels: [panelX()],
  rows: [{ id: 'r1', wafers: [w(0), w(1), w(2)] }, { id: 'r2', wafers: [w(0), w(1)] }],
  updatedAt: '2026-06-27T00:00:00.000Z', ...over,
})

describe('panelPieces — slice a donor face (axis = orientation only)', () => {
  it('crosscut (X): footprint = slice × faceWidth, grain follows the donor, capped by yield', () => {
    const p = panelPieces(panelX(), [board()])
    expect(p).toHaveLength(4)
    expect(p[0]).toMatchObject({ widthMm: 25, heightMm: 40, thicknessMm: 20, grain: 'edge', axis: 'x', faceLengthMm: 300, faceWidthMm: 40, sliceOffsetMm: 0, sliceMm: 25 })
    expect(p[1]?.sliceOffsetMm).toBe(28) // slice + kerf
    expect(p[0]?.bySpecies).toEqual({ maple: 15000, walnut: 5000 })
  })
  it('rip (Y): footprint = faceLength × slice, same grain, count capped to the donor width', () => {
    const p = panelPieces(panelX({ cut: { axis: 'y', stripWidthMm: 25, kerfMm: 3, count: 3 } }), [board()])
    expect(p).toHaveLength(1) // a 40mm-wide donor yields only one 25mm rip strip
    expect(p[0]).toMatchObject({ widthMm: 300, heightMm: 25, thicknessMm: 20, grain: 'edge', axis: 'y' })
    expect(p[0]?.bySpecies).toEqual({ maple: 112500, walnut: 37500 })
  })
  it('returns [] for a missing board', () => { expect(panelPieces(panelX({ boardId: 'gone' }), [board()])).toEqual([]) })
})

describe('boardFaceSize + maxWafers', () => {
  it('edge donor face = length × Σ strips', () => { expect(boardFaceSize(board())).toEqual({ lengthMm: 300, widthMm: 40 }) })
  it('caps wafers by the cut-axis dimension of the donor', () => {
    expect(maxWafers(board(), { axis: 'x', stripWidthMm: 25, kerfMm: 3, count: 99 })).toBe(10) // (300+3)/28
    expect(maxWafers(board(), { axis: 'y', stripWidthMm: 25, kerfMm: 3, count: 99 })).toBe(1)  // (40+3)/28
  })
})

describe('placedFootprint', () => {
  it('swaps for 90/270', () => {
    const [p] = panelPieces(panelX(), [board()])
    expect(placedFootprint(p!, w(0))).toEqual({ widthMm: 25, heightMm: 40 })
    expect(placedFootprint(p!, w(0, { rotate: 90 }))).toEqual({ widthMm: 40, heightMm: 25 })
  })
})

describe('croppedLayout + assembledSize — 4-sided crop', () => {
  it('crops X to the narrowest row (centered) and stacks rows', () => {
    const layout = croppedLayout(composite(), [board()])
    // wafer footprint 25×40; row1 width 75, row2 width 50 → target 50
    expect(layout.widthMm).toBe(50)
    expect(layout.rows[0]?.placed.map(p => p.keptWidthMm)).toEqual([12.5, 25, 12.5])
    expect(layout.rows[1]?.placed.map(p => p.keptWidthMm)).toEqual([25, 25])
    expect(assembledSize(composite(), [board()])).toEqual({ lengthMm: 80, widthMm: 50, thicknessMm: 20 })
  })
})

describe('material — placed wafers only', () => {
  it('finished = cropped (kept) volume by species', () => {
    // kept fractions: row1 .5/1/.5, row2 1/1 → 4× each wafer's bySpecies
    expect(materialBySpecies(composite(), [board()])).toEqual([
      { speciesId: 'maple', boardFeet: (15000 * 4) / CUBIC_MM_PER_BOARD_FOOT },
      { speciesId: 'walnut', boardFeet: (5000 * 4) / CUBIC_MM_PER_BOARD_FOOT },
    ])
  })
  it('stock = full placed wafers + kerf (1 + kerf/slice)', () => {
    const r = 1 + 3 / 25
    expect(stockBySpecies(composite(), [board()])).toEqual([
      { speciesId: 'maple', boardFeet: (15000 * 5 * r) / CUBIC_MM_PER_BOARD_FOOT },
      { speciesId: 'walnut', boardFeet: (5000 * 5 * r) / CUBIC_MM_PER_BOARD_FOOT },
    ])
  })
})

describe('cut plan', () => {
  it('names slice axis + kerf-inclusive source length', () => {
    expect(panelSourceLengthMm(panelX())).toBe(4 * (25 + 3))
    const plan = compositeCutPlan(composite(), [board()])
    expect(plan.stages[0]?.steps.some(s => /crosscut into 4 wafers/.test(s) && /112mm/.test(s))).toBe(true)
  })
})

describe('deskLayout — full footprints incl. empty rows', () => {
  it('keeps every row at its full (uncropped) footprint and carries trim', () => {
    const layout = deskLayout(composite(), [board()])
    expect(layout.rows.map(r => r.wafers.length)).toEqual([3, 2])
    expect(layout.rows[0]?.wafers.map(w => w.footWidthMm)).toEqual([25, 25, 25])
    expect(layout.rows[0]?.wafers[0]).toMatchObject({ footWidthMm: 25, footHeightMm: 40 })
    // row1 (width 75) is wider than the narrowest row (50), so its outer wafers
    // carry X trim; the desk reports the full footprint plus that trim.
    expect(layout.rows[0]?.wafers[0]?.trimLeftMm).toBe(12.5)
    expect(layout.maxRowWidthMm).toBe(75)
    expect(layout.totalHeightMm).toBe(80)
  })
  it('reports an empty row as zero-height with no wafers', () => {
    const c = composite({ rows: [{ id: 'r1', wafers: [w(0)] }, { id: 'empty', wafers: [] }] })
    const layout = deskLayout(c, [board()])
    expect(layout.rows[1]).toMatchObject({ rowId: 'empty', wafers: [], rowWidthMm: 0, bandHeightMm: 0 })
  })
  it('drops a wafer whose piece is missing (out-of-range index)', () => {
    const c = composite({ rows: [{ id: 'r1', wafers: [w(0), w(99)] }] })
    expect(deskLayout(c, [board()]).rows[0]?.wafers).toHaveLength(1)
  })
})

describe('end-grain donor thickness', () => {
  // For an end-grain donor the finished thickness is endGrain.sliceThickness, not
  // the stale project.thickness — so wafer volume/cost are not under-reported.
  const endBoard = (over: Partial<BoardProject> = {}): BoardProject => board({
    construction: 'end', thickness: 38,
    endGrain: { sourceLength: 900, stockThickness: 20, sliceThickness: 45, kerf: 3, trimAllowance: 20, rowFlips: [], rowRotations: [], rowOffsets: [], rowOrder: [] },
    strips: [{ id: 's1', speciesId: 'maple', width: 40, trailingAngle: 0 }, { id: 's2', speciesId: 'walnut', width: 40, trailingAngle: 0 }],
    ...over,
  })
  it('uses endGrain.sliceThickness (45), not project.thickness (38)', () => {
    const p = panelPieces(panelX({ cut: { axis: 'x', stripWidthMm: 25, kerfMm: 3, count: 2 } }), [endBoard()])
    expect(p.length).toBeGreaterThan(0)
    expect(p[0]?.thicknessMm).toBe(45)
  })
  it('scales wafer volume by the slice thickness (45/38 more than the stale value)', () => {
    const p = panelPieces(panelX({ cut: { axis: 'x', stripWidthMm: 25, kerfMm: 3, count: 1 } }), [endBoard()])
    const stale = panelPieces(panelX({ cut: { axis: 'x', stripWidthMm: 25, kerfMm: 3, count: 1 } }), [endBoard({ endGrain: { sourceLength: 900, stockThickness: 20, sliceThickness: 38, kerf: 3, trimAllowance: 20, rowFlips: [], rowRotations: [], rowOffsets: [], rowOrder: [] } })])
    const vol = (x: Record<string, number>) => Object.values(x).reduce((a, b) => a + b, 0)
    expect(vol(p[0]!.bySpecies)).toBeCloseTo(vol(stale[0]!.bySpecies) * (45 / 38), 4)
  })
})

describe('material — defensive branches', () => {
  it('stock skips wafers whose panel/piece is missing', () => {
    const c = composite({ rows: [{ id: 'r1', wafers: [w(0), { panelId: 'ghost', pieceIndex: 0, rotate: 0, flip: false }] }] })
    // The ghost wafer contributes nothing; only the real maple/walnut wafer counts.
    expect(stockBySpecies(c, [board()]).map(s => s.speciesId)).toEqual(['maple', 'walnut'])
  })
  it('finished material is zero when a wafer has no footprint area', () => {
    const zeroBoard = board({ strips: [{ id: 's1', speciesId: 'maple', width: 0, trailingAngle: 0 }] })
    const c = composite({ rows: [{ id: 'r1', wafers: [w(0)] }] })
    expect(materialBySpecies(c, [zeroBoard]).every(u => u.boardFeet === 0)).toBe(true)
  })
})
