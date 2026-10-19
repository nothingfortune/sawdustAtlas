import { describe, expect, it } from 'vitest'
import { DEFAULT_KERF_MM, starterData } from '../src/data'
import { makeComposite, updateComposite } from '../src/domain/workspace/composites'
import { FIXED_NOW, fixedContext } from './fixtures/context'

describe('composite actions', () => {
  it('makeComposite wraps one board in a single-panel composite of the same construction', () => {
    const board = starterData.boards[0]!
    const result = makeComposite(starterData, board.id, fixedContext())!
    const composite = result.data.composites.find(c => c.id === result.id)!
    expect(composite).toMatchObject({ name: `${board.name} composite`, construction: board.construction, updatedAt: FIXED_NOW })
    expect(composite.panels).toEqual([{ id: expect.any(String), boardId: board.id, cut: { axis: 'x', stripWidthMm: 25, kerfMm: DEFAULT_KERF_MM, count: 4 } }])
    expect(composite.rows).toEqual([{ id: expect.any(String), wafers: [] }])
  })

  it('makeComposite returns null for an unknown board', () => {
    expect(makeComposite(starterData, 'missing', fixedContext())).toBeNull()
  })

  it('updateComposite stamps updatedAt', () => {
    const { data, id } = makeComposite(starterData, starterData.boards[0]!.id, fixedContext())!
    const composite = { ...data.composites.find(c => c.id === id)!, name: 'Y' }
    expect(updateComposite(data, composite, fixedContext('2027-01-01T00:00:00.000Z')).composites.find(c => c.id === id)).toMatchObject({ name: 'Y', updatedAt: '2027-01-01T00:00:00.000Z' })
  })
})
