import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearPreImportSnapshot, hasOnboarded, importData, loadData, loadPreImportSnapshot, loadSketch, markOnboarded, normalizeData, normalizePricing, savePreImportSnapshot, saveData, saveSketch } from '../src/storage'
import { DEFAULT_ALLOWANCES } from '../src/domain/boardAllowances'
import { boardThickness } from '../src/domain/compositeBoard'
import type { AtlasData } from '../src/types'

describe('importData (PLAT-004)', () => {
  it('rejects a non-object file with a clear error', () => {
    const result = importData('just a string')
    expect(result.ok).toBe(false)
    expect(result.data).toBeNull()
    expect(result.errors[0]).toMatch(/not a SawdustAtlas backup/i)
  })

  it('rejects a backup missing its shops/boards lists', () => {
    const result = importData({ shops: [] }) // boards missing
    expect(result.ok).toBe(false)
    expect(result.errors.some(error => /boards/.test(error))).toBe(true)
  })

  it('reports project counts on a valid import', () => {
    const result = importData({ schemaVersion: 2, shops: [{ id: 's' }], boards: [{ id: 'b' }, { id: 'b2' }], composites: [] })
    expect(result.ok).toBe(true)
    expect(result.counts).toMatchObject({ shops: 1, boards: 2, composites: 0 })
    expect(result.data?.schemaVersion).toBe(2)
  })

  it('warns about unrecognized top-level and record fields instead of dropping them silently', () => {
    const result = importData({ schemaVersion: 2, shops: [], boards: [{ id: 'b', notes: 'hi', favorite: true }], extras: {} })
    expect(result.warnings.some(w => /top-level field/.test(w) && /extras/.test(w))).toBe(true)
    expect(result.warnings.some(w => /unrecognized field/.test(w) && /board\.notes/.test(w))).toBe(true)
  })

  it('warns when a strip references an unknown wood (but not for default species)', () => {
    const unknown = importData({ schemaVersion: 2, shops: [], boards: [{ id: 'b', strips: [{ id: 'x', speciesId: 'mystery-wood', width: 40 }] }] })
    expect(unknown.warnings.some(w => /unknown/.test(w) && /mystery-wood/.test(w))).toBe(true)
    const known = importData({ schemaVersion: 2, shops: [], boards: [{ id: 'b', strips: [{ id: 'x', speciesId: 'walnut', width: 40 }] }] })
    expect(known.warnings.some(w => /unknown/.test(w))).toBe(false) // walnut is a default species
  })

  it('imports a newer-than-app backup but warns it may lose data', () => {
    const result = importData({ schemaVersion: 999, shops: [], boards: [] })
    expect(result.ok).toBe(true)
    expect(result.warnings.some(w => /newer version/.test(w))).toBe(true)
  })

  it('runs migrations through the import path (v1 offsets -> fractions)', () => {
    const result = importData({
      schemaVersion: 1, shops: [],
      boards: [{ id: 'b', construction: 'end', strips: [{ id: 'a', speciesId: 'walnut', width: 40 }, { id: 'c', speciesId: 'maple', width: 40 }], endGrain: { stockThickness: 38, rowOffsets: [0, 20] } }],
    })
    expect(result.data?.boards[0]?.endGrain.rowOffsets).toEqual([0, 0.5])
  })
})

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
    expect(normalizeData(legacy).schemaVersion).toBe(2)
  })

  it('migrates legacy millimeter row offsets to cell fractions (schema 1 -> 2)', () => {
    const data = {
      schemaVersion: 1, shops: [],
      boards: [{
        id: 'b', name: 'Bond', length: 400, thickness: 38, construction: 'end', updatedAt: '',
        strips: [{ id: 's1', speciesId: 'walnut', width: 40, trailingAngle: 0 }, { id: 's2', speciesId: 'maple', width: 40, trailingAngle: 0 }],
        endGrain: { stockThickness: 38, rowOffsets: [0, 20] },
      }],
    } as unknown as AtlasData
    const board = normalizeData(data).boards[0]!
    expect(board.endGrain.rowOffsets).toEqual([0, 0.5]) // 20 mm / 40 mm cell
  })

  it('leaves schema-2 fractional offsets unchanged', () => {
    const data = {
      schemaVersion: 2, shops: [],
      boards: [{
        id: 'b', name: 'Bond', length: 400, thickness: 38, construction: 'end', updatedAt: '',
        strips: [{ id: 's1', speciesId: 'walnut', width: 40, trailingAngle: 0 }],
        endGrain: { stockThickness: 38, rowOffsets: [0, 0.5] },
      }],
    } as unknown as AtlasData
    const board = normalizeData(data).boards[0]!
    expect(board.endGrain.rowOffsets).toEqual([0, 0.5])
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

  it('keeps a wood\'s trimmed "available at" vendor note, and omits it when blank', () => {
    const data = { shops: [], boards: [], woods: [
      { id: 'w1', name: 'Walnut', color: '#5a3828', accent: '#87614a', pricePerBoardFoot: 12, availableAt: '  Rockler, aisle 4  ' },
      { id: 'w2', name: 'Maple', color: '#dbc59b', accent: '#f0dfb9', pricePerBoardFoot: 8, availableAt: '   ' },
    ] } as unknown as AtlasData
    const woods = normalizeData(data).woods
    expect(woods.find(w => w.id === 'w1')?.availableAt).toBe('Rockler, aisle 4')
    expect(woods.find(w => w.id === 'w2')).not.toHaveProperty('availableAt')
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

  it('seeds end-grain slice thickness from a legacy end-construction rip panel, preserving donor thickness (2.3)', () => {
    const data = normalizeData({
      shops: [], boards: [],
      composites: [{
        id: 'c', name: 'Old End', rows: 1, cols: 1, updatedAt: '',
        panels: [{
          id: 'p', name: 'Base', kind: 'rip', construction: 'end', thicknessMm: 30,
          strips: [{ id: 's', speciesId: 'walnut', width: 38, trailingAngle: 0 }],
          crosscut: { stripWidthMm: 25, kerfMm: 3, count: 4 },
        }],
        cells: [{ panelId: 'p', pieceIndex: 0, rotate: 0, flip: false }],
      }],
    } as unknown as Partial<AtlasData>)
    const ref = data.composites[0]!.panels[0]!
    const migratedBoard = data.boards.find(b => b.id === ref.boardId)!
    expect(migratedBoard.construction).toBe('end')
    expect(migratedBoard.thickness).toBe(30)
    expect(boardThickness(migratedBoard)).toBe(30)
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

describe('allowances normalization (2.1)', () => {
  it('coerces a string, Infinity, negative, missing, and null allowance field each to a finite non-negative number', () => {
    const data = {
      shops: [], boards: [],
      allowances: {
        jointing: '3',                       // string -> falls back to default
        planing: Number.POSITIVE_INFINITY,   // Infinity -> falls back to default
        routerTable: -5,                     // negative -> clamps to 0 (still finite/non-negative)
        // ripAllowance intentionally missing -> falls back to default
        lengthTrim: null,                    // null -> falls back to default
        widthTrim: Number.NaN,               // NaN -> falls back to default
      },
    } as unknown as AtlasData
    const allowances = normalizeData(data).allowances
    for (const value of Object.values(allowances)) {
      expect(Number.isFinite(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(0)
    }
    expect(allowances.jointing).toBe(DEFAULT_ALLOWANCES.jointing)
    expect(allowances.planing).toBe(DEFAULT_ALLOWANCES.planing)
    expect(allowances.routerTable).toBe(0)
    expect(allowances.ripAllowance).toBe(DEFAULT_ALLOWANCES.ripAllowance)
    expect(allowances.lengthTrim).toBe(DEFAULT_ALLOWANCES.lengthTrim)
    expect(allowances.widthTrim).toBe(DEFAULT_ALLOWANCES.widthTrim)
  })

  it('does not let a corrupt-allowances backup round-trip bad numbers through import -> export', () => {
    const corrupt = {
      schemaVersion: 2, shops: [], boards: [],
      allowances: { jointing: '3', planing: Number.POSITIVE_INFINITY, routerTable: 'x', ripAllowance: undefined, lengthTrim: NaN, widthTrim: -1 },
    }
    const imported = importData(corrupt)
    expect(imported.ok).toBe(true)
    // Export re-runs normalizeData; a second pass over already-clean data must stay clean.
    const exported = normalizeData(imported.data!)
    for (const value of Object.values(exported.allowances)) {
      expect(Number.isFinite(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(0)
    }
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
    expect(loadData().schemaVersion).toBe(2)
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

describe('corrupt payload recovery (2.4)', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', new MemoryStorage()) })
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('copies an unparseable payload to a recovery key before falling back to starter data', () => {
    localStorage.setItem('sawdust-atlas:v1', '{ not valid json')
    const data = loadData()
    expect(data.woods.length).toBeGreaterThan(0) // starter data
    expect(localStorage.getItem('sawdust-atlas:corrupt')).toBe('{ not valid json')
  })

  it('keeps only one recovery copy, overwriting the previous one', () => {
    localStorage.setItem('sawdust-atlas:v1', '{ first corrupt')
    loadData()
    localStorage.setItem('sawdust-atlas:v1', '{ second corrupt')
    loadData()
    expect(localStorage.getItem('sawdust-atlas:corrupt')).toBe('{ second corrupt')
  })

  it('does not crash loadData when the recovery write itself throws (e.g. quota)', () => {
    localStorage.setItem('sawdust-atlas:v1', '{ not valid json')
    vi.spyOn(globalThis.localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError')
    })
    expect(() => loadData()).not.toThrow()
    expect(loadData().schemaVersion).toBe(2)
  })
})

describe('onboarding flag (UX-004)', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', new MemoryStorage()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('is false on first run and true after marking onboarded', () => {
    expect(hasOnboarded()).toBe(false)
    markOnboarded()
    expect(hasOnboarded()).toBe(true)
  })
})

describe('geometry sketch scratchpad (BOARD-026)', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', new MemoryStorage()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('round-trips a sketch and defaults to empty', () => {
    expect(loadSketch()).toEqual({ points: [], members: [] })
    saveSketch({ points: [{ id: 'p', x: 10, y: 20 }], members: [] })
    expect(loadSketch().points[0]).toMatchObject({ id: 'p', x: 10, y: 20 })
  })

  it('normalizes junk: members referencing missing points are dropped', () => {
    saveSketch({ points: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 1, y: 1 }], members: [
      { id: 'm1', aId: 'a', bId: 'b', widthMm: 18 },
      { id: 'm2', aId: 'a', bId: 'ghost', widthMm: 18 },
    ] } as never)
    expect(loadSketch().members.map(m => m.id)).toEqual(['m1'])
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
