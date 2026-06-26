import type { AssemblyCell, CompositeBoard, RipPanel, SourcePanel } from '../types'
import { nonNegative } from './units'

export type BoardRegistry = Map<string, CompositeBoard>

export interface Piece {
  panelId: string
  index: number
  widthMm: number
  heightMm: number
  thicknessMm: number
  bySpecies: Record<string, number>
}

export function panelPieces(panel: SourcePanel, _registry: BoardRegistry): Piece[] {
  if (panel.kind === 'rip') return ripPanelPieces(panel)
  // Derived panels resolve from a source board; rendering is added in Task 5.
  return []
}

function ripPanelPieces(panel: RipPanel): Piece[] {
  const width = nonNegative(panel.crosscut.stripWidthMm)
  const thickness = nonNegative(panel.thicknessMm)
  const stackHeight = panel.strips.reduce((acc, strip) => acc + nonNegative(strip.width), 0)
  const bySpecies: Record<string, number> = {}
  for (const strip of panel.strips) {
    bySpecies[strip.speciesId] = (bySpecies[strip.speciesId] ?? 0) + nonNegative(strip.width) * width * thickness
  }
  const count = Math.max(0, Math.floor(panel.crosscut.count))
  const pieces: Piece[] = []
  for (let index = 0; index < count; index += 1) {
    pieces.push({ panelId: panel.id, index, widthMm: width, heightMm: stackHeight, thicknessMm: thickness, bySpecies: { ...bySpecies } })
  }
  return pieces
}

export function placedFootprint(piece: Piece, cell: AssemblyCell): { widthMm: number; heightMm: number } {
  const swap = cell.rotate === 90 || cell.rotate === 270
  return swap
    ? { widthMm: piece.heightMm, heightMm: piece.widthMm }
    : { widthMm: piece.widthMm, heightMm: piece.heightMm }
}

export interface AssembledSize {
  lengthMm: number
  widthMm: number
  thicknessMm: number
}

function buildPieceMap(board: CompositeBoard, registry: BoardRegistry): Map<string, Piece[]> {
  const map = new Map<string, Piece[]>()
  for (const panel of board.panels) map.set(panel.id, panelPieces(panel, registry))
  return map
}

function pieceFor(cell: AssemblyCell, pieceMap: Map<string, Piece[]>): Piece | undefined {
  return pieceMap.get(cell.panelId)?.[cell.pieceIndex]
}

export function assembledSize(board: CompositeBoard, registry: BoardRegistry): AssembledSize {
  const pieceMap = buildPieceMap(board, registry)
  let widthMm = 0
  let lengthMm = 0
  let thicknessMm = 0
  for (let r = 0; r < board.rows; r += 1) {
    let rowWidth = 0
    for (let c = 0; c < board.cols; c += 1) {
      const placed = board.cells[r * board.cols + c]
      if (!placed) continue
      const piece = pieceFor(placed, pieceMap)
      if (!piece) continue
      rowWidth += placedFootprint(piece, placed).widthMm
      thicknessMm = Math.max(thicknessMm, piece.thicknessMm)
    }
    widthMm = Math.max(widthMm, rowWidth)
  }
  for (let c = 0; c < board.cols; c += 1) {
    let colHeight = 0
    for (let r = 0; r < board.rows; r += 1) {
      const placed = board.cells[r * board.cols + c]
      if (!placed) continue
      const piece = pieceFor(placed, pieceMap)
      if (!piece) continue
      colHeight += placedFootprint(piece, placed).heightMm
    }
    lengthMm = Math.max(lengthMm, colHeight)
  }
  return { lengthMm, widthMm, thicknessMm }
}
