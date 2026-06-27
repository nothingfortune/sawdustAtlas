import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearPreImportSnapshot, loadData, loadPreImportSnapshot, normalizeData, normalizePricing, savePreImportSnapshot, saveData } from '../src/storage'
import type { AtlasData } from '../src/types'

// A deterministic in-memory localStorage so the persistence tests don't depend on
// a DOM environment. setItem can be overridden per-test to simulate quota errors.
class MemoryStorage {
  private store = new Map<string, string>()
  get length() { return this.store.size }
  clear() { this.store.clear() }
  getItem(key: string) { return this.store.has(key) ? this.store.get(key)! : null }
  setItem(key: string, value: string) { this.store.set(key, String(value)) }
  removeItem(key: string) { this.store.delete(key) }
  key(index: number) { return [...this.store.keys()][index] ?? null }
}

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

  it('returns only the known AtlasData keys, dropping imported junk (SEC5)', () => {
    const data = { shops: [], boards: [], hacked: 'x', extra: { a: 1 } } as unknown as AtlasData
    expect(Object.keys(normalizeData(data)).sort()).toEqual(['allowances', 'boards', 'composites', 'pricing', 'schemaVersion', 'shops', 'woods'])
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
      shops: [{ id: 'shop', name: '', width: Number.NaN, blockedZones: [null, { width: 0, depth: 200 }] }],
      boards: [{
        id: 'board',
        name: '',
        construction: 'end',
        strips: [null, { id: 'strip', speciesId: 'mystery', width: 40 }],
        endGrain: { stockThickness: 38 },
      }],
    } as unknown as AtlasData

    const normalized = normalizeData(legacy)
    expect(normalized.shops[0]).toMatchObject({ id: 'shop', name: 'Imported workshop', width: 6000, depth: 6000, gridSize: 300, items: [] })
    expect(normalized.shops[0]?.blockedZones).toHaveLength(1)
    expect(normalized.shops[0]?.blockedZones[0]).toMatchObject({ name: 'No-go zone', width: 1, depth: 200 })
    expect(normalized.boards[0]).toMatchObject({ id: 'board', name: 'Imported cutting board', construction: 'end' })
    expect(normalized.boards[0]?.strips).toHaveLength(1)
    expect(normalized.woods.find(wood => wood.id === 'mystery')).toMatchObject({ name: 'mystery', pricePerBoardFoot: 0 })
    expect(normalized.woods.find(wood => wood.id === 'walnut')).toMatchObject({ color: '#8c6a48', pricePerBoardFoot: 0 })
  })

  it('defaults composites to an empty array for legacy saves', () => {
    const legacy = { shops: [], boards: [] } as unknown as AtlasData
    expect(normalizeData(legacy).composites).toEqual([])
  })

  it('migrates a Phase-1 inline-strip composite panel into a board + reference', () => {
    const data = normalizeData({
      shops: [], boards: [],
      composites: [{
        id: 'c', name: 'Old', rows: 1, cols: 1, updatedAt: '2026-06-25T00:00:00.000Z',
        panels: [{ id: 'p', name: 'Base', kind: 'rip', construction: 'edge', thicknessMm: 20,
          strips: [{ id: 's', speciesId: 'walnut', width: 38, trailingAngle: 0 }],
          crosscut: { stripWidthMm: 25, kerfMm: 3, count: 4 } }],
        cells: [{ panelId: 'p', pieceIndex: 0, rotate: 0, flip: false }],
      }],
    } as unknown as Partial<AtlasData>)
    const comp = data.composites[0]!
    expect(comp.construction).toBe('edge')
    expect(comp.panels).toHaveLength(1)
    const ref = comp.panels[0]!
    expect(ref).toMatchObject({ id: 'p', cut: { axis: 'x', stripWidthMm: 25, count: 4 } })
    const migratedBoard = data.boards.find(b => b.id === ref.boardId)
    expect(migratedBoard?.construction).toBe('edge')
    expect(migratedBoard?.strips[0]).toMatchObject({ speciesId: 'walnut', width: 38 })
    expect(migratedBoard?.thickness).toBe(20)
  })

  it('migrates a legacy grid into rows, grouping non-null cells per grid row', () => {
    const data = normalizeData({
      shops: [], boards: [],
      composites: [{
        id: 'c', name: 'Grid', rows: 2, cols: 2, updatedAt: '',
        panels: [{ id: 'p', boardId: 'b', crosscut: { stripWidthMm: 25, kerfMm: 3, count: 4 } }],
        cells: [
          { panelId: 'p', pieceIndex: 0, rotate: 0, flip: false }, null,
          { panelId: 'p', pieceIndex: 1, rotate: 90, flip: false }, { panelId: 'p', pieceIndex: 2, rotate: 0, flip: true },
        ],
      }],
    } as unknown as Partial<AtlasData>)
    const comp = data.composites[0]!
    expect(comp.rows).toHaveLength(2)
    expect(comp.rows[0]!.wafers.map(w => w.pieceIndex)).toEqual([0])
    expect(comp.rows[1]!.wafers.map(w => w.pieceIndex)).toEqual([1, 2])
  })

  it('drops legacy derived panels and the wafers that referenced them', () => {
    const data = normalizeData({
      shops: [], boards: [],
      composites: [{ id: 'c', name: 'D', rows: 1, cols: 1, updatedAt: '',
        panels: [{ id: 'd', name: 'Recut', kind: 'derived', construction: 'end', sourceBoardId: 'x', crosscut: { stripWidthMm: 20, kerfMm: 3, count: 2 } }],
        cells: [{ panelId: 'd', pieceIndex: 0, rotate: 0, flip: false }] }],
    } as unknown as Partial<AtlasData>)
    expect(data.composites[0]!.panels).toEqual([])
    expect(data.composites[0]!.rows).toEqual([{ id: expect.any(String), wafers: [] }])
  })

  it('preserves a new-shape composite round-trip', () => {
    const data = normalizeData({
      shops: [], boards: [],
      composites: [{
        id: 'c', name: 'New', construction: 'end', updatedAt: '',
        panels: [{ id: 'p', boardId: 'b', cut: { axis: 'y', stripWidthMm: 30, kerfMm: 3, count: 3 } }],
        rows: [{ id: 'r1', wafers: [{ panelId: 'p', pieceIndex: 0, rotate: 270, flip: true }] }],
      }],
    } as unknown as Partial<AtlasData>)
    const comp = data.composites[0]!
    expect(comp.construction).toBe('end')
    expect(comp.panels[0]!.cut).toEqual({ axis: 'y', stripWidthMm: 30, kerfMm: 3, count: 3 })
    expect(comp.rows[0]!.wafers[0]).toEqual({ panelId: 'p', pieceIndex: 0, rotate: 270, flip: true })
  })
})

