import type { InstructionStep, Measurement } from '../../domain/instructions/types'
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

/** The step's "Makes" chips: one per distinct label in first-seen order, counted, so two
 *  walnut stock lines read "Walnut ×2" rather than "Walnut, Walnut". */
export function outputChips(labels: readonly string[]): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>()
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1)
  return [...counts].map(([label, count]) => ({ label, count }))
}

/** A verify-before measurement that only re-checks a machine setting (same label, value,
 *  and unit) is shown on that setting's line instead of as a second, identical line. */
export function splitSetupChecks(step: InstructionStep): { checks: Map<string, Measurement>; measurements: Measurement[] } {
  const settings = step.machineSetup?.settings ?? []
  const checks = new Map<string, Measurement>()
  const measurements = step.measurements.filter(measurement => {
    const setting = settings.find(s => s.label === measurement.label && s.value === measurement.target && s.unit === measurement.unit)
    if (measurement.phase !== 'verify-before' || !setting || checks.has(setting.label)) return true
    checks.set(setting.label, measurement)
    return false
  })
  return { checks, measurements }
}
