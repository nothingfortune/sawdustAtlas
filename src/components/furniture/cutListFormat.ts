import type { CutAllowance, FurnitureJoint, JointKind } from '../../domain/furniture/types'

const NOUNS: Partial<Record<JointKind, readonly [string, string]>> = {
  'mortise-tenon': ['tenon', 'tenons'],
  dado: ['dado', 'dados'],
  rabbet: ['rabbet', 'rabbets'],
  groove: ['groove', 'grooves'],
}

export interface AllowanceSummary {
  dimension: CutAllowance['dimension']
  amount: number
  /** "a tenon", "each of 2 tenons". */
  what: string
}

/** A line of several identical parts carries its first part's allowances, whose reasons
 *  name that part's own neighbours ("into the front left leg") and would mislead for the
 *  others. Summarize them by joint kind instead: same dimension, amount, and kind count
 *  together, in first-seen order. */
export function summarizeAllowances(allowances: readonly CutAllowance[], joints: readonly FurnitureJoint[]): AllowanceSummary[] {
  const kindById = new Map(joints.map(joint => [joint.id, joint.kind]))
  const groups = new Map<string, { dimension: CutAllowance['dimension']; amount: number; noun: readonly [string, string]; count: number }>()
  for (const allowance of allowances) {
    const kind = kindById.get(allowance.jointId)
    const noun = (kind && NOUNS[kind]) ?? ['joint', 'joints']
    const key = `${allowance.dimension}:${allowance.amount}:${noun[0]}`
    const group = groups.get(key)
    if (group) group.count += 1
    else groups.set(key, { dimension: allowance.dimension, amount: allowance.amount, noun, count: 1 })
  }
  return [...groups.values()].map(({ dimension, amount, noun, count }) => ({
    dimension,
    amount,
    what: count === 1 ? `a ${noun[0]}` : `each of ${count} ${noun[1]}`,
  }))
}
