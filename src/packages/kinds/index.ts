import type { PackageKind } from '../kind'
import { boardKind } from './board'
import type { BoardPayload } from './board'
import { compositeKind } from './composite'
import type { CompositePayload } from './composite'
import { furnitureKind } from './furniture'
import type { FurniturePayload } from './furniture'

export type { BoardPayload, CompositePayload, FurniturePayload }

export type ProjectPayload = BoardPayload | CompositePayload | FurniturePayload
export type ProjectType = ProjectPayload['type']

// One entry per design type: a new type is one module, one union member above, and one entry here.
export const PACKAGE_KINDS: readonly PackageKind<ProjectPayload>[] = [boardKind, compositeKind, furnitureKind]

export function findKind(type: unknown): PackageKind<ProjectPayload> | undefined {
  return PACKAGE_KINDS.find(kind => kind.type === type)
}
