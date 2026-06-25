import { describe, expect, it } from 'vitest'
import { normalizeData } from '../src/storage'
import type { AtlasData } from '../src/types'

describe('workspace storage migration', () => {
  it('stamps normalized data with the current schema version', () => {
    const legacy = { shops: [], boards: [] } as unknown as AtlasData
    expect(normalizeData(legacy).schemaVersion).toBe(1)
  })

  it('adds the default wood library to legacy saves', () => {
    const legacy = { shops: [], boards: [] } as unknown as AtlasData
    const normalized = normalizeData(legacy)
    expect(normalized.woods.length).toBeGreaterThan(1)
    expect(normalized.woods.some(wood => wood.id === 'walnut')).toBe(true)
  })

  it('migrates the legacy drumSanding allowance to routerTable', () => {
    const legacy = {
      shops: [],
      boards: [{
        id: 'board', name: 'Imported', length: 400, thickness: 38, construction: 'edge', updatedAt: '',
        strips: [],
        allowances: { jointing: 1, planing: 1, drumSanding: 2.5, ripAllowance: 3, lengthTrim: 10, widthTrim: 6 },
      }],
    } as unknown as AtlasData
    const board = normalizeData(legacy).boards[0]!
    expect(board.allowances.routerTable).toBe(2.5)
    expect((board.allowances as unknown as Record<string, unknown>)['drumSanding']).toBeUndefined()
  })

  it('preserves an unknown referenced wood as an editable placeholder', () => {
    const legacy = {
      shops: [],
      boards: [{
        id: 'board', name: 'Imported', length: 400, thickness: 38, construction: 'edge', updatedAt: '',
        strips: [{ id: 'strip', speciesId: 'mystery', width: 40, trailingAngle: 0 }],
        allowances: {},
      }],
    } as unknown as AtlasData
    const normalized = normalizeData(legacy)
    expect(normalized.woods.find(wood => wood.id === 'mystery')).toMatchObject({ name: 'mystery', pricePerBoardFoot: 0 })
  })

  it('preserves negative trailing angles through a normalize round-trip (C1)', () => {
    const data = {
      shops: [],
      boards: [{
        id: 'board', name: 'Chevron', length: 400, thickness: 38, construction: 'end', updatedAt: '',
        strips: [
          { id: 'a', speciesId: 'walnut', width: 40, trailingAngle: 45 },
          { id: 'b', speciesId: 'maple', width: 40, trailingAngle: -45 },
        ],
        allowances: {},
      }],
    } as unknown as AtlasData
    const board = normalizeData(data).boards[0]!
    expect(board.strips[0]?.trailingAngle).toBe(45)
    expect(board.strips[1]?.trailingAngle).toBe(-45)
  })

  it('preserves negative end-grain row offsets (C1)', () => {
    const data = {
      shops: [],
      boards: [{
        id: 'board', name: 'Offsets', length: 400, thickness: 38, construction: 'end', updatedAt: '',
        strips: [],
        endGrain: { stockThickness: 38, rowOffsets: [-10, 0, 12] },
      }],
    } as unknown as AtlasData
    const board = normalizeData(data).boards[0]!
    expect(board.endGrain.rowOffsets).toEqual([-10, 0, 12])
  })

  it('still floors negative dimensions to zero (width/length stay non-negative)', () => {
    const data = {
      shops: [],
      boards: [{
        id: 'board', name: 'b', length: -400, thickness: 38, construction: 'edge', updatedAt: '',
        strips: [{ id: 's', speciesId: 'walnut', width: -40, trailingAngle: 0 }],
        allowances: {},
      }],
    } as unknown as AtlasData
    const board = normalizeData(data).boards[0]!
    expect(board.length).toBe(0)
    expect(board.strips[0]?.width).toBe(0)
  })

  it('repairs malformed nested import records instead of throwing away the backup', () => {
    const legacy = {
      woods: [null, { id: 'walnut', name: 'Walnut', color: 'brown', accent: '#87614a', pricePerBoardFoot: -5 }],
      shops: [{ id: 'shop', name: '', width: Number.NaN }],
      boards: [{
        id: 'board',
        name: '',
        construction: 'end',
        strips: [null, { id: 'strip', speciesId: 'mystery', width: 40 }],
        endGrain: { stockThickness: 38 },
      }],
    } as unknown as AtlasData

    const normalized = normalizeData(legacy)
    expect(normalized.shops[0]).toMatchObject({ id: 'shop', name: 'Imported workshop', width: 6000, depth: 6000, items: [] })
    expect(normalized.boards[0]).toMatchObject({ id: 'board', name: 'Imported cutting board', construction: 'end' })
    expect(normalized.boards[0]?.strips).toHaveLength(1)
    expect(normalized.woods.find(wood => wood.id === 'mystery')).toBeDefined()
    expect(normalized.woods.find(wood => wood.id === 'walnut')).toMatchObject({ color: '#8c6a48', pricePerBoardFoot: 0 })
  })
})
