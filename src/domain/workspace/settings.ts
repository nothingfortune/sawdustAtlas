import type { AtlasData, BuildAllowances, PricingSettings } from '../../types'

// Allowances are shop-wide; boards carry a copy because the domain reads board.allowances.
export function updateAllowances(data: AtlasData, patch: Partial<BuildAllowances>): AtlasData {
  const allowances = { ...data.allowances, ...patch }
  return { ...data, allowances, boards: data.boards.map(board => ({ ...board, allowances })) }
}

export function updatePricing(data: AtlasData, patch: Partial<PricingSettings>): AtlasData {
  return { ...data, pricing: { ...data.pricing, ...patch } }
}
