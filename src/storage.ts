import type { AssemblyCell, AtlasData, BoardProject, BuildAllowances, CompositeBoard, CompositeCut, CompositePanel, CompositeRow, EndGrainSettings, ShopBlockedZone, ShopItem, ShopProject, WoodSpecies } from './types'
import { defaultSpecies, starterData } from './data'
import { DEFAULT_ALLOWANCES } from './domain/boardAllowances'
import { averageStripWidth } from './domain/boardGeometry'
import { normalizeShopItem } from './domain/shopObjects'
import { createId } from './id'

const KEY = 'sawdust-atlas:v1'
// v2: rowOffsets store a fraction of one cell (resolved to mm at render) rather than
// an absolute mm value, so running bonds keep tracking after strip widths are edited.
export const CURRENT_SCHEMA_VERSION = 2

export function loadData(): AtlasData {
  try {
    const saved = localStorage.getItem(KEY)
    if (!saved) return starterData
    const parsed: unknown = JSON.parse(saved)
    return isRecord(parsed) ? normalizeData(parsed) : starterData
  } catch {
    return starterData
  }
}

export function normalizeData(data: Partial<AtlasData>): AtlasData {
  const shops = records(data.shops)
  const boards = records(data.boards)
  const savedWoods = records(data.woods).length > 0 ? records(data.woods) : defaultSpecies
  const normalizedWoods = savedWoods.map(normalizeWood)
  const knownIds = new Set(normalizedWoods.map(wood => wood.id))
  const missingIds = boards
    .flatMap(board => records(board['strips']).map(strip => String(strip['speciesId'] ?? '')))
    .filter(id => id && !knownIds.has(id))
  // Milling allowances are shop-wide. Seed the global from saved global, else a
  // legacy board's per-board allowances (migrating drumSanding), then apply that
  // one setup to every board so the domain (which reads board.allowances) agrees.
  const allowances = normalizeAllowances((data.allowances ?? boards[0]?.['allowances']) as (BuildAllowances & { drumSanding?: number }) | undefined)
  // Pre-v2 saves stored running-bond offsets in absolute mm; v2 stores them as a
  // fraction of one cell (the average strip width) so they track edited widths.
  const incomingVersion = typeof data.schemaVersion === 'number' ? data.schemaVersion : 1
  // Migrating Phase-1 composites can spawn new boards (their inline strips become
  // real boards); collect them in a sink and append to the boards list.
  const migratedBoards: BoardProject[] = []
  const normalizedBoards = boards.map((board): BoardProject => {
    const strips = records(board['strips']).map(strip => ({
      id: stringValue(strip['id'], createId()),
      speciesId: stringValue(strip['speciesId'], normalizedWoods[0]?.id ?? 'walnut'),
      width: finiteNumber(strip['width'], 38),
      trailingAngle: signedFinite(strip['trailingAngle'], 0),
    }))
    const endGrain = normalizeEndGrain(board['endGrain'], finiteNumber(board['thickness'], 38))
    if (incomingVersion < 2 && endGrain.rowOffsets?.length) {
      const cell = averageStripWidth(strips)
      // No strips means no cell to scale against; leave the values as-is.
      if (cell > 0) endGrain.rowOffsets = endGrain.rowOffsets.map(mm => mm / cell)
    }
    return {
      id: stringValue(board['id'], createId()),
      name: stringValue(board['name'], 'Imported cutting board'),
      length: finiteNumber(board['length'], 450),
      thickness: finiteNumber(board['thickness'], 38),
      updatedAt: stringValue(board['updatedAt'], new Date().toISOString()),
      construction: board['construction'] === 'end' ? 'end' : 'edge',
      allowances,
      strips,
      endGrain,
    }
  })
  // Composites reference boards (to infer construction) and can spawn migrated
  // boards, so normalize them after the boards list exists.
  const composites = records(data.composites).map(c => normalizeComposite(c, migratedBoards, allowances, normalizedBoards))
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    allowances,
    composites,
    woods: [...normalizedWoods, ...[...new Set(missingIds)].map(id => normalizeWood({ id, name: id, color: '#8c6a48', accent: '#b18a5e', pricePerBoardFoot: 0 }))],
    shops: shops.map(normalizeShop),
    boards: [...normalizedBoards, ...migratedBoards],
  }
}

function normalizeShop(shop: Record<string, unknown>): ShopProject {
  return {
    id: stringValue(shop['id'], createId()),
    name: stringValue(shop['name'], 'Imported workshop'),
    width: finiteNumber(shop['width'], 6000),
    depth: finiteNumber(shop['depth'], 6000),
    gridSize: finiteNumber(shop['gridSize'], 300) || 300,
    blockedZones: records(shop['blockedZones']).map(zone => normalizeBlockedZone(zone as unknown as ShopBlockedZone)),
    updatedAt: stringValue(shop['updatedAt'], new Date().toISOString()),
    items: records(shop['items']).map(item => normalizeShopItem(item as unknown as ShopItem)),
  }
}

