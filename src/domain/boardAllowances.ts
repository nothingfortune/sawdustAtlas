import type { BoardProject, BuildAllowances } from '../types'
import { calculateEndGrainMetrics } from './boardGeometry'
import type { EndGrainMetrics } from './boardGeometry'
import { clampAngle, degToRad, nonNegative, sum, toBoardFeet } from './units'

// Build allowances describe how much oversized rough stock must be relative to the
// finished board. They are surfacing/trim stock removed to reach finished faces and
// square edges, kept separate from the kerf/offcut waste handled by the geometry engine.
//
// Assumptions documented for accuracy (see PRODUCT_PLAN accuracy requirements):
// - jointing / planing / routerTable are thickness removed reaching one finished face
//   (routerTable = a router-table/sled surfacing pass). Together they raise the rough
//   thickness above the finished thickness.
// - ripAllowance is width removed per strip when ripping each strip to final width
//   (saw kerf plus a jointed clean-up edge).
// - lengthTrim is total length removed squaring the two ends.
// - widthTrim is total width removed squaring the two outer long edges after glue-up.
export const DEFAULT_ALLOWANCES: BuildAllowances = {
  jointing: 1.5,
  planing: 1.5,
  routerTable: 1.5,
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
  routerTable: number
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

// The rough stock width to rip one first-glue-up strip to, including the extra
// width an angled end-grain face needs. Shared by the rough-board-feet total and
// the cut-plan BOM so the angle shift is applied identically (and only once) in
// both. `stripRoughWidth` already includes the rip/width-trim allowance.
export function roughStripStockWidth(project: BoardProject, stripRoughWidth: number, trailingAngle: number): number {
  if (project.construction !== 'end') return stripRoughWidth
  const angleShift = project.endGrain.stockThickness * Math.tan(degToRad(clampAngle(trailingAngle)))
  return stripRoughWidth + Math.max(0, angleShift)
}

// `metrics` may be supplied by a caller that already computed it (the designer
// pipeline), avoiding a redundant recompute; it is ignored for edge-grain boards.
export function calculateBuildDimensions(project: BoardProject, metrics?: EndGrainMetrics): BuildDimensions {
  const allowance = resolveAllowances(project)
  const surfacing = nonNegative(allowance.jointing) + nonNegative(allowance.planing) + nonNegative(allowance.routerTable)
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
    routerTable: nonNegative(allowance.routerTable),
    rough: finished + surfacing,
  })

  if (project.construction === 'end') {
    const endMetrics = metrics ?? calculateEndGrainMetrics(project)
    const finishedLength = endMetrics.finalLength
    const finishedWidth = endMetrics.finishedWidth
    const finishedThickness = nonNegative(project.endGrain.sliceThickness)
    const roughStockVolume = project.strips.reduce((volume, strip, index) => {
      const stockWidth = roughStripStockWidth(project, stripRoughWidths[index] ?? 0, strip.trailingAngle)
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
      finishedBoardFeet: endMetrics.finishedBoardFeet,
      removedBoardFeet: Math.max(0, roughBoardFeet - endMetrics.finishedBoardFeet),
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
