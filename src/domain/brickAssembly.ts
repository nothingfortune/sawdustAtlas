import { nonNegative, toBoardFeet } from './units'

// BOARD-008 (domain foundation): a true brick-and-mortar cutting board is not a
// single-panel row transform — it is a *composite assembly* of pieces cut from
// more than one source panel. This module models that:
//
//   - a brick-course source panel (brick courses separated by mortar lines),
//   - a mortar blank that supplies the thin separator strips inserted between
//     brick-course strips in the final glue-up,
//   - a parameterized final assembly that alternates brick wafers and mortar
//     separators, offsetting (or rotating) alternate strips by half a course.
//
// See docs/plans/completedPlans/BRICK_PATTERN_CORRECTION.md. UI wiring is a separate phase; the
// existing single-panel "Running bond" preset stays as an approximation until
// this composite model is surfaced in the designer.

export type BrickRole = 'brick' | 'mortar'

export interface BrickParameters {
  finishedLengthMm: number
  finishedWidthMm: number
  finishedThicknessMm: number
  /** Brick course height (the tall dimension of one brick in the panel). */
  brickCourseHeightMm: number
  /** Mortar line thickness between brick courses, within the brick-course panel. */
  mortarCourseThicknessMm: number
  /** Mortar separator thickness inserted between brick strips in the final glue-up. */
  mortarSeparatorThicknessMm: number
  /** Width each brick-course strip is crosscut to (its on-edge depth in the board). */
  crosscutStripWidthMm: number
  kerfMm: number
  endTrimMm: number
  surfacingAllowanceMm: number
  /** Half-height brick courses at the panel edges so the bond aligns after turning. */
  halfCourseEdge: boolean
  /** Add a mortar border separator on the two outer edges of the final board. */
  borders: boolean
}

export const DEFAULT_BRICK_PARAMETERS: BrickParameters = {
  finishedLengthMm: 450,
  finishedWidthMm: 300,
  finishedThicknessMm: 38,
  brickCourseHeightMm: 38,
  mortarCourseThicknessMm: 6,
  mortarSeparatorThicknessMm: 6,
  crosscutStripWidthMm: 38,
  kerfMm: 3.2,
  endTrimMm: 12,
  surfacingAllowanceMm: 3,
  halfCourseEdge: false,
  borders: false,
}

// Seed an editable recipe from a finished board size (the migration path away
// from the old single-panel brick preset: keep the user's dimensions, apply
// sensible brick/mortar defaults they can then edit).
export function defaultBrickParameters(finishedLengthMm: number, finishedWidthMm: number, finishedThicknessMm: number): BrickParameters {
  return {
    ...DEFAULT_BRICK_PARAMETERS,
    finishedLengthMm: nonNegative(finishedLengthMm),
    finishedWidthMm: nonNegative(finishedWidthMm),
    finishedThicknessMm: nonNegative(finishedThicknessMm),
    crosscutStripWidthMm: nonNegative(finishedThicknessMm) || DEFAULT_BRICK_PARAMETERS.crosscutStripWidthMm,
  }
}

export interface PanelCourse {
  role: BrickRole
  heightMm: number
}

export interface SourcePanelRecipe {
  id: string
  name: string
  role: 'brick-course' | 'mortar'
  courses: PanelCourse[]
  lengthMm: number
  thicknessMm: number
}

export interface AssemblyPart {
  sourcePanelId: string
  sourcePieceIndex: number
  kind: 'wafer' | 'separator' | 'border'
  rotate: 0 | 180
  offsetMm: number
}

export interface CompositeBoardRecipe {
  sourcePanels: SourcePanelRecipe[]
  finalAssembly: AssemblyPart[]
  parameters: BrickParameters
}

export interface BrickSummary {
  brickStripCount: number
  separatorCount: number
  courseCount: number
  coursePitchMm: number
  offsetMm: number
  assembledLengthMm: number
  assembledWidthMm: number
  brickBoardFeet: number
  mortarBoardFeet: number
  totalBoardFeet: number
  wasteBoardFeet: number
  conservationOk: boolean
  warnings: string[]
}

