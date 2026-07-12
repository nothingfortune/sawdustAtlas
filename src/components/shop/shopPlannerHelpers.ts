import type { ShopBlockedZone, ShopProject } from '../../types'

export function clamp(n: number, min: number, max: number) { return Math.min(Math.max(n, min), max) }

export function fitZoneToRoom(zone: ShopBlockedZone, room: Pick<ShopProject, 'width' | 'depth'>): ShopBlockedZone {
  const width = clamp(zone.width, 1, room.width)
  const depth = clamp(zone.depth, 1, room.depth)
  return {
    ...zone,
    width,
    depth,
    x: clamp(zone.x, 0, Math.max(0, room.width - width)),
    y: clamp(zone.y, 0, Math.max(0, room.depth - depth)),
  }
}
