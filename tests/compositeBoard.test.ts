import { describe, expect, it } from 'vitest'
import { assembledSize, boardDependsOn, boardVolumeBySpecies, materialBySpecies, panelPieces, placedFootprint } from '../src/domain/compositeBoard'
import { CUBIC_MM_PER_BOARD_FOOT } from '../src/domain/units'
import type { AssemblyCell, CompositeBoard, DerivedPanel, RipPanel } from '../src/types'

const derivedPanel = (sourceBoardId: string, over: Partial<DerivedPanel> = {}): DerivedPanel => ({
  id: 'd', name: 'Derived', kind: 'derived', construction: 'end', sourceBoardId,
  crosscut: { stripWidthMm: 20, kerfMm: 3, count: 3 }, ...over,
})

const ripPanel = (over: Partial<RipPanel> = {}): RipPanel => ({
  id: 'A',
  name: 'Panel A',
  kind: 'rip',
  construction: 'edge',
  thicknessMm: 20,
  strips: [
    { id: 's1', speciesId: 'maple', width: 30, trailingAngle: 0 },
    { id: 's2', speciesId: 'walnut', width: 10, trailingAngle: 0 },
  ],
  crosscut: { stripWidthMm: 25, kerfMm: 3, count: 4 },
  ...over,
})

describe('panelPieces (rip panel)', () => {
  it('yields one piece per crosscut with the strip-stack cross-section', () => {
    const pieces = panelPieces(ripPanel(), new Map())
    expect(pieces).toHaveLength(4)
    expect(pieces[0]).toMatchObject({ panelId: 'A', index: 0, widthMm: 25, heightMm: 40, thicknessMm: 20 })
  })

  it('splits each piece volume by species (strip width × crosscut width × thickness)', () => {
    const [piece] = panelPieces(ripPanel(), new Map())
    expect(piece?.bySpecies).toEqual({ maple: 30 * 25 * 20, walnut: 10 * 25 * 20 })
  })
})

const cell = (over: Partial<AssemblyCell> = {}): AssemblyCell => ({ panelId: 'A', pieceIndex: 0, rotate: 0, flip: false, ...over })

const boardWith = (over: Partial<CompositeBoard> = {}): CompositeBoard => ({
  id: 'board1', name: 'Board 1', panels: [ripPanel()], rows: 2, cols: 1,
  cells: [cell({ pieceIndex: 0 }), cell({ pieceIndex: 1 })], updatedAt: '2026-06-25T00:00:00.000Z', ...over,
})

describe('placedFootprint', () => {
  it('swaps width/height when rotated 90 or 270', () => {
    const [piece] = panelPieces(ripPanel(), new Map())
    expect(placedFootprint(piece!, cell({ rotate: 0 }))).toEqual({ widthMm: 25, heightMm: 40 })
    expect(placedFootprint(piece!, cell({ rotate: 90 }))).toEqual({ widthMm: 40, heightMm: 25 })
  })
})

describe('assembledSize', () => {
  it('stacks two pieces in a 2x1 grid: length = sum of heights, width = max row width', () => {
    const size = assembledSize(boardWith(), new Map())
    expect(size).toEqual({ lengthMm: 80, widthMm: 25, thicknessMm: 20 })
  })

  it('ignores empty (null) cells', () => {
    const size = assembledSize(boardWith({ cells: [cell({ pieceIndex: 0 }), null] }), new Map())
    expect(size).toEqual({ lengthMm: 40, widthMm: 25, thicknessMm: 20 })
  })
})

describe('material accounting', () => {
  it('sums placed-piece volume by species (mm^3)', () => {
    // 2x1 grid places pieces 0 and 1 of the rip panel; each piece is maple 15000 + walnut 5000
    expect(boardVolumeBySpecies(boardWith(), new Map())).toEqual({ maple: 30000, walnut: 10000 })
  })

  it('conserves: placing all crosscut pieces equals the whole panel material', () => {
    const board = boardWith({ rows: 4, cols: 1, cells: [0, 1, 2, 3].map(i => cell({ pieceIndex: i })) })
    const vol = boardVolumeBySpecies(board, new Map())
    expect(vol).toEqual({ maple: 4 * 30 * 25 * 20, walnut: 4 * 10 * 25 * 20 })
  })

  it('reports board-feet per species, sorted', () => {
    expect(materialBySpecies(boardWith(), new Map())).toEqual([
      { speciesId: 'maple', boardFeet: 30000 / CUBIC_MM_PER_BOARD_FOOT },
      { speciesId: 'walnut', boardFeet: 10000 / CUBIC_MM_PER_BOARD_FOOT },
    ])
  })
})

describe('boardDependsOn (cycle guard)', () => {
  it('is true for itself', () => {
    const b = boardWith({ id: 'X' })
    expect(boardDependsOn(b, 'X', new Map())).toBe(true)
  })

  it('detects a transitive dependency through derived panels', () => {
    const a = boardWith({ id: 'A', panels: [ripPanel()] })
    const b = boardWith({ id: 'B', panels: [derivedPanel('A')] })
    const c = boardWith({ id: 'C', panels: [derivedPanel('B')] })
    const reg = new Map([['A', a], ['B', b], ['C', c]])
    expect(boardDependsOn(c, 'A', reg)).toBe(true)
    expect(boardDependsOn(c, 'Z', reg)).toBe(false)
  })
})
