import { describe, expect, it } from 'vitest'
import { clampAngle, degToRad, EPSILON, isSquareAngle, nonNegative, radToDeg, sum, toBoardFeet, CUBIC_MM_PER_BOARD_FOOT } from '../src/domain/units'

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

describe('degToRad + radToDeg', () => {
  it('converts degrees to radians', () => { expect(degToRad(180)).toBeCloseTo(Math.PI, 12); expect(degToRad(0)).toBe(0) })
  it('converts radians to degrees', () => { expect(radToDeg(Math.PI)).toBeCloseTo(180, 12); expect(radToDeg(0)).toBe(0) })
  it('round-trips', () => { expect(radToDeg(degToRad(37))).toBeCloseTo(37, 12) })
})

describe('EPSILON', () => {
  it('is the shared small tolerance', () => { expect(EPSILON).toBe(1e-9) })
})

describe('isSquareAngle', () => {
  it('treats an exact zero as square', () => { expect(isSquareAngle(0)).toBe(true) })
  it('treats a negligible angle (1e-10) as square', () => { expect(isSquareAngle(1e-10)).toBe(true); expect(isSquareAngle(-1e-10)).toBe(true) })
  it('treats a real bevel as not square', () => { expect(isSquareAngle(1)).toBe(false); expect(isSquareAngle(-5)).toBe(false) })
})
