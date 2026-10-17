import { describe, expect, it } from 'vitest'
import { groupIssues, issueTarget } from '../src/domain/furniture/issueFocus'
import type { FurnitureIssue } from '../src/domain/furniture/types'

const issue = (patch: Partial<FurnitureIssue>): FurnitureIssue => ({ code: 'expression-invalid', severity: 'error', message: 'm', ...patch })

describe('issueTarget', () => {
  it('sends a part dimension issue to the part panel and its field', () => {
    expect(issueTarget(issue({ partIds: ['leg'], field: 'length' }))).toEqual({ panel: 'parts', partIds: ['leg'], focus: 'part:length' })
    expect(issueTarget(issue({ partIds: ['leg'], field: 'position.x' })).focus).toBe('part:position.x')
  })

  it('selects every part and shows the first listed', () => {
    expect(issueTarget(issue({ code: 'parts-collide', partIds: ['a', 'b'] }))).toEqual({ panel: 'parts', partIds: ['b', 'a'], focus: null })
    expect(issueTarget(issue({ code: 'part-floating' })).partIds).toEqual([])
  })

  it('sends parameter issues to the parameter value', () => {
    expect(issueTarget(issue({ code: 'parameter-cycle', parameterId: 'p1', field: 'value' }))).toEqual({ panel: 'parameters', partIds: [], focus: 'parameter:p1' })
  })

  it('sends joint issues to the joint and, when known, its parameter', () => {
    expect(issueTarget(issue({ code: 'joint-params-invalid', jointId: 'j1', field: 'depth', partIds: ['a', 'b'] }))).toEqual({ panel: 'joints', partIds: ['b', 'a'], focus: 'joint:j1.depth' })
    expect(issueTarget(issue({ code: 'cross-grain-glue', severity: 'warning', jointId: 'j1' })).focus).toBe('joint:j1')
  })

  it('sends subassembly issues to the assembly and relationship issues to the relationship', () => {
    expect(issueTarget(issue({ code: 'subassembly-invalid', subassemblyId: 's1' }))).toEqual({ panel: 'assemblies', partIds: [], focus: 'assembly:s1' })
    expect(issueTarget(issue({ code: 'relationship-conflict', relationshipId: 'r1', partIds: ['a'] }))).toEqual({ panel: 'parts', partIds: ['a'], focus: 'relationship:r1' })
  })
})

describe('groupIssues', () => {
  it('splits by severity and keeps order', () => {
    const list = [issue({ message: '1' }), issue({ message: '2', severity: 'warning' }), issue({ message: '3' })]
    const grouped = groupIssues(list)
    expect(grouped.errors.map(entry => entry.message)).toEqual(['1', '3'])
    expect(grouped.warnings.map(entry => entry.message)).toEqual(['2'])
  })
})
