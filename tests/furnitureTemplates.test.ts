import { describe, expect, it } from 'vitest'
import { defaultSpecies } from '../src/data'
import { resolveFurniture } from '../src/domain/furniture/geometry'
import { FURNITURE_TEMPLATES, templateById } from '../src/domain/furniture/templates'
import { validateFurniture } from '../src/domain/furniture/validation'
import type { FurnitureProject, FurnitureTemplate } from '../src/domain/furniture/types'
import { BOOKCASE_BOXES, TABLE_BOXES, UPDATED_AT, furnitureContext } from './fixtures/furniture'

const context = furnitureContext()

function build(template: FurnitureTemplate, values: Partial<Record<string, number>> = {}): FurnitureProject {
  return template.create(values, `project-${template.id}`, UPDATED_AT)
}

function check(project: FurnitureProject) {
  const resolved = resolveFurniture(project, context)
  return { resolved, issues: validateFurniture(resolved, context) }
}

/** Every combination of each parameter's min and max. */
function corners(template: FurnitureTemplate): Partial<Record<string, number>>[] {
  return template.parameters.reduce<Partial<Record<string, number>>[]>(
    (combos, parameter) => combos.flatMap(combo => [{ ...combo, [parameter.name]: parameter.min }, { ...combo, [parameter.name]: parameter.max }]),
    [{}],
  )
}

function boxesOf(project: FurnitureProject): Record<string, unknown> {
  return Object.fromEntries(resolveFurniture(project, context).parts.map(part => [part.id, part.box]))
}

describe('template registry', () => {
  it('lists unique ids and finds each template by id', () => {
    const ids = FURNITURE_TEMPLATES.map(template => template.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const template of FURNITURE_TEMPLATES) expect(templateById(template.id)).toBe(template)
    expect(templateById('no-such-template')).toBeUndefined()
  })

  it.each(FURNITURE_TEMPLATES.map(template => [template.id, template] as const))('%s declares sane parameters', (_id, template) => {
    const names = template.parameters.map(parameter => parameter.name)
    expect(new Set(names).size).toBe(names.length)
    for (const parameter of template.parameters) {
      expect(parameter.min, parameter.name).toBeLessThan(parameter.max)
      expect(parameter.defaultValue, parameter.name).toBeGreaterThanOrEqual(parameter.min)
      expect(parameter.defaultValue, parameter.name).toBeLessThanOrEqual(parameter.max)
      if (parameter.unit === 'count') expect(Number.isInteger(parameter.defaultValue), parameter.name).toBe(true)
    }
  })
})