interface BrickGeometry {
  coursePitch: number
  offset: number
  brickStripCount: number
  separatorCount: number
  courseCount: number
  assembledLength: number
  assembledWidth: number
}

const PANEL_A_ID = 'brick-course'
const PANEL_B_ID = 'mortar-blank'
const EPSILON = 1e-9

function deriveGeometry(params: BrickParameters): BrickGeometry {
  const brickHeight = nonNegative(params.brickCourseHeightMm)
  const mortarCourse = nonNegative(params.mortarCourseThicknessMm)
  const separator = nonNegative(params.mortarSeparatorThicknessMm)
  const crosscut = Math.max(EPSILON, nonNegative(params.crosscutStripWidthMm))
  const coursePitch = brickHeight + mortarCourse
  const offset = coursePitch / 2

  // Width = n*crosscut + (n-1)*separator  ->  n = (width + separator) / (crosscut + separator)
  const stripUnit = crosscut + separator
  const brickStripCount = Math.max(1, Math.round((nonNegative(params.finishedWidthMm) + separator) / stripUnit))
  const separatorCount = Math.max(0, brickStripCount - 1) + (params.borders ? 2 : 0)

  // Length = c*brickHeight + (c-1)*mortarCourse  ->  c = (length + mortarCourse) / coursePitch
  const courseCount = Math.max(1, coursePitch > EPSILON ? Math.round((nonNegative(params.finishedLengthMm) + mortarCourse) / coursePitch) : 1)

  const assembledLength = courseCount * brickHeight + Math.max(0, courseCount - 1) * mortarCourse
  const assembledWidth = brickStripCount * crosscut + separatorCount * separator
  return { coursePitch, offset, brickStripCount, separatorCount, courseCount, assembledLength, assembledWidth }
}

function buildBrickCourses(courseCount: number, brickHeight: number, mortarCourse: number, halfEdge: boolean): PanelCourse[] {
  const courses: PanelCourse[] = []
  for (let i = 0; i < courseCount; i += 1) {
    const edge = halfEdge && (i === 0 || i === courseCount - 1)
    courses.push({ role: 'brick', heightMm: edge ? brickHeight / 2 : brickHeight })
    if (i < courseCount - 1) courses.push({ role: 'mortar', heightMm: mortarCourse })
  }
  return courses
}

export function generateBrickAssembly(params: BrickParameters): CompositeBoardRecipe {
  const geom = deriveGeometry(params)
  const sourceThickness = nonNegative(params.finishedThicknessMm) + nonNegative(params.surfacingAllowanceMm)

  const brickPanel: SourcePanelRecipe = {
    id: PANEL_A_ID,
    name: 'Brick-course panel',
    role: 'brick-course',
    courses: buildBrickCourses(geom.courseCount, nonNegative(params.brickCourseHeightMm), nonNegative(params.mortarCourseThicknessMm), params.halfCourseEdge),
    lengthMm: geom.brickStripCount * nonNegative(params.crosscutStripWidthMm) + geom.brickStripCount * nonNegative(params.kerfMm) + nonNegative(params.endTrimMm),
    thicknessMm: sourceThickness,
  }
  const mortarPanel: SourcePanelRecipe = {
    id: PANEL_B_ID,
    name: 'Mortar separator blank',
    role: 'mortar',
    courses: [{ role: 'mortar', heightMm: geom.assembledLength }],
    lengthMm: geom.separatorCount * (nonNegative(params.mortarSeparatorThicknessMm) + nonNegative(params.kerfMm)) + nonNegative(params.endTrimMm),
    thicknessMm: sourceThickness,
  }

  const finalAssembly: AssemblyPart[] = []
  if (params.borders) finalAssembly.push({ sourcePanelId: PANEL_B_ID, sourcePieceIndex: 0, kind: 'border', rotate: 0, offsetMm: 0 })
  let separatorIndex = params.borders ? 1 : 0
  for (let i = 0; i < geom.brickStripCount; i += 1) {
    const odd = i % 2 === 1
    finalAssembly.push({
      sourcePanelId: PANEL_A_ID,
      sourcePieceIndex: i,
      kind: 'wafer',
      // Stagger alternate courses by half a course pitch. When the panel carries
      // half-course edges, a 180-degree turn achieves the same offset instead.
      rotate: odd && params.halfCourseEdge ? 180 : 0,
      offsetMm: odd && !params.halfCourseEdge ? geom.offset : 0,
    })
    if (i < geom.brickStripCount - 1) {
      finalAssembly.push({ sourcePanelId: PANEL_B_ID, sourcePieceIndex: separatorIndex, kind: 'separator', rotate: 0, offsetMm: 0 })
      separatorIndex += 1
    }
  }
  if (params.borders) finalAssembly.push({ sourcePanelId: PANEL_B_ID, sourcePieceIndex: separatorIndex, kind: 'border', rotate: 0, offsetMm: 0 })

  return { sourcePanels: [brickPanel, mortarPanel], finalAssembly, parameters: params }
}

