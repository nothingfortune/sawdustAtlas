import { describe, expect, it } from 'vitest'
import { resolveFurniture } from '../src/domain/furniture/geometry'
import {
  CROSS_GRAIN_GLUE_LIMIT, DEFAULT_DOWEL_DEPTH_FACTOR, DEFAULT_DOWEL_DIAMETER_FRACTION, DEFAULT_POCKET_BIT_DIAMETER, DEFAULT_SCREW_DIAMETER, DEFAULT_TENON_SHOULDER, DEFAULT_TENON_THICKNESS_FRACTION,
  MORTISE_CLEARANCE, PILOT_HOLE_FRACTION, cutSizes, jointHardware, jointOperations, validateJoints,
} from '../src/domain/furniture/joinery'
import type { FurnitureJoint, FurniturePart, FurnitureProject, JointKind, JointParams, PartOrientation } from '../src/domain/furniture/types'
import { bookcaseProject, furnitureContext, parametricBookcaseProject, parametricTableProject, tableProject } from './fixtures/furniture'

function resolve(project: FurnitureProject) {
  return resolveFurniture(project, furnitureContext())
}

const cutOf = (project: FurnitureProject, partId: string) => cutSizes(resolve(project)).find(line => line.partId === partId)!

// ---- Constructed cases ---------------------------------------------------------------

type Triple = [number, number, number]

/** A solid part placed by its world box; length, width, and thickness follow the orientation. */
function solid(id: string, orientation: PartOrientation, min: Triple, size: Triple, extra: Partial<FurniturePart> = {}): FurniturePart {
  const along = { x: size[0], y: size[1], z: size[2] }
  return {
    id, label: id, name: `Part ${id.toUpperCase()}`, role: 'other', kind: 'solid',
    length: along[orientation.charAt(0) as 'x'], width: along[orientation.charAt(1) as 'x'], thickness: along[orientation.charAt(2) as 'x'],
    orientation, position: { x: min[0], y: min[1], z: min[2] }, speciesId: 'maple', visibleFaces: [], ...extra,
  }
}

function joint(id: string, kind: JointKind, partId: string, targetId: string, glue = false, params: JointParams = {}): FurnitureJoint {
  return { id, kind, partId, targetId, glue, params }
}

function build(parts: FurniturePart[], joints: FurnitureJoint[]): FurnitureProject {
  return {
    id: 'mini', name: 'Mini', parameters: [], parts, relationships: [], joints, subassemblies: [], sheetMaterials: [], maxBoardWidth: 140, updatedAt: '2026-10-10T00:00:00.000Z',
  }
}

// A 45 mm leg standing up and a 500 mm apron (20 mm thick, 100 mm high) butting its right
// face: the apron's end meets the leg. The apron is the inserted part.
const leg = () => solid('leg', 'zxy', [0, 0, 0], [45, 45, 700])
const apron = () => solid('apron', 'xzy', [45, 0, 600], [500, 20, 100])
const frame = (kind: JointKind, glue: boolean, params: JointParams = {}) => build([leg(), apron()], [joint('j', kind, 'apron', 'leg', glue, params)])

describe('cutSizes on the table', () => {
  const sizes = cutSizes(resolve(tableProject()))
  const byId = new Map(sizes.map(line => [line.partId, line]))

  it('covers every part in project order and keeps the modeled size', () => {
    const resolved = resolve(tableProject())
    expect(sizes.map(line => line.partId)).toEqual(resolved.parts.map(part => part.id))
    for (const line of sizes) expect(line.modeled).toEqual(resolved.parts.find(part => part.id === line.partId)!.size)
  })

  it('adds a tenon on each end of the front and back aprons: 1060 + 2 x 30 = 1120', () => {
    for (const id of ['apron-front', 'apron-back']) {
      const line = byId.get(id)!
      expect(line.modeled).toEqual({ length: 1060, width: 100, thickness: 20 })
      expect(line.cut).toEqual({ length: 1120, width: 100, thickness: 20 })
      expect(line.allowances).toHaveLength(2)
    }
  })

  it('adds a tenon on each end of the side aprons: 560 + 60 = 620', () => {
    for (const id of ['apron-left', 'apron-right']) {
      expect(byId.get(id)!.cut).toEqual({ length: 620, width: 100, thickness: 20 })
      expect(byId.get(id)!.allowances).toHaveLength(2)
    }
  })

  it('reports one allowance per tenon, in plain words with no numbers', () => {
    const front = byId.get('apron-front')!
    expect(front.allowances).toEqual([
      { jointId: 'mt-front-fl', dimension: 'length', amount: 30, reason: 'Tenon into the front left leg' },
      { jointId: 'mt-front-fr', dimension: 'length', amount: 30, reason: 'Tenon into the front right leg' },
    ])
    for (const line of sizes) for (const allowance of line.allowances) expect(allowance.reason).not.toMatch(/\d/)
  })

  it('leaves legs and the top alone: tenons grow the apron, fasteners add nothing', () => {
    for (const id of ['leg-fl', 'leg-fr', 'leg-bl', 'leg-br', 'top']) {
      expect(byId.get(id)!.allowances).toEqual([])
      expect(byId.get(id)!.cut).toEqual(byId.get(id)!.modeled)
    }
  })

  it('is the same for the parametric twin', () => {
    expect(cutSizes(resolve(parametricTableProject()))).toEqual(sizes)
  })

  it('does not touch the resolved model', () => {
    const resolved = resolve(tableProject())
    const before = JSON.stringify(resolved)
    cutSizes(resolved)
    jointOperations(resolved)
    jointHardware(resolved)
    validateJoints(resolved)
    expect(JSON.stringify(resolved)).toBe(before)
  })
})

