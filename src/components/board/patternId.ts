import { species } from '../../data'

/** Returns a known species id for fill-pattern lookup, falling back to the first species. */
export function patternSpeciesId(speciesId: string): string {
  return species.some(wood => wood.id === speciesId) ? speciesId : (species[0]?.id ?? speciesId)
}
