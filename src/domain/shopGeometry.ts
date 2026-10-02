import type { ShopBlockedZone, ShopItem, ShopProject } from '../types'
import { degToRad } from './units'

export interface Point2D {
  x: number
  y: number
}

export interface BlockedZoneConflict {
  item: ShopItem
  zones: ShopBlockedZone[]
}

// Shop items whose footprint overlaps one or more blocked floor zones, with the
// zones each item hits. Shared by the planner's in-place alerts and the workspace
// warning center.
export function getBlockedZoneConflicts(project: ShopProject): BlockedZoneConflict[] {
  return project.items
    .map(item => ({
      item,
      zones: project.blockedZones.filter(zone => polygonsOverlap(getShopItemFootprint(item), getBlockedZoneFootprint(zone))),
    }))
    .filter(conflict => conflict.zones.length > 0)
}

export interface Point3D extends Point2D {
  z: number
}

export interface FeedClearanceZone {
  kind: 'infeed' | 'outfeed'
  points: [Point2D, Point2D, Point2D, Point2D]
}

export function getBlockedZoneFootprint(zone: ShopBlockedZone): [Point2D, Point2D, Point2D, Point2D] {
  return [
    { x: zone.x, y: zone.y },
    { x: zone.x + zone.width, y: zone.y },
    { x: zone.x + zone.width, y: zone.y + zone.depth },
    { x: zone.x, y: zone.y + zone.depth },
  ]
}

export function getShopItemFootprint(item: ShopItem): [Point2D, Point2D, Point2D, Point2D] {
  return transformRectangle(item, 0, 0, item.width, item.depth, item.rotation)
}

export function getFeedClearanceZones(item: ShopItem): FeedClearanceZone[] {
  if (item.feedDirection === null) return []

  const rotation = item.rotation + item.feedDirection
  const zones: FeedClearanceZone[] = []
  if (item.infeedClearance > 0) {
    zones.push({
      kind: 'infeed',
      points: transformRectangle(item, -item.infeedClearance, -item.sideClearance, item.infeedClearance, item.depth + item.sideClearance * 2, rotation),
    })
  }
  if (item.outfeedClearance > 0) {
    zones.push({
      kind: 'outfeed',
      points: transformRectangle(item, item.width, -item.sideClearance, item.outfeedClearance, item.depth + item.sideClearance * 2, rotation),
    })
  }
  return zones
}

export function projectIsometric(point: Point3D): Point2D {
  return {
    x: (point.x - point.y) * Math.cos(Math.PI / 6),
    y: (point.x + point.y) * 0.5 - point.z,
  }
}

export function projectPolygon(points: [Point2D, Point2D, Point2D, Point2D], z?: number): [Point2D, Point2D, Point2D, Point2D]
export function projectPolygon(points: readonly Point2D[], z?: number): Point2D[]
export function projectPolygon(points: readonly Point2D[], z = 0): Point2D[] {
  return points.map(point => projectIsometric({ ...point, z }))
}

export function pointsAttribute(points: readonly Point2D[]): string {
  return points.map(point => `${round(point.x)},${round(point.y)}`).join(' ')
}

export function polygonsOverlap(a: readonly Point2D[], b: readonly Point2D[]): boolean {
  return [...getAxes(a), ...getAxes(b)].every(axis => {
    const projectionA = projectOntoAxis(a, axis)
    const projectionB = projectOntoAxis(b, axis)
    return projectionA.max >= projectionB.min && projectionB.max >= projectionA.min
  })
}

function transformRectangle(
  item: ShopItem,
  x: number,
  y: number,
  width: number,
  depth: number,
  rotation: number,
): [Point2D, Point2D, Point2D, Point2D] {
  const center = { x: item.width / 2, y: item.depth / 2 }
  const local: [Point2D, Point2D, Point2D, Point2D] = [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + depth },
    { x, y: y + depth },
  ]

  return local.map(point => {
    const rotated = rotatePoint(point, center, rotation)
    return { x: item.x + rotated.x, y: item.y + rotated.y }
  }) as [Point2D, Point2D, Point2D, Point2D]
}

function rotatePoint(point: Point2D, center: Point2D, degrees: number): Point2D {
  const radians = degToRad(degrees)
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const x = point.x - center.x
  const y = point.y - center.y
  return {
    x: center.x + x * cosine - y * sine,
    y: center.y + x * sine + y * cosine,
  }
}

function getAxes(points: readonly Point2D[]): Point2D[] {
  return points.map((point, index) => {
    const next = points[(index + 1) % points.length] ?? point
    const edge = { x: next.x - point.x, y: next.y - point.y }
    const normal = { x: -edge.y, y: edge.x }
    const length = Math.hypot(normal.x, normal.y) || 1
    return { x: normal.x / length, y: normal.y / length }
  })
}

function projectOntoAxis(points: readonly Point2D[], axis: Point2D) {
  const values = points.map(point => dot(point, axis))
  return { min: Math.min(...values), max: Math.max(...values) }
}

function dot(a: Point2D, b: Point2D): number {
  return a.x * b.x + a.y * b.y
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
