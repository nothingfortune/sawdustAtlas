import type { BoxFace, FurniturePartKind, PartOrientation } from '../../domain/furniture/types'

// Plain-language names for the part vocabulary. An orientation is the world axes of the
// part's length, width, and thickness (x left to right, y front to back, z up).
export const ORIENTATION_CHOICES: readonly { value: PartOrientation; label: string }[] = [
  { value: 'xyz', label: 'Lying flat, like a top' },
  { value: 'yxz', label: 'Lying flat, turned a quarter' },
  { value: 'zxy', label: 'Standing, like a leg' },
  { value: 'zyx', label: 'Standing panel, like a cabinet side' },
  { value: 'xzy', label: 'On edge, left to right, like a front apron' },
  { value: 'yzx', label: 'On edge, front to back, like a side apron' },
]

export const KIND_LABELS: Readonly<Record<FurniturePartKind, string>> = { solid: 'Solid wood', sheet: 'Sheet', hardware: 'Hardware' }

export const FACE_LABELS: Readonly<Record<BoxFace, string>> = { left: 'Left', right: 'Right', front: 'Front', back: 'Back', bottom: 'Bottom', top: 'Top' }

export function roleLabel(role: string): string {
  return role.replace('-', ' ')
}
