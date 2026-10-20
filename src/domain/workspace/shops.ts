import type { AtlasData, ShopProject } from '../../types'
import type { Created, WorkspaceContext } from './context'

export function createShop(data: AtlasData, ctx: WorkspaceContext): Created {
  const shop: ShopProject = { id: ctx.createId(), name: 'Untitled workshop', width: 6000, depth: 6000, gridSize: 300, blockedZones: [], items: [], updatedAt: ctx.now }
  return { data: { ...data, shops: [...data.shops, shop] }, id: shop.id }
}

export function updateShop(data: AtlasData, shop: ShopProject, ctx: WorkspaceContext): AtlasData {
  return { ...data, shops: data.shops.map(p => p.id === shop.id ? { ...shop, updatedAt: ctx.now } : p) }
}

export function deleteShop(data: AtlasData, id: string): AtlasData {
  return { ...data, shops: data.shops.filter(p => p.id !== id) }
}
