import { describe, expect, it } from 'vitest'
import { starterData } from '../src/data'
import { createShop, deleteShop, updateShop } from '../src/domain/workspace/shops'
import { FIXED_NOW, fixedContext } from './fixtures/context'

describe('shop actions', () => {
  it('createShop appends the default workshop', () => {
    const { data, id } = createShop(starterData, fixedContext())
    expect(data.shops.find(shop => shop.id === id)).toEqual({ id, name: 'Untitled workshop', width: 6000, depth: 6000, gridSize: 300, blockedZones: [], items: [], updatedAt: FIXED_NOW })
  })

  it('updateShop stamps updatedAt; deleteShop removes by id', () => {
    const shop = { ...starterData.shops[0]!, name: 'Garage', updatedAt: 'old' }
    const updated = updateShop(starterData, shop, fixedContext())
    expect(updated.shops[0]).toMatchObject({ name: 'Garage', updatedAt: FIXED_NOW })
    expect(deleteShop(updated, shop.id).shops.some(s => s.id === shop.id)).toBe(false)
  })
})