describe('cutSizes on the bookcase', () => {
  const sizes = new Map(cutSizes(resolve(bookcaseProject())).map(line => [line.partId, line]))

  it('seats the top, bottom, and shelves in dados: 764 + 2 x 6 = 776 long', () => {
    for (const id of ['top', 'bottom', 'shelf-1', 'shelf-2', 'shelf-3']) {
      expect(sizes.get(id)!.modeled).toEqual({ length: 764, width: 294, thickness: 18 })
      expect(sizes.get(id)!.cut).toEqual({ length: 776, width: 294, thickness: 18 })
      expect(sizes.get(id)!.allowances.map(line => line.dimension)).toEqual(['length', 'length'])
    }
  })

  it('seats the back in rabbets along its edges: 764 + 2 x 6 = 776 wide', () => {
    const back = sizes.get('back')!
    expect(back.modeled).toEqual({ length: 1800, width: 764, thickness: 6 })
    expect(back.cut).toEqual({ length: 1800, width: 776, thickness: 6 })
    expect(back.allowances).toEqual([
      { jointId: 'rabbet-back-l', dimension: 'width', amount: 6, reason: 'Sits in a rabbet in the left side' },
      { jointId: 'rabbet-back-r', dimension: 'width', amount: 6, reason: 'Sits in a rabbet in the right side' },
    ])
  })

  it('leaves the sides alone', () => {
    expect(sizes.get('side-l')!.cut).toEqual({ length: 1800, width: 300, thickness: 18 })
    expect(sizes.get('side-r')!.allowances).toEqual([])
  })

  it('is the same for the parametric twin', () => {
    expect(cutSizes(resolve(parametricBookcaseProject())).map(line => line.cut)).toEqual([...sizes.values()].map(line => line.cut))
  })
})

