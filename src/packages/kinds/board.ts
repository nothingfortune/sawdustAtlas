import type { BoardProject } from '../../types'
import type { PackageKind } from '../kind'
import { IMPORTED_SUFFIX, fail, isPlainRecord, normalizeIncoming } from '../shared'

export interface BoardPayload {
  type: 'board'
  board: BoardProject
}

export function boardWoodIds(boards: readonly BoardProject[]): Set<string> {
  return new Set(boards.flatMap(board => board.strips.map(strip => strip.speciesId)))
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

export const boardKind: PackageKind<BoardPayload> = {
  type: 'board',
  build(data, id) {
    const board = data.boards.find(b => b.id === id)
    return board ? { type: 'board', board } : null
  },
  read(input, ctx) {
    const raw = input.project['board']
    if (!isPlainRecord(raw)) return fail('The project package has no board in it.')
    const incoming = normalizeIncoming({ schemaVersion: input.schemaVersion, woods: input.woods, boards: [raw] }, ctx)
    const board = incoming.boards[0]
    if (!board) return fail('The project package has no board in it.')
    return { ok: true, payload: { type: 'board', board }, woods: incoming.woods }
  },
  merge(data, payload, ctx) {
    const copy = data.boards.some(b => b.id === payload.board.id)
    const board = copy ? { ...payload.board, id: ctx.createId(), name: payload.board.name + IMPORTED_SUFFIX } : payload.board
    return {
      // Allowances are shop-wide; an incoming board follows the local setup.
      data: { ...data, boards: [...data.boards, { ...board, allowances: data.allowances }] },
      summary: { boards: 1, composites: 0, furniture: 0, importedAsCopy: copy, projectId: board.id },
    }
  },
  usedWoodIds(payload) {
    return boardWoodIds([payload.board])
  },
  describe(payload) {
    return { name: payload.board.name, label: 'Cutting board', size: plural(payload.board.strips.length, 'strip') }
  },
}
