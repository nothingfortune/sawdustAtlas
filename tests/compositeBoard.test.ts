import { describe, expect, it } from 'vitest'
import { assembledSize, panelPieces, placedFootprint } from '../src/domain/compositeBoard'
import type { AssemblyCell, CompositeBoard, RipPanel } from '../src/types'

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