function normalizeBlockedZone(zone: ShopBlockedZone): ShopBlockedZone {
  return {
    id: stringValue(zone.id, createId()),
    name: stringValue(zone.name, 'No-go zone'),
    x: finiteNumber(zone.x, 0),
    y: finiteNumber(zone.y, 0),
    width: Math.max(1, finiteNumber(zone.width, 600)),
    depth: Math.max(1, finiteNumber(zone.depth, 600)),
  }
}

function normalizeComposite(raw: Record<string, unknown>, boardSink: BoardProject[], allowances: BuildAllowances, normalizedBoards: readonly BoardProject[]): CompositeBoard {
  const droppedPanelIds = new Set<string>()
  const panels: CompositePanel[] = []
  // A composite is one construction throughout; infer it from the first panel's
  // referenced (or spawned) board when the composite itself doesn't record it.
  let inferredConstruction: 'edge' | 'end' | undefined
  for (const rawPanel of records(raw['panels'])) {
    const id = stringValue(rawPanel['id'], createId())
    // Accept both the new `cut` and the legacy `crosscut` (always axis 'x').
    const cut = normalizeCut(rawPanel['cut'] ?? rawPanel['crosscut'])
    // New shape (or legacy inline-strip migrated earlier): a direct board reference.
    if (typeof rawPanel['boardId'] === 'string') {
      panels.push({ id, boardId: rawPanel['boardId'], cut })
      if (inferredConstruction === undefined) {
        inferredConstruction = normalizedBoards.find(b => b.id === rawPanel['boardId'])?.construction
      }
      continue
    }
    // Legacy 'rip' (inline strips) → create a board and reference it.
    if (rawPanel['kind'] === 'rip') {
      const boardId = createId()
      const thickness = finiteNumber(rawPanel['thicknessMm'], 38)
      const construction = rawPanel['construction'] === 'end' ? 'end' : 'edge'
      boardSink.push({
        id: boardId,
        name: stringValue(rawPanel['name'], 'Migrated panel'),
        length: 300,
        thickness,
        construction,
        endGrain: normalizeEndGrain(undefined, thickness),
        allowances,
        strips: records(rawPanel['strips']).map(s => ({
          id: stringValue(s['id'], createId()),
          speciesId: stringValue(s['speciesId'], 'walnut'),
          width: finiteNumber(s['width'], 38),
          trailingAngle: signedFinite(s['trailingAngle'], 0),
        })),
        updatedAt: new Date().toISOString(),
      })
      panels.push({ id, boardId, cut })
      if (inferredConstruction === undefined) inferredConstruction = construction
      continue
    }
    // Legacy 'derived' (recursion) → dropped; any wafers referencing it drop too.
    droppedPanelIds.add(id)
  }
  const construction = raw['construction'] === 'end' || raw['construction'] === 'edge'
    ? raw['construction']
    : (inferredConstruction ?? 'edge')
  return {
    id: stringValue(raw['id'], createId()),
    name: stringValue(raw['name'], 'Composite board'),
    construction,
    panels,
    rows: normalizeRows(raw, droppedPanelIds),
    updatedAt: stringValue(raw['updatedAt'], new Date().toISOString()),
  }
}

function normalizeCut(raw: unknown): CompositeCut {
  const c = isRecord(raw) ? raw : {}
  return {
    axis: c['axis'] === 'y' ? 'y' : 'x',
    stripWidthMm: finiteNumber(c['stripWidthMm'], 25),
    kerfMm: finiteNumber(c['kerfMm'], 3),
    count: Math.max(0, Math.floor(finiteNumber(c['count'], 1))),
  }
}

function normalizeWafers(raw: unknown, droppedPanelIds: Set<string>): AssemblyCell[] {
  const list = Array.isArray(raw) ? raw : []
  return list
    .map(normalizeCell)
    .filter((w): w is AssemblyCell => w !== null && !droppedPanelIds.has(w.panelId))
}

function normalizeRows(raw: Record<string, unknown>, droppedPanelIds: Set<string>): CompositeRow[] {
  const rawRows = raw['rows']
  // New shape: rows is an array of { id, wafers }.
  if (Array.isArray(rawRows)) {
    return rawRows.filter(isRecord).map(r => ({
      id: stringValue(r['id'], createId()),
      wafers: normalizeWafers(r['wafers'], droppedPanelIds),
    }))
  }
  // Legacy grid: rows:number, cols:number, cells: row-major sparse array → one
  // CompositeRow per grid row, dropping nulls and wafers of dropped panels.
  const rowCount = Math.max(1, Math.floor(finiteNumber(rawRows, 1)))
  const colCount = Math.max(1, Math.floor(finiteNumber(raw['cols'], 1)))
  const rawCells = Array.isArray(raw['cells']) ? raw['cells'] : []
  const rows: CompositeRow[] = []
  for (let r = 0; r < rowCount; r += 1) {
    const wafers: AssemblyCell[] = []
    for (let c = 0; c < colCount; c += 1) {
      const cell = normalizeCell(rawCells[r * colCount + c])
      if (cell && !droppedPanelIds.has(cell.panelId)) wafers.push(cell)
    }
    rows.push({ id: createId(), wafers })
  }
  return rows
}

