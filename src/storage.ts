import type { AtlasData, BoardProject, BuildAllowances, EndGrainSettings, ShopItem, ShopProject, WoodSpecies } from './types'
import { defaultSpecies, starterData } from './data'
import { DEFAULT_ALLOWANCES } from './domain/boardAllowances'
import { normalizeShopItem } from './domain/shopObjects'
import { createId } from './id'

const KEY = 'sawdust-atlas:v1'
export const CURRENT_SCHEMA_VERSION = 1

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
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    allowances,
    woods: [...normalizedWoods, ...[...new Set(missingIds)].map(id => normalizeWood({ id, name: id, color: '#8c6a48', accent: '#b18a5e', pricePerBoardFoot: 0 }))],
    shops: shops.map(normalizeShop),
    boards: boards.map((board): BoardProject => ({
      id: stringValue(board['id'], createId()),
      name: stringValue(board['name'], 'Imported cutting board'),
      length: finiteNumber(board['length'], 450),
      thickness: finiteNumber(board['thickness'], 38),
      updatedAt: stringValue(board['updatedAt'], new Date().toISOString()),
      construction: board['construction'] === 'end' ? 'end' : 'edge',
      allowances,
      strips: records(board['strips']).map(strip => ({
        id: stringValue(strip['id'], createId()),
        speciesId: stringValue(strip['speciesId'], normalizedWoods[0]?.id ?? 'walnut'),
        width: finiteNumber(strip['width'], 38),
        trailingAngle: signedFinite(strip['trailingAngle'], 0),
      })),
      endGrain: normalizeEndGrain(board['endGrain'], finiteNumber(board['thickness'], 38)),
    })),
  }
}

function normalizeShop(shop: Record<string, unknown>): ShopProject {
  return {
    id: stringValue(shop['id'], createId()),
    name: stringValue(shop['name'], 'Imported workshop'),
    width: finiteNumber(shop['width'], 6000),
    depth: finiteNumber(shop['depth'], 6000),
    updatedAt: stringValue(shop['updatedAt'], new Date().toISOString()),
    items: records(shop['items']).map(item => normalizeShopItem(item as unknown as ShopItem)),
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
