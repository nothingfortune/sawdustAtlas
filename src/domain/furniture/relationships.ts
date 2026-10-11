import { evaluateDim } from './expressions'
import { faceAxis, isHighFace } from './faces'
import { stronglyConnectedComponents } from './graph'
import type { Axis, DimExpr, FaceRef, FurnitureIssue, FurnitureProject, FurnitureRelationship } from './types'

// The position solver behind resolveFurniture. A relationship drives the position of a
// part along one axis from other parts' face planes; it never reads a size to change
// it, only the already evaluated extents to find where a face sits. Each part axis has
// at most one driver, so the drivers form a graph that is solved in dependency order.
// Anything that cannot be solved is reported and left out, never guessed.

export interface PartExtents {
  sx: number
  sy: number
  sz: number
}

export type Position = Partial<Record<Axis, number>>

export interface RelationshipSolution {
  /** Final min corner of every sized part that came out fully placed. */
  placed: Map<string, { x: number; y: number; z: number }>
  /** Why a part could not be placed: a driver whose target did not resolve. */
  issues: FurnitureIssue[]
}

export interface RelationshipPlan {
  /** Invalid, conflicting, cyclic, and unevaluable relationships, found before solving. */
  issues: FurnitureIssue[]
  /** Axes of a part whose stored position is ignored because a relationship drives it,
   *  in x, y, z order. A relationship stuck in a cycle drives nothing. */
  drivenAxes(partId: string): Axis[]
  /** `literal` holds the evaluated stored position for every sized part on its undriven
   *  axes (an axis that failed to evaluate is simply missing). */
  solve(literal: ReadonlyMap<string, Position>): RelationshipSolution
}

const AXES: readonly Axis[] = ['x', 'y', 'z']

interface Reader {
  min(partId: string, axis: Axis): number | undefined
  extent(partId: string, axis: Axis): number | undefined
}

/** One part axis driven by one relationship. */
interface Driver {
  relationship: FurnitureRelationship
  partId: string
  axis: Axis
  /** Parts whose positions along `axis` this reads: the edges of the dependency graph. */
  readsFrom: string[]
  /** Parts that must be resolved for this to place its part (readsFrom, plus siblings
   *  whose extents a distribution needs). */
  needs: string[]
  /** Null when the offset expression failed; the failure is already reported. */
  offset: number | null
  compute(read: Reader, offset: number): number | undefined
}

type Claim = Pick<Driver, 'partId' | 'axis' | 'readsFrom' | 'needs' | 'compute'>

interface Draft {
  problem?: string
  claims: Claim[]
  offset?: DimExpr
}

export function planRelationships(project: FurnitureProject, extents: ReadonlyMap<string, PartExtents>, scope: Readonly<Record<string, number>>): RelationshipPlan {
  const names = new Map(project.parts.map(part => [part.id, part.name]))
  const nameOf = (id: string) => `"${names.get(id) ?? id}"`
  const issues: FurnitureIssue[] = []
  const claimed = new Map<string, Driver>()
  const keyOf = (partId: string, axis: Axis) => `${axis}:${partId}`

  for (const relationship of project.relationships) {
    const draft = draftOf(relationship, names)
    const base = { severity: 'error' as const, relationshipId: relationship.id }
    if (draft.problem) {
      issues.push({ ...base, code: 'relationship-invalid', message: draft.problem, partIds: partIdsOf(relationship) })
      continue
    }
    const taken = draft.claims.find(claim => claimed.has(keyOf(claim.partId, claim.axis)))
    if (taken) {
      issues.push({
        ...base, code: 'relationship-conflict', partIds: [taken.partId],
        message: `${nameOf(taken.partId)} is already placed along ${taken.axis} by another relationship, so this one is ignored.`,
      })
      continue
    }
    let offset: number | null = 0
    if (draft.offset !== undefined) {
      const result = evaluateDim(draft.offset, scope)
      if (result.ok) {
        offset = result.value
      } else {
        offset = null
        issues.push({ ...base, code: result.code, message: `${partIdsOf(relationship).map(nameOf).join(', ')}, offset: ${result.message}`, partIds: partIdsOf(relationship), field: 'offset' })
      }
    }
    for (const claim of draft.claims) claimed.set(keyOf(claim.partId, claim.axis), { ...claim, relationship, offset })
  }

  const drivers = [...claimed.values()]
  const driverOf = (partId: string, axis: Axis) => claimed.get(keyOf(partId, axis))
  const dependenciesOf = (driver: Driver) => driver.readsFrom.flatMap(id => driverOf(id, driver.axis) ?? [])
  const order: Driver[] = []
  for (const group of stronglyConnectedComponents(drivers, dependenciesOf)) {
    const first = group[0]!
    if (group.length === 1 && !dependenciesOf(first).includes(first)) {
      order.push(first)
      continue
    }
    // A loop has no starting point: its parts keep their stored positions.
    const members = group.map(driver => nameOf(driver.partId)).join(', ')
    for (const relationship of new Set(group.map(driver => driver.relationship))) {
      issues.push({
        severity: 'error', code: 'relationship-cycle', relationshipId: relationship.id, partIds: group.map(driver => driver.partId),
        message: `Parts are placed relative to each other in a loop along ${first.axis}: ${members}. They keep their stored positions.`,
      })
    }
    for (const driver of group) claimed.delete(keyOf(driver.partId, driver.axis))
  }

  return {
    issues,
    drivenAxes: partId => AXES.filter(axis => driverOf(partId, axis) !== undefined),
    solve: literal => solve(order, extents, literal, nameOf),
  }
}

