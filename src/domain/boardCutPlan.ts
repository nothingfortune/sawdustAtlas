import type { BoardProject, WoodSpecies } from '../types'
import { calculateBuildDimensions, resolveAllowances } from './boardAllowances'
import type { BuildDimensions } from './boardAllowances'
import { clampAngle, toBoardFeet } from './units'
import { calculateEndGrainMetrics } from './boardGeometry'

export type CutStage = 'rip' | 'crosscut' | 'trim'

export interface StockRequirement {
  id: string
  speciesId: string
  speciesName: string
  quantity: number
  length: number
  width: number
  thickness: number
  trailingAngle: number
  boardFeet: number
}

export interface CutListItem {
  id: string
  stage: CutStage
  label: string
  quantity: number
  passes: number
  speciesId?: string
  sourceLength?: number
  sourceWidth?: number
  sourceThickness?: number
  targetWidth?: number
  trailingAngle?: number
  kerf?: number
  note: string
}

export interface BuildStep {
  id: string
  order: number
  title: string
  instruction: string
}

export interface CuttingBoardPlan {
  stock: StockRequirement[]
  cuts: CutListItem[]
  steps: BuildStep[]
  summary: {
    roughBoardFeet: number
    finishedBoardFeet: number
    plannedWasteBoardFeet: number
    ripPasses: number
    crosscutPasses: number
  }
  warnings: string[]
}

export function generateCuttingBoardPlan(project: BoardProject, woods: readonly WoodSpecies[]): CuttingBoardPlan {
  const build = calculateBuildDimensions(project)
  const metrics = calculateEndGrainMetrics(project)
  const allowance = resolveAllowances(project)
  const stock = aggregateStock(project, woods, build)
  const cuts = project.construction === 'end' ? endGrainCuts(project, build.stripRoughWidths, metrics.crosscutCount, metrics.sliceCount) : edgeGrainCuts(project, build)
  const warnings = project.construction === 'end' ? [...metrics.errors] : []

  if (project.construction === 'end' && Math.abs(metrics.faceShift) > 1e-9) {
    warnings.push(`The first glue-up faces differ by ${format(Math.abs(metrics.faceShift))} mm; the final board requires side squaring.`)
  }
  if (!project.strips.length) warnings.push('Add at least one strip before generating a build plan.')

  return {
    stock,
    cuts,
    steps: project.construction === 'end' ? endGrainSteps(project, metrics.sliceCount, metrics.crosscutCount) : edgeGrainSteps(project),
    summary: {
      roughBoardFeet: build.roughBoardFeet,
      finishedBoardFeet: build.finishedBoardFeet,
      plannedWasteBoardFeet: Math.max(0, build.roughBoardFeet - build.finishedBoardFeet),
      ripPasses: project.strips.length,
      crosscutPasses: project.construction === 'end' ? metrics.crosscutCount : allowance.lengthTrim > 0 ? 2 : 0,
    },
    warnings,
  }
}

function aggregateStock(project: BoardProject, woods: readonly WoodSpecies[], build: BuildDimensions): StockRequirement[] {
  const byKey = new Map<string, StockRequirement>()

  project.strips.forEach((strip, index) => {
    const wood = woods.find(candidate => candidate.id === strip.speciesId)
    const angle = clampAngle(strip.trailingAngle)
    const angleShift = project.construction === 'end' ? project.endGrain.stockThickness * Math.tan(angle * Math.PI / 180) : 0
    const length = project.construction === 'end' ? project.endGrain.sourceLength : build.length.rough
    const width = (build.stripRoughWidths[index] ?? strip.width) + Math.max(0, angleShift)
    const thickness = project.construction === 'end' ? project.endGrain.stockThickness : build.thickness.rough
    const key = [strip.speciesId, length, width, thickness, angle].join('|')
    const existing = byKey.get(key)
    if (existing) {
      existing.quantity += 1
      existing.boardFeet += toBoardFeet(length * width * thickness)
      return
    }
    byKey.set(key, {
      id: `stock-${index + 1}`,
      speciesId: strip.speciesId,
      speciesName: wood?.name ?? strip.speciesId,
      quantity: 1,
      length,
      width,
      thickness,
      trailingAngle: angle,
      boardFeet: toBoardFeet(length * width * thickness),
    })
  })

  return [...byKey.values()]
}

