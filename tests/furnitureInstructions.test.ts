import { describe, expect, it } from 'vitest'
import { DEFAULT_ALLOWANCES } from '../src/domain/boardAllowances'
import { resolveFurniture } from '../src/domain/furniture/geometry'
import { jointHardware, jointOperations } from '../src/domain/furniture/joinery'
import { partsList } from '../src/domain/furniture/partsList'
import type { FurniturePart, FurnitureProject } from '../src/domain/furniture/types'
import { DEFAULT_FINISH_DRY_MINUTES, generateFurniturePlan } from '../src/domain/instructions/furnitureInstructions'
import { DEFAULT_GLUE_CLAMP_MINUTES, DEFAULT_TOLERANCES } from '../src/domain/instructions/tolerances'
import type { GenerationContext, InstructionPlan, InstructionStep } from '../src/domain/instructions/types'
import { validatePlan } from '../src/domain/instructions/validate'
import { bookcaseProject, furnitureContext, parametricBookcaseProject, parametricTableProject, tableProject } from './fixtures/furniture'

const fixtures = furnitureContext()
const context: GenerationContext = { woods: fixtures.woods, boards: [], allowances: fixtures.allowances }
const UNIT_IN_PROSE = /\d\s*(?:mm|cm|in\b|inch|"|°|deg)/i

function plan(project: FurnitureProject, overrides: Partial<GenerationContext> = {}): InstructionPlan {
  return generateFurniturePlan(project, { ...context, ...overrides })
}

function step(result: InstructionPlan, key: string): InstructionStep {
  const found = result.steps.find(candidate => candidate.key === key)
  if (!found) throw new Error(`no step ${key}`)
  return found
}

function keysOf(result: InstructionPlan) {
  return {
    phases: result.phases.map(phase => phase.key),
    steps: result.steps.map(candidate => candidate.key),
    parts: result.parts.map(part => part.key),
    assemblies: result.assemblies.map(assembly => assembly.key),
    stock: result.requirements.stock.map(line => line.key),
    cuts: result.requirements.cuts.map(cut => cut.id),
  }
}

function sortedKeys(result: InstructionPlan) {
  const keys = keysOf(result)
  return Object.fromEntries(Object.entries(keys).map(([name, list]) => [name, [...list].sort()]))
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

const builders = [
  ['table', tableProject],
  ['bookcase', bookcaseProject],
  ['parametric table', parametricTableProject],
  ['parametric bookcase', parametricBookcaseProject],
] as const

describe('generateFurniturePlan: the four fixtures', () => {
  it.each(builders)('%s validates with no issues and no warnings', (_name, build) => {
    const result = plan(build())
    expect(validatePlan(result).issues).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.construction).toBeUndefined()
    expect(result.source.kind).toBe('furniture')
  })

  it('matches the table golden plan', async () => {
    await expect(JSON.stringify(plan(tableProject()), null, 2) + '\n').toMatchFileSnapshot('./__golden__/furniture-table.plan.json')
  })

  it('matches the bookcase golden plan', async () => {
    await expect(JSON.stringify(plan(bookcaseProject()), null, 2) + '\n').toMatchFileSnapshot('./__golden__/furniture-bookcase.plan.json')
  })

  it.each(builders)('%s generates identical output twice', (_name, build) => {
    expect(plan(build())).toEqual(plan(build()))
  })

  it('gives the parametric twins the same step, part, assembly, stock, and cut keys', () => {
    expect(keysOf(plan(parametricTableProject()))).toEqual(keysOf(plan(tableProject())))
    expect(keysOf(plan(parametricBookcaseProject()))).toEqual(keysOf(plan(bookcaseProject())))
  })

  it('gives the twins the same steps, not just the same keys', () => {
    expect(plan(parametricTableProject()).steps).toEqual(plan(tableProject()).steps)
    expect(plan(parametricBookcaseProject()).steps).toEqual(plan(bookcaseProject()).steps)
  })

  it.each(builders)('%s carries no unit-bearing number in prose', (_name, build) => {
    for (const candidate of plan(build()).steps) {
      expect(candidate.title).not.toMatch(UNIT_IN_PROSE)
      expect(candidate.instruction).not.toMatch(UNIT_IN_PROSE)
    }
  })

  it('does not mutate the project it is given', () => {
    const frozen = deepFreeze(tableProject())
    const before = JSON.stringify(frozen)
    expect(() => plan(frozen)).not.toThrow()
    expect(JSON.stringify(frozen)).toBe(before)
  })

  it('orders phases and omits none that are empty', () => {
    expect(plan(tableProject()).phases.map(phase => phase.key)).toEqual(['stock', 'panels', 'mill', 'cut', 'mark', 'joinery', 'dry-fit', 'sand', 'assembly', 'finish'])
    expect(plan(bookcaseProject()).phases.map(phase => phase.key)).toEqual(['stock', 'cut', 'mark', 'joinery', 'dry-fit', 'sand', 'assembly', 'finish'])
  })
})

describe('generateFurniturePlan: the table', () => {
  const result = plan(tableProject())
  const resolved = resolveFurniture(tableProject(), fixtures)
  const list = partsList(resolved, fixtures)

  it('maps the bounds to the finished size', () => {
    expect(result.finished).toEqual({ length: 1200, width: 700, thickness: 750 })
    expect(result.key).toBe('furniture:table')
    expect(result.source).toEqual({ kind: 'furniture', projectId: 'table', projectName: 'Basic table', designRevision: tableProject().updatedAt })
  })

  it('selects stock per parts-list line from the shop allowances', () => {
    const legs = result.requirements.stock.find(line => line.key === 'solid:maple:725x45x45')!
    expect(legs).toMatchObject({ speciesId: 'maple', speciesName: 'Hard maple', quantity: 4, length: 737, thickness: 48 })
    expect(legs.width).toBeCloseTo(48.2, 12)
    expect(legs.boardFeet).toBeCloseTo(list.lines.find(line => line.key === legs.key)!.boardFeet, 12)
    expect(result.requirements.stock).toHaveLength(list.lines.length)
    const top = result.requirements.stock.find(line => line.key === 'solid:walnut:1200x700x25')!
    expect(top.quantity).toBe(5)
    expect(top.width).toBeCloseTo(722 / 5, 12)
  })

  it('builds the top as a panel: rip, glue, cure, flatten', () => {
    expect(step(result, 'panel-rip:top')).toMatchObject({ kind: 'cut', batch: { count: 5, unitLabel: 'board' }, irreversible: true })
    expect(step(result, 'panel-glue:top').kind).toBe('glue-clamp')
    const cure = step(result, 'panel-cure:top')
    expect(cure.wait).toEqual({ minimumMinutes: DEFAULT_GLUE_CLAMP_MINUTES, reason: 'Glue clamp time', source: 'assumption' })
    const flatten = step(result, 'panel-flatten:top')
    expect(flatten.outputs).toEqual([{ partKey: 'blank:solid:walnut:1200x700x25/milled', quantity: 1 }])
    expect(flatten.measurements.find(m => m.key === 'thickness')).toMatchObject({ target: 25, phase: 'achieve-after', critical: true, tolerance: DEFAULT_TOLERANCES.thicknessMm })
    expect(step(result, 'rip:700').dependsOn).toContain('panel-flatten:top')
  })

  it('batches milling per species and thickness with the milled thickness as a critical target', () => {
    const legs = step(result, 'mill:maple@45')
    expect(legs.batch).toEqual({ count: 4, unitLabel: 'board' })
    expect(legs.machineSetup).toEqual({ tool: 'planer', settings: [{ label: 'Planer target thickness', value: 45, unit: 'mm', source: 'design' }] })
    expect(legs.measurements.find(m => m.key === 'thickness')).toMatchObject({ target: 45, critical: true, phase: 'achieve-after' })
    expect(step(result, 'mill:maple@20').batch?.count).toBe(4)
  })

  it('batches rips by width and crosscuts by length, covering every cut', () => {
    expect(step(result, 'rip:100').batch).toEqual({ count: 4, unitLabel: 'piece' })
    expect(step(result, 'rip:100').machineSetup?.settings).toEqual([{ label: 'Fence to blade', value: 100, unit: 'mm', source: 'design' }])
    const crosscut = step(result, 'crosscut:1120')
    expect(crosscut.machineSetup?.settings[0]).toMatchObject({ label: 'Stop block distance', value: 1120 })
    expect(crosscut.outputs.map(output => output.partKey)).toEqual(['part:apron-front/cut', 'part:apron-back/cut'])
    expect(crosscut.measurements.find(m => m.key === 'length')).toMatchObject({ target: 1120, tolerance: DEFAULT_TOLERANCES.lengthMm })
    const covered = new Set(result.steps.flatMap(candidate => candidate.cutIds))
    for (const cut of result.requirements.cuts) expect(covered.has(cut.id)).toBe(true)
    expect(result.requirements.cuts).toHaveLength(list.lines.length * 2)
  })

  it('chains a part through stock, blank, part, machined part, and assembly', () => {
    const producers = (partKey: string) => result.steps.filter(candidate => candidate.outputs.some(output => output.partKey === partKey)).map(candidate => candidate.key)
    const consumers = (partKey: string) => result.steps.filter(candidate => candidate.inputs.some(input => input.partKey === partKey && input.consumed)).map(candidate => candidate.key)
    expect(producers('stock:solid:maple:725x45x45')).toEqual(['select:solid:maple:725x45x45'])
    expect(consumers('stock:solid:maple:725x45x45')).toEqual(['mill:maple@45'])
    expect(consumers('blank:solid:maple:725x45x45/milled')).toEqual(['rip:45'])
    expect(consumers('blank:solid:maple:725x45x45/ripped')).toEqual(['crosscut:725'])
    expect(producers('part:leg-fl/cut')).toEqual(['crosscut:725'])
    const machined = result.parts.filter(part => part.sourceId === 'leg-fl').map(part => part.key)
    expect(machined).toEqual([
      'part:leg-fl/cut',
      expect.stringMatching(/^part:leg-fl\/joinery:mortise\|mortiser\|/),
      'part:leg-fl/sand:parts',
    ])
    expect(consumers('part:leg-fl/sand:parts')).toEqual(['glue:sub-front'])
    expect(consumers('assembly:sub-front')).toEqual(['glue:sub-base'])
    expect(consumers('assembly:final')).toEqual(['finish:apply'])
  })

  it('batches joinery by setup, with the joint settings as values and a critical test cut', () => {
    const joinery = result.steps.filter(candidate => candidate.phaseKey === 'joinery')
    expect(joinery.map(candidate => candidate.kind)).toEqual(['machine-joinery', 'machine-joinery', 'machine-joinery'])
    const tenons = joinery[0]!
    expect(tenons.key).toMatch(/^joinery:tenon\|table-saw\|/)
    expect(tenons.batch).toEqual({ count: 8, unitLabel: 'tenon' })
    expect(tenons.irreversible).toBe(true)
    expect(tenons.machineSetup?.tool).toBe('table-saw')
    expect(tenons.machineSetup?.settings).toContainEqual({ label: 'Tenon thickness', value: 8, unit: 'mm', source: 'design' })
    expect(tenons.checklist.find(item => item.key === 'test-cut')?.critical).toBe(true)
    const mortises = joinery[1]!
    expect(mortises.machineSetup?.settings.some(setting => setting.source === 'assumption')).toBe(true)
  })

  it('closes joints in the lowest subassembly that holds both parts', () => {
    expect(step(result, 'glue:sub-front').checklist.map(item => item.key)).toEqual(expect.arrayContaining(['joint:mt-front-fl', 'joint:mt-front-fr']))
    expect(step(result, 'glue:sub-front').checklist.some(item => item.key === 'joint:mt-left-fl')).toBe(false)
    expect(step(result, 'glue:sub-base').checklist.map(item => item.key)).toEqual(expect.arrayContaining(['joint:mt-left-fl', 'joint:mt-left-bl', 'joint:mt-right-fr', 'joint:mt-right-br']))
    expect(step(result, 'assemble:final').kind).toBe('install')
    expect(step(result, 'assemble:final').irreversible).toBe(false)
    expect(step(result, 'assemble:final').checklist.map(item => item.key)).toEqual(['joint:tf-front', 'joint:tf-back', 'joint:tf-left', 'joint:tf-right'])
  })

  it('builds children first and follows each glue-up with a cure wait', () => {
    const order = result.steps.filter(candidate => candidate.phaseKey === 'assembly').map(candidate => candidate.key)
    expect(order).toEqual(['glue:sub-front', 'cure:sub-front', 'glue:sub-back', 'cure:sub-back', 'glue:sub-base', 'cure:sub-base', 'assemble:final'])
    expect(step(result, 'glue:sub-base').dependsOn).toEqual(expect.arrayContaining(['cure:sub-front', 'cure:sub-back']))
    expect(step(result, 'cure:sub-front')).toMatchObject({ kind: 'wait', wait: { source: 'assumption' }, duration: { kind: 'cure' } })
    const finish = step(result, 'finish:dry')
    expect(finish.wait).toEqual({ minimumMinutes: DEFAULT_FINISH_DRY_MINUTES, reason: 'Finish drying time', source: 'assumption' })
    expect(result.assemblies.find(assembly => assembly.key === 'assembly:sub-front')?.parentKey).toBe('assembly:sub-base')
    expect(result.assemblies.find(assembly => assembly.key === 'assembly:sub-base')?.parentKey).toBe('assembly:final')
  })

  it('checks a glued frame for square with equal diagonals', () => {
    const diagonals = step(result, 'glue:sub-front').measurements
    const expected = Math.hypot(1150, 725)
    expect(diagonals.map(m => m.key)).toEqual(['diagonal-1', 'diagonal-2'])
    for (const m of diagonals) expect(m).toMatchObject({ critical: true, phase: 'achieve-after', unit: 'mm' })
    expect(diagonals[0]!.target).toBeCloseTo(expected, 9)
    // The base is a box, not a flat frame, so it asks for the check instead.
    const base = step(result, 'glue:sub-base')
    expect(base.measurements).toEqual([])
    expect(base.checklist.find(item => item.key === 'square')?.critical).toBe(true)
  })

  it('shows every step in an isometric scene with the worked parts highlighted', () => {
    for (const candidate of result.steps) {
      expect(candidate.visual.view).toBe('scene-3d')
      expect(candidate.visual.camera?.up).toEqual([0, 0, 1])
      const { position, target } = candidate.visual.camera!
      // Front, right, and above the middle of the bounds.
      expect(position[0]).toBeGreaterThan(target[0])
      expect(position[1]).toBeLessThan(target[1])
      expect(position[2]).toBeGreaterThan(target[2])
    }
    expect(step(result, 'crosscut:1120').visual).toMatchObject({ state: 'before', highlightPartKeys: ['part:apron-front/cut', 'part:apron-back/cut'] })
    const base = step(result, 'glue:sub-base').visual
    expect(base.state).toBe('after')
    expect(base.ghostPartKeys).toEqual(['assembly:sub-front', 'assembly:sub-back'])
    expect(base.highlightPartKeys).toEqual(['part:apron-left/sand:parts', 'part:apron-right/sand:parts'])
  })

  it('lists glue, abrasives, finish, and the hardware with its quantity as consumables', () => {
    expect(result.requirements.consumables).toEqual(['Wood glue', 'Sandpaper', 'Finish', 'Tabletop fastener (10)'])
  })

  it('marks every part with its label and visible faces', () => {
    const mark = step(result, 'mark:parts')
    expect(mark.checklist).toHaveLength(9)
    expect(mark.checklist.find(item => item.key === 'mark:leg-fl')?.text).toBe('Write L1 on the Front left leg; keep the front, back, left, right faces clean')
    expect(mark.inputs.every(input => !input.consumed)).toBe(true)
  })
})

describe('generateFurniturePlan: the bookcase', () => {
  const result = plan(bookcaseProject())

  it('selects sheets per material and breaks them down in one step each', () => {
    const stock = result.requirements.stock
    expect(stock.map(line => [line.key, line.quantity, line.length, line.width, line.thickness, line.boardFeet])).toEqual([
      ['sheet:birch-ply-18', 1, 2440, 1220, 18, 0],
      ['sheet:birch-ply-6', 1, 2440, 1220, 6, 0],
    ])
    const cut = step(result, 'sheet-cut:birch-ply-18')
    expect(cut.batch).toEqual({ count: 7, unitLabel: 'part' })
    expect(cut.outputs).toHaveLength(7)
    expect(cut.checklist.find(item => item.key === 'layout')?.critical).toBe(true)
    expect(result.phases.map(phase => phase.key)).not.toContain('mill')
  })

  it('cuts the dados and rabbets with their settings and marks the pilot holes as assumptions', () => {
    const keys = result.steps.filter(candidate => candidate.phaseKey === 'joinery').map(candidate => candidate.key.split('|')[0])
    expect(keys).toEqual(['joinery:dado', 'joinery:rabbet', 'joinery:pilot-holes'])
    const drill = result.steps.find(candidate => candidate.key.startsWith('joinery:pilot-holes'))!
    expect(drill.kind).toBe('drill')
    expect(drill.machineSetup?.settings.every(setting => setting.source === 'assumption')).toBe(true)
  })

  it('glues the carcass, then screws the back on without glue', () => {
    expect(step(result, 'glue:sub-carcass').kind).toBe('glue-clamp')
    expect(step(result, 'glue:sub-carcass').measurements[0]!.target).toBeCloseTo(Math.hypot(1800, 800), 9)
    const final = step(result, 'assemble:final')
    expect(final.kind).toBe('assemble')
    expect(final.checklist.map(item => item.key)).toEqual(['joint:rabbet-back-l', 'joint:rabbet-back-r', 'joint:screw-back-bottom', 'joint:screw-back-top'])
    expect(result.requirements.consumables).toEqual(['Wood glue', 'Sandpaper', 'Finish', 'Screw (8)'])
  })

  it('maps the finished size', () => {
    expect(result.finished).toEqual({ length: 800, width: 300, thickness: 1800 })
  })
})

describe('generateFurniturePlan: traceability', () => {
  it.each(builders)('traces every line, operation, subassembly, and hardware line to a step (%s)', (_name, build) => {
    const project = build()
    const result = plan(project)
    const resolved = resolveFurniture(project, fixtures)
    const list = partsList(resolved, fixtures)
    const covered = new Set(result.steps.flatMap(candidate => candidate.cutIds))
    const produced = new Map(result.steps.flatMap(candidate => candidate.outputs.map(output => [output.partKey, candidate.key] as const)))

    for (const line of list.lines) {
      expect(covered.has(`cut:${line.key}:${line.kind === 'sheet' ? 'sheet' : 'crosscut'}`)).toBe(true)
      for (const partId of line.partIds) expect(produced.has(`part:${partId}/cut`)).toBe(true)
      if (line.kind === 'solid') {
        expect(result.requirements.stock.some(stock => stock.key === line.key)).toBe(true)
        expect(covered.has(`cut:${line.key}:rip`)).toBe(true)
      }
    }
    for (const operation of jointOperations(resolved)) {
      const owner = result.steps.find(candidate => candidate.key === `joinery:${operation.setupKey}`)
      expect(owner?.checklist.some(item => item.key === `op:${operation.key}`)).toBe(true)
      expect(owner?.outputs.some(output => output.partKey === `part:${operation.partId}/joinery:${operation.setupKey}`)).toBe(true)
    }
    for (const sub of project.subassemblies) {
      const assembly = result.assemblies.find(candidate => candidate.key === `assembly:${sub.id}`)
      expect(assembly?.label).toBe(sub.label)
      expect(assembly!.stepKeys.every(key => result.steps.some(candidate => candidate.key === key))).toBe(true)
      expect(produced.has(`assembly:${sub.id}`)).toBe(true)
    }
    for (const line of jointHardware(resolved)) {
      expect(line.sourceIds.every(id => result.steps.some(candidate => candidate.checklist.some(item => item.key === `joint:${id}`)))).toBe(true)
      expect(result.requirements.consumables).toContain(`${line.name} (${line.quantity})`)
    }
  })

  it('traces hardware parts to the assembly that holds them', () => {
    const project = bookcaseProject()
    const slide: FurniturePart = {
      id: 'hw-1', label: 'HW1', name: 'Shelf pin set', role: 'hardware', kind: 'hardware', length: 10, width: 10, thickness: 10, orientation: 'xyz',
      position: { x: 100, y: 100, z: 100 }, visibleFaces: [], hardwareName: 'Shelf pins',
    }
    project.parts.push(slide)
    project.subassemblies[0]!.partIds.push('hw-1')
    const result = plan(project)
    expect(step(result, 'glue:sub-carcass').checklist.some(item => item.key === 'hardware:hw-1')).toBe(true)
    expect(result.requirements.consumables).toContain('Shelf pins (1)')
    expect(validatePlan(result).issues).toEqual([])
  })
})

describe('generateFurniturePlan: key stability', () => {
  it.each(builders)('keeps the same keys when project.parts is reordered (%s)', (_name, build) => {
    const reordered = build()
    reordered.parts.reverse()
    expect(sortedKeys(plan(reordered))).toEqual(sortedKeys(plan(build())))
    expect(validatePlan(plan(reordered)).issues).toEqual([])
  })

  it('keeps the same keys when joints and subassemblies are shuffled around the parts', () => {
    const rotated = tableProject()
    rotated.parts.push(...rotated.parts.splice(0, 3))
    expect(sortedKeys(plan(rotated))).toEqual(sortedKeys(plan(tableProject())))
  })

  it('prefixes every key with the context key prefix', () => {
    const result = plan(tableProject(), { keyPrefix: 'p1/' })
    const keys = keysOf(result)
    for (const list of Object.values(keys)) for (const key of list) expect(key.startsWith('p1/')).toBe(true)
    for (const candidate of result.steps) for (const dep of candidate.dependsOn) expect(dep.startsWith('p1/')).toBe(true)
    expect(validatePlan(result).issues).toEqual([])
  })
})

describe('generateFurniturePlan: design problems and fallbacks', () => {
  it('turns design errors into plan warnings and builds only the resolved parts', () => {
    const project = tableProject()
    project.parts.find(candidate => candidate.id === 'leg-fl')!.length = 'oops +'
    const result = plan(project)
    const errors = result.warnings.filter(warning => warning.severity === 'error')
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]!.location).toEqual({ view: 'furniture', targetId: 'table', focusId: 'leg-fl' })
    expect(result.parts.some(part => part.sourceId === 'leg-fl')).toBe(false)
    expect(validatePlan(result).ok).toBe(true)
  })

  it('carries design warnings too', () => {
    const project = tableProject()
    project.parts.find(candidate => candidate.id === 'top')!.speciesId = 'unobtainium'
    const result = plan(project)
    expect(result.warnings.some(warning => warning.message.includes('unobtainium') || warning.severity === 'error')).toBe(true)
    expect(validatePlan(result).ok).toBe(true)
  })

  it('falls back to the default allowances with a warning when none are given', () => {
    const withDefaults = plan(tableProject(), { allowances: { ...DEFAULT_ALLOWANCES } })
    const without = generateFurniturePlan(tableProject(), { woods: fixtures.woods, boards: [] })
    expect(without.requirements.stock).toEqual(withDefaults.requirements.stock)
    expect(without.warnings.map(warning => warning.id)).toEqual(['furniture-default-allowances'])
    expect(without.warnings[0]!.severity).toBe('warning')
    const fence = step(without, 'panel-rip:top').machineSetup!.settings[0]!
    expect(fence.source).toBe('assumption')
    expect(step(withDefaults, 'panel-rip:top').machineSetup!.settings[0]!.source).toBe('design')
    expect(validatePlan(without).ok).toBe(true)
  })

  it('returns an empty plan with a warning when nothing resolves', () => {
    const project = tableProject()
    project.parts = []
    project.joints = []
    project.subassemblies = []
    const result = plan(project)
    expect(result.steps).toEqual([])
    expect(result.finished).toEqual({ length: 0, width: 0, thickness: 0 })
    expect(result.warnings).toHaveLength(0)
    const broken = tableProject()
    for (const part of broken.parts) part.length = 'nope +'
    const none = plan(broken)
    expect(none.steps).toEqual([])
    expect(none.warnings.some(warning => warning.severity === 'error')).toBe(true)
    expect(validatePlan(none).ok).toBe(true)
  })

  it('keeps names with a unit-bearing number out of the prose rules', () => {
    const project = bookcaseProject()
    project.sheetMaterials[0]!.name = 'Birch plywood 18 mm'
    project.parts[0]!.name = 'Side 2 in birch'
    const result = plan(project)
    expect(validatePlan(result).issues).toEqual([])
  })

  it('does not make the milled thickness critical for parts no joint touches', () => {
    const lone = tableProject()
    lone.parts.push({ ...lone.parts.find(candidate => candidate.id === 'top')!, id: 'plain', label: 'S9', name: 'Plain board', width: 100, thickness: 30, position: { x: 100, y: 100, z: 300 } })
    expect(step(plan(lone), 'mill:walnut@30').measurements.find(m => m.key === 'thickness')?.critical).toBe(false)
  })

  it('plans a single loose part with no final assembly', () => {
    const project = tableProject()
    project.parts = project.parts.filter(candidate => candidate.id === 'leg-fl')
    project.joints = []
    project.subassemblies = []
    const result = plan(project)
    expect(validatePlan(result).issues).toEqual([])
    expect(result.steps.some(candidate => candidate.key === 'assemble:final')).toBe(false)
    expect(step(result, 'finish:apply').inputs[0]!.partKey).toBe('part:leg-fl/cut')
    expect(result.phases.map(phase => phase.key)).not.toContain('sand')
    expect(result.phases.map(phase => phase.key)).not.toContain('joinery')
  })

  it('plans a single subassembly with no final assembly', () => {
    const project = tableProject()
    project.parts = project.parts.filter(candidate => ['leg-fl', 'leg-fr', 'apron-front'].includes(candidate.id))
    project.joints = project.joints.filter(joint => ['mt-front-fl', 'mt-front-fr'].includes(joint.id))
    project.subassemblies = project.subassemblies.filter(sub => sub.id === 'sub-front')
    const result = plan(project)
    expect(validatePlan(result).issues).toEqual([])
    expect(result.steps.some(candidate => candidate.key === 'assemble:final')).toBe(false)
    expect(step(result, 'finish:apply').inputs[0]!.partKey).toBe('assembly:sub-front')
  })

  it('survives broken subassemblies: cycles, unknown ids, and doubly claimed parts', () => {
    const project = tableProject()
    project.subassemblies = [
      { id: 'a', name: 'Alpha', label: 'A', partIds: ['leg-fl', 'ghost'], childIds: ['b', 'missing'] },
      { id: 'b', name: 'Beta', label: 'B', partIds: ['leg-fl', 'leg-fr'], childIds: ['a'] },
      { id: 'empty', name: 'Empty', label: 'E', partIds: [], childIds: [] },
    ]
    const result = plan(project)
    expect(validatePlan(result).issues).toEqual([])
    expect(result.assemblies.some(assembly => assembly.key === 'assembly:empty')).toBe(false)
  })

  it('validates over mutated fixtures', () => {
    let state = 7
    const next = () => (state = (state * 1664525 + 1013904223) % 4294967296) / 4294967296
    for (let run = 0; run < 50; run++) {
      const project = run % 2 === 0 ? tableProject() : bookcaseProject()
      project.maxBoardWidth = 60 + Math.floor(next() * 300)
      for (const part of project.parts) {
        if (next() < 0.3) part.length = (part.length as number) * (0.6 + next() * 0.8)
        if (next() < 0.3) part.width = (part.width as number) * (0.6 + next() * 0.8)
      }
      if (next() < 0.3) project.parts.splice(Math.floor(next() * project.parts.length), 1)
      const result = plan(project)
      const validation = validatePlan(result)
      expect(validation.issues.filter(issue => issue.severity === 'error')).toEqual([])
    }
  })
})
