import { describe, expect, it } from 'vitest'
import { starterData } from '../src/data'
import { FURNITURE_TEMPLATES } from '../src/domain/furniture/templates'
import { createFurniture, deleteFurniture, duplicateFurniture, updateFurniture } from '../src/domain/workspace/furniture'
import { FIXED_NOW, fixedContext } from './fixtures/context'

describe('furniture actions', () => {
  it('createFurniture with no template makes an empty project', () => {
    const { data, id } = createFurniture(starterData, { values: {} }, fixedContext())
    expect(data.furniture.find(p => p.id === id)).toMatchObject({ name: 'Untitled furniture', updatedAt: FIXED_NOW, parts: [] })
  })

  it('createFurniture from a template remaps species missing from the library', () => {
    const template = FURNITURE_TEMPLATES[0]!
    const data = { ...starterData, woods: [starterData.woods[0]!] }
    const result = createFurniture(data, { templateId: template.id, values: {} }, fixedContext())
    const project = result.data.furniture.find(p => p.id === result.id)!
    expect(project.parts.length).toBeGreaterThan(0)
    expect(project.parts.every(part => part.speciesId === undefined || part.speciesId === data.woods[0]!.id)).toBe(true)
  })

  it('duplicateFurniture keeps internal ids and adds " copy"', () => {
    const ctx = fixedContext()
    const created = createFurniture(starterData, { templateId: FURNITURE_TEMPLATES[0]!.id, values: {} }, ctx)
    const copy = duplicateFurniture(created.data, created.id, ctx)!
    const source = created.data.furniture.find(p => p.id === created.id)!
    const duplicate = copy.data.furniture.find(p => p.id === copy.id)!
    expect(duplicate.name).toBe(`${source.name} copy`)
    expect(duplicate.parts.map(part => part.id)).toEqual(source.parts.map(part => part.id))
    expect(duplicate.parts).not.toBe(source.parts)
    expect(duplicateFurniture(created.data, 'missing', ctx)).toBeNull()
  })

  it('updateFurniture stamps updatedAt and deleteFurniture removes by id', () => {
    const { data, id } = createFurniture(starterData, { values: {} }, fixedContext())
    const project = { ...data.furniture.find(p => p.id === id)!, name: 'Z' }
    const updated = updateFurniture(data, project, fixedContext('2027-01-01T00:00:00.000Z'))
    expect(updated.furniture.find(p => p.id === id)).toMatchObject({ name: 'Z', updatedAt: '2027-01-01T00:00:00.000Z' })
    expect(deleteFurniture(updated, id).furniture.some(p => p.id === id)).toBe(false)
  })
})
