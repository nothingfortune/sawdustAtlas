import { describe, expect, it } from 'vitest'
import { resolveFurniture } from '../src/domain/furniture/geometry'
import { furnitureWarnings, validateFurniture } from '../src/domain/furniture/validation'
import type { FurnitureIssueCode, FurnitureJoint, FurniturePart, FurnitureProject, FurnitureSubassembly, JointKind, JointParams, PartOrientation, SheetMaterial } from '../src/domain/furniture/types'
import { bookcaseProject, furnitureContext, parametricBookcaseProject, parametricTableProject, tableProject } from './fixtures/furniture'

const context = furnitureContext()
const validate = (project: FurnitureProject) => validateFurniture(resolveFurniture(project, context), context)
const codes = (project: FurnitureProject) => validate(project).map(found => found.code)

type Triple = [number, number, number]

/** A solid maple part placed by its world box. */
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

function build(parts: FurniturePart[], joints: FurnitureJoint[] = [], extra: Partial<FurnitureProject> = {}): FurnitureProject {
  return { id: 'mini', name: 'Mini', parameters: [], parts, relationships: [], joints, subassemblies: [], sheetMaterials: [], maxBoardWidth: 140, updatedAt: '2026-10-10T00:00:00.000Z', ...extra }
}

const ply = (over: Partial<SheetMaterial> = {}): SheetMaterial => ({ id: 'ply', name: 'Birch plywood', thickness: 18, sheetLength: 2440, sheetWidth: 1220, pricePerSheet: 90, color: '#d9c08f', grain: 'length', ...over })
const sheet = (id: string, min: Triple, size: Triple, extra: Partial<FurniturePart> = {}) => solid(id, 'xyz', min, size, { kind: 'sheet', sheetMaterialId: 'ply', speciesId: undefined as never, ...extra })

const leg = () => solid('leg', 'zxy', [0, 0, 0], [45, 45, 700])
const apron = (x = 45) => solid('apron', 'xzy', [x, 0, 600], [500, 20, 100])

describe('the fixtures', () => {
  it.each([
    ['table', tableProject],
    ['parametric table', parametricTableProject],
    ['bookcase', bookcaseProject],
    ['parametric bookcase', parametricBookcaseProject],
  ])('%s has no issues of any severity', (_name, make) => {
    expect(validate(make())).toEqual([])
    expect(furnitureWarnings(make(), context)).toEqual([])
  })
})

describe('what resolving reported', () => {
  it('comes first, unchanged', () => {
    const project = build([leg(), { ...apron(), length: 'oops +' }], [joint('j', 'butt', 'apron', 'leg')])
    const resolved = resolveFurniture(project, context)
    expect(resolved.issues.length).toBeGreaterThan(0)
    expect(validateFurniture(resolved, context).slice(0, resolved.issues.length)).toEqual(resolved.issues)
  })
})

describe('parts-collide and parts-overlap-at-joint', () => {
  it('reports two overlapping parts with no joint as an error', () => {
    const issues = validate(build([leg(), apron(15)]))
    expect(issues.filter(found => found.code === 'parts-collide')).toEqual([
      expect.objectContaining({ code: 'parts-collide', severity: 'error', partIds: ['apron', 'leg'] }),
    ])
  })

  it('reports the same overlap at a joint as a warning, in either joint direction', () => {
    for (const [partId, targetId] of [['apron', 'leg'], ['leg', 'apron']] as const) {
      const issues = validate(build([leg(), apron(15)], [joint('j', 'butt', partId, targetId)]))
      expect(issues.filter(found => found.code === 'parts-overlap-at-joint')).toEqual([
        expect.objectContaining({ severity: 'warning', jointId: 'j', partIds: ['apron', 'leg'] }),
      ])
      expect(issues.some(found => found.code === 'parts-collide')).toBe(false)
    }
  })

  it('lets hardware sit inside the parts around it', () => {
    const slide = solid('slide', 'xyz', [10, 10, 10], [20, 20, 20], { kind: 'hardware', hardwareName: 'Slide', speciesId: undefined as never })
    expect(codes(build([solid('box', 'xyz', [0, 0, 0], [100, 100, 100]), slide]))).toEqual([])
  })
})

