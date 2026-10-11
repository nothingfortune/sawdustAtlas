import type { BoardProject } from '../../types'
import { calculateEndGrainMetrics } from '../boardGeometry'
import type { EndGrainMetrics } from '../boardGeometry'
import { readSliceStates } from '../boardSlices'

// Physical part marks (stress test F7). The labels a woodworker writes on parts at the
// bench so identity survives milling, ripping, and crosscutting. Pure data; the
// instruction generators read the labels from here so the plan and the bench agree.

export interface StripMark { stripId: string; index: number; label: string; speciesId: string }
export interface SliceMark { physicalIndex: number; position: number; label: string; rotated: boolean; flipped: boolean }
export interface BoardMarks {
  strips: StripMark[]
  panelLabel: string
  /** End grain only; [] for edge grain. Ordered by physical identity (A, B, ...). */
  slices: SliceMark[]
  boardLabel: string
  /** Plain-language reference-face convention. */
  referenceMark: string
}

const REFERENCE_MARK =
  'Draw a cabinetmaker\'s triangle across the panel face, apex pointing at the top edge, so the slices keep their order and orientation after crosscutting.'

/** Bijective base-26 letters: 0 is A, 25 is Z, 26 is AA, 701 is ZZ, 702 is AAA. */
export function sliceLetter(index: number): string {
  let n = Math.max(0, Math.trunc(Number.isFinite(index) ? index : 0)) + 1
  let letters = ''
  while (n > 0) {
    const remainder = (n - 1) % 26
    letters = String.fromCharCode(65 + remainder) + letters
    n = Math.floor((n - 1) / 26)
  }
  return letters
}

export function boardPartMarks(project: BoardProject, metrics?: EndGrainMetrics): BoardMarks {
  const strips = project.strips.map((strip, index) => ({
    stripId: strip.id,
    index,
    label: `S${index + 1}`,
    speciesId: strip.speciesId,
  }))
  return {
    strips,
    panelLabel: 'P1',
    slices: project.construction === 'end' ? sliceMarks(project, metrics ?? calculateEndGrainMetrics(project)) : [],
    boardLabel: 'B1',
    referenceMark: REFERENCE_MARK,
  }
}

// boardSlices.ts indexes rowRotations/rowFlips by assembled POSITION, and rowOrder[position]
// is the physical slice sitting there. So the transform of physical slice p is read at
// the position where rowOrder places it.
function sliceMarks(project: BoardProject, metrics: EndGrainMetrics): SliceMark[] {
  const states = readSliceStates(project.endGrain, metrics.sliceCount)
  const marks: SliceMark[] = []
  states.forEach((state, position) => {
    marks.push({
      physicalIndex: state.sourceIndex,
      position,
      label: sliceLetter(state.sourceIndex),
      rotated: state.rotated,
      flipped: state.flipped,
    })
  })
  return marks.sort((a, b) => a.physicalIndex - b.physicalIndex)
}
