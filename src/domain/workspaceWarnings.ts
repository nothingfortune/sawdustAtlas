import type { AtlasData, BoardProject, CompositeBoard, ShopProject, WoodSpecies } from '../types'
import { calculateEndGrainMetrics } from './boardGeometry'
import { panelPieces } from './compositeBoard'
import { furnitureWarnings } from './furniture/validation'
import { getBlockedZoneConflicts } from './shopGeometry'

// UX-006: one app-wide list of everything that needs attention, each linked to the
// input that fixes it. Pure (no React) so it can be tested and reused. The UI renders
// these in the topbar warning center; in-place alerts in the editors stay as-is.

export type WarningSeverity = 'error' | 'warning'

export interface WarningLocation {
  view: 'boards' | 'composite' | 'shop' | 'woods' | 'furniture'
  /** Board, composite, shop, or furniture project id to open; omitted for views without a selection (e.g. woods). */
  targetId?: string
  /** Something inside the target to select and focus, such as a furniture part id. */
  focusId?: string
}

export interface WorkspaceWarning {
  id: string
  severity: WarningSeverity
  message: string
  location?: WarningLocation
}

export function collectWorkspaceWarnings(data: AtlasData, saveOk: boolean): WorkspaceWarning[] {
  const warnings: WorkspaceWarning[] = []

  if (!saveOk) {
    warnings.push({ id: 'storage', severity: 'error', message: "Changes aren't saving in this browser — export a backup to avoid losing work." })
  }

  for (const board of data.boards) {
    warnings.push(...boardWarnings(board))
  }
  for (const composite of data.composites) {
    warnings.push(...compositeWarnings(composite, data.boards))
  }
  for (const project of data.furniture) {
    warnings.push(...furnitureWarnings(project, { woods: data.woods, allowances: data.allowances }))
  }
  warnings.push(...placeholderWoodWarnings(data))
  for (const shop of data.shops) {
    const conflicts = getBlockedZoneConflicts(shop)
    if (conflicts.length) {
      warnings.push({
        id: `shop:${shop.id}`,
        severity: 'warning',
        message: `${shopName(shop)}: ${conflicts.length === 1 ? '1 object overlaps' : `${conflicts.length} objects overlap`} a blocked floor zone.`,
        location: { view: 'shop', targetId: shop.id },
      })
    }
  }

  // Errors before warnings; stable within each group.
  return warnings.sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
}

function boardWarnings(board: BoardProject): WorkspaceWarning[] {
  if (board.construction !== 'end') return []
  const metrics = calculateEndGrainMetrics(board)
  const name = board.name.trim() || 'Untitled board'
  const location: WarningLocation = { view: 'boards', targetId: board.id }
  return [
    ...metrics.errors.map((error, index): WorkspaceWarning => ({ id: `board:${board.id}:error:${index}`, severity: 'error', message: `${name}: ${error}`, location })),
    ...metrics.warnings.map((warning, index): WorkspaceWarning => ({ id: `board:${board.id}:warning:${index}`, severity: 'warning', message: `${name}: ${warning}`, location })),
  ]
}

// Composite failure modes that the layout code otherwise swallows silently: a panel whose
// donor board is gone or yields nothing, wafers pointing at pieces that do not exist
// (croppedLayout drops them), empty rows, and mixed wafer thickness (the glue-up can
// only reach the thinnest wafer).
function compositeWarnings(composite: CompositeBoard, boards: readonly BoardProject[]): WorkspaceWarning[] {
  const name = composite.name.trim() || 'Untitled composite'
  const location: WarningLocation = { view: 'composite', targetId: composite.id }
  const out: WorkspaceWarning[] = []
  const add = (key: string, severity: WarningSeverity, message: string) =>
    out.push({ id: `composite:${composite.id}:${key}`, severity, message: `${name}: ${message}`, location })

  if (composite.rows.length === 0) add('no-rows', 'warning', 'has no rows yet, so there is nothing to assemble.')
  else if (composite.rows.every(row => row.wafers.length === 0)) add('all-rows-empty', 'warning', 'has no wafers placed in any row.')
  else composite.rows.forEach((row, index) => {
    if (row.wafers.length === 0) add(`empty-row:${row.id}`, 'warning', `row ${index + 1} is empty and is left out of the assembled board.`)
  })

  const yields = new Map<string, number>()
  const thickness = new Map<string, number>()
  composite.panels.forEach((panel, index) => {
    const label = `panel ${index + 1}`
    if (!boards.some(board => board.id === panel.boardId)) {
      add(`panel-missing:${panel.id}`, 'error', `${label} uses a source board that no longer exists.`)
      return
    }
    const pieces = panelPieces(panel, boards)
    yields.set(panel.id, pieces.length)
    if (pieces[0]) thickness.set(panel.id, pieces[0].thicknessMm)
    if (pieces.length === 0) add(`panel-empty:${panel.id}`, 'warning', `${label} yields no wafers; check its cut width, kerf, and count.`)
  })

  const missingPanels = new Set<string>()
  let beyondYield = 0
  const placedThickness = new Set<number>()
  for (const row of composite.rows) {
    for (const wafer of row.wafers) {
      const panelYield = yields.get(wafer.panelId)
      if (panelYield === undefined) {
        if (!composite.panels.some(panel => panel.id === wafer.panelId)) missingPanels.add(wafer.panelId)
        continue
      }
      if (wafer.pieceIndex >= panelYield) { beyondYield += 1; continue }
      const t = thickness.get(wafer.panelId)
      if (t !== undefined) placedThickness.add(t)
    }
  }
  if (missingPanels.size > 0) add('unknown-panel', 'error', `${missingPanels.size === 1 ? 'a wafer refers' : 'wafers refer'} to a panel that is not in this composite.`)
  if (beyondYield > 0) add('beyond-yield', 'error', `${beyondYield} wafer${beyondYield === 1 ? '' : 's'} placed beyond what the panel can yield.`)
  if (placedThickness.size > 1) {
    add('thickness', 'warning', `panels differ in thickness; the assembled board takes the thinnest.`)
  }
  return out
}

// One warning per placeholder species (name === id, $0 — e.g. seeded by an import for
// an unknown wood) that a board actually uses. Fix lives in the wood library.
function placeholderWoodWarnings(data: AtlasData): WorkspaceWarning[] {
  const placeholders = new Map(data.woods.filter(isPlaceholderWood).map(wood => [wood.id, wood]))
  if (placeholders.size === 0) return []
  const used = new Set<string>()
  for (const board of data.boards) {
    for (const strip of board.strips) if (placeholders.has(strip.speciesId)) used.add(strip.speciesId)
  }
  return [...used].map((id): WorkspaceWarning => ({
    id: `wood:${id}`,
    severity: 'warning',
    message: `Wood "${id}" is a placeholder — set its name, color, and price in the Wood library.`,
    location: { view: 'woods' },
  }))
}

function isPlaceholderWood(wood: WoodSpecies): boolean {
  return wood.name === wood.id && wood.pricePerBoardFoot === 0
}

function shopName(shop: ShopProject): string {
  return shop.name.trim() || 'Untitled workshop'
}

function severityRank(severity: WarningSeverity): number {
  return severity === 'error' ? 0 : 1
}
