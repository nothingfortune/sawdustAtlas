import type { AssemblyCell, AtlasData, BoardProject, BuildAllowances, CompositeBoard, CompositeCut, CompositePanel, CompositeRow, EndGrainSettings, PricingSettings, ShopBlockedZone, ShopItem, ShopProject, WoodSpecies } from './types'
import { DEFAULT_PRICING, defaultSpecies, starterData } from './data'
import { DEFAULT_ALLOWANCES } from './domain/boardAllowances'
import { LATEST_SCHEMA_VERSION, migrate } from './domain/migrations'
import { normalizeShopItem } from './domain/shopObjects'
import { createId } from './id'

const KEY = 'sawdust-atlas:v1'
// Schema history and named migration steps live in domain/migrations.ts. v2 stores
// running-bond offsets as cell fractions (resolved to mm at render).
export const CURRENT_SCHEMA_VERSION = LATEST_SCHEMA_VERSION

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

export function normalizeData(input: Partial<AtlasData>): AtlasData {
  // Upgrade the raw shape through the named migration steps first, then coerce.
  const data = migrate(input as Record<string, unknown>).data as Partial<AtlasData>
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
    pricing: normalizePricing(data.pricing),
    composites,
    woods: [...normalizedWoods, ...[...new Set(missingIds)].map(id => normalizeWood({ id, name: id, color: '#8c6a48', accent: '#b18a5e', pricePerBoardFoot: 0 }))],
    shops: shops.map(normalizeShop),
    boards: [...normalizedBoards, ...migratedBoards],
  }
}

export interface ImportCounts { shops: number; boards: number; composites: number; woods: number }
export interface ImportResult {
  ok: boolean
  data: AtlasData | null
  counts: ImportCounts
  warnings: string[]
  errors: string[]
}

const NO_COUNTS: ImportCounts = { shops: 0, boards: 0, composites: 0, woods: 0 }
const TOP_LEVEL_KEYS = new Set(['schemaVersion', 'shops', 'boards', 'woods', 'allowances', 'pricing', 'composites'])
const BOARD_KEYS = new Set(['id', 'name', 'length', 'thickness', 'construction', 'endGrain', 'allowances', 'strips', 'updatedAt'])
const SHOP_KEYS = new Set(['id', 'name', 'width', 'depth', 'gridSize', 'blockedZones', 'items', 'updatedAt'])
const WOOD_KEYS = new Set(['id', 'name', 'color', 'accent', 'pricePerBoardFoot'])

// Single entry point for importing a backup: validate, migrate, normalize, and
// report. Surfaces project counts and anything it could not carry over (unrecognized
// fields, unknown wood references, newer-than-app backups) so nothing is dropped
// silently (PLAT-004). normalizeData stays the load path; importData wraps it for UI.
export function importData(parsed: unknown): ImportResult {
  if (!isRecord(parsed)) {
    return { ok: false, data: null, counts: NO_COUNTS, warnings: [], errors: ['This file is not a SawdustAtlas backup.'] }
  }
  const errors: string[] = []
  if (!Array.isArray(parsed['shops'])) errors.push('Backup is missing its "shops" list.')
  if (!Array.isArray(parsed['boards'])) errors.push('Backup is missing its "boards" list.')
  if (errors.length) return { ok: false, data: null, counts: NO_COUNTS, warnings: [], errors }

  const migrated = migrate(parsed)
  const data = normalizeData(parsed as Partial<AtlasData>)
  const counts: ImportCounts = { shops: data.shops.length, boards: data.boards.length, composites: data.composites.length, woods: data.woods.length }
  return { ok: true, data, counts, warnings: collectImportWarnings(parsed, migrated.tooNew, migrated.fromVersion), errors: [] }
}

