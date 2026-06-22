import { describe, expect, it } from 'vitest'
import { applySliceOrder, moveSlice, readSliceStates, writeSliceStates } from '../src/domain/boardSlices'
import type { EndGrainSettings } from '../src/types'

const settings = (patch: Partial<EndGrainSettings> = {}): EndGrainSettings => ({
  sourceLength: 900, stockThickness: 40, sliceThickness: 40, kerf: 3, trimAllowance: 20,
  rowFlips: [], rowRotations: [], rowOffsets: [], ...patch,
})

describe('readSliceStates', () => {
  it('produces a dense state list defaulting uncovered positions', () => {
    const states = readSliceStates(settings({ rowRotations: [true], rowFlips: [], rowOffsets: [5] }), 3)
    expect(states).toEqual([
      { rotated: true, flipped: false, offset: 5 },
      { rotated: false, flipped: false, offset: 0 },
      { rotated: false, flipped: false, offset: 0 },
    ])
  })

  it('treats a missing rowOffsets array as all zeros', () => {
    const bare = { ...settings(), rowOffsets: undefined } as unknown as EndGrainSettings
    expect(readSliceStates(bare, 2).map(state => state.offset)).toEqual([0, 0])
  })

  it('returns nothing for non-positive counts', () => {
    expect(readSliceStates(settings(), 0)).toEqual([])
    expect(readSliceStates(settings(), -4)).toEqual([])
  })
})

describe('moveSlice', () => {
  const states = [
    { rotated: true, flipped: false, offset: 1 },
    { rotated: false, flipped: true, offset: 2 },
    { rotated: false, flipped: false, offset: 3 },
  ]

  it('carries the moved slice transform to its new index', () => {
    expect(moveSlice(states, 0, 2)).toEqual([
      { rotated: false, flipped: true, offset: 2 },
      { rotated: false, flipped: false, offset: 3 },
      { rotated: true, flipped: false, offset: 1 },
    ])
  })

  it('clamps out-of-range indices instead of dropping slices', () => {
    expect(moveSlice(states, -5, 99)).toEqual([
      { rotated: false, flipped: true, offset: 2 },
      { rotated: false, flipped: false, offset: 3 },
      { rotated: true, flipped: false, offset: 1 },
    ])
  })

  it('is a no-op when source and destination match and never mutates input', () => {
    const copy = states.map(state => ({ ...state }))
    expect(moveSlice(states, 1, 1)).toEqual(states)
    expect(states).toEqual(copy)
  })

  it('handles empty and single-element lists', () => {
    expect(moveSlice([], 0, 0)).toEqual([])
    expect(moveSlice([states[0]!], 0, 1)).toEqual([states[0]])
  })
})

describe('applySliceOrder', () => {
  it('permutes the parallel transform arrays together', () => {
    const result = applySliceOrder(settings({ rowRotations: [true, false, false], rowFlips: [false, true, false], rowOffsets: [1, 2, 3] }), 3, [2, 0, 1])
    expect(result).toEqual({
      rowRotations: [false, true, false],
      rowFlips: [false, false, true],
      rowOffsets: [3, 1, 2],
    })
  })

  it('drops unknown or out-of-range indices rather than trusting them', () => {
    const result = applySliceOrder(settings({ rowRotations: [true, false], rowFlips: [], rowOffsets: [] }), 2, [1, 9, -1, 0])
    expect(result.rowRotations).toEqual([false, true])
  })

  it('round-trips through read/write when the order is identity', () => {
    const input = settings({ rowRotations: [false, true], rowFlips: [true, false], rowOffsets: [7, 8] })
    const states = readSliceStates(input, 2)
    expect(applySliceOrder(input, 2, [0, 1])).toEqual(writeSliceStates(states))
  })
})