function edgeGrainCuts(project: BoardProject, build: BuildDimensions): CutListItem[] {
  const allowance = resolveAllowances(project)
  const cuts: CutListItem[] = project.strips.map((strip, index) => ({
    id: `rip-${index + 1}`,
    stage: 'rip',
    label: `Rip strip ${index + 1}`,
    quantity: 1,
    passes: 1,
    speciesId: strip.speciesId,
    sourceLength: build.length.rough,
    sourceWidth: build.stripRoughWidths[index] ?? strip.width,
    sourceThickness: build.thickness.rough,
    targetWidth: strip.width,
    trailingAngle: 0,
    note: `Leave ${format((build.stripRoughWidths[index] ?? strip.width) - strip.width)} mm total width allowance before final sizing.`,
  }))
  if (allowance.lengthTrim > 0) cuts.push({ id: 'trim-length', stage: 'trim', label: 'Square both ends', quantity: 1, passes: 2, note: `Remove ${format(allowance.lengthTrim)} mm total to reach ${format(project.length)} mm.` })
  if (allowance.widthTrim > 0) cuts.push({ id: 'trim-width', stage: 'trim', label: 'Square outside edges', quantity: 1, passes: 2, note: `Remove ${format(allowance.widthTrim)} mm total after glue-up.` })
  return cuts
}

function endGrainCuts(project: BoardProject, roughWidths: readonly number[], crosscutCount: number, sliceCount: number): CutListItem[] {
  const allowance = resolveAllowances(project)
  const cuts: CutListItem[] = project.strips.map((strip, index) => ({
    id: `rip-${index + 1}`,
    stage: 'rip',
    label: `${strip.trailingAngle === 0 ? 'Rip' : 'Rip/bevel'} strip ${index + 1}`,
    quantity: 1,
    passes: 1,
    speciesId: strip.speciesId,
    sourceLength: project.endGrain.sourceLength,
    sourceWidth: roughWidths[index] ?? strip.width,
    sourceThickness: project.endGrain.stockThickness,
    targetWidth: strip.width,
    trailingAngle: clampAngle(strip.trailingAngle),
    note: strip.trailingAngle === 0 ? 'Prepare a square strip for the first glue-up.' : `Trailing face angle: ${format(strip.trailingAngle)}°; verify the complementary glue joint before cutting.`,
  }))
  cuts.push({
    id: 'crosscut-slices',
    stage: 'crosscut',
    label: 'Crosscut turned slices',
    quantity: sliceCount,
    passes: crosscutCount,
    sourceLength: project.endGrain.sourceLength,
    sourceThickness: project.endGrain.stockThickness,
    targetWidth: project.endGrain.sliceThickness,
    kerf: project.endGrain.kerf,
    note: `${crosscutCount} saw passes at ${format(project.endGrain.kerf)} mm measured kerf. End-trim allowance is treated as inclusive of its squaring cuts.`,
  })
  if (allowance.lengthTrim > 0 || allowance.widthTrim > 0) cuts.push({ id: 'trim-final', stage: 'trim', label: 'Square assembled board', quantity: 1, passes: 4, note: `Final allowances: ${format(allowance.lengthTrim)} mm length and ${format(allowance.widthTrim)} mm width.` })
  return cuts
}

function edgeGrainSteps(project: BoardProject): BuildStep[] {
  const allowance = resolveAllowances(project)
  return [
    { id: 'mill', order: 1, title: 'Mill stock', instruction: `Joint and plane rough stock, preserving ${format(allowance.jointing + allowance.planing + allowance.routerTable)} mm thickness allowance.` },
    { id: 'rip', order: 2, title: 'Rip the strip recipe', instruction: 'Keep strips numbered and oriented in the order shown in the design.' },
    { id: 'glue', order: 3, title: 'First glue-up', instruction: 'Assemble the long-grain strip pattern, keeping reference faces aligned.' },
    { id: 'finish', order: 4, title: 'Square and surface', instruction: `Trim to ${format(project.length)} mm finished length and surface to ${format(project.thickness)} mm.` },
  ]
}

function endGrainSteps(project: BoardProject, sliceCount: number, crosscutCount: number): BuildStep[] {
  return [
    { id: 'mill', order: 1, title: 'Mill source stock', instruction: `Prepare strips at ${format(project.endGrain.stockThickness)} mm milled thickness and ${format(project.endGrain.sourceLength)} mm source length.` },
    { id: 'rip', order: 2, title: 'Rip and bevel strips', instruction: 'Cut the first glue-up recipe, verifying angled faces against the cross-section preview.' },
    { id: 'glue-one', order: 3, title: 'First glue-up', instruction: 'Assemble the long-grain panel and flatten it before crosscutting.' },
    { id: 'crosscut', order: 4, title: 'Crosscut slices', instruction: `Produce ${sliceCount} slices with ${crosscutCount} saw passes at ${format(project.endGrain.sliceThickness)} mm width.` },
    { id: 'turn', order: 5, title: 'Turn and arrange', instruction: 'Rotate each slice 90 degrees, then follow the saved normal/rotate/flip sequence.' },
    { id: 'glue-two', order: 6, title: 'Final glue-up', instruction: 'Clamp the end-grain assembly against a verified flat reference.' },
    { id: 'finish', order: 7, title: 'Square and surface', instruction: 'Apply the configured final trim and surfacing allowances before finishing.' },
  ]
}

function format(value: number) { return Number(value.toFixed(2)).toString() }