function collectImportWarnings(raw: Record<string, unknown>, tooNew: boolean, fromVersion: number): string[] {
  const warnings: string[] = []
  if (tooNew) warnings.push(`This backup is from a newer version (schema v${fromVersion}); fields this app doesn't understand were ignored.`)

  const unknownTop = Object.keys(raw).filter(key => !TOP_LEVEL_KEYS.has(key))
  if (unknownTop.length) warnings.push(`Ignored unrecognized top-level field(s): ${unknownTop.join(', ')}.`)

  const unknownFields = new Set<string>()
  collectUnknownKeys(raw['boards'], BOARD_KEYS, 'board', unknownFields)
  collectUnknownKeys(raw['shops'], SHOP_KEYS, 'shop', unknownFields)
  collectUnknownKeys(raw['woods'], WOOD_KEYS, 'wood', unknownFields)
  if (unknownFields.size) {
    const shown = [...unknownFields].slice(0, 8).join(', ')
    warnings.push(`Ignored ${unknownFields.size} unrecognized field(s): ${shown}${unknownFields.size > 8 ? ', …' : ''}.`)
  }

  // A strip referencing a wood id absent from the effective library gets a placeholder
  // species (so colors/prices stay visible); surface it so it can be corrected. Mirror
  // normalizeData's source: saved woods if present, else the default library.
  const savedWoodIds = new Set(
    records(raw['woods']).length > 0
      ? records(raw['woods']).map(wood => String(wood['id'] ?? ''))
      : defaultSpecies.map(wood => wood.id),
  )
  const missing = new Set(
    records(raw['boards'])
      .flatMap(board => records(board['strips']).map(strip => String(strip['speciesId'] ?? '')))
      .filter(id => id && !savedWoodIds.has(id)),
  )
  if (missing.size) warnings.push(`${missing.size} strip wood reference(s) were unknown; placeholder species were added: ${[...missing].slice(0, 6).join(', ')}.`)

  return warnings
}

function collectUnknownKeys(list: unknown, allowed: Set<string>, label: string, sink: Set<string>): void {
  if (!Array.isArray(list)) return
  for (const record of list) {
    if (!isRecord(record)) continue
    for (const key of Object.keys(record)) if (!allowed.has(key)) sink.add(`${label}.${key}`)
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

export function normalizePricing(saved: unknown): PricingSettings {
  const s = isRecord(saved) ? saved : {}
  const tiers = isRecord(s['tierHours']) ? s['tierHours'] : {}
  const floor = isRecord(s['floor']) ? s['floor'] : {}
  return {
    materialMarkupPercent: nonNegativeFinite(s['materialMarkupPercent'], DEFAULT_PRICING.materialMarkupPercent),
    laborRatePerHour: nonNegativeFinite(s['laborRatePerHour'], DEFAULT_PRICING.laborRatePerHour),
    tierHours: {
      simple: nonNegativeFinite(tiers['simple'], DEFAULT_PRICING.tierHours.simple),
      standard: nonNegativeFinite(tiers['standard'], DEFAULT_PRICING.tierHours.standard),
      complex: nonNegativeFinite(tiers['complex'], DEFAULT_PRICING.tierHours.complex),
    },
    consumablesBase: nonNegativeFinite(s['consumablesBase'], DEFAULT_PRICING.consumablesBase),
    consumablesPerBoardFoot: nonNegativeFinite(s['consumablesPerBoardFoot'], DEFAULT_PRICING.consumablesPerBoardFoot),
    floor: {
      edge: nonNegativeFinite(floor['edge'], DEFAULT_PRICING.floor.edge),
      end: nonNegativeFinite(floor['end'], DEFAULT_PRICING.floor.end),
    },
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

// For pricing fields: reject negatives outright (unlike finiteNumber which floors
// them to 0). A stored negative price or rate is always a data error.
function nonNegativeFinite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
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

const ONBOARDED_KEY = 'sawdust-atlas:onboarded'

// Whether the first-run welcome has been dismissed. If storage is unavailable we
// report true so we never nag on every load when the dismissal can't be persisted.
export function hasOnboarded(): boolean {
  try { return localStorage.getItem(ONBOARDED_KEY) === '1' } catch { return true }
}

export function markOnboarded(): void {
  try { localStorage.setItem(ONBOARDED_KEY, '1') } catch { /* best effort; non-fatal */ }
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