describe('saveData / loadData persistence', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('round-trips data through localStorage and reports success (C4)', () => {
    const data = normalizeData({ shops: [], boards: [] } as unknown as AtlasData)
    expect(saveData(data)).toBe(true)
    expect(loadData().schemaVersion).toBe(data.schemaVersion)
  })

  it('falls back to starter data when the stored JSON is not an object or is malformed (TEST3)', () => {
    localStorage.setItem('sawdust-atlas:v1', '"a plain string"')
    expect(loadData().schemaVersion).toBe(1)
    localStorage.setItem('sawdust-atlas:v1', '{ not valid json')
    expect(loadData().woods.length).toBeGreaterThan(0)
  })

  it('returns false instead of throwing when the storage write is rejected (C4)', () => {
    const data = normalizeData({ shops: [], boards: [] } as unknown as AtlasData)
    vi.spyOn(globalThis.localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError')
    })
    expect(() => saveData(data)).not.toThrow()
    expect(saveData(data)).toBe(false)
  })
})

describe('pre-import snapshot (H3)', () => {
  beforeEach(() => vi.stubGlobal('localStorage', new MemoryStorage()))
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('round-trips a pre-import snapshot and clears it', () => {
    const data = normalizeData({ shops: [], boards: [{ id: 'b', name: 'Keep me', construction: 'edge', strips: [] }] } as unknown as AtlasData)
    expect(loadPreImportSnapshot()).toBeNull()
    savePreImportSnapshot(data)
    expect(loadPreImportSnapshot()?.boards[0]?.name).toBe('Keep me')
    clearPreImportSnapshot()
    expect(loadPreImportSnapshot()).toBeNull()
  })

  it('does not throw when the snapshot write is rejected', () => {
    vi.spyOn(globalThis.localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError')
    })
    expect(() => savePreImportSnapshot(normalizeData({ shops: [], boards: [] } as unknown as AtlasData))).not.toThrow()
  })
})

describe('pricing normalization', () => {
  it('fills the default pricing block when absent', () => {
    const normalized = normalizeData({ shops: [], boards: [] } as unknown as AtlasData)
    expect(normalized.pricing.materialMarkupPercent).toBe(30)
    expect(normalized.pricing.laborRatePerHour).toBe(60)
    expect(normalized.pricing.tierHours).toEqual({ simple: 0.75, standard: 1.5, complex: 3 })
    expect(normalized.pricing.consumablesBase).toBe(8)
    expect(normalized.pricing.consumablesPerBoardFoot).toBe(3)
    expect(normalized.pricing.floor).toEqual({ edge: 100, end: 200 })
  })

  it('merges saved pricing over defaults', () => {
    const result = normalizePricing({ materialMarkupPercent: 45, floor: { end: 250 } })
    expect(result.materialMarkupPercent).toBe(45)
    expect(result.floor.end).toBe(250)
    // unspecified values fall back to defaults
    expect(result.floor.edge).toBe(100)
    expect(result.laborRatePerHour).toBe(60)
  })

  it('coerces garbage values to non-negative defaults', () => {
    const result = normalizePricing({ laborRatePerHour: -10, consumablesBase: 'x', tierHours: null })
    expect(result.laborRatePerHour).toBe(60) // negative rejected → default
    expect(result.consumablesBase).toBe(8)   // non-number → default
    expect(result.tierHours).toEqual({ simple: 0.75, standard: 1.5, complex: 3 })
  })
})
