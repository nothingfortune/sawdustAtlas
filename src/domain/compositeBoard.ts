import type { AssemblyCell, BoardProject, CompositeBoard, CompositePanel } from '../types'
import { CUBIC_MM_PER_BOARD_FOOT, nonNegative } from './units'

export interface StripBlock {
  speciesId: string
  widthMm: number
}

export interface Piece {
  panelId: string
  index: number
  widthMm: number     // wafer face width (mm)
  heightMm: number    // wafer face height (mm)
  thicknessMm: number // wafer depth = slice thickness (mm)
  grain: 'end' | 'long'
  strips: StripBlock[] // ordered blocks across the face width
  bySpecies: Record<string, number> // per-wafer volume by species (mm^3)
}

// Slice a panel's source board into `count` wafers along the cut axis.
// X (crosscut) → end-grain wafer face = boardWidth × thickness, depth = slice.
// Y (rip)      → long-grain strip face = boardLength × slice, depth = thickness.
export function panelPieces(panel: CompositePanel, boards: readonly BoardProject[]): Piece[] {
  const board = boards.find(b => b.id === panel.boardId)
  if (!board) return []
  const slice = nonNegative(panel.cut.stripWidthMm)
  const thickness = nonNegative(board.thickness)
  const boardWidth = board.strips.reduce((acc, s) => acc + nonNegative(s.width), 0)
  const count = Math.max(0, Math.floor(panel.cut.count))

  let widthMm: number, heightMm: number, depthMm: number, grain: 'end' | 'long'
  let strips: StripBlock[], bySpecies: Record<string, number>
  if (panel.cut.axis === 'x') {
    widthMm = boardWidth; heightMm = thickness; depthMm = slice; grain = 'end'
    strips = board.strips.map(s => ({ speciesId: s.speciesId, widthMm: nonNegative(s.width) }))
    bySpecies = {}
    for (const s of strips) bySpecies[s.speciesId] = (bySpecies[s.speciesId] ?? 0) + s.widthMm * thickness * slice
  } else {
    const length = nonNegative(board.length)
    widthMm = length; heightMm = slice; depthMm = thickness; grain = 'long'
    const dominant = [...board.strips].sort((a, b) => nonNegative(b.width) - nonNegative(a.width))[0]?.speciesId ?? board.strips[0]?.speciesId ?? 'walnut'
    strips = [{ speciesId: dominant, widthMm: length }]
    bySpecies = { [dominant]: length * slice * thickness }
  }

  const pieces: Piece[] = []
  for (let index = 0; index < count; index += 1) {
    pieces.push({ panelId: panel.id, index, widthMm, heightMm, thicknessMm: depthMm, grain, strips, bySpecies: { ...bySpecies } })
  }
  return pieces
}

export function placedFootprint(piece: Piece, cell: AssemblyCell): { widthMm: number; heightMm: number } {
  const swap = cell.rotate === 90 || cell.rotate === 270
  return swap
    ? { widthMm: piece.heightMm, heightMm: piece.widthMm }
    : { widthMm: piece.widthMm, heightMm: piece.heightMm }
}

// ---- Crop to a 4-sided board -------------------------------------------------

export interface PlacedRect {
  wafer: AssemblyCell
  piece: Piece
  footWidthMm: number
  footHeightMm: number
  keptWidthMm: number
  keptHeightMm: number
  trimLeftMm: number
  trimRightMm: number
  trimTopMm: number
  trimBottomMm: number
}
export interface RowLayout { rowId: string; placed: PlacedRect[]; heightMm: number }
export interface CroppedLayout { rows: RowLayout[]; lengthMm: number; widthMm: number; thicknessMm: number }

function piecesByPanel(board: CompositeBoard, boards: readonly BoardProject[]): Map<string, Piece[]> {
  const map = new Map<string, Piece[]>()
  for (const panel of board.panels) map.set(panel.id, panelPieces(panel, boards))
  return map
}

