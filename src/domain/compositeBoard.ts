import type { AssemblyCell, BoardProject, CompositeBoard, CompositePanel } from '../types'
import { CUBIC_MM_PER_BOARD_FOOT, nonNegative } from './units'

export interface Piece {
  panelId: string
  index: number
  widthMm: number
  heightMm: number
  thicknessMm: number
  bySpecies: Record<string, number>
  construction: 'edge' | 'end'
}

// Resolve a panel's source board and crosscut it into `count` pieces. A piece's
// width is the crosscut width; its height is the board's strip-stack cross-section.
// Kerf is removed stock between pieces (accounted for in stock totals), not part
// of a piece. Returns [] when the referenced board is missing.
export function panelPieces(panel: CompositePanel, boards: readonly BoardProject[]): Piece[] {
  const board = boards.find(b => b.id === panel.boardId)
  if (!board) return []
  const width = nonNegative(panel.crosscut.stripWidthMm)
  const thickness = nonNegative(board.thickness)
  const stackHeight = board.strips.reduce((acc, strip) => acc + nonNegative(strip.width), 0)
  const bySpecies: Record<string, number> = {}
  for (const strip of board.strips) {
    bySpecies[strip.speciesId] = (bySpecies[strip.speciesId] ?? 0) + nonNegative(strip.width) * width * thickness
  }
  const count = Math.max(0, Math.floor(panel.crosscut.count))
  const pieces: Piece[] = []
  for (let index = 0; index < count; index += 1) {
    pieces.push({ panelId: panel.id, index, widthMm: width, heightMm: stackHeight, thicknessMm: thickness, bySpecies: { ...bySpecies }, construction: board.construction })
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

function buildPieceMap(board: CompositeBoard, boards: readonly BoardProject[]): Map<string, Piece[]> {
  const map = new Map<string, Piece[]>()
  for (const panel of board.panels) map.set(panel.id, panelPieces(panel, boards))
  return map
}

function pieceFor(cell: AssemblyCell, pieceMap: Map<string, Piece[]>): Piece | undefined {
  return pieceMap.get(cell.panelId)?.[cell.pieceIndex]
}

export function assembledSize(board: CompositeBoard, boards: readonly BoardProject[]): AssembledSize {
  const pieceMap = buildPieceMap(board, boards)
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

export function boardVolumeBySpecies(board: CompositeBoard, boards: readonly BoardProject[]): Record<string, number> {
  const pieceMap = buildPieceMap(board, boards)
  const totals: Record<string, number> = {}
  for (const placed of board.cells) {
    if (!placed) continue
    const piece = pieceFor(placed, pieceMap)
    if (!piece) continue
    for (const [species, volume] of Object.entries(piece.bySpecies)) {
      totals[species] = (totals[species] ?? 0) + volume
    }
  }
  return totals
}

export interface SpeciesUsage {
  speciesId: string
  boardFeet: number
}

export function materialBySpecies(board: CompositeBoard, boards: readonly BoardProject[]): SpeciesUsage[] {
  return Object.entries(boardVolumeBySpecies(board, boards))
    .map(([speciesId, volume]) => ({ speciesId, boardFeet: volume / CUBIC_MM_PER_BOARD_FOOT }))
    .sort((a, b) => a.speciesId.localeCompare(b.speciesId))
}

export interface CutPlanStage {
  boardId: string
  boardName: string
  steps: string[]
}

export interface CompositeCutPlan {
  stages: CutPlanStage[]
}

export function compositeCutPlan(board: CompositeBoard, boards: readonly BoardProject[]): CompositeCutPlan {
  const steps: string[] = []
  for (const panel of board.panels) {
    const src = boards.find(b => b.id === panel.boardId)
    steps.push(`Panel "${src?.name ?? panel.boardId}": crosscut into ${panel.crosscut.count} pieces (${panel.crosscut.stripWidthMm}mm wide, ${panel.crosscut.kerfMm}mm kerf).`)
  }
  const placed = board.cells.filter((c): c is AssemblyCell => c !== null).length
  steps.push(`Assemble ${board.rows}×${board.cols} grid: place ${placed} pieces, then glue up.`)
  return { stages: [{ boardId: board.id, boardName: board.name, steps }] }
}
