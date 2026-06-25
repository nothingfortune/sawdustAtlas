import type { BoardProject, WoodSpecies } from '../types'
import { clampAngle, nonNegative, sum, toBoardFeet } from './units'

export { CUBIC_MM_PER_BOARD_FOOT } from './units'
const EPSILON = 1e-9

export interface TemplatePolygon {
  id: string
  speciesId: string
  points: string
}

export interface EndGrainTemplate {
  height: number
  faceShift: number
  leftFaceWidth: number
  rightFaceWidth: number
  finishedWidth: number
  polygons: TemplatePolygon[]
  errors: string[]
}

export interface EndGrainMetrics {
  panelWidth: number
  finishedWidth: number
  faceShift: number
  sliceCount: number
  crosscutCount: number
  finalLength: number
  kerfWaste: number
  trimWaste: number
  offcutWaste: number
  wasteLength: number
  crosscutWastePercent: number
  sourceBoardFeet: number
  ripWasteBoardFeet: number
  crosscutWasteBoardFeet: number
  sideTrimWasteBoardFeet: number
  totalWasteBoardFeet: number
  totalWastePercent: number
  finishedBoardFeet: number
  errors: string[]
}

export interface WoodUsage {
  speciesId: string
  name: string
  color: string
  requiredBoardFeet: number
  wasteBoardFeet: number
  usedBoardFeet: number
}

interface StripVolume {
  speciesId: string
  stock: number
  ripWaste: number
  crosscutWaste: number
}

export function buildEndGrainTemplate(project: BoardProject): EndGrainTemplate {
  const thickness = nonNegative(project.endGrain.stockThickness)
  const errors: string[] = []
  let left = 0
  let right = 0
  let min = 0
  let max = 0

  const raw = project.strips.map((strip, index) => {
    const width = nonNegative(strip.width)
    const angle = clampAngle(strip.trailingAngle)
    const rightWidth = width + thickness * Math.tan(angle * Math.PI / 180)
    if (rightWidth <= EPSILON) errors.push(`Strip ${index + 1} closes or crosses on its angled face.`)
    const nextLeft = left + width
    const nextRight = right + rightWidth
    const ys = [left, nextLeft, nextRight, right]
    min = Math.min(min, ...ys)
    max = Math.max(max, ...ys)
    const coords: Array<readonly [number, number]> = [[0, left], [0, nextLeft], [thickness, nextRight], [thickness, right]]
    const result = { id: strip.id, speciesId: strip.speciesId, coords }
    left = nextLeft
    right = nextRight
    return result
  })

  const finishedWidth = Math.max(0, Math.min(left, right))
  return {
    height: Math.max(EPSILON, max - min),
    faceShift: right - left,
    leftFaceWidth: left,
    rightFaceWidth: right,
    finishedWidth,
    polygons: raw.map(shape => ({
      id: shape.id,
      speciesId: shape.speciesId,
      points: shape.coords.map(([x, y]) => `${x},${y - min}`).join(' '),
    })),
    errors,
  }
}

