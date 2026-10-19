import type { PackageKind } from '../kind'
import { boardKind } from './board'
import type { BoardPayload } from './board'
import { compositeKind } from './composite'
import type { CompositePayload } from './composite'

export type { BoardPayload, CompositePayload }

export type ProjectPayload = BoardPayload | CompositePayload
export type ProjectType = ProjectPayload['type']

// One entry per design type: a new type is one module, one union member above, and one entry here.
export const PACKAGE_KINDS: readonly PackageKind<ProjectPayload>[] = [boardKind, compositeKind]

export function findKind(type: unknown): PackageKind<ProjectPayload> | undefined {
  return PACKAGE_KINDS.find(kind => kind.type === type)
}
