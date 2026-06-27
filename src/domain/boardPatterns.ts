import type { BoardProject, BoardStrip, EndGrainSettings, WoodSpecies } from '../types'
import { nonNegative } from './units'

export interface BoardPatternDefinition<Id extends string = string> {
  id: Id
  name: string
  description: string
  apply: (context: PatternContext) => PatternResult
}

export interface PatternResult {
  strips: BoardStrip[]
  endGrain: EndGrainSettings
}

interface PatternContext {
  project: BoardProject
  primaryId: string
  secondaryId: string
  stripCount: number
  sliceCount: number
  createId: () => string
}

// Width of each generated preset strip. Bond offsets below are derived from this
// (half-cell, third-cell, …) rather than hard-coded, so they stay correct if the
// preset strip width ever changes. See docs/plans/BRICK_PATTERN_CORRECTION.md.
const PRESET_STRIP_WIDTH = 40

export const BOARD_PATTERNS = [
  define('stripe', 'Stripe', 'Straight repeating color bands.', context => result(context, flatStrips(context))),
  define('checker', 'Checkerboard', 'Alternating square end-grain cells.', context => {
    const alternate = slices(context, index => index % 2 === 1)
    return result(context, flatStrips(context), { rowFlips: alternate, rowRotations: alternate })
  }),
  define('brick', 'Running bond', 'Single-panel brick-bond approximation with every other slice offset half a cell.', context => {
    const strips = flatStrips(context)
    const cell = cellWidth(strips)
    return result(context, strips, { rowOffsets: slices(context, index => index % 2 === 1 ? cell / 2 : 0) })
  }),
  define('third-bond', 'Third bond', 'Three-step running bond offset.', context => {
    const strips = flatStrips(context)
    const cell = cellWidth(strips)
    return result(context, strips, { rowOffsets: slices(context, index => index % 3 * (cell / 3)) })
  }),
  define('chevron', 'Chevron', 'Alternating angled strip faces, gauged to the stock so wafers stay full.', context => result(context, chevronStrips(context))),
  define('zigzag', 'Zig-zag', 'Chevron blank with alternating slice direction.', context => result(context, chevronStrips(context), {
    rowRotations: slices(context, index => index % 2 === 1),
  })),
  define('stepped-wave', 'Stepped wave', 'Repeating rise-and-fall offset across slices.', context => {
    const strips = flatStrips(context)
    const cell = cellWidth(strips)
    const fractions = [0, 0.25, 0.5, 0.75, 0.5, 0.25]
    return result(context, strips, { rowOffsets: slices(context, index => fractions[index % fractions.length]! * cell) })
  }),
] as const satisfies readonly BoardPatternDefinition[]

export type BoardPatternId = (typeof BOARD_PATTERNS)[number]['id']

// The two species an alternating pattern/arrangement uses: the first strip's
// wood and the next distinct one, falling back to the library's first two.
export function pickSpeciesPair(project: BoardProject, woods: readonly WoodSpecies[]): [string, string] {
  const primaryId = project.strips[0]?.speciesId ?? woods[0]?.id ?? 'wood-1'
  const secondaryId = project.strips.find(strip => strip.speciesId !== primaryId)?.speciesId ?? woods[1]?.id ?? primaryId
  return [primaryId, secondaryId]
}

// Strip count rounded up to an even number so an alternating A/B stack isn't a
// palindrome (needed for the vertical-mirror checkerboard and brick offsets).
export function evenStripCount(project: BoardProject): number {
  const minimum = Math.max(project.strips.length, 8)
  return minimum % 2 ? minimum + 1 : minimum
}

// Strip-arrangement reorderings. Unlike the end-grain pattern recipes above
// (which intentionally rebuild the strip layout), these only permute the strips
// the user already chose — every strip keeps its wood, width, and angle — so
// arranging never discards their sizes or species.

// Interleave strips by species (round-robin over species in first-seen order),
// turning runs like A A B B into A B A B while preserving each strip exactly.
export function alternateStrips(strips: readonly BoardStrip[]): BoardStrip[] {
  const groups: BoardStrip[][] = []
  const bySpecies = new Map<string, BoardStrip[]>()
  for (const strip of strips) {
    let group = bySpecies.get(strip.speciesId)
    if (!group) { group = []; bySpecies.set(strip.speciesId, group); groups.push(group) }
    group.push(strip)
  }
  const longest = groups.reduce((max, group) => Math.max(max, group.length), 0)
  const ordered: BoardStrip[] = []
  for (let round = 0; round < longest; round += 1)
    for (const group of groups)
      if (round < group.length) ordered.push(group[round]!)
  return ordered
}

