import { describe, expect, it } from 'vitest'
import { DEFAULT_ALLOWANCES } from '../src/domain/boardAllowances'
import { normalizeBoard, normalizeEndGrain, normalizeStrip } from '../src/normalize/boards'
import { FIXED_NOW, fixedContext } from './fixtures/context'

const options = { allowances: DEFAULT_ALLOWANCES, fallbackSpeciesId: 'walnut' }

describe('normalizeBoard', () => {
  it('fills defaults for an empty record from the context', () => {
    const board = normalizeBoard({}, options, fixedContext())
    expect(board).toMatchObject({ id: 'id-1', name: 'Imported cutting board', length: 450, thickness: 38, construction: 'edge', updatedAt: FIXED_NOW, strips: [] })
    expect(board.allowances).toBe(DEFAULT_ALLOWANCES)
  })

  it('keeps negative trailing angles and row offsets (load-bearing for chevrons)', () => {
    const board = normalizeBoard({
      construction: 'end',
      strips: [{ id: 's', speciesId: 'oak', width: 30, trailingAngle: -22.5 }],
      endGrain: { rowOffsets: [-0.25, 0.5] },
    }, options, fixedContext())
    expect(board.strips[0]?.trailingAngle).toBe(-22.5)
    expect(board.endGrain.rowOffsets).toEqual([-0.25, 0.5])
  })

  it('clamps negative dimensions to 0', () => {
    expect(normalizeBoard({ length: -10 }, options, fixedContext()).length).toBe(0)
  })
})

describe('normalizeStrip', () => {
  it('uses the fallback species when none is given', () => {
    expect(normalizeStrip({}, 'maple', fixedContext())).toEqual({ id: 'id-1', speciesId: 'maple', width: 38, trailingAngle: 0 })
  })
})

describe('normalizeEndGrain', () => {
  it('seeds stock thickness from the board and truncates row order', () => {
    const settings = normalizeEndGrain({ rowOrder: [2.9, 'x'] }, 40)
    expect(settings.stockThickness).toBe(40)
    expect(settings.rowOrder).toEqual([2, 0])
  })
})
