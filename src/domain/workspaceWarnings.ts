import type { AtlasData, BoardProject, ShopProject, WoodSpecies } from '../types'
import { calculateEndGrainMetrics } from './boardGeometry'
import { getBlockedZoneConflicts } from './shopGeometry'

// UX-006: one app-wide list of everything that needs attention, each linked to the
// input that fixes it. Pure (no React) so it can be tested and reused. The UI renders
// these in the topbar warning center; in-place alerts in the editors stay as-is.

export type WarningSeverity = 'error' | 'warning'

export interface WarningLocation {
  view: 'boards' | 'shop' | 'woods'
  /** Board or shop id to open; omitted for views without a selection (e.g. woods). */
  targetId?: string
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
  warnings.push(...placeholderWoodWarnings(data))
  for (const shop of data.shops) {
    const conflicts = getBlockedZoneConflicts(shop)
    if (conflicts.length) {
      warnings.push({
        id: `shop:${shop.id}`,
        severity: 'warning',
        message: `${shopName(shop)}: ${conflicts.length} object${conflicts.length === 1 ? '' : 's'} overlap a blocked floor zone.`,
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
