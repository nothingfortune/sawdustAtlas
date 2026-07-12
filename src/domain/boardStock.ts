import type { BoardProject, WoodSpecies } from '../types'
import type { BuildDimensions } from './boardAllowances'
import { resolveAllowances, roughStripStockWidth } from './boardAllowances'
import type { EndGrainMetrics } from './boardGeometry'
import { calculateWoodUsage } from './boardGeometry'
import { nonNegative } from './units'

// BOARD-023: aggregate the existing build/usage math into one bench-usable reference —
// what to rip each strip to and how much stock to buy. No new geometry here.

export interface RipGroup {
  speciesId: string
  speciesName: string
  color: string
  finishedWidthMm: number
  trailingAngle: number
  roughRipWidthMm: number
  count: number
}

export interface SpeciesStock {
  speciesId: string
  name: string
  color: string
  purchasedBoardFeet: number
  finishedBoardFeet: number
  wasteBoardFeet: number
}

export interface StockAssumptions {
  construction: 'edge' | 'end'
  kerfMm: number
  ripAllowanceMm: number
  widthTrimMm: number
  lengthTrimMm: number
  surfacingMm: number
  sliceThicknessMm?: number
}

export interface StockRequirements {
  ripGroups: RipGroup[]
  species: SpeciesStock[]
  assumptions: StockAssumptions
  totalPurchasedBoardFeet: number
}

const NEUTRAL = '#8c6a48'

export function calculateStockRequirements(
  project: BoardProject,
  woods: readonly WoodSpecies[],
  build: BuildDimensions,
  metrics: EndGrainMetrics,
): StockRequirements {
  const woodById = new Map(woods.map(wood => [wood.id, wood]))
  const groups = new Map<string, RipGroup>()
  project.strips.forEach((strip, index) => {
    const wood = woodById.get(strip.speciesId)
    const roughRipWidthMm = roughStripStockWidth(project, build.stripRoughWidths[index] ?? strip.width, strip.trailingAngle)
    const key = `${strip.speciesId}|${strip.width}|${strip.trailingAngle}|${roughRipWidthMm}`
    const existing = groups.get(key)
    if (existing) { existing.count += 1; return }
    groups.set(key, {
      speciesId: strip.speciesId,
      speciesName: wood?.name ?? strip.speciesId,
      color: wood?.color ?? NEUTRAL,
      finishedWidthMm: strip.width,
      trailingAngle: strip.trailingAngle,
      roughRipWidthMm,
      count: 1,
    })
  })
  const ripGroups = [...groups.values()].sort((a, b) =>
    a.speciesName.localeCompare(b.speciesName) || a.finishedWidthMm - b.finishedWidthMm)

  const species: SpeciesStock[] = calculateWoodUsage(project, woods, metrics).map(usage => ({
    speciesId: usage.speciesId,
    name: usage.name,
    color: usage.color,
    purchasedBoardFeet: usage.requiredBoardFeet,
    finishedBoardFeet: usage.usedBoardFeet,
    wasteBoardFeet: usage.wasteBoardFeet,
  }))
  const totalPurchasedBoardFeet = species.reduce((total, stock) => total + stock.purchasedBoardFeet, 0)

  const allowance = resolveAllowances(project)
  const isEnd = project.construction === 'end'
  const assumptions: StockAssumptions = {
    construction: project.construction,
    kerfMm: isEnd ? nonNegative(project.endGrain.kerf) : 0,
    ripAllowanceMm: nonNegative(allowance.ripAllowance),
    widthTrimMm: nonNegative(allowance.widthTrim),
    lengthTrimMm: nonNegative(allowance.lengthTrim),
    surfacingMm: nonNegative(allowance.jointing) + nonNegative(allowance.planing) + nonNegative(allowance.routerTable),
    ...(isEnd ? { sliceThicknessMm: nonNegative(project.endGrain.sliceThickness) } : {}),
  }

  return { ripGroups, species, assumptions, totalPurchasedBoardFeet }
}
