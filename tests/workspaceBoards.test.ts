import { describe, expect, it } from 'vitest'
import { starterData } from '../src/data'
import { createBoard, createPanelBoard, deleteBoard, newBoard, updateBoard } from '../src/domain/workspace/boards'
import { FIXED_NOW, fixedContext } from './fixtures/context'

describe('board actions', () => {
  it('newBoard is the single default board', () => {
    const board = newBoard(fixedContext(), { construction: 'edge', name: 'X', allowances: starterData.allowances })
    expect(board).toMatchObject({ id: 'id-1', name: 'X', length: 450, thickness: 38, construction: 'edge', strips: [], updatedAt: FIXED_NOW })
    expect(board.endGrain).toMatchObject({ rowFlips: [], rowRotations: [], rowOffsets: [], rowOrder: [] })
    expect(board.allowances).toEqual(starterData.allowances)
    expect(board.allowances).not.toBe(starterData.allowances)
  })

  it('createBoard appends an end-grain board and returns its id', () => {
    const { data, id } = createBoard(starterData, fixedContext())
    expect(data.boards.at(-1)).toMatchObject({ id, name: 'Untitled cutting board', construction: 'end' })
    expect(data.boards).toHaveLength(starterData.boards.length + 1)
  })

  it('createPanelBoard inherits the requested construction', () => {
    const { data, id } = createPanelBoard(starterData, 'edge', fixedContext())
    expect(data.boards.find(board => board.id === id)).toMatchObject({ name: 'Untitled panel', construction: 'edge' })
  })

  it('updateBoard replaces by id and stamps updatedAt', () => {
    const board = { ...starterData.boards[0]!, name: 'Renamed', updatedAt: 'old' }
    const next = updateBoard(starterData, board, fixedContext())
    expect(next.boards[0]).toMatchObject({ name: 'Renamed', updatedAt: FIXED_NOW })
  })

  it('deleteBoard removes by id only', () => {
    const id = starterData.boards[0]!.id
    expect(deleteBoard(starterData, id).boards.some(board => board.id === id)).toBe(false)
    expect(deleteBoard(starterData, 'missing').boards).toEqual(starterData.boards)
  })
})
