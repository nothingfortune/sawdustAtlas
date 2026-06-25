import { describe, expect, it } from 'vitest'
import { getFeedClearanceZones, getShopItemFootprint, pointsAttribute, projectIsometric, projectPolygon } from '../src/domain/shopGeometry'
import type { Point2D } from '../src/domain/shopGeometry'
import type { ShopItem } from '../src/types'

const item: ShopItem = {
  id: 'saw',
  name: 'Saw',
  kind: 'machine',
  x: 1000,
  y: 800,
  width: 1000,
  depth: 600,
  height: 900,
  rotation: 0,
  clearance: 300,
  feedDirection: 0,
  infeedClearance: 1200,
  outfeedClearance: 1800,
  sideClearance: 200,
  color: '#123456',
}

describe('shop geometry', () => {
  it('builds distinct infeed and outfeed zones along the selected axis', () => {
    const zones = getFeedClearanceZones(item)
    expect(zones).toHaveLength(2)
    const [infeed, outfeed] = zones
    if (!infeed || !outfeed) throw new Error('Expected both feed zones')
    expect(Math.min(...infeed.points.map(point => point.x))).toBe(-200)
    expect(Math.max(...outfeed.points.map(point => point.x))).toBe(3800)
  })

  it('rotates the feed axis with the object', () => {
    const zones = getFeedClearanceZones({ ...item, rotation: 90 })
    const infeed = zones[0]
    if (!infeed) throw new Error('Expected an infeed zone')
    expect(Math.min(...infeed.points.map(point => point.y))).toBe(-600)
  })

  it('preserves a four-corner footprint for angled rendering', () => {
    expect(getShopItemFootprint({ ...item, rotation: 90 })).toHaveLength(4)
  })

  it('projects height upward without changing projected x', () => {
    const floor = projectIsometric({ x: 1000, y: 500, z: 0 })
    const top = projectIsometric({ x: 1000, y: 500, z: 900 })
    expect(top.x).toBe(floor.x)
    expect(top.y).toBe(floor.y - 900)
  })

  it('projects every polygon vertex through the isometric transform at the given height (TEST4)', () => {
    const square: [Point2D, Point2D, Point2D, Point2D] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]
    const projected = projectPolygon(square, 50)
    expect(projected).toHaveLength(4)
    expect(projected[0]).toEqual(projectIsometric({ x: 0, y: 0, z: 50 }))
    expect(projected[2]).toEqual(projectIsometric({ x: 100, y: 100, z: 50 }))
  })

  it('formats points into a rounded SVG points attribute (TEST4)', () => {
    expect(pointsAttribute([{ x: 12.3456, y: -7.891 }, { x: 3, y: 4 }])).toBe('12.35,-7.89 3,4')
  })
})