describe('jointOperations on the fixtures', () => {
  const table = jointOperations(resolve(tableProject()))
  const opsNamed = (name: string) => table.filter(op => op.operation === name)

  it('puts a tenon on each apron end and a mortise in each leg, keyed by joint, part, and operation', () => {
    expect(opsNamed('tenon')).toHaveLength(8)
    expect(opsNamed('mortise')).toHaveLength(8)
    expect(table.find(op => op.operation === 'tenon')!).toMatchObject({
      key: 'mt-front-fl:apron-front:tenon', jointId: 'mt-front-fl', partId: 'apron-front', kind: 'machine-joinery', tool: 'table-saw', count: 1,
    })
    expect(table.find(op => op.operation === 'mortise')!).toMatchObject({ key: 'mt-front-fl:leg-fl:mortise', partId: 'leg-fl', tool: 'mortiser' })
    expect(new Set(table.map(op => op.key)).size).toBe(table.length)
  })

  it('batches the eight tenons into one setup and the eight mortises into another', () => {
    expect(new Set(opsNamed('tenon').map(op => op.setupKey)).size).toBe(1)
    expect(new Set(opsNamed('mortise').map(op => op.setupKey)).size).toBe(1)
    expect(opsNamed('tenon')[0]!.setupKey).not.toBe(opsNamed('mortise')[0]!.setupKey)
  })

  it('marks the values the woodworker entered as design and the clearance as an assumption', () => {
    expect(opsNamed('tenon')[0]!.settings).toEqual([
      { label: 'Tenon thickness', value: 8, unit: 'mm', source: 'design' },
      { label: 'Tenon width', value: 80, unit: 'mm', source: 'design' },
      { label: 'Tenon length', value: 30, unit: 'mm', source: 'design' },
    ])
    expect(opsNamed('mortise')[0]!.settings).toEqual([
      { label: 'Mortise width', value: 8, unit: 'mm', source: 'design' },
      { label: 'Mortise length', value: 80, unit: 'mm', source: 'design' },
      { label: 'Mortise depth', value: 30 + MORTISE_CLEARANCE, unit: 'mm', source: 'assumption' },
    ])
  })

  it('slots the apron for the top fasteners and counts them per joint', () => {
    const slots = opsNamed('fastener-slots')
    expect(slots.map(op => [op.partId, op.count])).toEqual([['apron-front', 3], ['apron-back', 3], ['apron-left', 2], ['apron-right', 2]])
    expect(new Set(slots.map(op => op.setupKey)).size).toBe(1)
    expect(slots.every(op => op.settings.every(value => value.source === 'assumption'))).toBe(true)
  })

  it('cuts the bookcase dados into the sides and the rabbets for the back', () => {
    const ops = jointOperations(resolve(bookcaseProject()))
    const dados = ops.filter(op => op.operation === 'dado')
    expect(dados).toHaveLength(10)
    expect(dados.every(op => op.partId === 'side-l' || op.partId === 'side-r')).toBe(true)
    expect(dados[0]!.settings).toEqual([
      { label: 'Dado width', value: 18, unit: 'mm', source: 'design' },
      { label: 'Dado depth', value: 6, unit: 'mm', source: 'design' },
    ])
    expect(new Set(dados.map(op => op.setupKey)).size).toBe(1)
    const rabbets = ops.filter(op => op.operation === 'rabbet')
    expect(rabbets.map(op => op.partId)).toEqual(['side-l', 'side-r'])
    expect(rabbets[0]!.settings).toEqual([
      { label: 'Rabbet width', value: 6, unit: 'mm', source: 'design' },
      { label: 'Rabbet depth', value: 6, unit: 'mm', source: 'design' },
    ])
    expect(new Set(rabbets.map(op => op.setupKey)).size).toBe(1)
    const pilots = ops.filter(op => op.operation === 'pilot-holes')
    expect(pilots.map(op => [op.partId, op.count, op.kind, op.tool])).toEqual([['back', 4, 'drill', 'drill'], ['back', 4, 'drill', 'drill']])
  })

  it('gives the parametric twins the same operations', () => {
    expect(jointOperations(resolve(parametricTableProject()))).toEqual(table)
    expect(jointOperations(resolve(parametricBookcaseProject()))).toEqual(jointOperations(resolve(bookcaseProject())))
  })
})

describe('jointHardware on the fixtures', () => {
  it('totals ten tabletop fasteners on the table', () => {
    expect(jointHardware(resolve(tableProject()))).toEqual([
      { key: 'tabletop-fastener', name: 'Tabletop fastener', quantity: 10, sourceIds: ['tf-front', 'tf-back', 'tf-left', 'tf-right'] },
    ])
  })

  it('totals eight back screws on the bookcase', () => {
    expect(jointHardware(resolve(bookcaseProject()))).toEqual([
      { key: 'screw:4', name: 'Screw', quantity: 8, sourceIds: ['screw-back-bottom', 'screw-back-top'] },
    ])
  })
})

describe('defaults are assumptions', () => {
  it('fills a bare mortise and tenon from named defaults, all tagged as assumptions', () => {
    const project = tableProject()
    project.joints[0]!.params = {}
    const resolved = resolve(project)
    const tenon = jointOperations(resolved).find(op => op.key === 'mt-front-fl:apron-front:tenon')!
    expect(tenon.settings).toEqual([
      { label: 'Tenon thickness', value: 20 * DEFAULT_TENON_THICKNESS_FRACTION, unit: 'mm', source: 'assumption' },
      { label: 'Tenon width', value: 100 - 2 * DEFAULT_TENON_SHOULDER, unit: 'mm', source: 'assumption' },
      { label: 'Tenon length', value: 30, unit: 'mm', source: 'assumption' },
    ])
    expect(cutOf(project, 'apron-front').cut.length).toBe(1060 + 30 + 30)
    // The default tenon is its own setup; the seven entered ones still batch together.
    const keys = jointOperations(resolved).filter(op => op.operation === 'tenon').map(op => op.setupKey)
    expect(new Set(keys).size).toBe(2)
    expect(keys.filter(key => key === keys[1]!)).toHaveLength(7)
  })

  it('treats a width computed from an entered shoulder as design', () => {
    const project = tableProject()
    project.joints[0]!.params = { shoulder: 15 }
    const tenon = jointOperations(resolve(project)).find(op => op.key === 'mt-front-fl:apron-front:tenon')!
    expect(tenon.settings.map(value => [value.label, value.value, value.source])).toEqual([
      ['Tenon thickness', 20 * DEFAULT_TENON_THICKNESS_FRACTION, 'assumption'], ['Tenon width', 70, 'design'], ['Tenon length', 30, 'assumption'],
    ])
  })

  it('lets an entered width win over the shoulder', () => {
    const project = tableProject()
    project.joints[0]!.params = { width: 60, shoulder: 15 }
    const tenon = jointOperations(resolve(project)).find(op => op.key === 'mt-front-fl:apron-front:tenon')!
    expect(tenon.settings[1]).toEqual({ label: 'Tenon width', value: 60, unit: 'mm', source: 'design' })
  })

  it('defaults a dado to a third of the side', () => {
    const project = bookcaseProject()
    project.joints[0]!.params = {}
    expect(cutOf(project, 'bottom').allowances[0]).toMatchObject({ jointId: 'dado-bottom-l', amount: 6 })
    const dado = jointOperations(resolve(project)).find(op => op.key === 'dado-bottom-l:side-l:dado')!
    expect(dado.settings[1]).toEqual({ label: 'Dado depth', value: 6, unit: 'mm', source: 'assumption' })
    expect(dado.settings[0]!.source).toBe('design')
  })

  it('caps a default tenon at the longest default for a thick post', () => {
    const project = build(
      [solid('post', 'zxy', [0, 0, 0], [200, 200, 700]), solid('rail', 'xzy', [200, 0, 600], [500, 30, 100])],
      [joint('j', 'mortise-tenon', 'rail', 'post', true)],
    )
    expect(cutOf(project, 'rail').allowances[0]!.amount).toBe(50)
  })
})