describe('part-unattached and part-floating', () => {
  it('flags each part that touches another without being in a joint', () => {
    const issues = validate(build([leg(), apron()]))
    expect(issues).toEqual([
      expect.objectContaining({ code: 'part-unattached', severity: 'warning', partIds: ['apron'] }),
      expect.objectContaining({ code: 'part-unattached', severity: 'warning', partIds: ['leg'] }),
    ])
  })

  it('is satisfied by a joint on either side', () => {
    expect(codes(build([leg(), apron()], [joint('j', 'butt', 'apron', 'leg')]))).toEqual([])
    const third = solid('third', 'xzy', [-500, 0, 600], [500, 20, 100])
    // The third part is touching but in no joint, whatever the others do.
    expect(validate(build([leg(), apron(), third], [joint('j', 'butt', 'apron', 'leg')])).map(found => [found.code, found.partIds])).toEqual([['part-unattached', ['third']]])
  })

  it('flags a part that touches nothing, unless it stands on the floor', () => {
    const issues = validate(build([leg(), solid('hover', 'xyz', [400, 400, 300], [100, 100, 20])]))
    expect(issues).toEqual([expect.objectContaining({ code: 'part-floating', severity: 'warning', partIds: ['hover'] })])
  })

  it('does not call a lone part floating', () => {
    expect(codes(build([solid('hover', 'xyz', [400, 400, 300], [100, 100, 20])]))).toEqual([])
  })

  it('counts an overlap as touching', () => {
    const parts = [solid('low', 'xyz', [0, 0, 300], [100, 100, 20]), solid('high', 'xyz', [50, 50, 310], [100, 100, 20])]
    expect(codes(build(parts, [joint('j', 'butt', 'high', 'low')]))).toEqual(['parts-overlap-at-joint'])
  })
})

describe('joint issues', () => {
  it('include everything validateJoints reports, in joint-id order', () => {
    const far = solid('far', 'xzy', [900, 0, 600], [500, 20, 100])
    const project = build([leg(), far], [joint('z-far', 'butt', 'far', 'leg'), joint('a-self', 'screw', 'leg', 'leg')])
    const found = validate(project).filter(entry => entry.jointId)
    expect(found.map(entry => [entry.jointId, entry.code])).toEqual([['a-self', 'joint-invalid'], ['z-far', 'joint-parts-not-touching']])
  })

  it('include the glue warnings', () => {
    expect(codes(build([leg(), apron()], [joint('j', 'butt', 'apron', 'leg', true)]))).toEqual(['end-grain-glue'])
  })
})

describe('material-missing', () => {
  it('flags a solid part whose wood is not in the library', () => {
    const issues = validate(build([solid('a', 'xyz', [0, 0, 0], [100, 100, 20], { speciesId: 'unobtainium' })]))
    expect(issues).toEqual([expect.objectContaining({ code: 'material-missing', severity: 'error', partIds: ['a'], field: 'speciesId' })])
  })

  it('flags a solid part with no wood at all', () => {
    const noWood = solid('a', 'xyz', [0, 0, 0], [100, 100, 20])
    delete noWood.speciesId
    expect(codes(build([noWood]))).toEqual(['material-missing'])
  })

  it('flags a sheet part with an unknown or missing sheet material', () => {
    const unknown = validate(build([sheet('a', [0, 0, 0], [100, 100, 18], { sheetMaterialId: 'ghost' })], [], { sheetMaterials: [ply()] }))
    expect(unknown).toEqual([expect.objectContaining({ code: 'material-missing', field: 'sheetMaterialId' })])
    const none = sheet('a', [0, 0, 0], [100, 100, 18])
    delete none.sheetMaterialId
    expect(codes(build([none], [], { sheetMaterials: [ply()] }))).toEqual(['material-missing'])
  })

  it('is satisfied by the workspace wood library only', () => {
    const noMaple = { ...context, woods: context.woods.filter(wood => wood.id !== 'maple') }
    const project = build([solid('a', 'xyz', [0, 0, 0], [100, 100, 20])])
    expect(validateFurniture(resolveFurniture(project, noMaple), noMaple).map(found => found.code)).toEqual(['material-missing'])
  })
})

