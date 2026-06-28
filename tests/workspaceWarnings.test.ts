import { describe, expect, it } from 'vitest'
import { collectWorkspaceWarnings } from '../src/domain/workspaceWarnings'
import { DEFAULT_ALLOWANCES } from '../src/domain/boardAllowances'
import { DEFAULT_PRICING } from '../src/data'
import type { AtlasData, BoardProject, ShopProject, WoodSpecies } from '../src/types'

const wood = (id: string, over: Partial<WoodSpecies> = {}): WoodSpecies => ({ id, name: id === over.name ? id : 'Walnut', color: '#5a3828', accent: '#87614a', pricePerBoardFoot: 12, ...over })
const placeholderWood = (id: string): WoodSpecies => ({ id, name: id, color: '#8c6a48', accent: '#b18a5e', pricePerBoardFoot: 0 })

const endBoard = (id: string, strips: BoardProject['strips'], over: Partial<BoardProject['endGrain']> = {}): BoardProject => ({
  id, name: id, length: 450, thickness: 38, construction: 'end', updatedAt: '',
  endGrain: { sourceLength: 900, stockThickness: 38, sliceThickness: 45, kerf: 3.2, trimAllowance: 20, rowFlips: [], rowRotations: [], rowOffsets: [], rowOrder: [], ...over },
  allowances: { ...DEFAULT_ALLOWANCES }, strips,
})

const data = (over: Partial<AtlasData> = {}): AtlasData => ({
  schemaVersion: 2, shops: [], boards: [], woods: [wood('walnut')], allowances: { ...DEFAULT_ALLOWANCES }, pricing: { ...DEFAULT_PRICING }, composites: [], ...over,
})

describe('collectWorkspaceWarnings', () => {
  it('returns nothing for a clean, saved workspace', () => {
    expect(collectWorkspaceWarnings(data(), true)).toEqual([])
  })

  it('reports a storage error when saving has failed', () => {
    const warnings = collectWorkspaceWarnings(data(), false)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({ severity: 'error' })
    expect(warnings[0]!.message).toMatch(/sav/i)
  })

  it('reports an end-grain geometry error, linked to the board', () => {
    // width 10, trailing -45, 20 mm stock -> the strip closes/crosses.
    const board = endBoard('b', [{ id: 's', speciesId: 'walnut', width: 10, trailingAngle: -45 }], { stockThickness: 20 })
    const warnings = collectWorkspaceWarnings(data({ boards: [board] }), true)
    expect(warnings.some(w => w.severity === 'error' && /closes or crosses/.test(w.message) && w.location?.view === 'boards' && w.location.targetId === 'b')).toBe(true)
  })

  it('reports a thin/pointed-face warning, linked to the board', () => {
    const board = endBoard('b', [{ id: 's', speciesId: 'walnut', width: 40, trailingAngle: -40 }], { stockThickness: 40 })
    const warnings = collectWorkspaceWarnings(data({ boards: [board] }), true)
    expect(warnings.some(w => w.severity === 'warning' && /point|thin|taper/i.test(w.message) && w.location?.targetId === 'b')).toBe(true)
  })

  it('warns once per placeholder wood used by a board, linked to the wood library', () => {
    const board = endBoard('b', [{ id: 's', speciesId: 'ghost', width: 40, trailingAngle: 0 }])
    const warnings = collectWorkspaceWarnings(data({ boards: [board], woods: [wood('walnut'), placeholderWood('ghost')] }), true)
    const placeholder = warnings.filter(w => /placeholder/i.test(w.message))
    expect(placeholder).toHaveLength(1)
    expect(placeholder[0]!.location?.view).toBe('woods')
  })

  it('reports a shop with an object overlapping a blocked zone, linked to the shop', () => {
    const shop: ShopProject = {
      id: 'shop', name: 'Shop', width: 3000, depth: 3000, gridSize: 300, updatedAt: '',
      blockedZones: [{ id: 'z', name: 'No-go', x: 0, y: 0, width: 1000, depth: 1000 }],
      items: [{ id: 'i', name: 'Saw', kind: 'machine', x: 100, y: 100, width: 300, depth: 300, height: 900, rotation: 0, clearance: 0, feedDirection: null, infeedClearance: 0, outfeedClearance: 0, sideClearance: 0, color: '#d8863b' }],
    }
    const warnings = collectWorkspaceWarnings(data({ shops: [shop] }), true)
    expect(warnings.some(w => w.location?.view === 'shop' && w.location.targetId === 'shop' && /overlap/i.test(w.message))).toBe(true)
  })

  it('orders errors before warnings', () => {
    const errorBoard = endBoard('err', [{ id: 's', speciesId: 'walnut', width: 10, trailingAngle: -45 }], { stockThickness: 20 })
    const warnBoard = endBoard('warn', [{ id: 's', speciesId: 'walnut', width: 40, trailingAngle: -40 }], { stockThickness: 40 })
    const warnings = collectWorkspaceWarnings(data({ boards: [warnBoard, errorBoard] }), false)
    const severities = warnings.map(w => w.severity)
    expect(severities.indexOf('warning')).toBeGreaterThan(severities.lastIndexOf('error'))
  })
})
