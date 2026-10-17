import { describe, expect, it } from 'vitest'
import { JOINT_PARAMETERS, jointValues } from '../src/domain/furniture/joinery'
import { addJoint, defaultGlue, jointKindChoices, removeJoint, setJointGlue, setJointKind, setJointParam, swapJointParts } from '../src/domain/furniture/jointEditing'
import { resolveFurniture } from '../src/domain/furniture/geometry'
import { JOINT_KINDS } from '../src/domain/furniture/types'
import { furnitureContext, tableProject } from './fixtures/furniture'

const ctx = furnitureContext()

describe('jointKindChoices', () => {
  it('offers the kinds an end against a leg face allows, and not the ones it forbids', () => {
    const resolved = resolveFurniture(tableProject(), ctx)
    const { allowed, reason } = jointKindChoices(resolved, 'apron-front', 'leg-fl')
    expect(reason).toBeNull()
    expect(allowed).toContain('mortise-tenon')
    expect(allowed).toContain('butt')
    expect(allowed).toContain('pocket-screw')
    // Tabletop fasteners work on any contact; the order follows the vocabulary.
    expect(allowed).toEqual(JOINT_KINDS.filter(kind => allowed.includes(kind)))
  })

  it('drops socket joints when a broad face meets the target', () => {
    const resolved = resolveFurniture(tableProject(), ctx)
    const { allowed } = jointKindChoices(resolved, 'top', 'apron-front')
    expect(allowed).not.toContain('mortise-tenon')
    expect(allowed).not.toContain('dado')
    expect(allowed).toContain('tabletop-fastener')
    expect(allowed).toContain('screw')
  })

  it('explains why nothing fits when the parts do not touch', () => {
    const resolved = resolveFurniture(tableProject(), ctx)
    const none = jointKindChoices(resolved, 'leg-fl', 'leg-br')
    expect(none.allowed).toEqual([])
    expect(none.reason).toMatch(/do not touch/)
  })

  it('explains a part that cannot be joined', () => {
    const project = tableProject()
    project.parts.push({ ...project.parts[0]!, id: 'slide', kind: 'hardware', hardwareName: 'Slide' })
    const none = jointKindChoices(resolveFurniture(project, ctx), 'slide', 'leg-fl')
    expect(none.allowed).toEqual([])
    expect(none.reason).toMatch(/hardware is bought/)
  })

  it('explains a part that does not exist', () => {
    const resolved = resolveFurniture(tableProject(), ctx)
    expect(jointKindChoices(resolved, 'nope', 'leg-fl').reason).toMatch(/no longer exists/)
  })
})

