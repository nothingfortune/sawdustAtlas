import { describe, expect, it } from 'vitest'
import { starterData } from '../src/data'
import { addWood, deleteWood, updateWood, woodDeleteBlocker } from '../src/domain/workspace/woods'
import { fixedContext } from './fixtures/context'

describe('wood actions', () => {
  it('addWood appends a custom wood', () => {
    const { data, id } = addWood(starterData, fixedContext())
    expect(data.woods.at(-1)).toEqual({ id, name: 'Custom wood', color: '#8c6a48', accent: '#b18a5e', pricePerBoardFoot: 8 })
  })

  it('updateWood never changes the id', () => {
    const id = starterData.woods[0]!.id
    expect(updateWood(starterData, id, { id: 'hijack', name: 'N' }).woods[0]).toMatchObject({ id, name: 'N' })
  })

  it('woodDeleteBlocker checks in-use before last-wood, as the UI did', () => {
    const used = starterData.boards[0]!.strips[0]!.speciesId
    expect(woodDeleteBlocker(starterData, used)).toBe('in-use')
    const lone = { ...starterData, boards: [], woods: [starterData.woods[0]!] }
    expect(woodDeleteBlocker(lone, lone.woods[0]!.id)).toBe('last-wood')
    const unused = addWood(starterData, fixedContext())
    expect(woodDeleteBlocker(unused.data, unused.id)).toBeNull()
    expect(deleteWood(unused.data, unused.id).woods.some(w => w.id === unused.id)).toBe(false)
  })
})
