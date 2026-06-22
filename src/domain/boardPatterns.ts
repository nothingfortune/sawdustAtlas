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
  define('brick', 'Brick', 'Running bond with every other slice offset half a cell.', context => result(context, stripes(context), {
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
      ...patch,
    },
  }
}
