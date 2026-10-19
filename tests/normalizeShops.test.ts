import { describe, expect, it } from 'vitest'
import { normalizeShop } from '../src/normalize/shops'
import { FIXED_NOW, fixedContext } from './fixtures/context'

describe('normalizeShop', () => {
  it('fills defaults and replaces a zero grid with 300', () => {
    expect(normalizeShop({ gridSize: 0 }, fixedContext())).toMatchObject({
      id: 'id-1', name: 'Imported workshop', width: 6000, depth: 6000, gridSize: 300, blockedZones: [], items: [], updatedAt: FIXED_NOW,
    })
  })

  it('gives a blocked zone at least 1 mm of size', () => {
    const shop = normalizeShop({ blockedZones: [{ id: 'z', width: 0, depth: -4 }] }, fixedContext())
    expect(shop.blockedZones[0]).toMatchObject({ id: 'z', name: 'No-go zone', width: 1, depth: 1 })
  })
})
