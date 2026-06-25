// Pure undo/redo history over snapshots of type T. Kept framework-free so the
// stack logic is unit-tested without rendering React. `undo`/`redo` take the
// caller's current value (which becomes the opposite stack's top) and return the
// snapshot to restore, or null when the relevant stack is empty.

export interface History<T> {
  undo: readonly T[]
  redo: readonly T[]
}

export const emptyHistory = <T>(): History<T> => ({ undo: [], redo: [] })

// Push a snapshot of the pre-change value onto the undo stack and clear the redo
// branch (a new edit invalidates any redo path), capped to `limit` entries.
export function record<T>(history: History<T>, snapshot: T, limit = 25): History<T> {
  return { undo: [...history.undo, snapshot].slice(-limit), redo: [] }
}

export function undo<T>(history: History<T>, current: T): { history: History<T>; restored: T } | null {
  if (history.undo.length === 0) return null
  const restored = history.undo[history.undo.length - 1]!
  return { history: { undo: history.undo.slice(0, -1), redo: [...history.redo, current] }, restored }
}

export function redo<T>(history: History<T>, current: T): { history: History<T>; restored: T } | null {
  if (history.redo.length === 0) return null
  const restored = history.redo[history.redo.length - 1]!
  return { history: { undo: [...history.undo, current], redo: history.redo.slice(0, -1) }, restored }
}