describe('sheet-thickness-mismatch and part-exceeds-sheet', () => {
  it('warns when a sheet part is not the thickness of its material', () => {
    const issues = validate(build([sheet('a', [0, 0, 0], [600, 400, 19])], [], { sheetMaterials: [ply()] }))
    expect(issues).toEqual([expect.objectContaining({ code: 'sheet-thickness-mismatch', severity: 'warning', partIds: ['a'], field: 'thickness' })])
  })

  it('errors when the cut part is larger than the sheet', () => {
    const issues = validate(build([sheet('a', [0, 0, 0], [2500, 400, 18])], [], { sheetMaterials: [ply()] }))
    expect(issues).toEqual([expect.objectContaining({ code: 'part-exceeds-sheet', severity: 'error', partIds: ['a'], field: 'length' })])
  })

  it('judges the cut size, so a joint allowance can push a part over', () => {
    const side = solid('side', 'zyx', [0, 0, 0], [18, 300, 2438], { kind: 'sheet', sheetMaterialId: 'ply', speciesId: undefined as never })
    const shelf = sheet('shelf', [18, 0, 100], [2438, 294, 18])
    const project = build([side, shelf], [joint('d', 'dado', 'shelf', 'side', true, { depth: 6 })], { sheetMaterials: [ply()] })
    expect(validate(project).filter(found => found.code === 'part-exceeds-sheet')).toEqual([expect.objectContaining({ partIds: ['shelf'] })])
    expect(codes({ ...project, joints: [joint('d', 'dado', 'shelf', 'side', true, { depth: 0.5 })] })).toEqual([])
  })

  it('lets a grainless sheet turn but keeps a grained sheet straight', () => {
    const long = [sheet('a', [0, 0, 0], [1000, 2000, 18])]
    expect(codes(build(long, [], { sheetMaterials: [ply({ grain: 'length' })] }))).toEqual(['part-exceeds-sheet'])
    expect(codes(build(long, [], { sheetMaterials: [ply({ grain: 'none' })] }))).toEqual([])
    const tooBig = [sheet('a', [0, 0, 0], [2500, 2000, 18])]
    expect(codes(build(tooBig, [], { sheetMaterials: [ply({ grain: 'none' })] }))).toEqual(['part-exceeds-sheet'])
  })

  it('leaves the missing material to material-missing alone', () => {
    expect(codes(build([sheet('a', [0, 0, 0], [3000, 400, 20])]))).toEqual(['material-missing'])
  })
})

describe('subassembly-invalid', () => {
  const sub = (id: string, partIds: string[], childIds: string[] = []): FurnitureSubassembly => ({ id, name: `Unit ${id}`, label: id.toUpperCase(), partIds, childIds })
  const withSubs = (subassemblies: FurnitureSubassembly[]) => build([leg(), apron()], [joint('j', 'butt', 'apron', 'leg')], { subassemblies })
  const subIssues = (subassemblies: FurnitureSubassembly[]) => validate(withSubs(subassemblies)).filter(found => found.code === 'subassembly-invalid')

  it('accepts a sound tree', () => {
    expect(subIssues([sub('a', ['leg'], ['b']), sub('b', ['apron'])])).toEqual([])
  })

  it('flags an unknown part', () => {
    expect(subIssues([sub('a', ['leg', 'ghost'])])).toEqual([expect.objectContaining({ severity: 'error', subassemblyId: 'a', message: expect.stringMatching(/part that no longer exists/) })])
  })

  it('flags an unknown child', () => {
    expect(subIssues([sub('a', ['leg'], ['ghost'])])).toEqual([expect.objectContaining({ subassemblyId: 'a', message: expect.stringMatching(/subassembly that no longer exists/) })])
  })

  it('flags a part in two subassemblies, once, on the first by id', () => {
    const found = subIssues([sub('b', ['leg']), sub('a', ['leg'])])
    expect(found).toEqual([expect.objectContaining({ subassemblyId: 'a', partIds: ['leg'], message: expect.stringMatching(/more than one subassembly/) })])
  })

  it('flags a child in two parents', () => {
    const found = subIssues([sub('p', [], ['c']), sub('q', [], ['c']), sub('c', ['leg'])])
    expect(found).toEqual([expect.objectContaining({ subassemblyId: 'c', message: expect.stringMatching(/built into more than one/) })])
  })

  it('flags a cycle once, and a subassembly that contains itself', () => {
    const cycle = subIssues([sub('a', ['leg'], ['b']), sub('b', ['apron'], ['a'])])
    expect(cycle).toHaveLength(1)
    expect(cycle[0]).toMatchObject({ subassemblyId: 'a', message: expect.stringMatching(/contain each other/) })
    const self = subIssues([sub('a', ['leg'], ['a'])])
    expect(self).toEqual([expect.objectContaining({ subassemblyId: 'a', message: expect.stringMatching(/contains itself/) })])
  })
})

