import type { NormalizeContext } from '../normalize/context'
import type { AtlasData, WoodSpecies } from '../types'

/** The raw, untrusted pieces of a package that a kind reads. */
export interface RawPackageInput {
  project: Record<string, unknown>
  woods: unknown[]
  schemaVersion: number
}

export type ReadContext = NormalizeContext

export interface MergeContext {
  createId: () => string
}

export interface KindMergeSummary {
  boards: number
  composites: number
  furniture: number
  importedAsCopy: boolean
  /** The id the project was added under, so the UI can open it. */
  projectId: string
}

export interface PackageDescription {
  name: string
  /** Plain type name, e.g. "Cutting board". */
  label: string
  /** Short count for previews, e.g. "7 strips". */
  size: string
}

export type KindReadResult<P> = { ok: true; payload: P; woods: WoodSpecies[] } | { ok: false; error: string }

// Method syntax on purpose: it keeps parameters bivariant, so a PackageKind<BoardPayload> fits the PackageKind<ProjectPayload> registry.
export interface PackageKind<P extends { type: string }> {
  readonly type: P['type']
  build(data: AtlasData, id: string): P | null
  read(input: RawPackageInput, ctx: ReadContext): KindReadResult<P>
  merge(data: AtlasData, payload: P, ctx: MergeContext): { data: AtlasData; summary: KindMergeSummary }
  usedWoodIds(payload: P): ReadonlySet<string>
  describe(payload: P): PackageDescription
}
