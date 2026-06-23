import type { BoardProject, BoardStrip, EndGrainSettings, WoodSpecies } from '../types'

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

export const BOARD_PATTERNS = [
  define('stripe', 'Stripe', 'Straight repeating color bands.', context => result(context, stripes(context))),
  define('checker', 'Checkerboard', 'Alternating square end-grain cells.', context => {
    const alternate = slices(context, index => index % 2 === 1)
    return result(context, stripes(context), { rowFlips: alternate, rowRotations: alternate })
  }),
  define('brick', 'Running bond', 'Single-panel brick-bond approximation with every other slice offset half a cell.', context => result(context, stripes(context), {
    rowOffsets: slices(context, index => index % 2 === 1 ? 20 : 0),
  })),
  define('third-bond', 'Third bond', 'Three-step running bond offset.', context => result(context, stripes(context), {
    rowOffsets: slices(context, index => index % 3 * (40 / 3)),
  })),
  define('chevron', 'Chevron', 'Alternating 45-degree strip faces.', context => result(context, stripes(context, 45))),
  define('zigzag', 'Zig-zag', 'Chevron blank with alternating slice direction.', context => result(context, stripes(context, 45), {
    rowRotations: slices(context, index => index % 2 === 1),
  })),
  define('stepped-wave', 'Stepped wave', 'Repeating rise-and-fall offset across slices.', context => {
    const offsets = [0, 10, 20, 30, 20, 10]
    return result(context, stripes(context), { rowOffsets: slices(context, index => offsets[index % offsets.length]!) })
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

function stripes(context: PatternContext, angle = 0): BoardStrip[] {
  return Array.from({ length: context.stripCount }, (_, index) => ({
    id: context.createId(),
    speciesId: index % 2 ? context.secondaryId : context.primaryId,
    width: 40,
    trailingAngle: angle ? (index % 2 ? -angle : angle) : 0,
  }))
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
