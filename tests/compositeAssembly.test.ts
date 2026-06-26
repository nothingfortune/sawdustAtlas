import { describe, expect, it } from 'vitest'
import { clearCell, emptyCells, placeCell, resizeGrid } from '../src/domain/compositeAssembly'
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
