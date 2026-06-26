import { describe, expect, it } from 'vitest'
import { cellFromPointer, clearCell, cycleTransform, emptyCells, moveCell, pieceKey, placeCell, resizeGrid } from '../src/domain/compositeAssembly'
import type { AssemblyCell } from '../src/types'

const cell = (over: Partial<AssemblyCell> = {}): AssemblyCell => ({ panelId: 'A', pieceIndex: 0, rotate: 0, flip: false, ...over })

describe('grid cell operations', () => {
  it('emptyCells builds a rows*cols array of nulls', () => {
    expect(emptyCells(2, 3)).toEqual([null, null, null, null, null, null])
  })

  it('placeCell returns a new array with the cell set at index', () => {
    const before = emptyCells(1, 2)
    const after = placeCell(before, 1, cell({ pieceIndex: 2 }))
    expect(after[1]).toEqual(cell({ pieceIndex: 2 }))
    expect(after).not.toBe(before) // immutable
    expect(before[1]).toBeNull()
  })

  it('clearCell nulls a single index immutably', () => {
    const before = placeCell(emptyCells(1, 2), 0, cell())
    const after = clearCell(before, 0)
    expect(after[0]).toBeNull()
    expect(before[0]).not.toBeNull()
  })

  it('resizeGrid preserves pieces by (row,col) and drops out-of-bounds', () => {
    // 2x2 grid, piece at row1,col1 (index 3)
    const cells = placeCell(emptyCells(2, 2), 3, cell({ pieceIndex: 9 }))
    // grow to 3 cols: index 3 (r1,c1) moves to r1,c1 = 1*3+1 = 4
    const grown = resizeGrid(cells, 2, 2, 3)
    expect(grown).toHaveLength(6)
    expect(grown[4]).toEqual(cell({ pieceIndex: 9 }))
    // shrink back to 1 col: r1,c1 is out of bounds (cols=1) -> dropped
    const shrunk = resizeGrid(cells, 2, 2, 1)
    expect(shrunk).toEqual([null, null])
  })
})

describe('cycleTransform (tap to rotate/flip)', () => {
  it('cycles rotations then flips then wraps, preserving identity', () => {
    let c = cell({ panelId: 'B', pieceIndex: 3, rotate: 0, flip: false })
    const seen: Array<{ rotate: number; flip: boolean }> = []
    for (let i = 0; i < 8; i += 1) { c = cycleTransform(c); seen.push({ rotate: c.rotate, flip: c.flip }) }
    expect(seen).toEqual([
      { rotate: 90, flip: false }, { rotate: 180, flip: false }, { rotate: 270, flip: false },
      { rotate: 0, flip: true }, { rotate: 90, flip: true }, { rotate: 180, flip: true }, { rotate: 270, flip: true },
      { rotate: 0, flip: false },
    ])
    expect(c).toMatchObject({ panelId: 'B', pieceIndex: 3 })
  })
})

describe('cellFromPointer (2D hit test)', () => {
  const rects = [
    { index: 0, left: 0, top: 0, right: 10, bottom: 10 },
    { index: 1, left: 10, top: 0, right: 20, bottom: 10 },
    { index: 2, left: 0, top: 10, right: 10, bottom: 20 },
  ]
  it('returns the index of the containing cell', () => {
    expect(cellFromPointer(rects, 5, 5)).toBe(0)
    expect(cellFromPointer(rects, 15, 5)).toBe(1)
    expect(cellFromPointer(rects, 5, 15)).toBe(2)
  })
  it('is half-open on right/bottom edges', () => {
    expect(cellFromPointer(rects, 10, 0)).toBe(1) // x=10 belongs to cell 1, not 0
  })
  it('returns -1 when outside every cell', () => {
    expect(cellFromPointer(rects, 100, 100)).toBe(-1)
  })
})

describe('moveCell (drag to move / swap)', () => {
  it('moves a piece into an empty cell', () => {
    const cells = placeCell(emptyCells(1, 2), 0, cell({ pieceIndex: 1 }))
    const after = moveCell(cells, 0, 1)
    expect(after[0]).toBeNull()
    expect(after[1]).toEqual(cell({ pieceIndex: 1 }))
  })
  it('swaps when the target is occupied', () => {
    let cells = placeCell(emptyCells(1, 2), 0, cell({ pieceIndex: 1 }))
    cells = placeCell(cells, 1, cell({ pieceIndex: 2 }))
    const after = moveCell(cells, 0, 1)
    expect(after[0]).toEqual(cell({ pieceIndex: 2 }))
    expect(after[1]).toEqual(cell({ pieceIndex: 1 }))
  })
  it('is a no-op for from===to or out-of-range', () => {
    const cells = placeCell(emptyCells(1, 2), 0, cell())
    expect(moveCell(cells, 0, 0)).toEqual(cells)
    expect(moveCell(cells, 0, 9)).toEqual(cells)
  })
})

import { buildRegistry, selectableSourceBoardIds } from '../src/domain/compositeAssembly'

describe('pieceKey', () => {
  it('formats panelId and pieceIndex into a colon-separated string', () => {
    expect(pieceKey('A', 2)).toBe('A:2')
  })
})
import type { CompositeBoard, DerivedPanel } from '../src/types'

const board = (id: string, panels: CompositeBoard['panels'] = []): CompositeBoard => ({
  id, name: id, panels, rows: 1, cols: 1, cells: [null], updatedAt: '2026-06-25T00:00:00.000Z',
})
const derived = (sourceBoardId: string): DerivedPanel => ({
  id: 'd-' + sourceBoardId, name: 'd', kind: 'derived', construction: 'edge', sourceBoardId,
  crosscut: { stripWidthMm: 20, kerfMm: 3, count: 2 },
})

describe('registry + cycle-guarded selection', () => {
  it('buildRegistry maps boards by id', () => {
    const reg = buildRegistry([board('A'), board('B')])
    expect(reg.get('A')?.id).toBe('A')
    expect(reg.size).toBe(2)
  })
  it('selectableSourceBoardIds excludes self and boards that depend on current', () => {
    const a = board('A')
    const b = board('B', [derived('A')]) // B depends on A
    const c = board('C')
    const ids = selectableSourceBoardIds([a, b, c], 'A')
    // A can't source itself; B depends on A (would cycle); C is fine
    expect(ids.sort()).toEqual(['C'])
  })
})
