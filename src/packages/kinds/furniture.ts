import type { FurnitureProject } from '../../domain/furniture/types'
import type { PackageKind } from '../kind'
import { IMPORTED_SUFFIX, fail, isPlainRecord, normalizeIncoming, plural } from '../shared'

export interface FurniturePayload {
  type: 'furniture'
  furniture: FurnitureProject
}

export const furnitureKind: PackageKind<FurniturePayload> = {
  type: 'furniture',
  build(data, id) {
    const furniture = data.furniture.find(p => p.id === id)
    return furniture ? { type: 'furniture', furniture } : null
  },
  read(input, ctx) {
    const raw = input.project['furniture']
    if (!isPlainRecord(raw)) return fail('The project package has no furniture project in it.')
    const incoming = normalizeIncoming({ schemaVersion: input.schemaVersion, woods: input.woods, furniture: [raw] }, ctx)
    const furniture = incoming.furniture[0]
    if (!furniture) return fail('The project package has no furniture project in it.')
    return { ok: true, payload: { type: 'furniture', furniture }, woods: incoming.woods }
  },
  merge(data, payload, ctx) {
    // Part, joint, and relationship ids are project-scoped, so only the project id can clash.
    const copy = data.furniture.some(p => p.id === payload.furniture.id)
    const furniture = copy ? { ...payload.furniture, id: ctx.createId(), name: payload.furniture.name + IMPORTED_SUFFIX } : payload.furniture
    return {
      data: { ...data, furniture: [...data.furniture, furniture] },
      summary: { boards: 0, composites: 0, furniture: 1, importedAsCopy: copy, projectId: furniture.id },
    }
  },
  usedWoodIds(payload) {
    return new Set(payload.furniture.parts.flatMap(part => part.speciesId === undefined ? [] : [part.speciesId]))
  },
  describe(payload) {
    return { name: payload.furniture.name, label: 'Furniture project', size: plural(payload.furniture.parts.length, 'part') }
  },
}
