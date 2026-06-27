import { describe, expect, it } from 'vitest'
import { panelPieces, placedFootprint, croppedLayout, assembledSize, materialBySpecies, stockBySpecies, panelSourceLengthMm, compositeCutPlan } from '../src/domain/compositeBoard'
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

describe('panelPieces — slice along an axis', () => {
  it('X (crosscut) → end-grain wafer face = boardWidth × thickness, ordered strips', () => {
    const p = panelPieces(panelX(), [board()])
    expect(p).toHaveLength(4)
    expect(p[0]).toMatchObject({ widthMm: 40, heightMm: 20, thicknessMm: 25, grain: 'end' })
    expect(p[0]?.strips).toEqual([{ speciesId: 'maple', widthMm: 30 }, { speciesId: 'walnut', widthMm: 10 }])
    expect(p[0]?.bySpecies).toEqual({ maple: 30 * 20 * 25, walnut: 10 * 20 * 25 })
  })
  it('Y (rip) → long-grain strip face = boardLength × slice, dominant species', () => {
    const p = panelPieces(panelX({ cut: { axis: 'y', stripWidthMm: 25, kerfMm: 3, count: 3 } }), [board()])
    expect(p[0]).toMatchObject({ widthMm: 300, heightMm: 25, thicknessMm: 20, grain: 'long' })
    expect(p[0]?.bySpecies).toEqual({ maple: 300 * 25 * 20 })
  })
  it('returns [] for a missing board', () => { expect(panelPieces(panelX({ boardId: 'gone' }), [board()])).toEqual([]) })
})

describe('placedFootprint', () => {
  it('swaps for 90/270', () => {
    const [p] = panelPieces(panelX(), [board()])
    expect(placedFootprint(p!, w(0))).toEqual({ widthMm: 40, heightMm: 20 })
    expect(placedFootprint(p!, w(0, { rotate: 90 }))).toEqual({ widthMm: 20, heightMm: 40 })
  })
})

describe('croppedLayout + assembledSize — 4-sided crop', () => {
  it('crops X to the narrowest row (centered) and stacks rows', () => {
    const layout = croppedLayout(composite(), [board()])
    // row1 width 120, row2 width 80 → target 80; row1 wafers kept 20/40/20
    expect(layout.widthMm).toBe(80)
    expect(layout.rows[0]?.placed.map(p => p.keptWidthMm)).toEqual([20, 40, 20])
    expect(layout.rows[1]?.placed.map(p => p.keptWidthMm)).toEqual([40, 40])
    expect(assembledSize(composite(), [board()])).toEqual({ lengthMm: 40, widthMm: 80, thicknessMm: 25 })
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
