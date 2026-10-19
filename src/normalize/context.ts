import type { WorkspaceContext } from '../domain/workspace/context'
import { createId } from '../id'

export type NormalizeContext = WorkspaceContext

export function defaultNormalizeContext(): NormalizeContext {
  return { createId, now: new Date().toISOString() }
}
