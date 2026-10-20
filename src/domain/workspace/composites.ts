import { DEFAULT_KERF_MM } from '../../data'
import type { AtlasData, CompositeBoard } from '../../types'
import type { Created, WorkspaceContext } from './context'

export function makeComposite(data: AtlasData, boardId: string, ctx: WorkspaceContext): Created | null {
  const board = data.boards.find(b => b.id === boardId)
  if (!board) return null
  const composite: CompositeBoard = {
    id: ctx.createId(), name: `${board.name} composite`,
    construction: board.construction,
    panels: [{ id: ctx.createId(), boardId: board.id, cut: { axis: 'x', stripWidthMm: 25, kerfMm: DEFAULT_KERF_MM, count: 4 } }],
    rows: [{ id: ctx.createId(), wafers: [] }], updatedAt: ctx.now,
  }
  return { data: { ...data, composites: [...data.composites, composite] }, id: composite.id }
}

export function updateComposite(data: AtlasData, composite: CompositeBoard, ctx: WorkspaceContext): AtlasData {
  return { ...data, composites: data.composites.map(p => p.id === composite.id ? { ...composite, updatedAt: ctx.now } : p) }
}