describe('duplicate-label', () => {
  it('warns once per shared label and lists the parts', () => {
    const parts = [solid('c', 'xyz', [0, 0, 0], [10, 10, 10], { label: 'A1' }), solid('a', 'xyz', [100, 0, 0], [10, 10, 10], { label: ' A1 ' }), solid('b', 'xyz', [200, 0, 0], [10, 10, 10], { label: 'B1' })]
    expect(validate(build(parts)).filter(found => found.code === 'duplicate-label')).toEqual([
      expect.objectContaining({ severity: 'warning', partIds: ['a', 'c'], message: expect.stringContaining('"A1"') }),
    ])
  })

  it('ignores blank labels', () => {
    const parts = [solid('a', 'xyz', [0, 0, 0], [10, 10, 10], { label: '' }), solid('b', 'xyz', [100, 0, 0], [10, 10, 10], { label: '  ' })]
    expect(codes(build(parts))).toEqual([])
  })
})

describe('order', () => {
  it('does not depend on how the arrays are ordered', () => {
    const far = solid('far', 'xzy', [900, 0, 600], [500, 20, 100], { label: 'L' })
    const sub = (id: string, partIds: string[]): FurnitureSubassembly => ({ id, name: id, label: id, partIds, childIds: [] })
    const project = build(
      [{ ...leg(), label: 'L' }, apron(15), far, solid('hover', 'xyz', [400, 400, 300], [100, 100, 20], { speciesId: 'ghost' })],
      [joint('b', 'butt', 'apron', 'leg'), joint('a', 'screw', 'far', 'leg')],
      { subassemblies: [sub('s2', ['leg', 'ghost']), sub('s1', ['leg'])] },
    )
    const expected = validate(project)
    expect(new Set(expected.map(found => found.code))).toEqual(new Set<FurnitureIssueCode>([
      'material-missing', 'subassembly-invalid', 'duplicate-label', 'joint-parts-not-touching', 'parts-overlap-at-joint', 'part-floating',
    ]))
    const reversed = { ...project, parts: [...project.parts].reverse(), joints: [...project.joints].reverse(), subassemblies: [...project.subassemblies].reverse() }
    expect(validate(reversed)).toEqual(expected)
    expect(validate(project)).toEqual(expected)
  })
})

describe('furnitureWarnings', () => {
  it('maps issues to warning-center entries linked to the project and its first part', () => {
    const project = build([leg(), apron(15)], [], { name: 'Hall table' })
    const warnings = furnitureWarnings(project, context)
    expect(warnings[0]).toEqual({
      id: 'furniture:mini:parts-collide:apron+leg',
      severity: 'error',
      message: expect.stringMatching(/^Hall table: /),
      location: { view: 'furniture', targetId: 'mini', focusId: 'apron' },
    })
    expect(warnings.map(warning => warning.severity)).toEqual(['error', 'warning', 'warning'])
  })

  it('falls back to a name for an unnamed project and omits the focus when no part is involved', () => {
    const project = build([leg(), apron()], [joint('j', 'butt', 'apron', 'leg')], { name: '  ', parameters: [{ id: 'p', name: 'a b', label: 'Bad', value: 1 }] })
    const [warning] = furnitureWarnings(project, context)
    expect(warning).toMatchObject({ id: 'furniture:mini:expression-invalid:p', message: expect.stringMatching(/^Untitled furniture: /) })
    expect(warning!.location).toEqual({ view: 'furniture', targetId: 'mini' })
  })

  it('keys by joint, subassembly, and field, and keeps ids unique', () => {
    const sub = (id: string, partIds: string[]): FurnitureSubassembly => ({ id, name: id, label: id, partIds, childIds: [] })
    const project = build(
      [{ ...leg(), length: 0, width: 0 }, apron()],
      [joint('far', 'butt', 'apron', 'ghost')],
      { subassemblies: [sub('s', ['ghost']), { ...sub('t', []), childIds: ['gone', 'gone2'] }] },
    )
    const ids = furnitureWarnings(project, context).map(warning => warning.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(expect.arrayContaining([
      'furniture:mini:dimension-not-positive:leg.length',
      'furniture:mini:dimension-not-positive:leg.width',
      'furniture:mini:joint-invalid:far',
      'furniture:mini:subassembly-invalid:s',
      'furniture:mini:subassembly-invalid:t',
    ]))
  })

  it('numbers a repeated id', () => {
    const sub: FurnitureSubassembly = { id: 's', name: 'S', label: 'S', partIds: ['ghost', 'ghost2'], childIds: ['gone'] }
    const ids = furnitureWarnings(build([leg()], [], { subassemblies: [sub] }), context).map(warning => warning.id)
    expect(ids).toEqual(['furniture:mini:subassembly-invalid:s', 'furniture:mini:subassembly-invalid:s#2'])
  })
})
