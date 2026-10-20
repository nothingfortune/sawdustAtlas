import { describe, expect, it } from 'vitest'
import { defaultSpecies } from '../src/data'
import { normalizeWood, normalizeWoodLibrary, placeholderWoods } from '../src/normalize/woods'
import { fixedContext } from './fixtures/context'

describe('normalizeWood', () => {
  it('fills defaults and keeps a trimmed availableAt', () => {
    expect(normalizeWood({ id: 'oak', availableAt: '  Shop A ' }, fixedContext())).toEqual({
      id: 'oak', name: 'oak', color: '#8c6a48', accent: '#b18a5e', pricePerBoardFoot: 0, availableAt: 'Shop A',
    })
  })

  it('drops a blank availableAt and issues an id from the context when missing', () => {
    const wood = normalizeWood({ name: 'Cherry', availableAt: '   ' }, fixedContext())
    expect(wood.id).toBe('id-1')
    expect('availableAt' in wood).toBe(false)
  })
})

describe('normalizeWoodLibrary', () => {
  it('falls back to the default species when none are saved', () => {
    expect(normalizeWoodLibrary([], fixedContext()).map(wood => wood.id)).toEqual(defaultSpecies.map(wood => wood.id))
  })

  it('keeps saved woods when present', () => {
    expect(normalizeWoodLibrary([{ id: 'ash', name: 'Ash' }], fixedContext()).map(wood => wood.id)).toEqual(['ash'])
  })
})

describe('placeholderWoods', () => {
  it('adds one placeholder per unknown strip species, deduplicated', () => {
    const library = normalizeWoodLibrary([{ id: 'ash' }], fixedContext())
    const rawBoards = [{ strips: [{ speciesId: 'ash' }, { speciesId: 'zebra' }, { speciesId: 'zebra' }, {}] }]
    expect(placeholderWoods(rawBoards, library, fixedContext())).toEqual([
      { id: 'zebra', name: 'zebra', color: '#8c6a48', accent: '#b18a5e', pricePerBoardFoot: 0 },
    ])
  })
})
