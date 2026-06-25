import { describe, expect, it } from 'vitest'
import { dropTargetFromX, orderWithKeyAt } from '../src/components/sliceDrag'

describe('dropTargetFromX', () => {
  const mids = [10, 30, 50, 70]

  it('returns the slot whose midpoint the pointer has passed', () => {
    expect(dropTargetFromX(mids, 0)).toBe(0)
    expect(dropTargetFromX(mids, 35)).toBe(2)
    expect(dropTargetFromX(mids, 1000)).toBe(3)
  })

  it('does not assume the midpoints are pre-sorted', () => {
    expect(dropTargetFromX([70, 10, 50, 30], 35)).toBe(2)
  })

  it('clamps to 0 for an empty set', () => {
    expect(dropTargetFromX([], 100)).toBe(0)
  })
})

describe('orderWithKeyAt', () => {
  it('moves a slot to a new position, shifting the rest', () => {
    expect(orderWithKeyAt(4, 0, 2)).toEqual([1, 2, 0, 3])
  })

  it('is the identity when a slot stays at its own index', () => {
    expect(orderWithKeyAt(3, 1, 1)).toEqual([0, 1, 2])
  })

  it('always returns a permutation of 0..count-1', () => {
    for (let target = 0; target < 5; target += 1) {
      expect([...orderWithKeyAt(5, 3, target)].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4])
    }
  })
})
