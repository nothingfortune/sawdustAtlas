import { describe, expect, it } from 'vitest'
import { classifyBoard, classifyComposite, calculatePrice, materialCost, roughPieceCost, COMPLEX_SLICE_THRESHOLD } from '../src/domain/pricing'
import { CUBIC_MM_PER_BOARD_FOOT } from '../src/domain/units'
import type { BoardProject, BoardStrip, EndGrainSettings, PricingSettings } from '../src/types'

const pricing: PricingSettings = {
  materialMarkupPercent: 30,
  laborRatePerHour: 60,
  tierHours: { simple: 0.75, standard: 1.5, complex: 3 },
  consumablesBase: 8,
  consumablesPerBoardFoot: 3,
  floor: { edge: 100, end: 200 },
}

const endGrain = (over: Partial<EndGrainSettings> = {}): EndGrainSettings => ({
  sourceLength: 900, stockThickness: 38, sliceThickness: 45, kerf: 3.2, trimAllowance: 20,
  rowFlips: [], rowRotations: [], rowOffsets: [], rowOrder: [], ...over,
})

const board = (construction: 'edge' | 'end', strips: BoardStrip[], eg: Partial<EndGrainSettings> = {}): BoardProject => ({
  id: 'b', name: 'b', length: 450, thickness: 38, construction, strips,
  updatedAt: '2026-01-01T00:00:00.000Z',
  allowances: { jointing: 2, planing: 1, routerTable: 1, ripAllowance: 3, lengthTrim: 10, widthTrim: 6 },
  endGrain: endGrain(eg),
})

const strip = (trailingAngle = 0): BoardStrip => ({ id: 's', speciesId: 'walnut', width: 38, trailingAngle })

describe('classifyBoard', () => {
  it('edge grain with no bevels is simple', () => {
    expect(classifyBoard(board('edge', [strip(), strip()]), 0)).toBe('simple')
  })
  it('edge grain with a beveled strip is standard', () => {
    expect(classifyBoard(board('edge', [strip(0), strip(12)]), 0)).toBe('standard')
  })
  it('plain end grain is standard', () => {
    expect(classifyBoard(board('end', [strip(), strip()]), 4)).toBe('standard')
  })
  it('end grain with a beveled strip is complex', () => {
    expect(classifyBoard(board('end', [strip(0), strip(8)]), 4)).toBe('complex')
  })
  it('end grain with per-slice variation is complex', () => {
    expect(classifyBoard(board('end', [strip()], { rowRotations: [false, true] }), 4)).toBe('complex')
    expect(classifyBoard(board('end', [strip()], { rowFlips: [true] }), 4)).toBe('complex')
    expect(classifyBoard(board('end', [strip()], { rowOffsets: [0, 5] }), 4)).toBe('complex')
  })
  it('end grain at or over the slice threshold is complex', () => {
    expect(classifyBoard(board('end', [strip()]), COMPLEX_SLICE_THRESHOLD)).toBe('complex')
  })
})

describe('classifyComposite', () => {
  it('is always complex', () => {
    expect(classifyComposite()).toBe('complex')
  })
})

describe('materialCost', () => {
  it('multiplies rough board feet by the per-board-foot price', () => {
    expect(materialCost(2.5, 12)).toBeCloseTo(30, 6)
    expect(materialCost(0, 12)).toBe(0)
    expect(materialCost(3, 0)).toBe(0)
  })
})

describe('roughPieceCost', () => {
  it('converts a rough w×l×t piece (mm) to board feet then cost', () => {
    // one board foot of stock at $9 => $9
    expect(roughPieceCost(CUBIC_MM_PER_BOARD_FOOT, 1, 1, 9)).toBeCloseTo(9, 6)
  })
  it('matches an explicit volume / CUBIC_MM_PER_BOARD_FOOT × price calc', () => {
    const w = 40, l = 600, t = 20, price = 12
    const expected = w * l * t / CUBIC_MM_PER_BOARD_FOOT * price
    expect(roughPieceCost(w, l, t, price)).toBeCloseTo(expected, 9)
  })
  it('is zero for a zero dimension', () => {
    expect(roughPieceCost(0, 600, 20, 12)).toBe(0)
  })
})

describe('calculatePrice', () => {
  it('computes markup, labor, consumables, and subtotal', () => {
    // material 31.25, 2.5 bf, standard tier, end grain
    const p = calculatePrice({ materialCost: 31.25, roughBoardFeet: 2.5, construction: 'end', tier: 'standard', pricing })
    expect(p.markupPercent).toBe(30)
    expect(p.materialMarkup).toBeCloseTo(9.375, 6)   // 31.25 * 0.30
    expect(p.laborHours).toBe(1.5)
    expect(p.labor).toBeCloseTo(90, 6)               // 1.5 * 60
    expect(p.consumables).toBeCloseTo(15.5, 6)       // 8 + 3 * 2.5
    expect(p.subtotal).toBeCloseTo(146.125, 6)
  })
  it('raises small builds to the end-grain floor', () => {
    const p = calculatePrice({ materialCost: 31.25, roughBoardFeet: 2.5, construction: 'end', tier: 'standard', pricing })
    expect(p.floor).toBe(200)
    expect(p.floorAdjustment).toBeCloseTo(53.875, 6)
    expect(p.total).toBe(200)
  })
  it('does not raise builds already above the floor', () => {
    const p = calculatePrice({ materialCost: 400, roughBoardFeet: 8, construction: 'end', tier: 'complex', pricing })
    expect(p.floorAdjustment).toBe(0)
    expect(p.total).toBeCloseTo(p.subtotal, 6)
    expect(p.total).toBeGreaterThan(200)
  })
  it('uses the edge floor for edge-grain builds', () => {
    const p = calculatePrice({ materialCost: 5, roughBoardFeet: 1, construction: 'edge', tier: 'simple', pricing })
    expect(p.floor).toBe(100)
    expect(p.total).toBe(100)
  })
})
