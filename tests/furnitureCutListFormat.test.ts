import { describe, expect, it } from 'vitest'
import { summarizeAllowances } from '../src/components/furniture/cutListFormat'
import type { CutAllowance, FurnitureJoint } from '../src/domain/furniture/types'
import { bookcaseProject, tableProject } from './fixtures/furniture'

const allowance = (jointId: string, amount: number, dimension: CutAllowance['dimension'] = 'length'): CutAllowance =>
  ({ jointId, dimension, amount, reason: `Joint ${jointId}` })

describe('summarizeAllowances', () => {
  it('counts a part’s matching tenons together without naming its neighbours', () => {
    const { joints } = tableProject()
    expect(summarizeAllowances([allowance('mt-front-fl', 30), allowance('mt-front-fr', 30)], joints)).toEqual([
      { dimension: 'length', amount: 30, what: 'each of 2 tenons' },
    ])
  })

  it('keeps different joints, amounts, and dimensions apart in first-seen order', () => {
    const { joints } = bookcaseProject()
    expect(summarizeAllowances([allowance('rabbet-back-l', 6, 'width'), allowance('dado-top-l', 6), allowance('dado-top-r', 6), allowance('rabbet-back-r', 6, 'width')], joints)).toEqual([
      { dimension: 'width', amount: 6, what: 'each of 2 rabbets' },
      { dimension: 'length', amount: 6, what: 'each of 2 dados' },
    ])
  })

  it('reads a single allowance with an article, and falls back to "joint" for an unknown joint', () => {
    const joints: FurnitureJoint[] = [{ id: 'g', kind: 'groove', partId: 'a', targetId: 'b', glue: true, params: {} }]
    expect(summarizeAllowances([allowance('g', 8, 'width')], joints)).toEqual([{ dimension: 'width', amount: 8, what: 'a groove' }])
    expect(summarizeAllowances([allowance('missing', 4)], joints)).toEqual([{ dimension: 'length', amount: 4, what: 'a joint' }])
    expect(summarizeAllowances([], joints)).toEqual([])
  })
})
