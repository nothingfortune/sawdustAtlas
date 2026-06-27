import { describe, expect, it } from 'vitest'
import {
  cycleTransform, rotateLeft, rotateRight, flipX, flipY, pieceKey,
  addRow, removeRow, moveRow, addWaferToRow, removeWafer, moveWafer, transformWafer,
} from '../src/domain/compositeAssembly'
import type { AssemblyCell, CompositeBoard } from '../src/types'

const w = (over: Partial<AssemblyCell> = {}): AssemblyCell => ({ panelId: 'A', pieceIndex: 0, rotate: 0, flip: false, ...over })
const board = (over: Partial<CompositeBoard> = {}): CompositeBoard => ({
  id: 'c', name: 'C', construction: 'edge', panels: [],
  rows: [{ id: 'r1', wafers: [w({ pieceIndex: 0 })] }, { id: 'r2', wafers: [w({ pieceIndex: 1 })] }],
  updatedAt: '', ...over,
})

describe('transforms', () => {
  it('rotateRight/Left step ±90 wrap', () => { expect(rotateRight(w({ rotate: 270 })).rotate).toBe(0); expect(rotateLeft(w({ rotate: 0 })).rotate).toBe(270) })
  it('flipX toggles flip only; flipY = flip + 180', () => {
    expect(flipX(w({ flip: false, rotate: 90 }))).toMatchObject({ flip: true, rotate: 90 })
    expect(flipY(w({ flip: false, rotate: 90 }))).toMatchObject({ flip: true, rotate: 270 })
  })
  it('cycleTransform walks the 8 states and preserves identity', () => {
    expect(cycleTransform(w({ rotate: 270, flip: true }))).toMatchObject({ rotate: 0, flip: false, panelId: 'A' })
  })
  it('pieceKey formats', () => { expect(pieceKey('A', 2)).toBe('A:2') })
})

describe('row operations', () => {
  it('addRow above/below a ref row', () => {
    expect(addRow(board(), 'above', 'r2').rows.map(r => r.id).indexOf('r2')).toBe(2)
    const below = addRow(board(), 'below', 'r1')
    expect(below.rows.map(r => r.id)[1]).not.toBe('r2') // a new row sits between r1 and r2
    expect(below.rows).toHaveLength(3)
  })
  it('removeRow drops by id', () => { expect(removeRow(board(), 'r1').rows.map(r => r.id)).toEqual(['r2']) })
  it('moveRow reorders', () => { expect(moveRow(board(), 'r2', 0).rows.map(r => r.id)).toEqual(['r2', 'r1']) })
})

describe('wafer operations', () => {
  it('addWaferToRow appends', () => {
    expect(addWaferToRow(board(), 'r1', w({ pieceIndex: 9 })).rows[0]?.wafers).toHaveLength(2)
  })
  it('removeWafer drops by index', () => {
    const b = addWaferToRow(board(), 'r1', w({ pieceIndex: 9 }))
    expect(removeWafer(b, 'r1', 0).rows[0]?.wafers.map(x => x.pieceIndex)).toEqual([9])
  })
  it('transformWafer applies fn at index', () => {
    expect(transformWafer(board(), 'r1', 0, rotateRight).rows[0]?.wafers[0]?.rotate).toBe(90)
  })
  it('moveWafer relocates across rows', () => {
    const m = moveWafer(board(), 'r1', 0, 'r2', 0)
    expect(m.rows[0]?.wafers).toHaveLength(0)
    expect(m.rows[1]?.wafers.map(x => x.pieceIndex)).toEqual([0, 1])
  })
  it('is immutable', () => {
    const b = board()
    addWaferToRow(b, 'r1', w({ pieceIndex: 5 }))
    expect(b.rows[0]?.wafers).toHaveLength(1)
  })
})
