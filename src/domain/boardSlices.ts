import type { EndGrainSettings } from '../types'

// BOARD-009 slice ordering. In the single-panel end-grain model every slice
// shares one cross-section, so a slice's identity is its per-slice transform:
// rotation, flip, and running-bond offset. Reordering slices therefore means
// permuting those three values together, which this module does as pure data so
// the UI never hand-rolls parallel-array juggling.

export interface SliceState {
  rotated: boolean
  flipped: boolean
  offset: number
  sourceIndex: number
}

// Read the dense per-slice state for `count` slices, defaulting any positions
// the (possibly sparse) settings arrays don't cover.
export function readSliceStates(settings: EndGrainSettings, count: number): SliceState[] {
  const length = Math.max(0, Math.trunc(count))
  const order = normalizeOrder(settings.rowOrder, length)
  return Array.from({ length }, (_, index) => ({
    rotated: settings.rowRotations[index] ?? false,
    flipped: settings.rowFlips[index] ?? false,
    offset: settings.rowOffsets?.[index] ?? 0,
    sourceIndex: order[index] ?? index,
  }))
}

// Project slice state back onto the parallel arrays the project stores.
export function writeSliceStates(states: readonly SliceState[]): Pick<EndGrainSettings, 'rowFlips' | 'rowRotations' | 'rowOffsets' | 'rowOrder'> {
  return {
    rowRotations: states.map(state => state.rotated),
    rowFlips: states.map(state => state.flipped),
    rowOffsets: states.map(state => state.offset),
    rowOrder: states.map(state => state.sourceIndex),
  }
}

// Move the slice at `from` to position `to`, carrying its transform with it.
// Indices are clamped to range; a no-op move returns the input unchanged.
export function moveSlice(states: readonly SliceState[], from: number, to: number): SliceState[] {
  const source = states.slice()
  const length = source.length
  if (length === 0) return source
  const src = clampIndex(from, length)
  const dest = clampIndex(to, length)
  if (src === dest) return source
  const [moved] = source.splice(src, 1)
  if (!moved) return source
  source.splice(dest, 0, moved)
  return source
}

// Apply an explicit ordering of original slice indices (the order the UI drags
// into). Unknown or out-of-range indices are dropped rather than trusted.
export function applySliceOrder(settings: EndGrainSettings, count: number, order: readonly number[]): Pick<EndGrainSettings, 'rowFlips' | 'rowRotations' | 'rowOffsets' | 'rowOrder'> {
  const states = readSliceStates(settings, count)
  const reordered = order
    .map(index => states[index])
    .filter((state): state is SliceState => !!state)
  return writeSliceStates(reordered)
}

function clampIndex(value: number, length: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(Math.trunc(value), 0), length - 1)
}

function normalizeOrder(saved: readonly number[] | undefined, length: number) {
  const seen = new Set<number>()
  const order: number[] = []
  for (const value of saved ?? []) {
    const index = Math.trunc(value)
    if (Number.isFinite(index) && index >= 0 && index < length && !seen.has(index)) {
      seen.add(index)
      order.push(index)
    }
  }
  for (let index = 0; index < length; index += 1) if (!seen.has(index)) order.push(index)
  return order
}
