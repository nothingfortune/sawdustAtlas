import type { AtlasData } from '../../types'

/** Ids and time for a workspace change; the domain never reads the clock or random ids itself. */
export interface WorkspaceContext {
  createId: () => string
  now: string
}

/** A change that made something, plus the id of what it made so the UI can open it. */
export interface Created {
  data: AtlasData
  id: string
}