describe('other joint kinds', () => {
  it('drills dowel holes in both parts and buys the dowels', () => {
    const resolved = resolve(frame('dowel', true))
    const diameter = 20 * DEFAULT_DOWEL_DIAMETER_FRACTION
    const depth = diameter * DEFAULT_DOWEL_DEPTH_FACTOR
    const ops = jointOperations(resolved)
    expect(ops.map(op => [op.key, op.operation, op.tool, op.kind, op.count])).toEqual([
      ['j:apron:dowel-holes', 'dowel-holes', 'doweling-jig', 'drill', 1],
      ['j:leg:dowel-holes', 'dowel-holes', 'doweling-jig', 'drill', 1],
    ])
    expect(ops[0]!.settings).toEqual([
      { label: 'Hole diameter', value: diameter, unit: 'mm', source: 'assumption' },
      { label: 'Hole depth', value: depth, unit: 'mm', source: 'assumption' },
    ])
    expect(ops[0]!.setupKey).toBe(ops[1]!.setupKey)
    expect(jointHardware(resolved)).toEqual([{ key: 'dowel:6.667x40', name: 'Dowel', quantity: 1, sourceIds: ['j'] }])
    expect(cutSizes(resolved).every(line => line.allowances.length === 0)).toBe(true)
  })

  it('uses entered dowel sizes and counts as design values', () => {
    const resolved = resolve(frame('dowel', true, { diameter: 8, depth: 20, count: 2 }))
    expect(jointOperations(resolved)[0]!.settings.map(value => value.source)).toEqual(['design', 'design'])
    expect(jointHardware(resolved)).toEqual([{ key: 'dowel:8x40', name: 'Dowel', quantity: 2, sourceIds: ['j'] }])
  })

  it('mortises both parts for loose tenons and counts the tenons', () => {
    const resolved = resolve(frame('loose-tenon', true))
    const ops = jointOperations(resolved)
    expect(ops.map(op => [op.partId, op.operation, op.tool, op.count])).toEqual([
      ['apron', 'mortise', 'loose-tenon-joiner', 1], ['leg', 'mortise', 'loose-tenon-joiner', 1],
    ])
    expect(ops[0]!.settings.map(value => value.value)).toEqual([20 * DEFAULT_TENON_THICKNESS_FRACTION, 50, 22.5])
    expect(jointHardware(resolved)).toEqual([{ key: 'loose-tenon:6.667x50x45', name: 'Loose tenon', quantity: 1, sourceIds: ['j'] }])
    expect(jointHardware(resolve(frame('loose-tenon', true, { thickness: 6, width: 40, depth: 20, count: 3 })))[0]).toMatchObject({ key: 'loose-tenon:6x40x40', quantity: 3 })
  })

  it('drills pocket holes in the part and buys pocket screws', () => {
    const resolved = resolve(frame('pocket-screw', false, { count: 3 }))
    expect(jointOperations(resolved)).toEqual([
      expect.objectContaining({ key: 'j:apron:pocket-holes', operation: 'pocket-holes', tool: 'pocket-hole-jig', kind: 'drill', count: 3 }),
    ])
    expect(jointOperations(resolved)[0]!.settings).toEqual([
      { label: 'Bit diameter', value: DEFAULT_POCKET_BIT_DIAMETER, unit: 'mm', source: 'assumption' },
      { label: 'Stock thickness', value: 20, unit: 'mm', source: 'design' },
    ])
    expect(jointHardware(resolved)).toEqual([{ key: 'pocket-screw', name: 'Pocket screw', quantity: 3, sourceIds: ['j'] }])
  })

  it('sizes the pilot hole from the screw, whichever diameter was entered', () => {
    const bare = jointOperations(resolve(frame('screw', false)))[0]!
    expect(bare.settings).toEqual([
      { label: 'Screw diameter', value: DEFAULT_SCREW_DIAMETER, unit: 'mm', source: 'assumption' },
      { label: 'Pilot hole diameter', value: DEFAULT_SCREW_DIAMETER * PILOT_HOLE_FRACTION, unit: 'mm', source: 'assumption' },
    ])
    const entered = resolve(frame('screw', false, { diameter: 5 }))
    expect(jointOperations(entered)[0]!.settings[0]).toEqual({ label: 'Screw diameter', value: 5, unit: 'mm', source: 'design' })
    expect(jointHardware(entered)).toEqual([{ key: 'screw:5', name: 'Screw', quantity: 1, sourceIds: ['j'] }])
  })

  it('needs at least one fastener even on a short contact', () => {
    expect(jointHardware(resolve(frame('tabletop-fastener', false)))[0]!.quantity).toBe(1)
  })

  it('sizes counts to the contact length', () => {
    const long = build(
      [solid('top', 'xyz', [0, 0, 25], [1200, 700, 25]), solid('rail', 'xzy', [0, 100, 0], [1200, 20, 25])],
      [joint('f', 'tabletop-fastener', 'top', 'rail')],
    )
    expect(jointHardware(resolve(long))[0]!.quantity).toBe(3)
  })

  it('makes a butt joint with no allowance, operation, or hardware', () => {
    const resolved = resolve(frame('butt', false))
    expect(jointOperations(resolved)).toEqual([])
    expect(jointHardware(resolved)).toEqual([])
    expect(cutSizes(resolved).map(line => line.allowances)).toEqual([[], []])
    expect(validateJoints(resolved)).toEqual([])
  })

  it('combines the same hardware across joints and keeps different sizes apart', () => {
    const project = build([leg(), apron()], [
      joint('a', 'screw', 'apron', 'leg', false, { diameter: 4, count: 2 }),
      joint('b', 'screw', 'apron', 'leg', false, { diameter: 4, count: 1 }),
      joint('c', 'screw', 'apron', 'leg', false, { diameter: 5, count: 1 }),
    ])
    expect(jointHardware(resolve(project))).toEqual([
      { key: 'screw:4', name: 'Screw', quantity: 3, sourceIds: ['a', 'b'] },
      { key: 'screw:5', name: 'Screw', quantity: 1, sourceIds: ['c'] },
    ])
  })
})

