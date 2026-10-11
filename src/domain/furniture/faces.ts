import type { Axis, BoxFace } from './types'

// Which axis a box face lies on and which side of the axis it is. Shared by geometry.ts
// and relationships.ts, which would otherwise import each other.

const FACE_AXIS: Readonly<Record<BoxFace, Axis>> = { left: 'x', right: 'x', front: 'y', back: 'y', bottom: 'z', top: 'z' }

export const LOW_FACE: Readonly<Record<Axis, BoxFace>> = { x: 'left', y: 'front', z: 'bottom' }
export const HIGH_FACE: Readonly<Record<Axis, BoxFace>> = { x: 'right', y: 'back', z: 'top' }

export function faceAxis(face: BoxFace): Axis {
  return FACE_AXIS[face]
}

/** Whether a face is on the +axis side of its box (right, back, top). */
export function isHighFace(face: BoxFace): boolean {
  return HIGH_FACE[FACE_AXIS[face]] === face
}
