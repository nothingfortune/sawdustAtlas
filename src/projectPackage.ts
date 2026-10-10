import type { AtlasData, BoardProject, CompositeBoard, WoodSpecies } from './types'
import { normalizeData } from './storage'

// A single project (one board, or one composite with the boards its panels use)
// packaged for handoff between devices. Not domain code: reads reuse normalizeData
// so a package is repaired exactly like a backup, and merges never touch existing work.

export const PROJECT_PACKAGE_KIND = 'sawdust-atlas/project-package'

export interface ProjectPackage {
  kind: typeof PROJECT_PACKAGE_KIND
  packageVersion: 1
  schemaVersion: number
  exportedAt: string
  project: { type: 'board'; board: BoardProject } | { type: 'composite'; composite: CompositeBoard; panelBoards: BoardProject[] }
  /** Only the species the project uses. */
  woods: WoodSpecies[]
}

export interface ProjectMergeSummary {
  boards: number
  composites: number
  woodsAdded: number
  woodsKept: number
  importedAsCopy: boolean
}

const IMPORTED_SUFFIX = ' (imported)'

function usedWoodIds(boards: readonly BoardProject[]): Set<string> {
  return new Set(boards.flatMap(board => board.strips.map(strip => strip.speciesId)))
}

function woodsFor(data: AtlasData, boards: readonly BoardProject[]): WoodSpecies[] {
  const used = usedWoodIds(boards)
  return data.woods.filter(wood => used.has(wood.id))
}

export function buildProjectPackage(data: AtlasData, ref: { type: 'board' | 'composite'; id: string }, exportedAt: string): ProjectPackage | null {
  const base = { kind: PROJECT_PACKAGE_KIND as typeof PROJECT_PACKAGE_KIND, packageVersion: 1 as const, schemaVersion: data.schemaVersion, exportedAt }
  if (ref.type === 'board') {
    const board = data.boards.find(b => b.id === ref.id)
    if (!board) return null
    return { ...base, project: { type: 'board', board }, woods: woodsFor(data, [board]) }
  }
  const composite = data.composites.find(c => c.id === ref.id)
  if (!composite) return null
  const panelIds = new Set(composite.panels.map(panel => panel.boardId))
  const panelBoards = data.boards.filter(b => panelIds.has(b.id))
  return { ...base, project: { type: 'composite', composite, panelBoards }, woods: woodsFor(data, panelBoards) }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readProjectPackage(parsed: unknown): { ok: true; pkg: ProjectPackage } | { ok: false; error: string } {
  if (!isRecord(parsed) || parsed['kind'] !== PROJECT_PACKAGE_KIND) {
    return { ok: false, error: 'This file is not a SawdustAtlas project package.' }
  }
  const project = parsed['project']
  if (!isRecord(project)) return { ok: false, error: 'The project package has no project in it.' }
  const schemaVersion = typeof parsed['schemaVersion'] === 'number' ? parsed['schemaVersion'] : 1
  const exportedAt = typeof parsed['exportedAt'] === 'string' ? parsed['exportedAt'] : ''
  const rawWoods = Array.isArray(parsed['woods']) ? parsed['woods'] : []

  let rawBoards: unknown[]
  let rawComposites: unknown[] = []
  if (project['type'] === 'board') {
    if (!isRecord(project['board'])) return { ok: false, error: 'The project package has no board in it.' }
    rawBoards = [project['board']]
  } else if (project['type'] === 'composite') {
    if (!isRecord(project['composite'])) return { ok: false, error: 'The project package has no composite in it.' }
    rawBoards = Array.isArray(project['panelBoards']) ? project['panelBoards'] : []
    rawComposites = [project['composite']]
  } else {
    return { ok: false, error: 'The project package holds an unknown kind of project.' }
  }

  // Run through the same funnel as a backup. With no woods listed normalizeData would
  // seed the default species, so the used-species filter below trims them back.
  const data = normalizeData({ schemaVersion, boards: rawBoards, composites: rawComposites, woods: rawWoods, shops: [] } as unknown as Partial<AtlasData>)
  const woods = woodsFor(data, data.boards)
  if (project['type'] === 'board') {
    const board = data.boards[0]
    if (!board) return { ok: false, error: 'The project package has no board in it.' }
    return { ok: true, pkg: { kind: PROJECT_PACKAGE_KIND, packageVersion: 1, schemaVersion: data.schemaVersion, exportedAt, project: { type: 'board', board }, woods } }
  }
  const composite = data.composites[0]
  if (!composite) return { ok: false, error: 'The project package has no composite in it.' }
  return { ok: true, pkg: { kind: PROJECT_PACKAGE_KIND, packageVersion: 1, schemaVersion: data.schemaVersion, exportedAt, project: { type: 'composite', composite, panelBoards: data.boards }, woods } }
}

export function mergeProjectPackage(data: AtlasData, pkg: ProjectPackage, createId: () => string): { data: AtlasData; summary: ProjectMergeSummary } {
  const boardIds = new Set(data.boards.map(b => b.id))
  const incomingBoards = pkg.project.type === 'board' ? [pkg.project.board] : pkg.project.panelBoards
  const project = pkg.project
  // A clash on the project's own id, or on any board it carries, turns the whole import
  // into a copy so the pieces stay together under fresh ids and one clear name.
  const wholeCopy = project.type === 'board'
    ? boardIds.has(project.board.id)
    : data.composites.some(c => c.id === project.composite.id) || incomingBoards.some(board => boardIds.has(board.id))

  // Existing projects are never replaced; every reference to a re-issued id is remapped.
  const idMap = new Map<string, string>()
  const boards = incomingBoards.map(board => {
    if (!wholeCopy) return board
    const id = createId()
    idMap.set(board.id, id)
    return { ...board, id, name: board.name + IMPORTED_SUFFIX }
  })

  let composites = data.composites
  if (pkg.project.type === 'composite') {
    const source = pkg.project.composite
    const composite: CompositeBoard = {
      ...source,
      id: wholeCopy ? createId() : source.id,
      name: wholeCopy ? source.name + IMPORTED_SUFFIX : source.name,
      panels: source.panels.map(panel => ({ ...panel, boardId: idMap.get(panel.boardId) ?? panel.boardId })),
    }
    composites = [...data.composites, composite]
  }

  const localWoods = new Set(data.woods.map(w => w.id))
  const newWoods = pkg.woods.filter(w => !localWoods.has(w.id))
  const next: AtlasData = {
    ...data,
    // Allowances are shop-wide; incoming boards follow the local setup.
    boards: [...data.boards, ...boards.map(b => ({ ...b, allowances: data.allowances }))],
    composites,
    woods: [...data.woods, ...newWoods],
  }
  return {
    data: next,
    summary: {
      boards: boards.length,
      composites: pkg.project.type === 'composite' ? 1 : 0,
      woodsAdded: newWoods.length,
      woodsKept: pkg.woods.length - newWoods.length,
      importedAsCopy: wholeCopy,
    },
  }
}