// Order strips by ascending width so sizes step up across the panel, keeping the
// same strips and woods (only the order changes).
export function gradientStrips(strips: readonly BoardStrip[]): BoardStrip[] {
  return [...strips].sort((a, b) => a.width - b.width)
}

export function applyBoardPattern(
  patternId: BoardPatternId,
  project: BoardProject,
  woods: readonly WoodSpecies[],
  sliceCount: number,
  createId: () => string,
): PatternResult {
  const [primaryId, secondaryId] = pickSpeciesPair(project, woods)
  const pattern = BOARD_PATTERNS.find(candidate => candidate.id === patternId)
  if (!pattern) throw new Error(`Unknown cutting board pattern: ${patternId}`)
  return pattern.apply({ project, primaryId, secondaryId, stripCount: evenStripCount(project), sliceCount, createId })
}

function define<const Id extends string>(id: Id, name: string, description: string, apply: BoardPatternDefinition['apply']): BoardPatternDefinition<Id> {
  return { id, name, description, apply }
}

// Re-skin the user's existing strips with this recipe's trailing angle, keeping
// each strip's width, species, and id (so a recipe never discards the layout they
// built). On an empty board, generate a starter layout so a recipe still produces
// something editable.
function reskin(context: PatternContext, angleFor: (index: number, count: number) => number): BoardStrip[] {
  const existing = context.project.strips
  if (existing.length > 0) return existing.map((strip, index) => ({ ...strip, trailingAngle: angleFor(index, existing.length) }))
  return Array.from({ length: context.stripCount }, (_, index) => ({
    id: context.createId(),
    speciesId: index % 2 ? context.secondaryId : context.primaryId,
    width: PRESET_STRIP_WIDTH,
    trailingAngle: angleFor(index, context.stripCount),
  }))
}

// Strips for a flat (un-angled) recipe.
function flatStrips(context: PatternContext): BoardStrip[] {
  return reskin(context, () => 0)
}

// Strips for chevron/zig-zag: alternating ± the adaptive angle.
function chevronStrips(context: PatternContext): BoardStrip[] {
  const base = flatStrips(context)
  const magnitude = chevronMagnitude(base, nonNegative(context.project.endGrain.stockThickness))
  return base.map((strip, index) => ({ ...strip, trailingAngle: index % 2 ? -magnitude : magnitude }))
}

// Trailing half-angle that keeps the narrowest strip's shrinking face at ~2/3 of its
// width for the given stock thickness, so wafers never taper to a point. The face
// shift is stockThickness·tan(angle); targeting a shift of width/3 gives
// tan(angle) = width / (3·thickness). Capped at 45° as a practical ceiling.
function chevronMagnitude(strips: readonly BoardStrip[], thickness: number): number {
  if (!(thickness > 0)) return 0
  const minWidth = Math.min(...strips.map(strip => nonNegative(strip.width)))
  if (!(minWidth > 0)) return 0
  return Math.min(45, Math.atan(minWidth / (3 * thickness)) * 180 / Math.PI)
}

// The running-bond cell the offsets are measured against — the average strip width,
// so a bond tracks the real strips instead of a fixed preset constant.
function cellWidth(strips: readonly BoardStrip[]): number {
  if (strips.length === 0) return PRESET_STRIP_WIDTH
  return strips.reduce((total, strip) => total + nonNegative(strip.width), 0) / strips.length
}

function slices<T>(context: PatternContext, value: (index: number) => T): T[] {
  return Array.from({ length: context.sliceCount }, (_, index) => value(index))
}

function result(context: PatternContext, strips: BoardStrip[], patch: Partial<EndGrainSettings> = {}): PatternResult {
  return {
    strips,
    endGrain: {
      ...context.project.endGrain,
      rowFlips: [],
      rowRotations: [],
      rowOffsets: [],
      rowOrder: [],
      ...patch,
    },
  }
}
