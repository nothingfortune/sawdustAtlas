export type LengthUnit = 'metric' | 'imperial'

export const MM_PER_INCH = 25.4
export const MM_PER_FOOT = MM_PER_INCH * 12
const IMPERIAL_DENOMINATOR = 32

// Round a millimetre length to the nearest whole foot (minimum one foot). Used by
// the imperial workshop grid so the floor always reads in round feet regardless of
// the underlying grid spacing.
export function snapMmToFoot(mm: number): number {
  return Math.max(MM_PER_FOOT, Math.round(mm / MM_PER_FOOT) * MM_PER_FOOT)
}
const METRIC_TOKEN = /(-?\d+(?:\.\d+)?)\s*mm\b/gi

export function formatNumber(value: number, digits = 2): string {
  return Number(value.toFixed(digits)).toString()
}

export function lengthUnitLabel(unit: LengthUnit): 'mm' | 'in' {
  return unit === 'imperial' ? 'in' : 'mm'
}

export function formatLengthValue(mm: number, unit: LengthUnit): string {
  return unit === 'imperial'
    ? formatImperialInches(mmToInches(mm))
    : formatNumber(mm)
}

export function formatLength(mm: number, unit: LengthUnit): string {
  return `${formatLengthValue(mm, unit)} ${lengthUnitLabel(unit)}`
}

export function formatDimensions(values: readonly number[], unit: LengthUnit): string {
  return `${values.map(value => formatLengthValue(value, unit)).join(' × ')} ${lengthUnitLabel(unit)}`
}

export function formatFieldLabel(label: string, unit: LengthUnit): string {
  const base = label.replace(/\s*\((?:mm|in)\)\s*$/i, '')
  return `${base} (${lengthUnitLabel(unit)})`
}

export function mmToInches(mm: number): number {
  return mm / MM_PER_INCH
}

export function inchesToMm(inches: number): number {
  return inches * MM_PER_INCH
}

export function roundInchesToNearest32nd(inches: number): number {
  return Math.round(inches * IMPERIAL_DENOMINATOR) / IMPERIAL_DENOMINATOR
}

// Preston's Button: in imperial, snap committed lengths to the nearest half inch
// so values stay short, round, and don't overflow the inputs. Metric is untouched.
export function snapLengthMm(mm: number, unit: LengthUnit): number {
  if (unit !== 'imperial') return mm
  const half = MM_PER_INCH / 2
  return Math.round(mm / half) * half
}

export function parseLengthInput(raw: string, unit: LengthUnit): number | null {
  if (unit === 'metric') {
    const value = Number(raw.trim())
    return Number.isFinite(value) ? value : null
  }

  const normalized = raw.trim().toLowerCase()
  if (!normalized) return 0

  const feetMatch = normalized.match(/^(-?\d+(?:\.\d+)?)\s*(?:ft|')\s*(.*)$/)
  if (feetMatch) {
    const feet = Number(feetMatch[1] ?? 0)
    // The architectural convention 2'-3" uses the hyphen purely as a feet/inches
    // separator — it doesn't mean "negative 3 inches". Strip a leading separator
    // hyphen before parsing so it isn't mistaken for a sign.
    const inchesPart = (feetMatch[2] ?? '').trim().replace(/^-\s*/, '')
    const inches = inchesPart ? parseImperialValue(inchesPart) : 0
    if (inches === null) return null
    const sign = feet < 0 ? -1 : 1
    return inchesToMm(sign * (Math.abs(feet) * 12 + Math.abs(inches)))
  }

  const inches = parseImperialValue(normalized)
  return inches === null ? null : inchesToMm(inches)
}

export function convertMetricText(text: string, unit: LengthUnit): string {
  if (unit === 'metric') return text
  return text.replace(METRIC_TOKEN, (_, token: string) => formatLength(Number(token), unit))
}

function formatImperialInches(inches: number): string {
  const sign = inches < 0 ? '-' : ''
  const rounded = roundInchesToNearest32nd(Math.abs(inches))
  let whole = Math.floor(rounded + 1e-9)
  let numerator = Math.round((rounded - whole) * IMPERIAL_DENOMINATOR)
  if (numerator === IMPERIAL_DENOMINATOR) {
    whole += 1
    numerator = 0
  }
  if (!numerator) return `${sign}${whole}`
  const divisor = gcd(numerator, IMPERIAL_DENOMINATOR)
  const reducedNumerator = numerator / divisor
  const reducedDenominator = IMPERIAL_DENOMINATOR / divisor
  return `${sign}${whole > 0 ? `${whole} ` : ''}${reducedNumerator}/${reducedDenominator}`
}

function parseImperialValue(raw: string): number | null {
  const cleaned = raw
    .replace(/in(?:ch(?:es)?)?\.?/g, '')
    .replace(/"/g, '')
    // Split a hyphenated mixed number ("1-1/2" -> "1 1/2") without swallowing a
    // leading negative sign ("-5" must stay negative).
    .replace(/(\d)-(\d)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return 0
  if (/^-?\d+(?:\.\d+)?$/.test(cleaned)) return Number(cleaned)

  const mixed = cleaned.match(/^(-?\d+)\s+(\d+)\/(\d+)$/)
  if (mixed) {
    const whole = Number(mixed[1] ?? 0)
    const numerator = Number(mixed[2] ?? 0)
    const denominator = Number(mixed[3] ?? 0)
    if (!(denominator > 0)) return null
    const sign = whole < 0 ? -1 : 1
    return sign * (Math.abs(whole) + numerator / denominator)
  }

  const fraction = cleaned.match(/^(-?\d+)\/(\d+)$/)
  if (fraction) {
    const numerator = Number(fraction[1] ?? 0)
    const denominator = Number(fraction[2] ?? 0)
    if (!(denominator > 0)) return null
    return numerator / denominator
  }

  return null
}

function gcd(a: number, b: number): number {
  let left = Math.abs(a)
  let right = Math.abs(b)
  while (right) {
    const next = left % right
    left = right
    right = next
  }
  return left || 1
}