export function summarizeBrickAssembly(params: BrickParameters): BrickSummary {
  const geom = deriveGeometry(params)
  const crosscut = nonNegative(params.crosscutStripWidthMm)
  const brickHeight = nonNegative(params.brickCourseHeightMm)
  const mortarCourse = nonNegative(params.mortarCourseThicknessMm)
  const separator = nonNegative(params.mortarSeparatorThicknessMm)
  const finishedThickness = nonNegative(params.finishedThicknessMm)
  const surfacing = nonNegative(params.surfacingAllowanceMm)

  const brickVolume = geom.brickStripCount * crosscut * (geom.courseCount * brickHeight) * finishedThickness
  const courseMortarVolume = geom.brickStripCount * crosscut * Math.max(0, geom.courseCount - 1) * mortarCourse * finishedThickness
  const separatorMortarVolume = geom.separatorCount * separator * geom.assembledLength * finishedThickness
  const mortarVolume = courseMortarVolume + separatorMortarVolume
  const finishedVolume = geom.assembledLength * geom.assembledWidth * finishedThickness

  const surfacingWaste = geom.assembledLength * geom.assembledWidth * surfacing
  const kerfWaste = geom.brickStripCount * nonNegative(params.kerfMm) * geom.assembledLength * (finishedThickness + surfacing)
  const trimWaste = nonNegative(params.endTrimMm) * geom.assembledWidth * (finishedThickness + surfacing)
  const wasteVolume = surfacingWaste + kerfWaste + trimWaste

  return {
    brickStripCount: geom.brickStripCount,
    separatorCount: geom.separatorCount,
    courseCount: geom.courseCount,
    coursePitchMm: geom.coursePitch,
    offsetMm: geom.offset,
    assembledLengthMm: geom.assembledLength,
    assembledWidthMm: geom.assembledWidth,
    brickBoardFeet: toBoardFeet(brickVolume),
    mortarBoardFeet: toBoardFeet(mortarVolume),
    totalBoardFeet: toBoardFeet(brickVolume + mortarVolume),
    wasteBoardFeet: toBoardFeet(wasteVolume),
    conservationOk: Math.abs((brickVolume + mortarVolume) - finishedVolume) <= Math.max(1, finishedVolume) * 1e-8,
    warnings: ['End grain — do not run this board through a planer. Flatten with a router sled, drum sander, CNC surfacing pass, or careful sanding.'],
  }
}

// The old single-panel approximation is the `brick` preset id. Boards built from
// it need migrating to a composite recipe (defaultBrickParameters seeds one from
// the board's finished size).
export function isLegacyBrickPreset(patternId: string): boolean {
  return patternId === 'brick'
}
