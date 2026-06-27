import type { AssemblyCell, CompositeBoard, CompositeRow } from '../types'
import { createId } from '../id'

// ---- Per-wafer transforms (about the wafer center) ----
const ROT: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270]
const TRANSFORM_CYCLE: Array<{ rotate: 0 | 90 | 180 | 270; flip: boolean }> = [
  { rotate: 0, flip: false }, { rotate: 90, flip: false }, { rotate: 180, flip: false }, { rotate: 270, flip: false },
  { rotate: 0, flip: true }, { rotate: 90, flip: true }, { rotate: 180, flip: true }, { rotate: 270, flip: true },
]
export function cycleTransform(cell: AssemblyCell): AssemblyCell {
  const i = TRANSFORM_CYCLE.findIndex(s => s.rotate === cell.rotate && s.flip === cell.flip)
  const next = TRANSFORM_CYCLE[(i + 1) % TRANSFORM_CYCLE.length] ?? TRANSFORM_CYCLE[0]!
  return { ...cell, rotate: next.rotate, flip: next.flip }
}
export function rotateRight(cell: AssemblyCell): AssemblyCell { return { ...cell, rotate: ROT[(ROT.indexOf(cell.rotate) + 1) % 4] ?? 0 } }
export function rotateLeft(cell: AssemblyCell): AssemblyCell { return { ...cell, rotate: ROT[(ROT.indexOf(cell.rotate) + 3) % 4] ?? 0 } }
export function flipX(cell: AssemblyCell): AssemblyCell { return { ...cell, flip: !cell.flip } }
export function flipY(cell: AssemblyCell): AssemblyCell { return { ...cell, flip: !cell.flip, rotate: ROT[(ROT.indexOf(cell.rotate) + 2) % 4] ?? 0 } }

export function pieceKey(panelId: string, pieceIndex: number): string { return `${panelId}:${pieceIndex}` }

// ---- Row + wafer operations (immutable; return a new board) ----
export function emptyRow(): CompositeRow { return { id: createId(), wafers: [] } }

export function addRow(board: CompositeBoard, where: 'above' | 'below', refRowId?: string): CompositeBoard {
  const row = emptyRow()
  const idx = refRowId ? board.rows.findIndex(r => r.id === refRowId) : -1
  if (idx < 0) return { ...board, rows: where === 'above' ? [row, ...board.rows] : [...board.rows, row] }
  const at = where === 'above' ? idx : idx + 1
  const rows = board.rows.slice()
  rows.splice(at, 0, row)
  return { ...board, rows }
}

export function removeRow(board: CompositeBoard, rowId: string): CompositeBoard {
  return { ...board, rows: board.rows.filter(r => r.id !== rowId) }
}

export function moveRow(board: CompositeBoard, rowId: string, toIndex: number): CompositeBoard {
  const from = board.rows.findIndex(r => r.id === rowId)
  if (from < 0 || toIndex < 0 || toIndex >= board.rows.length || from === toIndex) return board
  const rows = board.rows.slice()
  const [r] = rows.splice(from, 1)
  if (r) rows.splice(toIndex, 0, r)
  return { ...board, rows }
}

export function addWaferToRow(board: CompositeBoard, rowId: string, wafer: AssemblyCell): CompositeBoard {
  return { ...board, rows: board.rows.map(r => r.id === rowId ? { ...r, wafers: [...r.wafers, wafer] } : r) }
}

export function removeWafer(board: CompositeBoard, rowId: string, index: number): CompositeBoard {
  return { ...board, rows: board.rows.map(r => r.id === rowId ? { ...r, wafers: r.wafers.filter((_, i) => i !== index) } : r) }
}

export function transformWafer(board: CompositeBoard, rowId: string, index: number, fn: (cell: AssemblyCell) => AssemblyCell): CompositeBoard {
  return { ...board, rows: board.rows.map(r => r.id === rowId ? { ...r, wafers: r.wafers.map((w, i) => i === index ? fn(w) : w) } : r) }
}

export function moveWafer(board: CompositeBoard, fromRow: string, fromIndex: number, toRow: string, toIndex: number): CompositeBoard {
  const src = board.rows.find(r => r.id === fromRow)
  const wafer = src?.wafers[fromIndex]
  if (!wafer) return board
  const removed = board.rows.map(r => r.id === fromRow ? { ...r, wafers: r.wafers.filter((_, i) => i !== fromIndex) } : r)
  return {
    ...board,
    rows: removed.map(r => {
      if (r.id !== toRow) return r
      const wafers = r.wafers.slice()
      wafers.splice(Math.max(0, Math.min(toIndex, wafers.length)), 0, wafer)
      return { ...r, wafers }
    }),
  }
}
