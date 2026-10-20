export function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

// Arrays pass too (unlike packages/shared's isPlainRecord); callers only read named keys.
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback
}

// For true dimensions (widths, lengths, thicknesses) that can never be negative.
export function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback
}

// For signed quantities (trailing angles, row offsets) where a negative value is
// meaningful and load-bearing — chevron/herringbone/mirrored bevels rely on it.
export function signedFinite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

// For pricing fields: reject negatives outright (unlike finiteNumber which floors
// them to 0). A stored negative price or rate is always a data error.
export function nonNegativeFinite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

export function validColor(value: unknown, fallback: string) { return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback }
