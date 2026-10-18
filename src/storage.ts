import type { AtlasData, BoardProject, BuildAllowances } from './types'
import { defaultSpecies, starterData } from './data'
import { LATEST_SCHEMA_VERSION, migrate } from './domain/migrations'
import { normalizeFurnitureProject } from './domain/furniture/project'
import type { FurnitureProject } from './domain/furniture/types'
import type { Sketch, SketchMember, SketchPoint } from './domain/geometry2d'
import { createId } from './id'
import { normalizeBoard } from './normalize/boards'
import { finiteNumber, isRecord, records, signedFinite, stringValue } from './normalize/coerce'
import { normalizeComposite } from './normalize/composites'
import { defaultNormalizeContext } from './normalize/context'
import type { NormalizeContext } from './normalize/context'
import { normalizeAllowances, normalizePricing } from './normalize/settings'
import { normalizeShop } from './normalize/shops'
import { normalizeWoodLibrary, placeholderWoods } from './normalize/woods'

export { normalizePricing }

const KEY = 'sawdust-atlas:v1'
// Schema history and named migration steps live in domain/migrations.ts. v2 stores
// running-bond offsets as cell fractions (resolved to mm at render).
export const CURRENT_SCHEMA_VERSION = LATEST_SCHEMA_VERSION

// If the main payload fails to parse (e.g. a truncated write), the raw string is
// otherwise lost the moment loadData falls back to starterData and the app's next
// autosave overwrites it. Stash one recovery copy here so it isn't destroyed silently.
const CORRUPT_RECOVERY_KEY = 'sawdust-atlas:corrupt'

export function loadData(): AtlasData {
  let saved: string | null
  try {
    saved = localStorage.getItem(KEY)
  } catch {
    return starterData
  }
  if (!saved) return starterData
  try {
    const parsed: unknown = JSON.parse(saved)
    return isRecord(parsed) ? normalizeData(parsed) : starterData
  } catch {
    saveCorruptRecovery(saved)
    return starterData
  }
}

// Best-effort; storage may be full or blocked (possibly the reason the main payload
// is corrupt in the first place). Only one copy is kept — overwrite is fine.
function saveCorruptRecovery(raw: string): void {
  try { localStorage.setItem(CORRUPT_RECOVERY_KEY, raw) } catch { /* best effort; non-fatal */ }
}

export function normalizeData(input: Partial<AtlasData>, ctx: NormalizeContext = defaultNormalizeContext()): AtlasData {
  // Upgrade the raw shape through the named migration steps first, then coerce.
  const data = migrate(input as Record<string, unknown>).data as Partial<AtlasData>
  const rawBoards = records(data.boards)
  const library = normalizeWoodLibrary(data.woods, ctx)
  const fallbackSpeciesId = library[0]?.id ?? 'walnut'
  // Milling allowances are shop-wide: seed from the saved global, else a legacy board's own.
  const allowances = normalizeAllowances((data.allowances ?? rawBoards[0]?.['allowances']) as (BuildAllowances & { drumSanding?: number }) | undefined)
  const boards = rawBoards.map(raw => normalizeBoard(raw, { allowances, fallbackSpeciesId }, ctx))
  // Composites read the boards list and may append boards migrated from legacy inline panels.
  const migratedBoards: BoardProject[] = []
  const composites = records(data.composites).map(raw => normalizeComposite(raw, { boardSink: migratedBoards, allowances, boards }, ctx))
  const furniture = records(data.furniture)
    .map(raw => normalizeFurnitureProject(raw, { createId: ctx.createId, now: ctx.now, fallbackSpeciesId }))
    .filter((project): project is FurnitureProject => project !== null)
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    allowances,
    pricing: normalizePricing(data.pricing),
    composites,
    woods: [...library, ...placeholderWoods(rawBoards, library, ctx)],
    shops: records(data.shops).map(shop => normalizeShop(shop, ctx)),
    boards: [...boards, ...migratedBoards],
    furniture,
  }
}

export interface ImportCounts { shops: number; boards: number; composites: number; furniture: number; woods: number }
export interface ImportResult {
  ok: boolean
  data: AtlasData | null
  counts: ImportCounts
  warnings: string[]
  errors: string[]
}

const NO_COUNTS: ImportCounts = { shops: 0, boards: 0, composites: 0, furniture: 0, woods: 0 }
const TOP_LEVEL_KEYS = new Set(['schemaVersion', 'shops', 'boards', 'woods', 'allowances', 'pricing', 'composites', 'furniture'])
const BOARD_KEYS = new Set(['id', 'name', 'length', 'thickness', 'construction', 'endGrain', 'allowances', 'strips', 'updatedAt'])
const SHOP_KEYS = new Set(['id', 'name', 'width', 'depth', 'gridSize', 'blockedZones', 'items', 'updatedAt'])
const WOOD_KEYS = new Set(['id', 'name', 'color', 'accent', 'pricePerBoardFoot', 'availableAt'])

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
  const counts: ImportCounts = { shops: data.shops.length, boards: data.boards.length, composites: data.composites.length, furniture: data.furniture.length, woods: data.woods.length }
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

// BOARD-026: the geometry calculator's single working sketch — its own key, separate from
// AtlasData (no schema/migration). Coerce untrusted shape and drop dangling members.
const SKETCH_KEY = 'sawdust-atlas:geometry'

export function normalizeSketch(raw: unknown): Sketch {
  if (!isRecord(raw)) return { points: [], members: [] }
  const points: SketchPoint[] = records(raw['points']).map(point => ({
    id: stringValue(point['id'], createId()),
    x: signedFinite(point['x'], 0),
    y: signedFinite(point['y'], 0),
  }))
  const ids = new Set(points.map(point => point.id))
  const members: SketchMember[] = records(raw['members'])
    .map(member => ({
      id: stringValue(member['id'], createId()),
      aId: stringValue(member['aId'], ''),
      bId: stringValue(member['bId'], ''),
      widthMm: finiteNumber(member['widthMm'], 18),
    }))
    .filter(member => ids.has(member.aId) && ids.has(member.bId) && member.aId !== member.bId)
  return { points, members }
}

export function loadSketch(): Sketch {
  try {
    const saved = localStorage.getItem(SKETCH_KEY)
    return saved ? normalizeSketch(JSON.parse(saved) as unknown) : { points: [], members: [] }
  } catch { return { points: [], members: [] } }
}

export function saveSketch(sketch: Sketch): void {
  try { localStorage.setItem(SKETCH_KEY, JSON.stringify(sketch)) } catch { /* best effort; non-fatal */ }
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