function solve(
  order: readonly Driver[], extents: ReadonlyMap<string, PartExtents>, literal: ReadonlyMap<string, Position>, nameOf: (id: string) => string,
): RelationshipSolution {
  const positions = new Map<string, Position>([...literal].map(([id, position]) => [id, { ...position }]))
  const read: Reader = {
    min: (partId, axis) => positions.get(partId)?.[axis],
    extent: (partId, axis) => {
      const box = extents.get(partId)
      return box === undefined ? undefined : axis === 'x' ? box.sx : axis === 'y' ? box.sy : box.sz
    },
  }
  for (const driver of order) {
    if (driver.offset === null || !extents.has(driver.partId)) continue
    const value = driver.compute(read, driver.offset)
    if (value !== undefined) positions.set(driver.partId, { ...positions.get(driver.partId), [driver.axis]: value })
  }

  // A part is gone when it is unsized or missing an axis. Whatever needs a gone part is
  // gone too, and says why.
  const gone = new Set<string>()
  for (const id of extents.keys()) {
    const position = positions.get(id)
    if (!position || position.x === undefined || position.y === undefined || position.z === undefined) gone.add(id)
  }
  const issues: FurnitureIssue[] = []
  const explained = new Set<string>()
  const missing = (driver: Driver) => driver.needs.find(id => gone.has(id) || !extents.has(id))
  for (let changed = true; changed;) {
    changed = false
    for (const driver of order) {
      const cause = missing(driver)
      if (cause === undefined || !extents.has(driver.partId)) continue
      const note = `${driver.relationship.id}\0${driver.partId}`
      if (!explained.has(note)) {
        explained.add(note)
        issues.push({
          severity: 'error', code: 'relationship-invalid', relationshipId: driver.relationship.id, partIds: [driver.partId, cause],
          message: `${nameOf(driver.partId)} cannot be placed because ${nameOf(cause)} did not resolve.`,
        })
      }
      if (!gone.has(driver.partId)) {
        gone.add(driver.partId)
        changed = true
      }
    }
  }

  const placed = new Map<string, { x: number; y: number; z: number }>()
  for (const id of extents.keys()) {
    const position = positions.get(id)
    if (!gone.has(id) && position?.x !== undefined && position.y !== undefined && position.z !== undefined) placed.set(id, { x: position.x, y: position.y, z: position.z })
  }
  return { placed, issues }
}

// ---- Relationship kinds ----------------------------------------------------------

