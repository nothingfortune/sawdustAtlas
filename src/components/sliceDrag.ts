// Pure slice drag-reorder math for the assembled-board pop-out, extracted so the
// glue-up-critical ordering logic can be unit-tested independently of the DOM.

// The slot a pointer at `clientX` should drop into, given each slot's on-screen
// x midpoint. Clamped to a valid slot index.
export function dropTargetFromX(mids: readonly number[], clientX: number): number {
  let target = 0
  for (const mid of [...mids].sort((a, b) => a - b)) { if (clientX < mid) break; target += 1 }
  return Math.min(Math.max(target, 0), Math.max(mids.length - 1, 0))
}

// Place slot `key` at position `target`, shifting the other slots to fill around
// it. Always returns a permutation of 0..count-1.
export function orderWithKeyAt(count: number, key: number, target: number): number[] {
  const others = Array.from({ length: count }, (_, index) => index).filter(slot => slot !== key)
  const order: number[] = []
  let next = 0
  for (let position = 0; position < count; position += 1) order.push(position === target ? key : others[next++]!)
  return order
}
