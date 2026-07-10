import { describe, expect, it } from 'vitest'
import { createShopItem, normalizeShopItem, SHOP_OBJECT_TEMPLATES } from '../src/domain/shopObjects'
import type { ShopItem } from '../src/types'

describe('shop objects', () => {
  it('includes storage and dust collection starting points', () => {
    expect(SHOP_OBJECT_TEMPLATES.some(item => item.kind === 'storage')).toBe(true)
    expect(SHOP_OBJECT_TEMPLATES.some(item => item.kind === 'dust')).toBe(true)
  })

  it('every template has a name and positive dimensions', () => {
    for (const item of SHOP_OBJECT_TEMPLATES) {
      expect(item.name.trim()).not.toBe('')
      expect(item.width).toBeGreaterThan(0)
      expect(item.depth).toBeGreaterThan(0)
      expect(item.height).toBeGreaterThan(0)
      expect(item.clearance).toBeGreaterThanOrEqual(0)
    }
  })

  it('creates an independently saved item inside the room', () => {
    const item = createShopItem({
      name: 'Clamp rack',
      kind: 'storage',
      width: 1200,
      depth: 250,
      height: 1800,
      clearance: 400,
      color: '#445566',
    }, { width: 1800, depth: 900 }, 'item-1')

    expect(item).toMatchObject({ id: 'item-1', name: 'Clamp rack', x: 600, y: 650, rotation: 0 })
  })

  it('normalizes invalid custom dimensions and clearances', () => {
    const item = createShopItem({
      name: 'Custom',
      kind: 'custom',
      width: 0,
      depth: Number.NaN,
      height: 0,
      clearance: -20,
      color: '#000000',
    }, { width: 1000, depth: 1000 }, 'item-2')

    expect(item.width).toBe(1)
    expect(item.depth).toBe(1)
    expect(item.clearance).toBe(0)
  })

  it('migrates legacy saved objects to height and feed defaults', () => {
    const legacy = {
      id: 'legacy', name: 'Old bench', kind: 'bench', x: 0, y: 0,
      width: 1200, depth: 600, rotation: 0, clearance: 300, color: '#555555',
    } as unknown as ShopItem

    expect(normalizeShopItem(legacy)).toMatchObject({
      height: 900,
      feedDirection: null,
      infeedClearance: 0,
      outfeedClearance: 0,
      sideClearance: 0,
    })
  })
})