function draftOf(relationship: FurnitureRelationship, names: ReadonlyMap<string, string>): Draft {
  const exists = (id: string) => names.has(id)
  const label = (id: string) => `"${names.get(id) ?? id}"`
  const invalid = (problem: string): Draft => ({ problem, claims: [] })
  const missing = (ids: readonly string[]) => ids.find(id => !exists(id))
  const unknown = (id: string) => invalid(`A relationship refers to a part that does not exist (${id}).`)

  switch (relationship.kind) {
    case 'face': {
      const { partId, face, target } = relationship
      const axis = faceAxis(face)
      const absent = missing([partId, target.partId])
      if (absent !== undefined) return unknown(absent)
      if (target.partId === partId) return invalid(`${label(partId)} cannot be placed relative to itself.`)
      if (faceAxis(target.face) !== axis) return invalid(`${label(partId)}: the ${face} face and ${label(target.partId)}'s ${target.face} face are not on the same axis.`)
      return {
        offset: relationship.offset,
        claims: [{
          partId, axis, readsFrom: [target.partId], needs: [target.partId],
          compute: (read, offset) => {
            const plane = planeOf(read, target, axis)
            const own = read.extent(partId, axis)
            return plane === undefined || own === undefined ? undefined : plane + offset - (isHighFace(face) ? own : 0)
          },
        }],
      }
    }
    case 'center': {
      const { partId, targetId, axis } = relationship
      const absent = missing([partId, targetId])
      if (absent !== undefined) return unknown(absent)
      if (targetId === partId) return invalid(`${label(partId)} cannot be centered on itself.`)
      return {
        offset: relationship.offset,
        claims: [{
          partId, axis, readsFrom: [targetId], needs: [targetId],
          compute: (read, offset) => {
            const start = read.min(targetId, axis)
            const size = read.extent(targetId, axis)
            const own = read.extent(partId, axis)
            return start === undefined || size === undefined || own === undefined ? undefined : start + size / 2 + offset - own / 2
          },
        }],
      }
    }
    case 'between': {
      const { partId, axis, from, to } = relationship
      const absent = missing([partId, from.partId, to.partId])
      if (absent !== undefined) return unknown(absent)
      if (from.partId === partId || to.partId === partId) return invalid(`${label(partId)} cannot be placed between planes of itself.`)
      const wrong = anchorProblem(axis, [from, to], label)
      if (wrong) return invalid(wrong)
      return {
        claims: [{
          partId, axis, readsFrom: [from.partId, to.partId], needs: [from.partId, to.partId],
          compute: read => {
            const a = planeOf(read, from, axis)
            const b = planeOf(read, to, axis)
            const own = read.extent(partId, axis)
            return a === undefined || b === undefined || own === undefined ? undefined : (a + b) / 2 - own / 2
          },
        }],
      }
    }
    case 'distribute': {
      const { partIds, axis, from, to } = relationship
      const absent = missing([...partIds, from.partId, to.partId])
      if (absent !== undefined) return unknown(absent)
      if (new Set(partIds).size !== partIds.length) return invalid('A distribution lists the same part twice.')
      const anchor = [from.partId, to.partId].find(id => partIds.includes(id))
      if (anchor !== undefined) return invalid(`${label(anchor)} cannot be both spaced and an end of its own distribution.`)
      const wrong = anchorProblem(axis, [from, to], label)
      if (wrong) return invalid(wrong)
      return {
        claims: partIds.map((partId, index) => ({
          partId, axis, readsFrom: [from.partId, to.partId], needs: [from.partId, to.partId, ...partIds.filter(id => id !== partId)],
          compute: (read: Reader) => {
            const start = planeOf(read, from, axis)
            const end = planeOf(read, to, axis)
            const sizes = partIds.map(id => read.extent(id, axis))
            if (start === undefined || end === undefined || sizes.some(size => size === undefined)) return undefined
            const lengths = sizes as number[]
            const gap = (Math.abs(end - start) - lengths.reduce((total, size) => total + size, 0)) / (partIds.length + 1)
            const before = lengths.slice(0, index).reduce((total, size) => total + size, 0)
            // Spacing runs from the `from` plane toward the `to` plane, in array order.
            return end >= start ? start + gap * (index + 1) + before : start - gap * (index + 1) - before - lengths[index]!
          },
        })),
      }
    }
  }
}

function planeOf(read: Reader, ref: FaceRef, axis: Axis): number | undefined {
  const start = read.min(ref.partId, axis)
  const size = read.extent(ref.partId, axis)
  if (start === undefined || size === undefined) return undefined
  return isHighFace(ref.face) ? start + size : start
}

function anchorProblem(axis: Axis, refs: readonly FaceRef[], label: (id: string) => string): string | null {
  const wrong = refs.find(ref => faceAxis(ref.face) !== axis)
  return wrong ? `${label(wrong.partId)}'s ${wrong.face} face is not on the ${axis} axis of this relationship.` : null
}

function partIdsOf(relationship: FurnitureRelationship): string[] {
  const ids = relationship.kind === 'distribute' ? relationship.partIds : [relationship.partId]
  return [...ids]
}
