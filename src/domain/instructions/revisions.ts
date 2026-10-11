import type { InstructionPlan } from './types'

// Plan revision: a deterministic content hash over the whole plan except its own
// `revision` field. Two plans with the same revision say the same thing, so a build
// run (which embeds a frozen plan) can tell whether a freshly generated plan differs
// from the one it started with.

export function planRevision(plan: Omit<InstructionPlan, 'revision'>): string {
  const content: Record<string, unknown> = { ...plan }
  delete content['revision']
  return `r-${cyrb53(stableStringify(content)).toString(16).padStart(14, '0')}`
}

export function withRevision(plan: Omit<InstructionPlan, 'revision'>): InstructionPlan {
  return { ...plan, revision: planRevision(plan) }
}

// JSON with object keys sorted at every level, so key order never changes the hash.
// Undefined properties are skipped, as JSON.stringify does.
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(item => (item === undefined ? 'null' : stableStringify(item))).join(',')}]`
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort().filter(key => record[key] !== undefined)
  return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`
}

// cyrb53: a small, well-distributed 53-bit string hash. Not cryptographic; it only
// needs to tell plan contents apart.
function cyrb53(text: string): number {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}
