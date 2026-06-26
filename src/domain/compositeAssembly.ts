import type { AssemblyCell } from '../types'

export type Cell = AssemblyCell | null

export function emptyCells(rows: number, cols: number): Cell[] {
  return Array.from({ length: Math.max(0, rows) * Math.max(0, cols) }, () => null)
}

export function placeCell(cells: Cell[], index: number, cell: AssemblyCell): Cell[] {
  const next = cells.slice()
  if (index >= 0 && index < next.length) next[index] = cell
  return next
}

export function clearCell(cells: Cell[], index: number): Cell[] {
  const next = cells.slice()
  if (index >= 0 && index < next.length) next[index] = null
  return next
}

export function resizeGrid(cells: Cell[], oldCols: number, newRows: number, newCols: number): Cell[] {
  const next = emptyCells(newRows, newCols)
  for (let i = 0; i < cells.length; i += 1) {
    const piece = cells[i]
    if (!piece) continue
    const r = Math.floor(i / oldCols)
    const c = i % oldCols
    if (r < newRows && c < newCols) next[r * newCols + c] = piece
  }
  return next
}