describe('engagement', () => {
  it('finds an edge against a target as the width', () => {
    const board = solid('board', 'xyz', [18, 0, 0], [500, 300, 18])
    const side = solid('side', 'zyx', [0, 0, 0], [18, 300, 700])
    const project = build([side, board], [joint('j', 'dado', 'board', 'side')])
    // The board's left face is across its length axis: an end. A panel's edge is its width.
    expect(cutOf(project, 'board').allowances[0]).toMatchObject({ dimension: 'length' })
    const panel = solid('panel', 'zxy', [18, 0, 0], [482, 6, 700])
    expect(cutOf(build([side, panel], [joint('j', 'groove', 'panel', 'side')]), 'panel').allowances[0]).toMatchObject({ dimension: 'width' })
  })

  it('engages parts modeled overlapping along the axis where the part sticks out', () => {
    const inside = solid('apron', 'xzy', [15, 0, 600], [500, 20, 100])
    const project = build([leg(), inside], [joint('j', 'mortise-tenon', 'apron', 'leg', true, { depth: 30, thickness: 8 })])
    const resolved = resolve(project)
    expect(validateJoints(resolved)).toEqual([])
    expect(cutSizes(resolved).find(line => line.partId === 'apron')!.cut.length).toBe(530)
    const farSide = solid('apron', 'xzy', [-470, 0, 600], [500, 20, 100])
    expect(cutSizes(resolve(build([leg(), farSide], [joint('j', 'mortise-tenon', 'apron', 'leg', true)]))).find(line => line.partId === 'apron')!.allowances).toHaveLength(1)
  })

  it('still engages a part wholly inside its target', () => {
    const block = solid('block', 'xyz', [5, 5, 5], [10, 10, 10])
    const big = solid('big', 'xyz', [0, 0, 0], [100, 100, 100])
    expect(validateJoints(resolve(build([big, block], [joint('j', 'butt', 'block', 'big')])))).toEqual([])
  })
})

