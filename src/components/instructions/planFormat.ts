import type { Measurement } from '../../domain/instructions/types'
import { formatLength, formatNumber } from '../../domain/lengthUnits'
import type { LengthUnit } from '../../domain/lengthUnits'

/** Formats a plan value (mm, degrees, or a count) for display in the current unit system. */
export function formatQuantity(value: number, unit: 'mm' | 'deg' | 'count', lengthUnit: LengthUnit): string {
  if (unit === 'mm') return formatLength(value, lengthUnit)
  if (unit === 'deg') return `${formatNumber(value)}°`
  return formatNumber(value, 0)
}

/** Empty string when the measurement has no tolerance. */
export function formatTolerance(measurement: Measurement, lengthUnit: LengthUnit): string {
  const { minus, plus } = measurement.tolerance
  if (minus === 0 && plus === 0) return ''
  const fmt = (value: number) => formatQuantity(value, measurement.unit, lengthUnit)
  return minus === plus ? `± ${fmt(plus)}` : `− ${fmt(minus)} / + ${fmt(plus)}`
}