function normalizeCell(raw: unknown): AssemblyCell | null {
  if (!isRecord(raw) || typeof raw['panelId'] !== 'string') return null
  const rotateRaw = finiteNumber(raw['rotate'], 0)
  const rotate = ([0, 90, 180, 270].includes(rotateRaw) ? rotateRaw : 0) as 0 | 90 | 180 | 270
  return {
    panelId: raw['panelId'],
    pieceIndex: Math.max(0, Math.floor(finiteNumber(raw['pieceIndex'], 0))),
    rotate,
    flip: raw['flip'] === true,
  }
}

function normalizeEndGrain(value: unknown, stockThickness: number): EndGrainSettings {
  const saved = isRecord(value) ? value : {}
  return {
    sourceLength: finiteNumber(saved['sourceLength'], 900),
    stockThickness: finiteNumber(saved['stockThickness'], stockThickness),
    sliceThickness: finiteNumber(saved['sliceThickness'], 45),
    kerf: finiteNumber(saved['kerf'], 3.2),
    trimAllowance: finiteNumber(saved['trimAllowance'], 20),
    rowFlips: Array.isArray(saved['rowFlips']) ? saved['rowFlips'].map(Boolean) : [],
    rowRotations: Array.isArray(saved['rowRotations']) ? saved['rowRotations'].map(Boolean) : [],
    rowOffsets: Array.isArray(saved['rowOffsets']) ? saved['rowOffsets'].map(value => signedFinite(value, 0)) : [],
    rowOrder: Array.isArray(saved['rowOrder']) ? saved['rowOrder'].map(value => Math.trunc(finiteNumber(value, 0))) : [],
  }
}

// Migrate the legacy `drumSanding` allowance to `routerTable` (same role: a
// final thickness-surfacing pass) so saved boards keep their value after the
// rename. Unknown/missing fields fall back to defaults.
function normalizeAllowances(saved: (BuildAllowances & { drumSanding?: number }) | undefined): BuildAllowances {
  const legacy = saved?.drumSanding
  const merged = { ...DEFAULT_ALLOWANCES, ...saved }
  if (saved?.routerTable === undefined && typeof legacy === 'number') merged.routerTable = legacy
  return {
    jointing: merged.jointing,
    planing: merged.planing,
    routerTable: merged.routerTable,
    ripAllowance: merged.ripAllowance,
    lengthTrim: merged.lengthTrim,
    widthTrim: merged.widthTrim,
  }
}

function normalizeWood(wood: Partial<WoodSpecies>): WoodSpecies {
  return {
    id: stringValue(wood.id, createId()),
    name: stringValue(wood.name, stringValue(wood.id, 'Custom wood')),
    color: validColor(wood.color, '#8c6a48'),
    accent: validColor(wood.accent, '#b18a5e'),
    pricePerBoardFoot: finiteNumber(wood.pricePerBoardFoot, 0),
  }
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback
}

// For true dimensions (widths, lengths, thicknesses) that can never be negative.
function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback
}

// For signed quantities (trailing angles, row offsets) where a negative value is
// meaningful and load-bearing — chevron/herringbone/mirrored bevels rely on it.
function signedFinite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function validColor(value: unknown, fallback: string) { return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback }

// Returns whether the write succeeded. localStorage.setItem can throw on quota
// exhaustion (large libraries) or in privacy modes (SecurityError); callers must
// surface that honestly instead of claiming the work is saved.
export function saveData(data: AtlasData): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

const PRE_IMPORT_KEY = 'sawdust-atlas:pre-import'

// Best-effort snapshot of the workspace taken immediately before an import
// replaces it, under a separate key so it survives a reload and stays recoverable.
export function savePreImportSnapshot(data: AtlasData): void {
  try { localStorage.setItem(PRE_IMPORT_KEY, JSON.stringify(data)) } catch { /* best effort; non-fatal */ }
}

export function loadPreImportSnapshot(): AtlasData | null {
  try {
    const saved = localStorage.getItem(PRE_IMPORT_KEY)
    if (!saved) return null
    const parsed: unknown = JSON.parse(saved)
    return isRecord(parsed) ? normalizeData(parsed) : null
  } catch {
    return null
  }
}

export function clearPreImportSnapshot(): void {
  try { localStorage.removeItem(PRE_IMPORT_KEY) } catch { /* best effort; non-fatal */ }
}

export function downloadData(data: AtlasData) {
  const blob = new Blob([JSON.stringify(normalizeData(data), null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `sawdust-atlas-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}