describe('validateJoints', () => {
  const issuesOf = (project: FurnitureProject) => validateJoints(resolve(project))

  it('finds nothing wrong with any of the four fixtures', () => {
    for (const project of [tableProject(), parametricTableProject(), bookcaseProject(), parametricBookcaseProject()]) expect(issuesOf(project)).toEqual([])
  })

  describe('joint-invalid', () => {
    it('flags a joint that names a part that does not exist', () => {
      const missing = build([leg()], [joint('j', 'butt', 'ghost', 'leg')])
      expect(issuesOf(missing)).toEqual([expect.objectContaining({ code: 'joint-invalid', severity: 'error', jointId: 'j', partIds: ['leg'] })])
      expect(issuesOf(build([leg()], [joint('j', 'butt', 'leg', 'ghost')]))[0]!.code).toBe('joint-invalid')
    })

    it('flags a part joined to itself', () => {
      const issues = issuesOf(build([leg()], [joint('j', 'butt', 'leg', 'leg')]))
      expect(issues).toEqual([expect.objectContaining({ code: 'joint-invalid', partIds: ['leg'] })])
      expect(issues[0]!.message).toMatch(/itself/)
    })

    it('flags hardware on either side', () => {
      const slide = solid('slide', 'xyz', [45, 0, 0], [10, 10, 10], { kind: 'hardware', hardwareName: 'Slide' })
      for (const [partId, targetId] of [['slide', 'leg'], ['leg', 'slide']] as const) {
        const issues = issuesOf(build([leg(), slide], [joint('j', 'screw', partId, targetId)]))
        expect(issues).toEqual([expect.objectContaining({ code: 'joint-invalid', partIds: [partId, targetId].filter((id, i, all) => all.indexOf(id) === i) })])
        expect(issues[0]!.message).toMatch(/hardware/)
      }
    })

    it('flags glue on a tabletop fastener and points at the glue field', () => {
      expect(issuesOf(frame('tabletop-fastener', true))).toEqual([expect.objectContaining({ code: 'joint-invalid', field: 'glue' })])
      expect(issuesOf(frame('tabletop-fastener', false))).toEqual([])
    })

    it.each<JointKind>(['mortise-tenon', 'dado', 'rabbet', 'groove'])('flags a %s whose part meets the target with a face', kind => {
      const top = solid('top', 'xyz', [0, 0, 20], [300, 100, 20])
      const rail = solid('rail', 'xyz', [0, 0, 0], [300, 100, 20])
      const issues = issuesOf(build([rail, top], [joint('j', kind, 'top', 'rail')]))
      expect(issues).toEqual([expect.objectContaining({ code: 'joint-invalid', jointId: 'j' })])
      expect(issues[0]!.message).toMatch(/not a face/)
    })
  })

  it('flags parts that do not touch and names both', () => {
    const far = solid('far', 'xzy', [200, 0, 600], [500, 20, 100])
    expect(issuesOf(build([leg(), far], [joint('j', 'dowel', 'far', 'leg')]))).toEqual([
      expect.objectContaining({ code: 'joint-parts-not-touching', severity: 'error', jointId: 'j', partIds: ['far', 'leg'] }),
    ])
    // Meeting only at an edge is not touching.
    const corner = solid('corner', 'xyz', [45, 45, 0], [100, 100, 20])
    expect(issuesOf(build([leg(), corner], [joint('j', 'butt', 'corner', 'leg')]))[0]!.code).toBe('joint-parts-not-touching')
  })

  it('stays quiet about a joint whose part could not resolve, and makes nothing from it', () => {
    const project = tableProject()
    project.parts.find(part => part.id === 'apron-front')!.length = 'bogus +'
    const resolved = resolve(project)
    expect(resolved.issues.length).toBeGreaterThan(0)
    expect(validateJoints(resolved)).toEqual([])
    expect(cutSizes(resolved).some(line => line.partId === 'apron-front')).toBe(false)
    expect(jointOperations(resolved).filter(op => op.partId === 'apron-front')).toEqual([])
    expect(jointOperations(resolved).filter(op => op.operation === 'tenon')).toHaveLength(6)
  })

  describe('joint-params-invalid', () => {
    const tenonWith = (params: JointParams) => issuesOf(frame('mortise-tenon', true, params))
    const only = (issues: ReturnType<typeof tenonWith>, field: string) => {
      expect(issues).toEqual([expect.objectContaining({ code: 'joint-params-invalid', severity: 'error', jointId: 'j', field, partIds: ['apron', 'leg'] })])
    }

    it.each([['depth', 0], ['depth', -3], ['thickness', Number.NaN], ['width', Number.POSITIVE_INFINITY], ['diameter', 0]] as const)('flags a %s of %s', (field, value) => {
      only(tenonWith({ [field]: value }), field)
    })

    it('flags a negative shoulder but allows none', () => {
      only(tenonWith({ shoulder: -1 }), 'shoulder')
      expect(tenonWith({ shoulder: 0 })).toEqual([])
    })

    it.each([0, -1, 1.5, Number.NaN])('flags a count of %s', count => {
      only(issuesOf(frame('screw', false, { count })), 'count')
    })

    it('flags a tenon thicker than its part', () => {
      only(tenonWith({ thickness: 21 }), 'thickness')
      expect(tenonWith({ thickness: 20 })).toEqual([])
    })

    it('flags a tenon wider than its part, and shoulders that leave no tenon', () => {
      only(tenonWith({ width: 101 }), 'width')
      only(tenonWith({ shoulder: 50 }), 'shoulder')
      only(tenonWith({ shoulder: 60 }), 'shoulder')
    })

    it('measures the tenon across the part\'s length when the part meets the target with its edge', () => {
      const rail = solid('apron', 'yxz', [45, 0, 600], [100, 500, 20])
      const withParams = (params: JointParams) => build([leg(), rail], [joint('j', 'mortise-tenon', 'apron', 'leg', true, params)])
      only(validateJoints(resolve(withParams({ width: 501 }))), 'width')
      expect(validateJoints(resolve(withParams({ width: 500 })))).toEqual([])
      expect(cutOf(withParams({}), 'apron').allowances[0]).toMatchObject({ dimension: 'width', amount: 30 })
    })

    it('flags a stopped mortise that reaches through the target', () => {
      only(tenonWith({ depth: 43 }), 'depth')
      only(tenonWith({ depth: 45 }), 'depth')
      expect(tenonWith({ depth: 42 })).toEqual([])
    })

    it.each<JointKind>(['dado', 'rabbet', 'groove'])('flags a %s as deep as the target', kind => {
      only(issuesOf(frame(kind, false, { depth: 45 })), 'depth')
      expect(issuesOf(frame(kind, false, { depth: 44 }))).toEqual([])
    })

    it('flags a dowel too wide for the thinner part', () => {
      only(issuesOf(frame('dowel', true, { diameter: 11 })), 'diameter')
      expect(issuesOf(frame('dowel', true, { diameter: 10 }))).toEqual([])
    })

    it('flags dowel holes and loose-tenon mortises deeper than the shallower part', () => {
      only(issuesOf(frame('dowel', true, { depth: 45 })), 'depth')
      only(issuesOf(frame('loose-tenon', true, { depth: 45 })), 'depth')
    })

    it('flags a loose tenon thicker than the thinner part or wider than the joint', () => {
      only(issuesOf(frame('loose-tenon', true, { thickness: 21 })), 'thickness')
      only(issuesOf(frame('loose-tenon', true, { width: 101 })), 'width')
      expect(issuesOf(frame('loose-tenon', true, { thickness: 6, width: 100, depth: 20 }))).toEqual([])
    })

    it('stops at the first problem of a joint and makes nothing from it', () => {
      const resolved = resolve(frame('dowel', true, { diameter: 11, depth: 45 }))
      expect(validateJoints(resolved)).toHaveLength(1)
      expect(jointOperations(resolved)).toEqual([])
      expect(jointHardware(resolved)).toEqual([])
    })

    it('skips operations, allowances, and hardware for every joint with an error', () => {
      const project = build([leg(), apron()], [joint('bad', 'mortise-tenon', 'apron', 'leg', true, { depth: 45 }), joint('good', 'screw', 'apron', 'leg')])
      const resolved = resolve(project)
      expect(jointOperations(resolved).map(op => op.jointId)).toEqual(['good'])
      expect(cutSizes(resolved).find(line => line.partId === 'apron')!.allowances).toEqual([])
      expect(jointHardware(resolved).map(line => line.sourceIds)).toEqual([['good']])
    })
  })

  describe('cross-grain-glue', () => {
    // Board A has its grain along x, board B along y, glued face to face.
    const crossed = (width: number, glue = true, extra: Partial<FurniturePart> = {}) => build(
      [solid('a', 'xyz', [0, 0, 0], [300, 40, 20]), solid('b', 'yxz', [0, 0, 20], [width, 300, 20], extra)],
      [joint('j', 'dowel', 'b', 'a', glue, { diameter: 6, depth: 8, count: 1 })],
    )

    it('warns when the grain crosses over a glued area wider than the limit', () => {
      const issues = issuesOf(build(
        [solid('a', 'xyz', [0, 0, 0], [300, 100, 20]), solid('b', 'yxz', [0, 0, 20], [100, 300, 20])],
        [joint('j', 'butt', 'b', 'a', true)],
      ))
      expect(issues).toEqual([expect.objectContaining({ code: 'cross-grain-glue', severity: 'warning', jointId: 'j', partIds: ['b', 'a'] })])
      expect(issues[0]!.message).toMatch(/seasonal movement/)
    })

    it('is silent at or under the limit', () => {
      expect(issuesOf(crossed(30))).toEqual([])
      const atLimit = build(
        [solid('a', 'xyz', [0, 0, 0], [300, CROSS_GRAIN_GLUE_LIMIT, 20]), solid('b', 'yxz', [0, 0, 20], [CROSS_GRAIN_GLUE_LIMIT, 300, 20])],
        [joint('j', 'butt', 'b', 'a', true)],
      )
      expect(issuesOf(atLimit)).toEqual([])
    })

    it('is silent without glue, with parallel grain, or when a part is a sheet', () => {
      const wide = (glue: boolean, orientation: PartOrientation, extra: Partial<FurniturePart> = {}) => build(
        [solid('a', 'xyz', [0, 0, 0], [300, 100, 20]), solid('b', orientation, [0, 0, 20], orientation === 'xyz' ? [300, 100, 20] : [100, 300, 20], extra)],
        [joint('j', 'butt', 'b', 'a', glue)],
      )
      expect(issuesOf(wide(false, 'yxz'))).toEqual([])
      expect(issuesOf(wide(true, 'xyz'))).toEqual([])
      expect(issuesOf(wide(true, 'yxz', { kind: 'sheet', sheetMaterialId: 'ply' }))).toEqual([])
    })

    it('warns for other glued joint kinds too', () => {
      const dowelled = build(
        [solid('a', 'xyz', [0, 0, 0], [300, 100, 20]), solid('b', 'yxz', [0, 0, 20], [100, 300, 20])],
        [joint('j', 'dowel', 'b', 'a', true, { diameter: 6, depth: 8, count: 1 })],
      )
      expect(issuesOf(dowelled).map(issue => issue.code)).toEqual(['cross-grain-glue'])
    })

    it('does not call a tenon into a leg cross-grain', () => {
      expect(issuesOf(frame('mortise-tenon', true))).toEqual([])
    })
  })

  describe('end-grain-glue', () => {
    it('warns about a glue-only butt joint on end grain', () => {
      const issues = issuesOf(frame('butt', true))
      expect(issues).toEqual([expect.objectContaining({ code: 'end-grain-glue', severity: 'warning', jointId: 'j', partIds: ['apron', 'leg'] })])
      expect(issues[0]!.message).toMatch(/end grain/)
    })

    it('catches end grain on the target as well', () => {
      const upright = solid('post', 'xyz', [0, 0, 0], [100, 50, 20])
      const cap = solid('cap', 'yxz', [100, 0, 0], [50, 100, 20])
      expect(issuesOf(build([upright, cap], [joint('j', 'butt', 'cap', 'post', true)])).map(issue => issue.code)).toEqual(['end-grain-glue'])
    })

    it('is exempt for mortise and tenon, loose tenons, and dowels', () => {
      for (const kind of ['mortise-tenon', 'loose-tenon', 'dowel'] as const) expect(issuesOf(frame(kind, true))).toEqual([])
    })

    it('is silent without glue, on long grain, and on sheet goods', () => {
      expect(issuesOf(frame('butt', false))).toEqual([])
      const boards = build([solid('a', 'xyz', [0, 0, 0], [300, 100, 20]), solid('b', 'xyz', [0, 100, 0], [300, 100, 20])], [joint('j', 'butt', 'b', 'a', true)])
      expect(issuesOf(boards)).toEqual([])
      const sheets = build(
        [solid('a', 'zxy', [0, 0, 0], [45, 45, 700], { kind: 'sheet', sheetMaterialId: 'ply' }), solid('b', 'xzy', [45, 0, 600], [500, 20, 100], { kind: 'sheet', sheetMaterialId: 'ply' })],
        [joint('j', 'butt', 'b', 'a', true)],
      )
      expect(issuesOf(sheets)).toEqual([])
    })
  })

  it('reports in joint order, structure before glue, deterministically', () => {
    const far = solid('far', 'xzy', [900, 0, 600], [500, 20, 100])
    const project = build([leg(), apron(), far], [
      joint('b-butt', 'butt', 'apron', 'leg', true),
      joint('a-far', 'dowel', 'far', 'leg'),
      joint('c-self', 'screw', 'leg', 'leg'),
      joint('d-deep', 'dado', 'apron', 'leg', false, { depth: 45 }),
    ])
    const issues = issuesOf(project)
    expect(issues.map(issue => [issue.jointId, issue.code])).toEqual([
      ['b-butt', 'end-grain-glue'], ['a-far', 'joint-parts-not-touching'], ['c-self', 'joint-invalid'], ['d-deep', 'joint-params-invalid'],
    ])
    expect(issuesOf(project)).toEqual(issues)
  })
})
