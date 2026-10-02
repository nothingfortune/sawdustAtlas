import { describe, expect, it } from 'vitest'
import { getBlockedZoneFootprint, getFeedClearanceZones, getShopItemFootprint, pointsAttribute, polygonsOverlap, projectIsometric, projectPolygon } from '../src/domain/shopGeometry'
import type { Point2D } from '../src/domain/shopGeometry'
import type { FeedDirection, ShopBlockedZone, ShopItem } from '../src/types'

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

const blockedZone: ShopBlockedZone = {
  id: 'blocked',
  name: 'Water heater',
  x: 900,
  y: 750,
  width: 600,
  depth: 450,
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

  describe('feedDirection composes with rotation (non-square machine)', () => {
    // 1000×600 machine at the origin: center is (500, 300). Drop side clearance so the
    // zones are clean rectangles and we can read which side of the machine they land on.
    const base: ShopItem = { ...item, x: 0, y: 0, width: 1000, depth: 600, rotation: 0, sideClearance: 0, infeedClearance: 300, outfeedClearance: 300, feedDirection: 0 }
    const center = { x: base.width / 2, y: base.depth / 2 }
    const centroid = (pts: readonly Point2D[]): Point2D => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length })

    // For each feed direction (relative to a 0-rotation body) the infeed sits on a known
    // side and the outfeed sits on the opposite side.
    const sides: Array<[FeedDirection, 'west' | 'north' | 'east' | 'south']> = [[0, 'west'], [90, 'north'], [180, 'east'], [270, 'south']]
    it.each(sides)('feedDirection %d puts infeed to the %s and outfeed opposite', (feedDirection, side) => {
      const [infeed, outfeed] = getFeedClearanceZones({ ...base, feedDirection })
      if (!infeed || !outfeed) throw new Error('Expected both zones')
      const inC = centroid(infeed.points), outC = centroid(outfeed.points)
      if (side === 'west') { expect(inC.x).toBeLessThan(center.x); expect(outC.x).toBeGreaterThan(center.x) }
      if (side === 'east') { expect(inC.x).toBeGreaterThan(center.x); expect(outC.x).toBeLessThan(center.x) }
      if (side === 'north') { expect(inC.y).toBeLessThan(center.y); expect(outC.y).toBeGreaterThan(center.y) }
      if (side === 'south') { expect(inC.y).toBeGreaterThan(center.y); expect(outC.y).toBeLessThan(center.y) }
    })

    it('rotation and feedDirection add: rotation 90 + feed 90 == rotation 0 + feed 180', () => {
      const composed = getFeedClearanceZones({ ...base, rotation: 90, feedDirection: 90 })
      const direct = getFeedClearanceZones({ ...base, rotation: 0, feedDirection: 180 })
      expect(composed[0]?.points).toEqual(direct[0]?.points)
      expect(composed[1]?.points).toEqual(direct[1]?.points)
    })

    it('omits a zone whose clearance is zero', () => {
      expect(getFeedClearanceZones({ ...base, infeedClearance: 0 }).map(z => z.kind)).toEqual(['outfeed'])
      expect(getFeedClearanceZones({ ...base, outfeedClearance: 0 }).map(z => z.kind)).toEqual(['infeed'])
      expect(getFeedClearanceZones({ ...base, feedDirection: null })).toEqual([])
    })
  })

  it('preserves a four-corner footprint for angled rendering', () => {
    expect(getShopItemFootprint({ ...item, rotation: 90 })).toHaveLength(4)
  })

  it('builds a rectangular footprint for blocked floor zones', () => {
    expect(getBlockedZoneFootprint(blockedZone)).toEqual([
      { x: 900, y: 750 },
      { x: 1500, y: 750 },
      { x: 1500, y: 1200 },
      { x: 900, y: 1200 },
    ])
  })

  it('detects when an item footprint overlaps a blocked zone', () => {
    expect(polygonsOverlap(getShopItemFootprint(item), getBlockedZoneFootprint(blockedZone))).toBe(true)
    expect(polygonsOverlap(getShopItemFootprint({ ...item, x: 2000, y: 1800 }), getBlockedZoneFootprint(blockedZone))).toBe(false)
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
