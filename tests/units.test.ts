import { describe, expect, it } from 'vitest'
import { clampAngle, nonNegative, sum, toBoardFeet, CUBIC_MM_PER_BOARD_FOOT } from '../src/domain/units'

describe('nonNegative', () => {
  it('passes through finite non-negative values', () => { expect(nonNegative(5)).toBe(5) })
  it('floors negatives to zero', () => { expect(nonNegative(-5)).toBe(0) })
  it('coerces non-finite (NaN/Infinity) to zero', () => { expect(nonNegative(Number.NaN)).toBe(0); expect(nonNegative(Infinity)).toBe(0) })
})

describe('clampAngle', () => {
  it('keeps in-range angles', () => { expect(clampAngle(45)).toBe(45); expect(clampAngle(-45)).toBe(-45) })
  it('clamps beyond ±89', () => { expect(clampAngle(200)).toBe(89); expect(clampAngle(-200)).toBe(-89) })
  it('coerces non-finite to zero', () => { expect(clampAngle(Number.NaN)).toBe(0) })
})

describe('toBoardFeet + sum', () => {
  it('converts cubic mm to board feet', () => { expect(toBoardFeet(CUBIC_MM_PER_BOARD_FOOT)).toBe(1) })
  it('sums a list', () => { expect(sum([1, 2, 3])).toBe(6); expect(sum([])).toBe(0) })
})