export function calculateEndGrainMetrics(project: BoardProject): EndGrainMetrics {
  const settings = project.endGrain
  const sourceLength = nonNegative(settings.sourceLength)
  const stockThickness = nonNegative(settings.stockThickness)
  const sliceThickness = nonNegative(settings.sliceThickness)
  const kerf = nonNegative(settings.kerf)
  const trimAllowance = Math.min(sourceLength, nonNegative(settings.trimAllowance))
  const template = buildEndGrainTemplate(project)
  const errors = [...template.errors]

  if (sourceLength <= EPSILON) errors.push('Source length must be greater than zero.')
  if (stockThickness <= EPSILON) errors.push('Stock thickness must be greater than zero.')
  if (sliceThickness <= EPSILON) errors.push('Crosscut width must be greater than zero.')

  const usableLength = sourceLength - trimAllowance
  const pitch = sliceThickness + kerf
  let sliceCount = pitch > EPSILON ? Math.max(0, Math.floor((usableLength + kerf + EPSILON) / pitch)) : 0
  let interiorUse = sliceCount * sliceThickness + Math.max(0, sliceCount - 1) * kerf
  let remainderAfterInteriorCuts = usableLength - interiorUse
  if (sliceCount > 0 && remainderAfterInteriorCuts > EPSILON && remainderAfterInteriorCuts + EPSILON < kerf) {
    sliceCount -= 1
    interiorUse = sliceCount * sliceThickness + Math.max(0, sliceCount - 1) * kerf
    remainderAfterInteriorCuts = usableLength - interiorUse
  }
  const crosscutCount = sliceCount === 0 ? 0 : remainderAfterInteriorCuts <= EPSILON ? Math.max(0, sliceCount - 1) : sliceCount
  const kerfWaste = crosscutCount * kerf
  const retainedLength = sliceCount * sliceThickness
  const offcutWaste = Math.max(0, usableLength - retainedLength - kerfWaste)
  const wasteLength = trimAllowance + kerfWaste + offcutWaste
  const stripVolumes = calculateStripVolumes(project, wasteLength)
  const sourceVolume = sum(stripVolumes.map(volume => volume.stock))
  const ripWasteVolume = sum(stripVolumes.map(volume => volume.ripWaste))
  const crosscutWasteVolume = sum(stripVolumes.map(volume => volume.crosscutWaste))
  const sideTrimVolume = Math.abs(template.faceShift) / 2 * stockThickness * retainedLength
  const finishedVolume = sliceCount * stockThickness * template.finishedWidth * sliceThickness
  const totalWasteVolume = ripWasteVolume + crosscutWasteVolume + sideTrimVolume

  // The volume identity only holds for otherwise-valid geometry. A strip that
  // closes or crosses already reports a specific error and breaks the identity by
  // definition (its clamped volume diverges from the unclamped template edges), so
  // guard on `errors.length` to avoid piling a confusing second message on top.
  const conservationDifference = Math.abs(sourceVolume - finishedVolume - totalWasteVolume)
  if (errors.length === 0 && conservationDifference > Math.max(1, sourceVolume) * 1e-8) {
    errors.push('Material-volume conservation failed; check the design inputs.')
  }

  return {
    panelWidth: template.height,
    finishedWidth: template.finishedWidth,
    faceShift: template.faceShift,
    sliceCount,
    crosscutCount,
    finalLength: sliceCount * stockThickness,
    kerfWaste,
    trimWaste: trimAllowance,
    offcutWaste,
    wasteLength,
    crosscutWastePercent: sourceLength > EPSILON ? wasteLength / sourceLength * 100 : 0,
    sourceBoardFeet: toBoardFeet(sourceVolume),
    ripWasteBoardFeet: toBoardFeet(ripWasteVolume),
    crosscutWasteBoardFeet: toBoardFeet(crosscutWasteVolume),
    sideTrimWasteBoardFeet: toBoardFeet(sideTrimVolume),
    totalWasteBoardFeet: toBoardFeet(totalWasteVolume),
    totalWastePercent: sourceVolume > EPSILON ? totalWasteVolume / sourceVolume * 100 : 0,
    finishedBoardFeet: toBoardFeet(finishedVolume),
    errors,
  }
}

export function calculateWoodUsage(project: BoardProject, woods: readonly WoodSpecies[], metrics: EndGrainMetrics): WoodUsage[] {
  const bySpecies = new Map<string, WoodUsage>()
  const volumes = calculateStripVolumes(project, metrics.wasteLength)

  for (const volume of volumes) {
    const wood = woods.find(candidate => candidate.id === volume.speciesId)
    if (!wood) continue
    const current = bySpecies.get(wood.id) ?? { speciesId: wood.id, name: wood.name, color: wood.color, requiredBoardFeet: 0, wasteBoardFeet: 0, usedBoardFeet: 0 }
    current.requiredBoardFeet += toBoardFeet(volume.stock)
    current.wasteBoardFeet += toBoardFeet(volume.ripWaste + volume.crosscutWaste)
    bySpecies.set(wood.id, current)
  }

  const lastStrip = project.strips.at(-1)
  if (lastStrip && Math.abs(metrics.faceShift) > EPSILON) {
    const owner = bySpecies.get(lastStrip.speciesId)
    if (owner) owner.wasteBoardFeet += metrics.sideTrimWasteBoardFeet
  }

  for (const usage of bySpecies.values()) usage.usedBoardFeet = Math.max(0, usage.requiredBoardFeet - usage.wasteBoardFeet)
  return [...bySpecies.values()]
}

function calculateStripVolumes(project: BoardProject, wasteLength: number): StripVolume[] {
  const sourceLength = nonNegative(project.endGrain.sourceLength)
  const stockThickness = nonNegative(project.endGrain.stockThickness)
  return project.strips.map(strip => {
    const leftWidth = nonNegative(strip.width)
    const angle = clampAngle(strip.trailingAngle)
    const rightWidth = Math.max(0, leftWidth + stockThickness * Math.tan(angle * Math.PI / 180))
    const stockWidth = Math.max(leftWidth, rightWidth)
    const averageWidth = (leftWidth + rightWidth) / 2
    return {
      speciesId: strip.speciesId,
      stock: stockWidth * stockThickness * sourceLength,
      ripWaste: Math.abs(rightWidth - leftWidth) / 2 * stockThickness * sourceLength,
      crosscutWaste: averageWidth * stockThickness * wasteLength,
    }
  })
}
