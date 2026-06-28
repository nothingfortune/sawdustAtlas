import type { BoardProject, ComplexityTier, PriceBreakdown, PricingSettings } from '../types'

// End-grain boards with this many slices or more are treated as Complex labor.
export const COMPLEX_SLICE_THRESHOLD = 10

// Derive a labor complexity tier from a single board's design. Edge grain is
// Simple unless any strip is beveled; end grain is Standard unless it has bevels,
// per-slice variation (rotation/flip/offset), or a high slice count.
export function classifyBoard(project: BoardProject, sliceCount: number): ComplexityTier {
  const hasBevel = project.strips.some(s => s.trailingAngle !== 0)
  if (project.construction === 'edge') return hasBevel ? 'standard' : 'simple'
  const eg = project.endGrain
  const sliceVariation =
    eg.rowRotations.some(Boolean) ||
    eg.rowFlips.some(Boolean) ||
    (eg.rowOffsets?.some(offset => offset !== 0) ?? false)
  if (hasBevel || sliceVariation || sliceCount >= COMPLEX_SLICE_THRESHOLD) return 'complex'
  return 'standard'
}

// Composites are multi-panel assemblies; always the Complex tier.
export function classifyComposite(): ComplexityTier {
  return 'complex'
}

// Pure price math. Markup applies to material only; labor and consumables are
// added at cost; the per-construction floor is applied last to the grand total.
export function calculatePrice(input: {
  materialCost: number
  roughBoardFeet: number
  construction: 'edge' | 'end'
  tier: ComplexityTier
  pricing: PricingSettings
}): PriceBreakdown {
  const { materialCost, roughBoardFeet, construction, tier, pricing } = input
  const materialMarkup = materialCost * (pricing.materialMarkupPercent / 100)
  const laborHours = pricing.tierHours[tier]
  const labor = laborHours * pricing.laborRatePerHour
  const consumables = pricing.consumablesBase + pricing.consumablesPerBoardFoot * roughBoardFeet
  const subtotal = materialCost + materialMarkup + labor + consumables
  const floor = construction === 'end' ? pricing.floor.end : pricing.floor.edge
  const floorAdjustment = Math.max(0, floor - subtotal)
  return {
    tier, markupPercent: pricing.materialMarkupPercent, laborHours, materialCost, materialMarkup, labor, consumables,
    subtotal, floor, floorAdjustment, total: subtotal + floorAdjustment,
  }
}
