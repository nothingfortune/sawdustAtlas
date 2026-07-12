import type { FeedDirection, ShopItem, ShopItemKind } from '../types'

export interface ShopObjectDefinition {
  name: string
  kind: ShopItemKind
  width: number
  depth: number
  height: number
  clearance: number
  color: string
  feedDirection?: FeedDirection | null
  infeedClearance?: number
  outfeedClearance?: number
  sideClearance?: number
}

export const SHOP_ITEM_KINDS = [
  { value: 'machine', label: 'Machine' },
  { value: 'bench', label: 'Bench / table' },
  { value: 'storage', label: 'Storage' },
  { value: 'dust', label: 'Dust collection' },
  { value: 'utility', label: 'Utility' },
  { value: 'door', label: 'Door / opening' },
  { value: 'custom', label: 'Other' },
] as const satisfies ReadonlyArray<{ value: ShopItemKind; label: string }>

export const SHOP_OBJECT_TEMPLATES = [
  { name: 'Table Saw', kind: 'machine', width: 1070, depth: 970, height: 890, clearance: 600, color: '#d8863b', feedDirection: 0, infeedClearance: 2440, outfeedClearance: 2440, sideClearance: 300 },
  { name: 'Planer', kind: 'machine', width: 700, depth: 400, height: 900, clearance: 450, color: '#c76f37', feedDirection: 0, infeedClearance: 1830, outfeedClearance: 1830, sideClearance: 200 },
  { name: 'Bandsaw', kind: 'machine', width: 750, depth: 500, height: 1800, clearance: 600, color: '#b9683b' },
  { name: 'Drill Press', kind: 'machine', width: 500, depth: 500, height: 1750, clearance: 450, color: '#a85f42' },
  { name: 'Miter Station', kind: 'machine', width: 2440, depth: 760, height: 1000, clearance: 450, color: '#b77b42', feedDirection: 0, infeedClearance: 1220, outfeedClearance: 1220, sideClearance: 150 },
  { name: 'Workbench', kind: 'bench', width: 2400, depth: 1300, height: 900, clearance: 450, color: '#66826d' },
  { name: 'Trash', kind: 'custom', width: 500, depth: 500, height: 900, clearance: 450, color: '#66826d' },
  { name: 'Assembly Table', kind: 'bench', width: 1830, depth: 1220, height: 900, clearance: 600, color: '#718b73' },
  { name: 'Wall Shelves', kind: 'storage', width: 1830, depth: 410, height: 2100, clearance: 300, color: '#637d89' },
  { name: 'Lumber Rack', kind: 'storage', width: 2440, depth: 400, height: 2400, clearance: 600, color: '#6c7887' },
  { name: 'Dust Collector', kind: 'dust', width: 900, depth: 500, height: 2100, clearance: 600, color: '#7a697f' },
  { name: 'Door', kind: 'door', width: 915, depth: 125, height: 2040, clearance: 915, color: '#9b8365' },
] as const satisfies readonly ShopObjectDefinition[]

export function createShopItem(
  definition: ShopObjectDefinition,
  room: { width: number; depth: number },
  id: string,
): ShopItem {
  const width = positiveDimension(definition.width)
  const depth = positiveDimension(definition.depth)
  const maxX = Math.max(0, room.width - width)
  const maxY = Math.max(0, room.depth - depth)

  return {
    ...definition,
    id,
    width,
    depth,
    height: positiveDimension(definition.height),
    clearance: Math.max(0, finiteNumber(definition.clearance)),
    feedDirection: definition.feedDirection ?? null,
    infeedClearance: nonNegative(definition.infeedClearance),
    outfeedClearance: nonNegative(definition.outfeedClearance),
    sideClearance: nonNegative(definition.sideClearance),
    rotation: 0,
    x: Math.min(900, maxX),
    y: Math.min(900, maxY),
  }
}

export function normalizeShopItem(item: ShopItem): ShopItem {
  return {
    ...item,
    height: positiveDimension(item.height ?? defaultHeight(item.kind)),
    feedDirection: item.feedDirection ?? null,
    infeedClearance: nonNegative(item.infeedClearance),
    outfeedClearance: nonNegative(item.outfeedClearance),
    sideClearance: nonNegative(item.sideClearance),
  }
}

function defaultHeight(kind: ShopItemKind): number {
  if (kind === 'door' || kind === 'storage' || kind === 'dust') return 2100
  if (kind === 'bench' || kind === 'machine') return 900
  return 1000
}

function positiveDimension(value: number): number {
  return Math.max(1, finiteNumber(value))
}

function finiteNumber(value: number): number {
  return Number.isFinite(value) ? value : 0
}

function nonNegative(value: number | undefined): number {
  return Math.max(0, finiteNumber(value ?? 0))
}
