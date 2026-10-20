import type { WorkspaceContext } from '../../src/domain/workspace/context'

export const FIXED_NOW = '2026-10-18T00:00:00.000Z'

/** Deterministic ids (id-1, id-2, ...) and a fixed clock for domain tests. */
export function fixedContext(now = FIXED_NOW): WorkspaceContext {
  let next = 0
  return { createId: () => `id-${++next}`, now }
}
