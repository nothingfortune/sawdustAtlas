import { describe, it, expect } from 'vitest'
import { normalizeData, importData } from '../src/storage'
import type { AtlasData } from '../src/types'

// PLAT-004 hardening: realistic "gnarly export" fixtures — older app states, hand-edited
// JSON, and partially-corrupted backups. The contract is that normalizeData NEVER throws
// (losing the whole backup is a trust failure) and always returns valid current-schema data.
// Anything it can't understand is coerced to a safe default, not crashed on.
const norm = (input: unknown) => normalizeData(input as Partial<AtlasData>)

describe('import robustness (PLAT-004)', () => {
  it('coerces top-level lists that are the wrong type instead of throwing', () => {
    const junk = { shops: 'nope', boards: {}, woods: 5, composites: null } as unknown
    expect(() => norm(junk)).not.toThrow()
    const out = norm(junk)
    expect(out.shops).toEqual([])
    expect(out.boards).toEqual([])
    expect(out.composites).toEqual([])
    // woods is unusable -> falls back to the default species library, never empty
    expect(out.woods.length).toBeGreaterThan(0)
  })

  it('survives a board whose endGrain is null and whose strips are a non-array', () => {
    const input = { shops: [], boards: [{ id: 'b', construction: 'end', endGrain: null, strips: { junk: true } }] } as unknown
    expect(() => norm(input)).not.toThrow()
    const board = norm(input).boards[0]!
    expect(board.strips).toEqual([])
    expect(board.endGrain.stockThickness).toBeGreaterThan(0)
    expect(Array.isArray(board.endGrain.rowFlips)).toBe(true)
  })

  it('survives null/garbage allowances and pricing blocks', () => {
    const input = { shops: [], boards: [], allowances: null, pricing: 'broken' } as unknown
    expect(() => norm(input)).not.toThrow()
    const out = norm(input)
    expect(Number.isFinite(out.allowances.jointing)).toBe(true)
    expect(Number.isFinite(out.pricing.laborRatePerHour)).toBe(true)
  })

  it('survives a composite whose rows and panels are the wrong type', () => {
    const input = {
      shops: [], boards: [],
      composites: [null, { id: 'c', name: 'C', construction: 'edge', rows: 'x', panels: 7 }],
    } as unknown
    expect(() => norm(input)).not.toThrow()
    const composites = norm(input).composites
    expect(composites).toHaveLength(1)
    expect(Array.isArray(composites[0]!.rows)).toBe(true)
    expect(Array.isArray(composites[0]!.panels)).toBe(true)
  })

  it('survives a shop whose items and zones are non-arrays with null members', () => {
    const input = { shops: [{ id: 's', name: 'S', width: 5000, depth: 4000, items: 'nope', blockedZones: [null] }], boards: [] } as unknown
    expect(() => norm(input)).not.toThrow()
    const shop = norm(input).shops[0]!
    expect(shop.items).toEqual([])
    expect(shop.blockedZones).toEqual([])
  })

  it('floors a deeply negative / NaN endGrain and keeps the board', () => {
    const input = {
      shops: [], boards: [{ id: 'b', construction: 'end', strips: [],
        endGrain: { stockThickness: -10, sliceThickness: Number.NaN, kerf: 'wide', trimAllowance: -3, sourceLength: Infinity } }],
    } as unknown
    expect(() => norm(input)).not.toThrow()
    const eg = norm(input).boards[0]!.endGrain
    expect(eg.stockThickness).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(eg.sliceThickness)).toBe(true)
    expect(Number.isFinite(eg.kerf)).toBe(true)
    expect(eg.trimAllowance).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(eg.sourceLength)).toBe(true)
  })

  it('importData reports a clean result for a gnarly-but-recoverable backup', () => {
    const backup = {
      shops: [{ id: 's', name: '', width: Number.NaN, items: [null], blockedZones: 'x' }],
      boards: [{ id: 'b', construction: 'end', endGrain: null, strips: [null, { speciesId: 'ghost', width: 40 }] }],
      composites: [{ id: 'c', name: 'C', construction: 'edge', rows: null, panels: null }],
    }
    const result = importData(backup)
    expect(result.ok).toBe(true)
    expect(result.data?.boards).toHaveLength(1)
    expect(result.data?.shops).toHaveLength(1)
    // the unknown wood is preserved as an editable placeholder, never silently dropped
    expect(result.data?.woods.some(w => w.id === 'ghost')).toBe(true)
  })
})
