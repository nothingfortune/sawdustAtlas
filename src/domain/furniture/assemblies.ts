import type { FurnitureProject, FurnitureSubassembly } from './types'

// Pure subassembly edits behind the Assemblies panel. A part belongs to at most one
// subassembly and a subassembly is built into at most one parent, which is what
// validation requires, so every operation here keeps those true. Order is build order:
// top-level subassemblies in list order, and each one's children in `childIds` order.

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** The first unused single-letter mark, A to Z; empty when all are taken. */
export function nextAssemblyLabel(project: FurnitureProject): string {
  const taken = new Set(project.subassemblies.map(sub => sub.label))
  return [...LETTERS].find(letter => !taken.has(letter)) ?? ''
}

function nextName(project: FurnitureProject): string {
  const taken = new Set(project.subassemblies.map(sub => sub.name))
  let n = project.subassemblies.length + 1
  while (taken.has(`Assembly ${n}`)) n += 1
  return `Assembly ${n}`
}

function mapSub(project: FurnitureProject, id: string, change: (sub: FurnitureSubassembly) => FurnitureSubassembly): FurnitureProject {
  return { ...project, subassemblies: project.subassemblies.map(sub => sub.id === id ? change(sub) : sub) }
}

/** Takes the parts out of every subassembly except `keep`. */
function withoutParts(project: FurnitureProject, partIds: readonly string[], keep?: string): FurnitureProject {
  const moving = new Set(partIds)
  return { ...project, subassemblies: project.subassemblies.map(sub => sub.id === keep ? sub : { ...sub, partIds: sub.partIds.filter(id => !moving.has(id)) }) }
}

/** A new top-level subassembly holding the existing parts among `partIds`, which leave any
 *  subassembly they were in. */
export function createSubassembly(project: FurnitureProject, id: string, partIds: readonly string[]): FurnitureProject {
  const known = new Set(project.parts.map(part => part.id))
  const members = [...new Set(partIds)].filter(partId => known.has(partId))
  const emptied = withoutParts(project, members)
  return { ...emptied, subassemblies: [...emptied.subassemblies, { id, name: nextName(project), label: nextAssemblyLabel(project), partIds: members, childIds: [] }] }
}

export function renameSubassembly(project: FurnitureProject, id: string, name: string): FurnitureProject {
  return mapSub(project, id, sub => ({ ...sub, name }))
}

export function labelSubassembly(project: FurnitureProject, id: string, label: string): FurnitureProject {
  return mapSub(project, id, sub => ({ ...sub, label }))
}

/** Adds existing parts to a subassembly, taking them out of any other. */
export function addPartsToSubassembly(project: FurnitureProject, id: string, partIds: readonly string[]): FurnitureProject {
  const known = new Set(project.parts.map(part => part.id))
  const adding = [...new Set(partIds)].filter(partId => known.has(partId))
  const emptied = withoutParts(project, adding, id)
  return mapSub(emptied, id, sub => ({ ...sub, partIds: [...sub.partIds, ...adding.filter(partId => !sub.partIds.includes(partId))] }))
}

export function removePartFromSubassembly(project: FurnitureProject, id: string, partId: string): FurnitureProject {
  return mapSub(project, id, sub => ({ ...sub, partIds: sub.partIds.filter(candidate => candidate !== partId) }))
}

export function parentOf(project: FurnitureProject, id: string): FurnitureSubassembly | undefined {
  return project.subassemblies.find(sub => sub.childIds.includes(id))
}

/** Every subassembly built into `id`, at any depth. */
export function descendantIds(project: FurnitureProject, id: string): Set<string> {
  const byId = new Map(project.subassemblies.map(sub => [sub.id, sub]))
  const found = new Set<string>()
  const visit = (current: string) => {
    for (const child of byId.get(current)?.childIds ?? []) {
      if (!found.has(child)) {
        found.add(child)
        visit(child)
      }
    }
  }
  visit(id)
  return found
}

/** Whether `parentId` may take `childId` as a child: not itself or anything built into it. */
export function canNest(project: FurnitureProject, childId: string, parentId: string): boolean {
  return childId !== parentId && !descendantIds(project, childId).has(parentId)
}

/** Builds `childId` into `parentId` (last in its order), or makes it top-level with a null
 *  parent. Null when that would make a subassembly contain itself. */
export function nestSubassembly(project: FurnitureProject, childId: string, parentId: string | null): FurnitureProject | null {
  if (parentId !== null && !canNest(project, childId, parentId)) return null
  const detached = { ...project, subassemblies: project.subassemblies.map(sub => ({ ...sub, childIds: sub.childIds.filter(id => id !== childId) })) }
  return parentId === null ? detached : mapSub(detached, parentId, sub => ({ ...sub, childIds: [...sub.childIds, childId] }))
}

/** Moves a subassembly one place earlier (-1) or later (1) among its siblings. */
export function moveSubassembly(project: FurnitureProject, id: string, direction: -1 | 1): FurnitureProject {
  const parent = parentOf(project, id)
  if (parent) {
    const index = parent.childIds.indexOf(id)
    const swap = index + direction
    if (swap < 0 || swap >= parent.childIds.length) return project
    const childIds = [...parent.childIds]
    ;[childIds[index], childIds[swap]] = [childIds[swap]!, childIds[index]!]
    return mapSub(project, parent.id, sub => ({ ...sub, childIds }))
  }
  const isChild = new Set(project.subassemblies.flatMap(sub => sub.childIds))
  const roots = project.subassemblies.filter(sub => !isChild.has(sub.id))
  const index = roots.findIndex(sub => sub.id === id)
  const neighbor = roots[index + direction]
  if (index < 0 || !neighbor) return project
  const list = [...project.subassemblies]
  const [a, b] = [list.findIndex(sub => sub.id === id), list.findIndex(sub => sub.id === neighbor.id)]
  ;[list[a], list[b]] = [list[b]!, list[a]!]
  return { ...project, subassemblies: list }
}

/** Deletes a subassembly. Its parts become loose, and its children take its place in its
 *  parent (or become top-level). */
export function removeSubassembly(project: FurnitureProject, id: string): FurnitureProject {
  const removed = project.subassemblies.find(sub => sub.id === id)
  if (!removed) return project
  return {
    ...project,
    subassemblies: project.subassemblies.filter(sub => sub.id !== id).map(sub => {
      if (!sub.childIds.includes(id)) return sub
      const childIds = sub.childIds.flatMap(child => child === id ? removed.childIds : [child])
      return { ...sub, childIds }
    }),
  }
}

export interface AssemblyRow {
  subassembly: FurnitureSubassembly
  depth: number
}

/** The subassemblies in build order, depth first, each with its nesting depth. Anything
 *  unreachable from a root (a cycle in imported data) is listed last so it can be fixed. */
export function assemblyRows(project: FurnitureProject): AssemblyRow[] {
  const byId = new Map(project.subassemblies.map(sub => [sub.id, sub]))
  const isChild = new Set(project.subassemblies.flatMap(sub => sub.childIds))
  const rows: AssemblyRow[] = []
  const seen = new Set<string>()
  const visit = (sub: FurnitureSubassembly, depth: number) => {
    if (seen.has(sub.id)) return
    seen.add(sub.id)
    rows.push({ subassembly: sub, depth })
    for (const child of sub.childIds) {
      const next = byId.get(child)
      if (next) visit(next, depth + 1)
    }
  }
  for (const sub of project.subassemblies) if (!isChild.has(sub.id)) visit(sub, 0)
  for (const sub of project.subassemblies) visit(sub, 0)
  return rows
}
