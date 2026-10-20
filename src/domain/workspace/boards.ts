import { DEFAULT_END_GRAIN } from '../../data'
import type { AtlasData, BoardProject, BuildAllowances } from '../../types'
import type { Created, WorkspaceContext } from './context'

export function newBoard(ctx: WorkspaceContext, options: { construction: 'edge' | 'end'; name: string; allowances: BuildAllowances }): BoardProject {
  return {
    id: ctx.createId(), name: options.name, length: 450, thickness: 38, construction: options.construction, strips: [], updatedAt: ctx.now,
    endGrain: { ...DEFAULT_END_GRAIN, rowFlips: [], rowRotations: [], rowOffsets: [], rowOrder: [] },
    allowances: { ...options.allowances },
  }
}

function appendBoard(data: AtlasData, board: BoardProject): Created {
  return { data: { ...data, boards: [...data.boards, board] }, id: board.id }
}

export function createBoard(data: AtlasData, ctx: WorkspaceContext): Created {
  return appendBoard(data, newBoard(ctx, { construction: 'end', name: 'Untitled cutting board', allowances: data.allowances }))
}

// A composite is one construction throughout, so its inline panel board inherits it.
export function createPanelBoard(data: AtlasData, construction: 'edge' | 'end', ctx: WorkspaceContext): Created {
  return appendBoard(data, newBoard(ctx, { construction, name: 'Untitled panel', allowances: data.allowances }))
}

export function updateBoard(data: AtlasData, board: BoardProject, ctx: WorkspaceContext): AtlasData {
  return { ...data, boards: data.boards.map(p => p.id === board.id ? { ...board, updatedAt: ctx.now } : p) }
}

export function deleteBoard(data: AtlasData, id: string): AtlasData {
  return { ...data, boards: data.boards.filter(p => p.id !== id) }
}