// Finished board = per-row crop to the shortest wafer (Y, centered) and every row
// cropped to the narrowest row's total width (X, centered). Overhang is waste.
export function croppedLayout(board: CompositeBoard, boards: readonly BoardProject[]): CroppedLayout {
  const pmap = piecesByPanel(board, boards)
  const resolved = board.rows.map(row => {
    const fps = row.wafers.flatMap(w => {
      const piece = pmap.get(w.panelId)?.[w.pieceIndex]
      if (!piece) return []
      const fp = placedFootprint(piece, w)
      return [{ wafer: w, piece, fw: fp.widthMm, fh: fp.heightMm }]
    })
    const rowWidth = fps.reduce((a, f) => a + f.fw, 0)
    const rowHeight = fps.length ? Math.min(...fps.map(f => f.fh)) : 0
    return { rowId: row.id, fps, rowWidth, rowHeight }
  }).filter(r => r.fps.length > 0)

  const targetWidth = resolved.length ? Math.min(...resolved.map(r => r.rowWidth)) : 0
  const rows: RowLayout[] = resolved.map(r => {
    const crop = (r.rowWidth - targetWidth) / 2
    const winR = r.rowWidth - crop
    let x = 0
    const placed: PlacedRect[] = r.fps.map(f => {
      const x0 = x
      x += f.fw
      const trimLeft = Math.max(0, Math.min(f.fw, crop - x0))
      const trimRight = Math.max(0, Math.min(f.fw, (x0 + f.fw) - winR))
      const keptWidthMm = Math.max(0, f.fw - trimLeft - trimRight)
      const trimY = Math.max(0, (f.fh - r.rowHeight) / 2)
      return {
        wafer: f.wafer, piece: f.piece, footWidthMm: f.fw, footHeightMm: f.fh,
        keptWidthMm, keptHeightMm: r.rowHeight, trimLeftMm: trimLeft, trimRightMm: trimRight, trimTopMm: trimY, trimBottomMm: trimY,
      }
    })
    return { rowId: r.rowId, placed, heightMm: r.rowHeight }
  })
  const lengthMm = rows.reduce((a, r) => a + r.heightMm, 0)
  const thicknessMm = resolved.length ? Math.max(...resolved.flatMap(r => r.fps.map(f => f.piece.thicknessMm))) : 0
  return { rows, lengthMm, widthMm: targetWidth, thicknessMm }
}

export interface AssembledSize { lengthMm: number; widthMm: number; thicknessMm: number }

export function assembledSize(board: CompositeBoard, boards: readonly BoardProject[]): AssembledSize {
  const l = croppedLayout(board, boards)
  return { lengthMm: l.lengthMm, widthMm: l.widthMm, thicknessMm: l.thicknessMm }
}

// ---- Material ----------------------------------------------------------------

export interface SpeciesUsage { speciesId: string; boardFeet: number }

function toUsage(totals: Record<string, number>): SpeciesUsage[] {
  return Object.entries(totals)
    .map(([speciesId, volume]) => ({ speciesId, boardFeet: volume / CUBIC_MM_PER_BOARD_FOOT }))
    .sort((a, b) => a.speciesId.localeCompare(b.speciesId))
}

// Finished material = the kept (cropped) volume of placed wafers, by species.
export function materialBySpecies(board: CompositeBoard, boards: readonly BoardProject[]): SpeciesUsage[] {
  const layout = croppedLayout(board, boards)
  const totals: Record<string, number> = {}
  for (const row of layout.rows) for (const pr of row.placed) {
    const fullArea = pr.footWidthMm * pr.footHeightMm
    const keptFrac = fullArea > 0 ? (pr.keptWidthMm * pr.keptHeightMm) / fullArea : 0
    for (const [sp, vol] of Object.entries(pr.piece.bySpecies)) totals[sp] = (totals[sp] ?? 0) + vol * keptFrac
  }
  return toUsage(totals)
}

// Stock = full placed-wafer volume + kerf (the cut that freed each wafer), by species.
export function stockBySpecies(board: CompositeBoard, boards: readonly BoardProject[]): SpeciesUsage[] {
  const pmap = piecesByPanel(board, boards)
  const panelById = new Map(board.panels.map(p => [p.id, p]))
  const totals: Record<string, number> = {}
  for (const row of board.rows) for (const w of row.wafers) {
    const piece = pmap.get(w.panelId)?.[w.pieceIndex]
    const panel = panelById.get(w.panelId)
    if (!piece || !panel) continue
    const slice = nonNegative(panel.cut.stripWidthMm) || 1
    const ratio = 1 + nonNegative(panel.cut.kerfMm) / slice
    for (const [sp, vol] of Object.entries(piece.bySpecies)) totals[sp] = (totals[sp] ?? 0) + vol * ratio
  }
  return toUsage(totals)
}

// ---- Cut plan ----------------------------------------------------------------

export interface CutPlanStage { boardId: string; boardName: string; steps: string[] }
export interface CompositeCutPlan { stages: CutPlanStage[] }

export function panelSourceLengthMm(panel: CompositePanel): number {
  const count = Math.max(0, Math.floor(panel.cut.count))
  return count * (nonNegative(panel.cut.stripWidthMm) + nonNegative(panel.cut.kerfMm))
}

export function compositeCutPlan(board: CompositeBoard, boards: readonly BoardProject[]): CompositeCutPlan {
  const steps: string[] = []
  for (const panel of board.panels) {
    const src = boards.find(b => b.id === panel.boardId)
    const verb = panel.cut.axis === 'x' ? 'crosscut' : 'rip'
    steps.push(`Panel "${src?.name ?? panel.boardId}": ${verb} into ${panel.cut.count} wafers (${panel.cut.stripWidthMm}mm wide, ${panel.cut.kerfMm}mm kerf) — needs ${panelSourceLengthMm(panel)}mm of source.`)
  }
  const size = assembledSize(board, boards)
  const placed = board.rows.reduce((a, r) => a + r.wafers.length, 0)
  steps.push(`Assemble ${board.rows.length} row(s), ${placed} wafers; glue and trim to ${Math.round(size.lengthMm)}×${Math.round(size.widthMm)}mm.`)
  return { stages: [{ boardId: board.id, boardName: board.name, steps }] }
}
