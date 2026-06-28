import type { AssemblyCell, BoardProject, CompositeBoard, CompositeCut, CompositePanel } from '../types'
import { CUBIC_MM_PER_BOARD_FOOT, nonNegative } from './units'
import { calculateEndGrainMetrics } from './boardGeometry'

export interface Piece {
  panelId: string
  boardId: string     // donor board this wafer is sliced from (for faithful render)
  index: number
  widthMm: number     // drawn footprint width (mm)
  heightMm: number    // drawn footprint height (mm)
  thicknessMm: number // wafer depth = donor thickness (mm)
  grain: 'edge' | 'end' // composite/donor grain — both cut axes preserve it
  faceLengthMm: number  // donor face extent along X
  faceWidthMm: number   // donor face extent along Y
  axis: 'x' | 'y'       // cut orientation on the donor
  sliceOffsetMm: number // band start along the cut axis, in donor-face coords
  sliceMm: number       // band width
  bySpecies: Record<string, number> // per-wafer volume by species (mm^3)
}

export interface BoardFaceSize { lengthMm: number; widthMm: number }

// The donor board's finished thickness. For an end-grain board this is the
// crosscut width (endGrain.sliceThickness) — project.thickness is stale/hidden in
// the end-grain editor — so wafer volumes and the assembled thickness are right.
export function boardThickness(board: BoardProject): number {
  return board.construction === 'end'
    ? nonNegative(board.endGrain.sliceThickness)
    : nonNegative(board.thickness)
}

// The donor board's finished top-face extent. Edge: length × Σ strips. End: the
// assembled end-grain face (finalLength × panelWidth from the end-grain metrics).
export function boardFaceSize(board: BoardProject): BoardFaceSize {
  if (board.construction === 'end') {
    const m = calculateEndGrainMetrics(board)
    return { lengthMm: nonNegative(m.finalLength), widthMm: nonNegative(m.panelWidth) }
  }
  const widthMm = board.strips.reduce((acc, s) => acc + nonNegative(s.width), 0)
  return { lengthMm: nonNegative(board.length), widthMm }
}

// Most wafers the donor yields along the cut axis (a crosscut consumes the board
// length; a rip consumes the width), one slice + kerf per cut.
export function maxWafers(board: BoardProject, cut: CompositeCut): number {
  const face = boardFaceSize(board)
  const avail = cut.axis === 'x' ? face.lengthMm : face.widthMm
  const step = nonNegative(cut.stripWidthMm) + nonNegative(cut.kerfMm)
  if (step <= 0) return 0
  return Math.max(0, Math.floor((avail + nonNegative(cut.kerfMm)) / step))
}

