import type { AssemblyCell, CompositeBoard } from '../types'
import { boardDependsOn, type BoardRegistry } from './compositeBoard'

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

const TRANSFORM_CYCLE: Array<{ rotate: 0 | 90 | 180 | 270; flip: boolean }> = [
  { rotate: 0, flip: false }, { rotate: 90, flip: false }, { rotate: 180, flip: false }, { rotate: 270, flip: false },
  { rotate: 0, flip: true }, { rotate: 90, flip: true }, { rotate: 180, flip: true }, { rotate: 270, flip: true },
]

export function cycleTransform(cell: AssemblyCell): AssemblyCell {
  const i = TRANSFORM_CYCLE.findIndex(s => s.rotate === cell.rotate && s.flip === cell.flip)
  const next = TRANSFORM_CYCLE[(i + 1) % TRANSFORM_CYCLE.length] ?? TRANSFORM_CYCLE[0]!
  return { ...cell, rotate: next.rotate, flip: next.flip }
}

export interface CellRect {
  index: number
  left: number
  top: number
  right: number
  bottom: number
}

export function cellFromPointer(rects: readonly CellRect[], clientX: number, clientY: number): number {
  for (const r of rects) {
    if (clientX >= r.left && clientX < r.right && clientY >= r.top && clientY < r.bottom) return r.index
  }
  return -1
}

export function moveCell(cells: Cell[], from: number, to: number): Cell[] {
  if (from === to || from < 0 || to < 0 || from >= cells.length || to >= cells.length) return cells
  const next = cells.slice()
  const moved = next[from] ?? null
  next[from] = next[to] ?? null
  next[to] = moved
  return next
}

export function buildRegistry(boards: readonly CompositeBoard[]): BoardRegistry {
  return new Map(boards.map(b => [b.id, b]))
}

export function selectableSourceBoardIds(boards: readonly CompositeBoard[], currentId: string): string[] {
  const registry = buildRegistry(boards)
  return boards
    .filter(b => b.id !== currentId && !boardDependsOn(b, currentId, registry))
    .map(b => b.id)
}

export function pieceKey(panelId: string, pieceIndex: number): string {
  return `${panelId}:${pieceIndex}`
}
