import type { BoardProject, WoodSpecies } from '../types'
import type { BuildDimensions } from './boardAllowances'
import type { EndGrainMetrics } from './boardGeometry'
import { calculateStockRequirements } from './boardStock'
import type { RipGroup, StockAssumptions } from './boardStock'
import { calculateAngleSetup } from './boardAngle'
import { SQUARE_ANGLE_TOLERANCE_DEG } from './units'

// BOARD-025: the glanceable bench reference — what you set at the saw. Delegates to the
// 023/024 calculators (single source of truth) and adds the crosscut summary from metrics.

export interface BenchAngle { trailingAngleDeg: number; sawAngleDeg: number; count: number }
export interface BenchCrosscut { stopBlockMm: number; slices: number; passes: number }

export interface BenchSetup {
  ripGroups: RipGroup[]
  angles: BenchAngle[]
  crosscut: BenchCrosscut | null
  assumptions: StockAssumptions
}

export function summarizeBenchSetup(
  project: BoardProject,
  woods: readonly WoodSpecies[],
  build: BuildDimensions,
  metrics: EndGrainMetrics,
): BenchSetup {
  const stock = calculateStockRequirements(project, woods, build, metrics)
  const isEnd = project.construction === 'end'

  const byAngle = new Map<number, number>()
  if (isEnd) {
    for (const strip of project.strips) {
      const angle = Math.round(strip.trailingAngle * 100) / 100
      if (Math.abs(angle) <= SQUARE_ANGLE_TOLERANCE_DEG) continue
      byAngle.set(angle, (byAngle.get(angle) ?? 0) + 1)
    }
  }
  const angles: BenchAngle[] = [...byAngle.entries()]
    .map(([trailingAngleDeg, count]) => ({
      trailingAngleDeg,
      sawAngleDeg: calculateAngleSetup({ trailingAngleDeg, stockThicknessMm: project.endGrain.stockThickness, stripLengthMm: project.endGrain.sourceLength }).sawAngleDeg,
      count,
    }))
    .sort((a, b) => a.trailingAngleDeg - b.trailingAngleDeg)

  const crosscut: BenchCrosscut | null = isEnd
    ? { stopBlockMm: Math.max(0, project.endGrain.sliceThickness), slices: metrics.sliceCount, passes: metrics.crosscutCount }
    : null

  return { ripGroups: stock.ripGroups, angles, crosscut, assumptions: stock.assumptions }
}
