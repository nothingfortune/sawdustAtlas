import { describe, expect, it } from 'vitest'
import { DEFAULT_PRICING } from '../src/data'
import { DEFAULT_ALLOWANCES } from '../src/domain/boardAllowances'
import { normalizeAllowances, normalizePricing } from '../src/normalize/settings'

describe('normalizeAllowances', () => {
  it('migrates legacy drumSanding to routerTable', () => {
    expect(normalizeAllowances({ ...DEFAULT_ALLOWANCES, routerTable: undefined as unknown as number, drumSanding: 1.5 }).routerTable).toBe(1.5)
  })

  it('falls back per field on invalid values', () => {
    expect(normalizeAllowances(undefined)).toEqual(DEFAULT_ALLOWANCES)
    expect(normalizeAllowances({ ...DEFAULT_ALLOWANCES, planing: Infinity }).planing).toBe(DEFAULT_ALLOWANCES.planing)
  })
})

describe('normalizePricing', () => {
  it('rejects negative rates instead of clamping them', () => {
    expect(normalizePricing({ laborRatePerHour: -10 }).laborRatePerHour).toBe(DEFAULT_PRICING.laborRatePerHour)
  })
})
