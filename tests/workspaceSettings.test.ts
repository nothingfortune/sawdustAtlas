import { describe, expect, it } from 'vitest'
import { starterData } from '../src/data'
import { updateAllowances, updatePricing } from '../src/domain/workspace/settings'

describe('settings actions', () => {
  it('updateAllowances writes the shop-wide setup through to every board', () => {
    const next = updateAllowances(starterData, { planing: 2.5 })
    expect(next.allowances.planing).toBe(2.5)
    expect(next.boards.every(board => board.allowances.planing === 2.5)).toBe(true)
  })

  it('updatePricing patches only the global block', () => {
    const next = updatePricing(starterData, { laborRatePerHour: 99 })
    expect(next.pricing.laborRatePerHour).toBe(99)
    expect(next.boards).toBe(starterData.boards)
  })
})
