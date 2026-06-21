import type { BoardProject, BuildAllowances } from '../types'
import { CUBIC_MM_PER_BOARD_FOOT, calculateEndGrainMetrics } from './boardGeometry'

// Build allowances describe how much oversized rough stock must be relative to the
// finished board. They are surfacing/trim stock removed to reach finished faces and
// square edges, kept separate from the kerf/offcut waste handled by the geometry engine.
//
// Assumptions documented for accuracy (see PRODUCT_PLAN accuracy requirements):
// - jointing / planing / drumSanding are thickness removed reaching one finished face.
//   Together they raise the rough thickness above the finished thickness.
// - ripAllowance is width removed per strip when ripping each strip to final width
//   (saw kerf plus a jointed clean-up edge).
// - lengthTrim is total length removed squaring the two ends.
// - widthTrim is total width removed squaring the two outer long edges after glue-up.
export const DEFAULT_ALLOWANCES: BuildAllowances = {
  jointing: 1.5,
  planing: 1.5,
  drumSanding: 1.5,
  ripAllowance: 3.2,
  lengthTrim: 12,
  widthTrim: 6,
}

export interface DimensionPair {
  finished: number
  rough: number
}

export interface ThicknessBreakdown extends DimensionPair {
  jointing: number
  planing: number
  drumSanding: number
}

export interface BuildDimensions {
  construction: 'edge' | 'end'
  length: DimensionPair
  width: DimensionPair
  thickness: ThicknessBreakdown
  /** Width to rip each first-glue-up strip to, parallel to project.strips. */
  stripRoughWidths: number[]
  roughBoardFeet: number
  finishedBoardFeet: number
  /** Rough stock minus finished part: material removed by surfacing, ripping, and trimming. */
  removedBoardFeet: number
}

export function resolveAllowances(project: BoardProject): BuildAllowances {
  return { ...DEFAULT_ALLOWANCES, ...project.allowances }
}

export function calculateBuildDimensions(project: BoardProject): BuildDimensions {
  const allowance = resolveAllowances(project)
  const surfacing = nonNegative(allowance.jointing) + nonNegative(allowance.planing) + nonNegative(allowance.drumSanding)
  const rip = nonNegative(allowance.ripAllowance)
  const lengthTrim = nonNegative(allowance.lengthTrim)
  const widthTrim = nonNegative(allowance.widthTrim)
  const stripRoughWidths = project.strips.map(strip => nonNegative(strip.width) + rip)
  if (stripRoughWidths.length === 1) {
    stripRoughWidths[0] = (stripRoughWidths[0] ?? 0) + widthTrim
  } else if (stripRoughWidths.length > 1) {
    stripRoughWidths[0] = (stripRoughWidths[0] ?? 0) + widthTrim / 2
    const last = stripRoughWidths.length - 1
    stripRoughWidths[last] = (stripRoughWidths[last] ?? 0) + widthTrim / 2
  }

  const thickness = (finished: number): ThicknessBreakdown => ({
    finished,
    jointing: nonNegative(allowance.jointing),
    planing: nonNegative(allowance.planing),
    drumSanding: nonNegative(allowance.drumSanding),
    rough: finished + surfacing,
  })

  if (project.construction === 'end') {
    const metrics = calculateEndGrainMetrics(project)
    const finishedLength = metrics.finalLength
    const finishedWidth = metrics.finishedWidth
    const finishedThickness = nonNegative(project.endGrain.sliceThickness)
    const roughStockVolume = project.strips.reduce((volume, strip, index) => {
      const angleShift = project.endGrain.stockThickness * Math.tan(clampAngle(strip.trailingAngle) * Math.PI / 180)
      const stockWidth = (stripRoughWidths[index] ?? 0) + Math.max(0, angleShift)
      return volume + stockWidth * project.endGrain.sourceLength * project.endGrain.stockThickness
    }, 0)
    const roughBoardFeet = toBoardFeet(roughStockVolume)
    return {
      construction: 'end',
      length: { finished: finishedLength, rough: finishedLength + lengthTrim },
      width: { finished: finishedWidth, rough: finishedWidth + widthTrim },
      thickness: thickness(finishedThickness),
      stripRoughWidths,
      roughBoardFeet,
      finishedBoardFeet: metrics.finishedBoardFeet,
      removedBoardFeet: Math.max(0, roughBoardFeet - metrics.finishedBoardFeet),
    }
  }

  const finishedLength = nonNegative(project.length)
  const finishedWidth = sum(project.strips.map(strip => nonNegative(strip.width)))
  const finishedThickness = nonNegative(project.thickness)
  const roughLength = finishedLength + lengthTrim
  const roughWidth = finishedWidth + project.strips.length * rip + widthTrim
  const roughThickness = finishedThickness + surfacing
  const roughBoardFeet = toBoardFeet(roughWidth * roughLength * roughThickness)
  const finishedBoardFeet = toBoardFeet(finishedWidth * finishedLength * finishedThickness)
  return {
    construction: 'edge',
    length: { finished: finishedLength, rough: roughLength },
    width: { finished: finishedWidth, rough: roughWidth },
    thickness: thickness(finishedThickness),
    stripRoughWidths,
    roughBoardFeet,
    finishedBoardFeet,
    removedBoardFeet: Math.max(0, roughBoardFeet - finishedBoardFeet),
  }
}

function toBoardFeet(cubicMillimeters: number) { return cubicMillimeters / CUBIC_MM_PER_BOARD_FOOT }
function nonNegative(value: number) { return Number.isFinite(value) ? Math.max(0, value) : 0 }
function sum(values: readonly number[]) { return values.reduce((total, value) => total + value, 0) }
function clampAngle(value: number) { return Math.min(Math.max(Number.isFinite(value) ? value : 0, -89), 89) }
