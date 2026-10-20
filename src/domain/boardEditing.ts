import type { BoardProject, BoardStrip, EndGrainSettings } from '../types'
import { calculateEndGrainMetrics } from './boardGeometry'
import { clampTransforms } from './boardSlices'
import type { WorkspaceContext } from './workspace/context'

type Ids = Pick<WorkspaceContext, 'createId'>
export type RowPattern = 'same' | 'rotate' | 'flip' | 'invert'

const withStrips = (project: BoardProject, strips: BoardStrip[]): BoardProject => ({ ...project, strips })

export function addStrip(project: BoardProject, speciesId: string, ctx: Ids): BoardProject {
  return withStrips(project, [...project.strips, { id: ctx.createId(), speciesId, width: 38, trailingAngle: 0 }])
}

export function updateStrip(project: BoardProject, id: string, patch: Partial<BoardStrip>): BoardProject {
  return withStrips(project, project.strips.map(strip => strip.id === id ? { ...strip, ...patch } : strip))
}

export function deleteStrip(project: BoardProject, id: string): BoardProject {
  return withStrips(project, project.strips.filter(strip => strip.id !== id))
}

export function reorderStrips(project: BoardProject, orderedIds: readonly string[]): BoardProject {
  return withStrips(project, orderedIds.map(id => project.strips.find(strip => strip.id === id)).filter((strip): strip is BoardStrip => !!strip))
}

export function duplicatePattern(project: BoardProject, ctx: Ids): BoardProject {
  return withStrips(project, [...project.strips, ...project.strips.map(strip => ({ ...strip, id: ctx.createId() }))])
}

export function mirrorPattern(project: BoardProject, ctx: Ids): BoardProject {
  return withStrips(project, [...project.strips, ...[...project.strips].reverse().map(strip => ({ ...strip, id: ctx.createId() }))])
}

export function reverseStrips(project: BoardProject): BoardProject {
  return withStrips(project, [...project.strips].reverse())
}

// Clamp per-slice transforms to the new count so stale ones cannot return when it grows back.
export function updateEndGrain(project: BoardProject, patch: Partial<EndGrainSettings>): BoardProject {
  const settings = { ...project.endGrain, ...patch }
  const count = calculateEndGrainMetrics({ ...project, endGrain: settings }).sliceCount
  return { ...project, endGrain: { ...settings, ...clampTransforms(settings, count) } }
}

function sliceFlags(project: BoardProject): { flips: boolean[]; rotations: boolean[] } {
  const count = calculateEndGrainMetrics(project).sliceCount
  return {
    flips: Array.from({ length: count }, (_, index) => project.endGrain.rowFlips[index] ?? false),
    rotations: Array.from({ length: count }, (_, index) => project.endGrain.rowRotations[index] ?? false),
  }
}

export function setRowPattern(project: BoardProject, pattern: RowPattern): BoardProject {
  const { flips, rotations } = sliceFlags(project)
  return updateEndGrain(project, {
    rowFlips: flips.map((flipped, index) => pattern === 'flip' ? index % 2 === 1 : pattern === 'invert' ? !flipped : false),
    rowRotations: rotations.map((rotated, index) => pattern === 'rotate' ? index % 2 === 1 : pattern === 'invert' ? !rotated : false),
    rowOffsets: [],
  })
}

export function cycleSliceRow(project: BoardProject, index: number): BoardProject {
  const { flips, rotations } = sliceFlags(project)
  const next = ((rotations[index] ? 1 : 0) + (flips[index] ? 2 : 0) + 1) % 4
  rotations[index] = next === 1 || next === 3
  flips[index] = next === 2 || next === 3
  return updateEndGrain(project, { rowFlips: flips, rowRotations: rotations })
}
