import { describe, expect, it } from 'vitest'
import { normalizeData } from '../src/storage'
import type { AtlasData } from '../src/types'

describe('workspace storage migration', () => {
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
})