describe('joint edits', () => {
  it('adds a joint with the kind\'s default glue and no entered parameters', () => {
    const project = tableProject()
    const next = addJoint(project, { id: 'j1', kind: 'dowel', partId: 'apron-front', targetId: 'leg-fl' })
    expect(next.joints.at(-1)).toEqual({ id: 'j1', kind: 'dowel', partId: 'apron-front', targetId: 'leg-fl', glue: true, params: {} })
    expect(addJoint(project, { id: 'j2', kind: 'screw', partId: 'top', targetId: 'apron-front' }).joints.at(-1)!.glue).toBe(false)
    expect(project.joints).toHaveLength(12)
    expect(defaultGlue('butt')).toBe(false)
    expect(defaultGlue('mortise-tenon')).toBe(true)
  })

  it('changes the kind, keeps only the parameters the new kind takes, and resets glue', () => {
    const project = tableProject()
    const joint = project.joints.find(candidate => candidate.id === 'mt-front-fl')!
    expect(joint.params).toEqual({ depth: 30, thickness: 8, shoulder: 10 })
    const next = setJointKind(project, 'mt-front-fl', 'dowel')
    const changed = next.joints.find(candidate => candidate.id === 'mt-front-fl')!
    expect(changed).toMatchObject({ kind: 'dowel', glue: true, params: { depth: 30 } })
    const fastener = setJointKind(next, 'mt-front-fl', 'tabletop-fastener').joints.find(candidate => candidate.id === 'mt-front-fl')!
    expect(fastener).toMatchObject({ glue: false, params: {} })
    expect(joint.params).toEqual({ depth: 30, thickness: 8, shoulder: 10 })
  })

  it('sets glue, sets and clears a parameter, swaps the parts, and removes a joint', () => {
    let project = tableProject()
    project = setJointGlue(project, 'mt-front-fl', false)
    expect(project.joints.find(joint => joint.id === 'mt-front-fl')!.glue).toBe(false)
    project = setJointParam(project, 'mt-front-fl', 'depth', 25)
    expect(project.joints.find(joint => joint.id === 'mt-front-fl')!.params).toEqual({ depth: 25, thickness: 8, shoulder: 10 })
    project = setJointParam(project, 'mt-front-fl', 'thickness', undefined)
    expect(project.joints.find(joint => joint.id === 'mt-front-fl')!.params).toEqual({ depth: 25, shoulder: 10 })
    project = swapJointParts(project, 'mt-front-fl')
    expect(project.joints.find(joint => joint.id === 'mt-front-fl')).toMatchObject({ partId: 'leg-fl', targetId: 'apron-front' })
    project = removeJoint(project, 'mt-front-fl')
    expect(project.joints.some(joint => joint.id === 'mt-front-fl')).toBe(false)
    expect(project.joints).toHaveLength(11)
    // An unknown id changes nothing.
    expect(setJointGlue(project, 'nope', true).joints).toEqual(project.joints)
  })
})

describe('jointValues', () => {
  it('reports entered values as entered and defaults as assumptions', () => {
    const resolved = resolveFurniture(tableProject(), ctx)
    const values = jointValues(resolved, 'mt-front-fl')
    expect(values.map(value => value.key)).toEqual(['thickness', 'width', 'shoulder', 'depth'])
    expect(values.find(value => value.key === 'depth')).toEqual({ key: 'depth', value: 30, entered: true })
    const bare = resolveFurniture(setJointParam(setJointParam(tableProject(), 'mt-front-fl', 'depth', undefined), 'mt-front-fl', 'shoulder', undefined), ctx)
    const defaults = jointValues(bare, 'mt-front-fl')
    expect(defaults.find(value => value.key === 'depth')).toMatchObject({ entered: false })
    expect(defaults.find(value => value.key === 'shoulder')).toMatchObject({ entered: false, value: 6 })
  })

  it('covers every kind: each plan reports exactly the parameters the kind takes', () => {
    const project = tableProject()
    const pairs: Record<string, [string, string]> = {
      'mortise-tenon': ['apron-front', 'leg-fl'], 'loose-tenon': ['apron-front', 'leg-fl'], 'dowel': ['apron-front', 'leg-fl'], 'dado': ['apron-front', 'leg-fl'],
      'rabbet': ['apron-front', 'leg-fl'], 'groove': ['apron-front', 'leg-fl'], 'pocket-screw': ['apron-front', 'leg-fl'], 'screw': ['top', 'apron-front'],
      'tabletop-fastener': ['top', 'apron-front'], 'butt': ['apron-front', 'leg-fl'],
    }
    for (const kind of JOINT_KINDS) {
      const [partId, targetId] = pairs[kind]!
      const next = addJoint({ ...project, joints: [] }, { id: 'probe', kind, partId, targetId })
      const values = jointValues(resolveFurniture(next, ctx), 'probe')
      expect(values.map(value => value.key).sort(), kind).toEqual([...JOINT_PARAMETERS[kind]].sort())
      expect(values.every(value => !value.entered)).toBe(true)
    }
  })

  it('is empty for a joint with an error and for an unknown joint', () => {
    const project = setJointParam(tableProject(), 'mt-front-fl', 'depth', 400)
    const resolved = resolveFurniture(project, ctx)
    expect(jointValues(resolved, 'mt-front-fl')).toEqual([])
    expect(jointValues(resolved, 'nope')).toEqual([])
  })
})
