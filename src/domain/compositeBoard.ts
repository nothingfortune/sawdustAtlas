import type { AssemblyCell, BoardProject, CompositeBoard, CompositePanel } from '../types'
import { CUBIC_MM_PER_BOARD_FOOT, nonNegative } from './units'

export interface StripBlock {
  speciesId: string
  widthMm: number
}

export interface Piece {
  panelId: string
  index: number
  widthMm: number    // wafer end-grain face width = board width (sum of strip widths)
  heightMm: number   // wafer end-grain face height = board thickness
  thicknessMm: number // wafer depth = crosscut slice thickness
  strips: StripBlock[] // ordered strip blocks shown across the end-grain face
  bySpecies: Record<string, number>
}

// Crosscut a panel's source board into `count` wafers. Crosscutting a glued strip
// panel yields true end-grain wafers: each wafer's visible face is the board's
// cross-section — boardWidth (sum of strip widths) × boardThickness — with each
// strip an ordered end-grain block. The crosscut slice thickness is the wafer's
// depth. Kerf is removed stock between slices (see stockBySpecies), not part of a
// wafer. Returns [] when the referenced board is missing.
export function panelPieces(panel: CompositePanel, boards: readonly BoardProject[]): Piece[] {
  const board = boards.find(b => b.id === panel.boardId)
  if (!board) return []
  const slice = nonNegative(panel.crosscut.stripWidthMm)
  const thickness = nonNegative(board.thickness)
  const strips: StripBlock[] = board.strips.map(s => ({ speciesId: s.speciesId, widthMm: nonNegative(s.width) }))
  const faceWidth = strips.reduce((acc, s) => acc + s.widthMm, 0)
  const bySpecies: Record<string, number> = {}
  for (const s of strips) {
    bySpecies[s.speciesId] = (bySpecies[s.speciesId] ?? 0) + s.widthMm * thickness * slice
  }
  const count = Math.max(0, Math.floor(panel.crosscut.count))
  const pieces: Piece[] = []
  for (let index = 0; index < count; index += 1) {
    pieces.push({ panelId: panel.id, index, widthMm: faceWidth, heightMm: thickness, thicknessMm: slice, strips, bySpecies: { ...bySpecies } })
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

// Source-panel length needed to cut all pieces, including a parting kerf per piece.
export function panelSourceLengthMm(panel: CompositePanel): number {
  const count = Math.max(0, Math.floor(panel.crosscut.count))
  return count * (nonNegative(panel.crosscut.stripWidthMm) + nonNegative(panel.crosscut.kerfMm))
}

// Stock to cut, by species: every cut piece's volume PLUS kerf waste (kerf is not
// free), split across species in proportion to each board's strip volume.
export function stockBySpecies(board: CompositeBoard, boards: readonly BoardProject[]): SpeciesUsage[] {
  const totals: Record<string, number> = {}
  for (const panel of board.panels) {
    const src = boards.find(b => b.id === panel.boardId)
    if (!src) continue
    const count = Math.max(0, Math.floor(panel.crosscut.count))
    const width = nonNegative(panel.crosscut.stripWidthMm)
    const kerf = nonNegative(panel.crosscut.kerfMm)
    const thickness = nonNegative(src.thickness)
    const stackHeight = src.strips.reduce((a, s) => a + nonNegative(s.width), 0)
    const kerfWaste = count * kerf * stackHeight * thickness
    const stripTotal = stackHeight || 1
    for (const strip of src.strips) {
      const sw = nonNegative(strip.width)
      const finished = count * sw * width * thickness
      const waste = kerfWaste * (sw / stripTotal)
      totals[strip.speciesId] = (totals[strip.speciesId] ?? 0) + finished + waste
    }
  }
  return Object.entries(totals)
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
    steps.push(`Panel "${src?.name ?? panel.boardId}": rip glue-up, then crosscut into ${panel.crosscut.count} pieces (${panel.crosscut.stripWidthMm}mm wide, ${panel.crosscut.kerfMm}mm kerf) — needs ${panelSourceLengthMm(panel)}mm of source length.`)
  }
  const placed = board.cells.filter((c): c is AssemblyCell => c !== null).length
  steps.push(`Assemble ${board.rows}×${board.cols} grid: place ${placed} pieces, then glue up.`)
  return { stages: [{ boardId: board.id, boardName: board.name, steps }] }
}