// Slice a panel's donor board into wafers along the cut axis. The axis only
// changes orientation (crosscut vs rip), never the grain; every wafer mirrors a
// `slice`-wide band of the donor's real face. Count is capped to the donor yield.
export function panelPieces(panel: CompositePanel, boards: readonly BoardProject[]): Piece[] {
  const board = boards.find(b => b.id === panel.boardId)
  if (!board) return []
  const face = boardFaceSize(board)
  const slice = nonNegative(panel.cut.stripWidthMm)
  const kerf = nonNegative(panel.cut.kerfMm)
  const thickness = boardThickness(board)
  const count = Math.min(Math.max(0, Math.floor(panel.cut.count)), maxWafers(board, panel.cut))

  // Donor face species split by strip width (an approximation for end-grain donors).
  const totalStripW = board.strips.reduce((a, s) => a + nonNegative(s.width), 0)
  const frac: Record<string, number> = {}
  if (totalStripW > 0) for (const s of board.strips) frac[s.speciesId] = (frac[s.speciesId] ?? 0) + nonNegative(s.width) / totalStripW

  const pieces: Piece[] = []
  for (let index = 0; index < count; index += 1) {
    const widthMm = panel.cut.axis === 'x' ? slice : face.lengthMm
    const heightMm = panel.cut.axis === 'x' ? face.widthMm : slice
    const bandArea = slice * (panel.cut.axis === 'x' ? face.widthMm : face.lengthMm)
    const vol = bandArea * thickness
    const bySpecies: Record<string, number> = {}
    for (const [sp, f] of Object.entries(frac)) bySpecies[sp] = f * vol
    pieces.push({
      panelId: panel.id, boardId: board.id, index,
      widthMm, heightMm, thicknessMm: thickness, grain: board.construction,
      faceLengthMm: face.lengthMm, faceWidthMm: face.widthMm,
      axis: panel.cut.axis, sliceOffsetMm: index * (slice + kerf), sliceMm: slice,
      bySpecies,
    })
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

// ---- Desk layout (editing view) ---------------------------------------------
// Full (uncropped) footprints for every row — including empty ones, which the
// crop omits — each wafer carrying the trim it WOULD lose so the desk can draw
// faint trim markings on both axes while you edit.

export interface DeskWafer {
  wafer: AssemblyCell
  piece: Piece
  footWidthMm: number
  footHeightMm: number
  trimLeftMm: number
  trimRightMm: number
  trimTopMm: number
  trimBottomMm: number
}
export interface DeskRow { rowId: string; wafers: DeskWafer[]; rowWidthMm: number; bandHeightMm: number }
export interface DeskLayout { rows: DeskRow[]; maxRowWidthMm: number; totalHeightMm: number }

export function deskLayout(board: CompositeBoard, boards: readonly BoardProject[]): DeskLayout {
  const pmap = piecesByPanel(board, boards)
  const cropByRow = new Map(croppedLayout(board, boards).rows.map(r => [r.rowId, r]))
  const rows: DeskRow[] = board.rows.map(row => {
    const cr = cropByRow.get(row.id)
    // Filter to present pieces in the SAME order the crop used, so placed[j] aligns.
    const present = row.wafers
      .map(w => ({ w, piece: pmap.get(w.panelId)?.[w.pieceIndex] }))
      .filter((x): x is { w: AssemblyCell; piece: Piece } => x.piece !== undefined)
    const wafers: DeskWafer[] = present.map((x, j) => {
      const fp = placedFootprint(x.piece, x.w)
      const pr = cr?.placed[j]
      return {
        wafer: x.w, piece: x.piece, footWidthMm: fp.widthMm, footHeightMm: fp.heightMm,
        trimLeftMm: pr?.trimLeftMm ?? 0, trimRightMm: pr?.trimRightMm ?? 0,
        trimTopMm: pr?.trimTopMm ?? 0, trimBottomMm: pr?.trimBottomMm ?? 0,
      }
    })
    const rowWidthMm = wafers.reduce((a, w) => a + w.footWidthMm, 0)
    const bandHeightMm = wafers.length ? Math.max(...wafers.map(w => w.footHeightMm)) : 0
    return { rowId: row.id, wafers, rowWidthMm, bandHeightMm }
  })
  const maxRowWidthMm = Math.max(1, ...rows.map(r => r.rowWidthMm))
  const totalHeightMm = rows.reduce((a, r) => a + r.bandHeightMm, 0)
  return { rows, maxRowWidthMm, totalHeightMm }
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
    // Actual (yield-capped) wafer count — you can't slice more than the board has.
    const n = panelPieces(panel, boards).length
    const sourceMm = n * (nonNegative(panel.cut.stripWidthMm) + nonNegative(panel.cut.kerfMm))
    steps.push(`Panel "${src?.name ?? panel.boardId}": ${verb} into ${n} wafers (${panel.cut.stripWidthMm}mm wide, ${panel.cut.kerfMm}mm kerf) — needs ${sourceMm}mm of source.`)
  }
  const size = assembledSize(board, boards)
  const placed = board.rows.reduce((a, r) => a + r.wafers.length, 0)
  steps.push(`Assemble ${board.rows.length} row(s), ${placed} wafers; glue and trim to ${Math.round(size.lengthMm)}×${Math.round(size.widthMm)}mm.`)
  return { stages: [{ boardId: board.id, boardName: board.name, steps }] }
}
