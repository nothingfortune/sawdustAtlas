import type { BoardProject, CompositeBoard } from '../../types'
import type { PackageKind } from '../kind'
import { IMPORTED_SUFFIX, fail, isPlainRecord, normalizeIncoming, plural } from '../shared'
import { boardWoodIds } from './board'

export interface CompositePayload {
  type: 'composite'
  composite: CompositeBoard
  panelBoards: BoardProject[]
}

export const compositeKind: PackageKind<CompositePayload> = {
  type: 'composite',
  build(data, id) {
    const composite = data.composites.find(c => c.id === id)
    if (!composite) return null
    const panelIds = new Set(composite.panels.map(panel => panel.boardId))
    return { type: 'composite', composite, panelBoards: data.boards.filter(b => panelIds.has(b.id)) }
  },
  read(input, ctx) {
    const raw = input.project['composite']
    if (!isPlainRecord(raw)) return fail('The project package has no composite in it.')
    const rawBoards = Array.isArray(input.project['panelBoards']) ? input.project['panelBoards'] : []
    const incoming = normalizeIncoming({ schemaVersion: input.schemaVersion, woods: input.woods, boards: rawBoards, composites: [raw] }, ctx)
    const composite = incoming.composites[0]
    if (!composite) return fail('The project package has no composite in it.')
    return { ok: true, payload: { type: 'composite', composite, panelBoards: incoming.boards }, woods: incoming.woods }
  },
  merge(data, payload, ctx) {
    const boardIds = new Set(data.boards.map(b => b.id))
    // A clash on the composite or any board it carries copies the whole set so the pieces stay together.
    const copy = data.composites.some(c => c.id === payload.composite.id) || payload.panelBoards.some(board => boardIds.has(board.id))
    const idMap = new Map<string, string>()
    const boards = payload.panelBoards.map(board => {
      if (!copy) return board
      const id = ctx.createId()
      idMap.set(board.id, id)
      return { ...board, id, name: board.name + IMPORTED_SUFFIX }
    })
    const source = payload.composite
    const composite: CompositeBoard = {
      ...source,
      id: copy ? ctx.createId() : source.id,
      name: copy ? source.name + IMPORTED_SUFFIX : source.name,
      panels: source.panels.map(panel => ({ ...panel, boardId: idMap.get(panel.boardId) ?? panel.boardId })),
    }
    return {
      data: {
        ...data,
        boards: [...data.boards, ...boards.map(board => ({ ...board, allowances: data.allowances }))],
        composites: [...data.composites, composite],
      },
      summary: { boards: boards.length, composites: 1, furniture: 0, importedAsCopy: copy, projectId: composite.id },
    }
  },
  usedWoodIds(payload) {
    return boardWoodIds(payload.panelBoards)
  },
  describe(payload) {
    return { name: payload.composite.name, label: 'Composite board', size: plural(payload.composite.panels.length, 'panel') }
  },
}
