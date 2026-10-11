import type { Measurement } from '../../domain/instructions/types'
import { formatLength, formatNumber, mmToInches } from '../../domain/lengthUnits'
import type { LengthUnit } from '../../domain/lengthUnits'

/** Formats a plan value (mm, degrees, or a count) for display in the current unit system. */
export function formatQuantity(value: number, unit: 'mm' | 'deg' | 'count', lengthUnit: LengthUnit): string {
  if (unit === 'mm') return formatLength(value, lengthUnit)
  if (unit === 'deg') return `${formatNumber(value)}°`
  return formatNumber(value, 0)
}

/** Empty string when the measurement has no tolerance. Imperial length tolerances are
 *  decimal inches to the thousandth: a quarter millimeter is far below the 1/32 inch
 *  that lengths display at, and "± 0 in" would tell the woodworker there is no slack. */
export function formatTolerance(measurement: Measurement, lengthUnit: LengthUnit): string {
  const { minus, plus } = measurement.tolerance
  if (minus === 0 && plus === 0) return ''
  const fmt = (value: number) => measurement.unit === 'mm' && lengthUnit === 'imperial'
    ? `${mmToInches(value).toFixed(3)} in`
    : formatQuantity(value, measurement.unit, lengthUnit)
  return minus === plus ? `± ${fmt(plus)}` : `− ${fmt(minus)} / + ${fmt(plus)}`
}
