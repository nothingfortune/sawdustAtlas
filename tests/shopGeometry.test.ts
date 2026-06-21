import { describe, expect, it } from 'vitest'
import { getFeedClearanceZones, getShopItemFootprint, projectIsometric } from '../src/domain/shopGeometry'
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
})
