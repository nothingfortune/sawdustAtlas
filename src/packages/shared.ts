import { normalizeFurnitureProject } from '../domain/furniture/project'
import type { FurnitureProject } from '../domain/furniture/types'
import { migrate } from '../domain/migrations'
import { normalizeBoard } from '../normalize/boards'
import { records } from '../normalize/coerce'
import { normalizeComposite } from '../normalize/composites'
import { normalizeAllowances } from '../normalize/settings'
import { normalizeWoodLibrary, placeholderWoodsFor } from '../normalize/woods'
import type { BoardProject, BuildAllowances, CompositeBoard, WoodSpecies } from '../types'
import type { ReadContext } from './kind'

export const IMPORTED_SUFFIX = ' (imported)'

// Unlike normalize/coerce's isRecord, arrays are rejected: every package section is an object.
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`

export function fail(error: string): { ok: false; error: string } {
  return { ok: false, error }
}

export interface IncomingProjects {
  boards: BoardProject[]
  composites: CompositeBoard[]
  furniture: FurnitureProject[]
  woods: WoodSpecies[]
}

export interface IncomingRaw {
  schemaVersion: number
  woods: unknown[]
  boards?: unknown[]
  composites?: unknown[]
  furniture?: unknown[]
}

// An untrusted package can repeat an id, and clash checks only compare against local ids, so the first entry wins.
function firstById<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>()
  return items.filter(item => !seen.has(item.id) && seen.add(item.id))
}

// Migrations read top-level lists, so a package's pieces are put back into a workspace shape before migrating.
export function normalizeIncoming(raw: IncomingRaw, ctx: ReadContext): IncomingProjects {
  const migrated = migrate({ schemaVersion: raw.schemaVersion, woods: raw.woods, boards: raw.boards ?? [], composites: raw.composites ?? [], furniture: raw.furniture ?? [] }).data
  const rawBoards = records(migrated['boards'])
  const library = firstById(normalizeWoodLibrary(migrated['woods'], ctx))
  const fallbackSpeciesId = library[0]?.id ?? 'walnut'
  const allowances = normalizeAllowances(rawBoards[0]?.['allowances'] as (BuildAllowances & { drumSanding?: number }) | undefined)
  const boards = rawBoards.map(board => normalizeBoard(board, { allowances, fallbackSpeciesId }, ctx))
  const migratedBoards: BoardProject[] = []
  const composites = records(migrated['composites']).map(composite => normalizeComposite(composite, { boardSink: migratedBoards, allowances, boards }, ctx))
  const furniture = records(migrated['furniture'])
    .map(project => normalizeFurnitureProject(project, { createId: ctx.createId, now: ctx.now, fallbackSpeciesId }))
    .filter((project): project is FurnitureProject => project !== null)
  const stripSpecies = rawBoards.flatMap(board => records(board['strips']).map(strip => String(strip['speciesId'] ?? '')))
  // A part naming a species the package does not carry gets a placeholder, so the id is never lost.
  const partSpecies = records(migrated['furniture']).flatMap(project => records(project['parts']).map(part => typeof part['speciesId'] === 'string' ? part['speciesId'] : ''))
  return {
    boards: firstById([...boards, ...migratedBoards]),
    composites: firstById(composites),
    furniture: firstById(furniture),
    woods: firstById([...library, ...placeholderWoodsFor([...stripSpecies, ...partSpecies], library, ctx)]),
  }
}

export function woodsUsedBy(woods: readonly WoodSpecies[], used: ReadonlySet<string>): WoodSpecies[] {
  return woods.filter(wood => used.has(wood.id))
}

/** Adds incoming species the workspace lacks; a species already present keeps the local version. */
export function mergeWoods(local: readonly WoodSpecies[], incoming: readonly WoodSpecies[]): { woods: WoodSpecies[]; added: number; kept: number } {
  const localIds = new Set(local.map(wood => wood.id))
  const added = incoming.filter(wood => !localIds.has(wood.id))
  return { woods: [...local, ...added], added: added.length, kept: incoming.length - added.length }
}
