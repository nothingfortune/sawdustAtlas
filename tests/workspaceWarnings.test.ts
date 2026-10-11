import { describe, expect, it } from 'vitest'
import { collectWorkspaceWarnings } from '../src/domain/workspaceWarnings'
import { DEFAULT_ALLOWANCES } from '../src/domain/boardAllowances'
import { DEFAULT_PRICING, starterData } from '../src/data'
import type { AtlasData, BoardProject, CompositeBoard, ShopProject, WoodSpecies } from '../src/types'

const wood = (id: string, over: Partial<WoodSpecies> = {}): WoodSpecies => ({ id, name: id === over.name ? id : 'Walnut', color: '#5a3828', accent: '#87614a', pricePerBoardFoot: 12, ...over })
const placeholderWood = (id: string): WoodSpecies => ({ id, name: id, color: '#8c6a48', accent: '#b18a5e', pricePerBoardFoot: 0 })

const endBoard = (id: string, strips: BoardProject['strips'], over: Partial<BoardProject['endGrain']> = {}): BoardProject => ({
  id, name: id, length: 450, thickness: 38, construction: 'end', updatedAt: '',
  endGrain: { sourceLength: 900, stockThickness: 38, sliceThickness: 45, kerf: 3.2, trimAllowance: 20, rowFlips: [], rowRotations: [], rowOffsets: [], rowOrder: [], ...over },
  allowances: { ...DEFAULT_ALLOWANCES }, strips,
})

const data = (over: Partial<AtlasData> = {}): AtlasData => ({
  schemaVersion: 2, shops: [], boards: [], woods: [wood('walnut')], allowances: { ...DEFAULT_ALLOWANCES }, pricing: { ...DEFAULT_PRICING }, composites: [], furniture: [], ...over,
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

describe('composite warnings', () => {
  const edgeBoard = (id: string, thickness = 20): BoardProject => ({
    id, name: id, length: 450, thickness, construction: 'edge', updatedAt: '',
    endGrain: { sourceLength: 900, stockThickness: 38, sliceThickness: 45, kerf: 3.2, trimAllowance: 20, rowFlips: [], rowRotations: [], rowOffsets: [], rowOrder: [] },
    allowances: { ...DEFAULT_ALLOWANCES },
    strips: [{ id: `${id}-s`, speciesId: 'walnut', width: 50, trailingAngle: 0 }],
  })
  const cut = { axis: 'x' as const, stripWidthMm: 50, kerfMm: 3, count: 3 }
  const cell = (panelId: string, pieceIndex: number) => ({ panelId, pieceIndex, rotate: 0 as const, flip: false })
  const composite = (over: Partial<CompositeBoard> = {}): CompositeBoard => ({
    id: 'c', name: 'Mosaic', construction: 'edge', updatedAt: '',
    panels: [{ id: 'p1', boardId: 'b1', cut }],
    rows: [{ id: 'r1', wafers: [cell('p1', 0), cell('p1', 1)] }],
    ...over,
  })
  const run = (c: CompositeBoard, boards: BoardProject[] = [edgeBoard('b1')]) =>
    collectWorkspaceWarnings(data({ boards, composites: [c] }), true).filter(w => w.id.startsWith('composite:'))

  it('is silent for a healthy composite', () => {
    expect(run(composite())).toEqual([])
  })

  it('errors on a panel whose source board is missing, linked to the composite', () => {
    const warnings = run(composite(), [])
    const w = warnings.find(x => x.id === 'composite:c:panel-missing:p1')
    expect(w).toMatchObject({ severity: 'error', location: { view: 'composite', targetId: 'c' } })
    expect(w!.message).toMatch(/Mosaic.*no longer exists/)
  })

  it('warns on a panel that yields zero wafers', () => {
    const warnings = run(composite({ panels: [{ id: 'p1', boardId: 'b1', cut: { ...cut, count: 0 } }], rows: [{ id: 'r1', wafers: [] }] }))
    expect(warnings.some(w => w.id === 'composite:c:panel-empty:p1' && w.severity === 'warning')).toBe(true)
  })

  it('warns on a composite with no rows', () => {
    expect(run(composite({ rows: [] })).map(w => w.id)).toEqual(['composite:c:no-rows'])
  })

  it('warns when every row is empty', () => {
    expect(run(composite({ rows: [{ id: 'r1', wafers: [] }] })).map(w => w.id)).toEqual(['composite:c:all-rows-empty'])
  })

  it('warns on one empty row among filled rows, naming its position', () => {
    const warnings = run(composite({ rows: [{ id: 'r1', wafers: [cell('p1', 0)] }, { id: 'r2', wafers: [] }] }))
    expect(warnings).toHaveLength(1)
    expect(warnings[0]!.id).toBe('composite:c:empty-row:r2')
    expect(warnings[0]!.message).toMatch(/row 2/)
  })

  it('errors on a wafer that references an unknown panel', () => {
    const warnings = run(composite({ rows: [{ id: 'r1', wafers: [cell('ghost', 0), cell('p1', 0)] }] }))
    expect(warnings.map(w => [w.id, w.severity])).toEqual([['composite:c:unknown-panel', 'error']])
  })

  it('errors on wafers placed beyond the panel yield and counts them', () => {
    // 450 mm board, 50 mm slices + 3 kerf, count 3 -> pieces 0..2 exist.
    const warnings = run(composite({ rows: [{ id: 'r1', wafers: [cell('p1', 2), cell('p1', 3), cell('p1', 9)] }] }))
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({ id: 'composite:c:beyond-yield', severity: 'error' })
    expect(warnings[0]!.message).toMatch(/2 wafers/)
  })

  it('does not blame wafers of a missing-source panel twice', () => {
    const warnings = run(composite(), [])
    expect(warnings.map(w => w.id)).toEqual(['composite:c:panel-missing:p1'])
  })

  it('warns when placed wafers differ in thickness', () => {
    const c = composite({
      panels: [{ id: 'p1', boardId: 'b1', cut }, { id: 'p2', boardId: 'b2', cut }],
      rows: [{ id: 'r1', wafers: [cell('p1', 0), cell('p2', 0)] }],
    })
    const warnings = run(c, [edgeBoard('b1', 20), edgeBoard('b2', 25)])
    expect(warnings.map(w => [w.id, w.severity])).toEqual([['composite:c:thickness', 'warning']])
  })

  it('ignores thickness of a panel whose wafers are not placed', () => {
    const c = composite({ panels: [{ id: 'p1', boardId: 'b1', cut }, { id: 'p2', boardId: 'b2', cut }] })
    expect(run(c, [edgeBoard('b1', 20), edgeBoard('b2', 25)])).toEqual([])
  })

  it('sorts composite errors ahead of warnings', () => {
    const c = composite({ panels: [{ id: 'p1', boardId: 'b1', cut }], rows: [{ id: 'r1', wafers: [cell('p1', 0)] }, { id: 'r2', wafers: [] }, { id: 'r3', wafers: [cell('p1', 7)] }] })
    const severities = run(c).map(w => w.severity)
    expect(severities).toEqual(['error', 'warning'])
  })
})

describe('starter workspace', () => {
  // A first-time visitor should open a clean workspace, not a warning about sample data.
  it('has nothing to review', () => {
    expect(collectWorkspaceWarnings(starterData, true)).toEqual([])
  })
})
