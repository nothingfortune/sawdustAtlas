import { defaultSpecies } from '../data'
import type { WoodSpecies } from '../types'
import { finiteNumber, records, stringValue, validColor } from './coerce'
import type { NormalizeContext } from './context'

export function normalizeWood(wood: Partial<WoodSpecies>, ctx: NormalizeContext): WoodSpecies {
  const base: WoodSpecies = {
    id: stringValue(wood.id, ctx.createId()),
    name: stringValue(wood.name, stringValue(wood.id, 'Custom wood')),
    color: validColor(wood.color, '#8c6a48'),
    accent: validColor(wood.accent, '#b18a5e'),
    pricePerBoardFoot: finiteNumber(wood.pricePerBoardFoot, 0),
  }
  const availableAt = typeof wood.availableAt === 'string' ? wood.availableAt.trim() : ''
  return availableAt ? { ...base, availableAt } : base
}

/** Saved woods, or the default library when none are saved. */
export function normalizeWoodLibrary(raw: unknown, ctx: NormalizeContext): WoodSpecies[] {
  const saved: Partial<WoodSpecies>[] = records(raw).length > 0 ? records(raw) : defaultSpecies
  return saved.map(wood => normalizeWood(wood, ctx))
}

/** Placeholder species for strip references missing from the library, so colors and prices stay visible. */
export function placeholderWoods(rawBoards: readonly Record<string, unknown>[], library: readonly WoodSpecies[], ctx: NormalizeContext): WoodSpecies[] {
  const known = new Set(library.map(wood => wood.id))
  const missing = rawBoards
    .flatMap(board => records(board['strips']).map(strip => String(strip['speciesId'] ?? '')))
    .filter(id => id && !known.has(id))
  return [...new Set(missing)].map(id => normalizeWood({ id, name: id, color: '#8c6a48', accent: '#b18a5e', pricePerBoardFoot: 0 }, ctx))
}