describe.each(FURNITURE_TEMPLATES.map(template => [template.id, template] as const))('%s template', (_id, template) => {
  it('is clean at its defaults: no issues of any kind', () => {
    const { resolved, issues } = check(build(template))
    expect(resolved.issues).toEqual([])
    expect(issues).toEqual([])
    expect(resolved.parts).toHaveLength(resolved.project.parts.length)
  })

  it('resolves with no issues and no errors at every corner of its min/max grid', () => {
    for (const values of corners(template)) {
      const { resolved, issues } = check(build(template, values))
      expect(resolved.issues, JSON.stringify(values)).toEqual([])
      expect(issues.filter(found => found.severity === 'error'), JSON.stringify(values)).toEqual([])
    }
  })

  it('is pure: the same inputs give equal, independent projects', () => {
    const first = build(template, { [template.parameters[0]!.name]: template.parameters[0]!.max })
    const second = build(template, { [template.parameters[0]!.name]: template.parameters[0]!.max })
    expect(first).toEqual(second)
    first.parts[0]!.name = 'edited'
    first.parameters[0]!.value = -1
    expect(build(template, { [template.parameters[0]!.name]: template.parameters[0]!.max })).toEqual(second)
  })

  it('stamps the project identity and template id it was given', () => {
    const project = template.create({}, 'abc', '2030-01-02T03:04:05.000Z')
    expect(project.id).toBe('abc')
    expect(project.updatedAt).toBe('2030-01-02T03:04:05.000Z')
    expect(project.templateId).toBe(template.id)
    expect(project.name).toBe(template.name)
  })

  it('creates a parameter for each template parameter, holding the entered value', () => {
    const project = build(template)
    for (const parameter of template.parameters) {
      expect(project.parameters.find(found => found.name === parameter.name)?.value, parameter.name).toBe(parameter.defaultValue)
    }
    const names = project.parameters.map(parameter => parameter.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('clamps values to [min, max], rounds counts, and ignores non-numbers', () => {
    for (const parameter of template.parameters) {
      const high = build(template, { [parameter.name]: parameter.max * 10 })
      const low = build(template, { [parameter.name]: parameter.min - 1000 })
      expect(high, parameter.name).toEqual(build(template, { [parameter.name]: parameter.max }))
      expect(low, parameter.name).toEqual(build(template, { [parameter.name]: parameter.min }))
      expect(build(template, { [parameter.name]: Number.NaN }), parameter.name).toEqual(build(template))
    }
  })

  it('re-flows: editing a parameter on the project equals creating with that value', () => {
    const base = boxesOf(build(template))
    // A count decides how many parts exist, so it is covered separately below.
    for (const parameter of template.parameters.filter(found => found.unit !== 'count')) {
      const project = build(template)
      const target = project.parameters.find(found => found.name === parameter.name)!
      target.value = parameter.max
      const edited = boxesOf(project)
      expect(edited, parameter.name).toEqual(boxesOf(build(template, { [parameter.name]: parameter.max })))
      expect(edited, `${parameter.name} should move or resize a part`).not.toEqual(base)
    }
  })

  it('builds sizes and positions from expressions or relationships, not frozen numbers', () => {
    const project = build(template)
    const driven = new Set(project.relationships.flatMap(relationship => relationship.kind === 'distribute' ? relationship.partIds : [relationship.partId]))
    for (const part of project.parts) {
      for (const field of ['length', 'width', 'thickness'] as const) expect(typeof part[field], `${part.id}.${field}`).toBe('string')
      const positions = Object.values(part.position)
      const fixed = positions.every(value => value === 0)
      expect(fixed || positions.some(value => typeof value === 'string') || driven.has(part.id), `${part.id} position`).toBe(true)
    }
  })

  it('joins every part, with joints and subassemblies that reference real parts', () => {
    const project = build(template)
    const ids = new Set(project.parts.map(part => part.id))
    expect(ids.size).toBe(project.parts.length)
    const jointed = new Set(project.joints.flatMap(joint => [joint.partId, joint.targetId]))
    for (const id of ids) expect(jointed.has(id), `${id} is in a joint`).toBe(true)
    expect(new Set(project.joints.map(joint => joint.id)).size).toBe(project.joints.length)
    for (const joint of project.joints) {
      expect(ids.has(joint.partId), joint.id).toBe(true)
      expect(ids.has(joint.targetId), joint.id).toBe(true)
    }
    const owned = project.subassemblies.flatMap(sub => sub.partIds)
    expect(new Set(owned).size).toBe(owned.length)
    for (const id of owned) expect(ids.has(id), id).toBe(true)
  })

  it('assembles leaf subassemblies before the ones that contain them', () => {
    const project = build(template)
    const order = new Map(project.subassemblies.map((sub, index) => [sub.id, index]))
    for (const sub of project.subassemblies) {
      for (const childId of sub.childIds) expect(order.get(childId)!, `${childId} before ${sub.id}`).toBeLessThan(order.get(sub.id)!)
    }
  })

  it('gives every part a unique label and a wood or sheet material from the library', () => {
    const project = build(template)
    const labels = project.parts.map(part => part.label)
    expect(labels.every(Boolean)).toBe(true)
    expect(new Set(labels).size).toBe(labels.length)
    const woods = new Set(defaultSpecies.map(wood => wood.id))
    const sheets = new Set(project.sheetMaterials.map(material => material.id))
    for (const part of project.parts) {
      if (part.kind === 'solid') expect(woods.has(part.speciesId ?? ''), part.id).toBe(true)
      else expect(sheets.has(part.sheetMaterialId ?? ''), part.id).toBe(true)
    }
  })
})

describe('basic table defaults', () => {
  it('matches the shared table fixture box for box', () => {
    const table = templateById('basic-table')!
    expect(boxesOf(build(table))).toEqual(TABLE_BOXES)
  })

  it('holds the top on a fastener at each apron and mortises every apron into two legs', () => {
    const project = build(templateById('basic-table')!)
    expect(project.joints.filter(joint => joint.kind === 'tabletop-fastener').map(joint => joint.targetId).sort()).toEqual(['apron-back', 'apron-front', 'apron-left', 'apron-right'])
    expect(project.joints.filter(joint => joint.kind === 'mortise-tenon')).toHaveLength(8)
    expect(project.joints.every(joint => joint.glue === (joint.kind !== 'tabletop-fastener'))).toBe(true)
  })
})

describe('bookcase', () => {
  const bookcase = templateById('bookcase')!

  it('matches the shared bookcase fixture box for box at its defaults', () => {
    expect(boxesOf(build(bookcase))).toEqual(BOOKCASE_BOXES)
  })

  it('makes one dadoed shelf per count, spaced evenly between the bottom and the top', () => {
    for (const shelves of [1, 2, 5, 8]) {
      const project = build(bookcase, { shelves })
      const { resolved, issues } = check(project)
      expect(issues, `${shelves} shelves`).toEqual([])
      const shelfBoxes = resolved.parts.filter(part => part.part.role === 'shelf').map(part => part.box)
      expect(shelfBoxes).toHaveLength(shelves)
      expect(project.joints.filter(joint => joint.kind === 'dado' && joint.partId.startsWith('shelf-'))).toHaveLength(shelves * 2)
      const bottom = resolved.parts.find(part => part.id === 'bottom')!.box
      const top = resolved.parts.find(part => part.id === 'top')!.box
      const gaps = [bottom.z + bottom.sz, ...shelfBoxes.flatMap(box => [box.z, box.z + box.sz]), top.z].reduce<number[]>(
        (found, plane, index, planes) => (index % 2 === 0 && index + 1 < planes.length ? [...found, planes[index + 1]! - plane] : found), [],
      )
      for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0]!, 9)
    }
  })

  it('rounds a fractional shelf count', () => {
    expect(build(bookcase, { shelves: 3.6 })).toEqual(build(bookcase, { shelves: 4 }))
  })

  it('lists the carcass as one subassembly and leaves the back for the final assembly', () => {
    const project = build(bookcase, { shelves: 2 })
    expect(project.subassemblies).toHaveLength(1)
    expect(project.subassemblies[0]!.partIds).toEqual(['side-l', 'side-r', 'bottom', 'top', 'shelf-1', 'shelf-2'])
    expect(project.subassemblies[0]!.partIds).not.toContain('back')
  })
})

describe('plywood casework', () => {
  const casework = ['bookcase', 'base-cabinet', 'wall-cabinet'].map(id => templateById(id)!)

  it.each(casework.map(template => [template.id, template] as const))('%s parts are cut from the sheets the project lists, at their thickness', (_id, template) => {
    const { resolved } = check(build(template))
    expect(resolved.project.sheetMaterials.length).toBeGreaterThan(0)
    for (const part of resolved.parts) {
      const material = resolved.project.sheetMaterials.find(found => found.id === part.part.sheetMaterialId)
      expect(material, part.id).toBeDefined()
      expect(part.size.thickness, part.id).toBe(material!.thickness)
    }
  })

  it('lets the back into a rabbet in each side', () => {
    for (const template of casework) {
      const rabbets = build(template).joints.filter(joint => joint.kind === 'rabbet')
      expect(rabbets.map(joint => [joint.partId, joint.targetId]), template.id).toEqual([['back', 'side-l'], ['back', 'side-r']])
    }
  })

  it('base cabinet raises the bottom on a recessed toe kick and carries the top rails flush with the sides', () => {
    const { resolved } = check(build(templateById('base-cabinet')!, { toe_h: 120, height: 900 }))
    const box = (id: string) => resolved.parts.find(part => part.id === id)!.box
    expect(box('bottom').z).toBe(120)
    expect(box('kick').z).toBe(0)
    expect(box('kick').y).toBe(75)
    for (const id of ['rail-front', 'rail-back']) expect(box(id).z + box(id).sz).toBe(900)
  })

  it('wall cabinet hangs its cleat under the top against the back', () => {
    const { resolved } = check(build(templateById('wall-cabinet')!))
    const box = (id: string) => resolved.parts.find(part => part.id === id)!.box
    expect(box('cleat').z + box('cleat').sz).toBe(box('top').z)
    expect(box('cleat').y + box('cleat').sy).toBe(box('back').y)
  })
})
