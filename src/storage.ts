import type { AtlasData, BoardProject, BuildAllowances, WoodSpecies } from './types'
import { defaultSpecies, starterData } from './data'
import { DEFAULT_ALLOWANCES } from './domain/boardAllowances'
import { normalizeShopItem } from './domain/shopObjects'

const KEY = 'sawdust-atlas:v1'

export function loadData(): AtlasData {
  try {
    const saved = localStorage.getItem(KEY)
    return saved ? normalizeData(JSON.parse(saved) as AtlasData) : starterData
  } catch {
    return starterData
  }
}

export function normalizeData(data: AtlasData): AtlasData {
  const savedWoods = Array.isArray(data.woods) && data.woods.length > 0 ? data.woods : defaultSpecies
  const normalizedWoods = savedWoods.map(normalizeWood)
  const knownIds = new Set(normalizedWoods.map(wood => wood.id))
  const missingIds = data.boards.flatMap(board => board.strips.map(strip => strip.speciesId)).filter(id => !knownIds.has(id))
  // Milling allowances are shop-wide. Seed the global from saved global, else a
  // legacy board's per-board allowances (migrating drumSanding), then apply that
  // one setup to every board so the domain (which reads board.allowances) agrees.
  const allowances = normalizeAllowances(data.allowances ?? data.boards[0]?.allowances)
  return {
    ...data,
    allowances,
    woods: [...normalizedWoods, ...[...new Set(missingIds)].map(id => normalizeWood({ id, name: id, color: '#8c6a48', accent: '#b18a5e', pricePerBoardFoot: 0 }))],
    shops: data.shops.map(shop => ({ ...shop, items: shop.items.map(normalizeShopItem) })),
    boards: data.boards.map((board): BoardProject => ({
      ...board,
      construction: board.construction ?? 'edge',
      allowances,
      strips: board.strips.map(strip => ({ ...strip, trailingAngle: strip.trailingAngle ?? 0 })),
      endGrain: board.endGrain ? {
        ...board.endGrain,
        rowFlips: board.endGrain.rowFlips ?? [],
        rowRotations: board.endGrain.rowRotations ?? [],
        rowOffsets: board.endGrain.rowOffsets ?? [],
      } : {
        sourceLength: 900,
        stockThickness: board.thickness,
        sliceThickness: 45,
        kerf: 3.2,
        trimAllowance: 20,
        rowFlips: [],
        rowRotations: [],
        rowOffsets: [],
      },
    })),
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

function normalizeWood(wood: WoodSpecies): WoodSpecies {
  return {
    id: String(wood.id),
    name: String(wood.name || wood.id || 'Custom wood'),
    color: validColor(wood.color, '#8c6a48'),
    accent: validColor(wood.accent, '#b18a5e'),
    pricePerBoardFoot: Number.isFinite(wood.pricePerBoardFoot) ? Math.max(0, wood.pricePerBoardFoot) : 0,
  }
}

function validColor(value: string, fallback: string) { return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback }

export function saveData(data: AtlasData) {
  localStorage.setItem(KEY, JSON.stringify(data))
}

export function downloadData(data: AtlasData) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `sawdust-atlas-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}
