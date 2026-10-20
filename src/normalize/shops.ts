import { normalizeShopItem } from '../domain/shopObjects'
import type { ShopBlockedZone, ShopItem, ShopProject } from '../types'
import { finiteNumber, records, stringValue } from './coerce'
import type { NormalizeContext } from './context'

export function normalizeShop(shop: Record<string, unknown>, ctx: NormalizeContext): ShopProject {
  return {
    id: stringValue(shop['id'], ctx.createId()),
    name: stringValue(shop['name'], 'Imported workshop'),
    width: finiteNumber(shop['width'], 6000),
    depth: finiteNumber(shop['depth'], 6000),
    gridSize: finiteNumber(shop['gridSize'], 300) || 300,
    blockedZones: records(shop['blockedZones']).map(zone => normalizeBlockedZone(zone as unknown as ShopBlockedZone, ctx)),
    updatedAt: stringValue(shop['updatedAt'], ctx.now),
    items: records(shop['items']).map(item => normalizeShopItem(item as unknown as ShopItem)),
  }
}

function normalizeBlockedZone(zone: ShopBlockedZone, ctx: NormalizeContext): ShopBlockedZone {
  return {
    id: stringValue(zone.id, ctx.createId()),
    name: stringValue(zone.name, 'No-go zone'),
    x: finiteNumber(zone.x, 0),
    y: finiteNumber(zone.y, 0),
    width: Math.max(1, finiteNumber(zone.width, 600)),
    depth: Math.max(1, finiteNumber(zone.depth, 600)),
  }
}
