import { isoCamera } from '../../domain/furniture/projection'
import type { ExplodeOffsets } from '../../domain/furniture/projection'
import type { Box, ResolvedPart } from '../../domain/furniture/types'
import type { CameraPose } from '../../domain/instructions/types'

// World to three.js mapping for the 3D viewport. The domain is z-up (x left to right,
// y front to back, z up, millimeters); three.js is y-up with +z toward a viewer at the
// default pose. The scene keeps millimeters and maps (x, y, z) to (x, z, -y): a proper
// rotation (no mirroring), so the front of the piece (world -y) faces three's +z and
// the right-hand rule holds. Every world value passes through here before it reaches
// three.js.

export type Vec3 = [number, number, number]

export function worldToThree(point: readonly [number, number, number]): Vec3 {
  return [point[0], point[2], -point[1]]
}

export interface ThreeBox {
  center: Vec3
  /** Extent along three's x, y, and z: world sx, sz, and sy. */
  size: Vec3
}

export function boxToThree(box: Box): ThreeBox {
  return {
    center: worldToThree([box.x + box.sx / 2, box.y + box.sy / 2, box.z + box.sz / 2]),
    size: [box.sx, box.sz, box.sy],
  }
}

/** Bounding box of the parts after the explode offsets; null when there are none. */
export function partsBounds(parts: readonly ResolvedPart[], offsets?: ExplodeOffsets): Box | null {
  if (!parts.length) return null
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (const { id, box } of parts) {
    const [dx, dy, dz] = offsets?.[id] ?? [0, 0, 0]
    minX = Math.min(minX, box.x + dx); maxX = Math.max(maxX, box.x + dx + box.sx)
    minY = Math.min(minY, box.y + dy); maxY = Math.max(maxY, box.y + dy + box.sy)
    minZ = Math.min(minZ, box.z + dz); maxZ = Math.max(maxZ, box.z + dz + box.sz)
  }
  return { x: minX, y: minY, z: minZ, sx: maxX - minX, sy: maxY - minY, sz: maxZ - minZ }
}

/** Radius of the sphere around the bounds, at least 1 mm. */
export function boundsRadius(bounds: Box): number {
  return Math.max(Math.hypot(bounds.sx, bounds.sy, bounds.sz) / 2, 1)
}

/** The iso direction from isoCamera, pulled back far enough that the bounding sphere
 *  fits both the vertical and the horizontal field of view at this aspect ratio (a
 *  portrait tablet needs more distance than a landscape one). In three coordinates. */
export function fitPose(bounds: Box, fovDeg: number, aspect: number): CameraPose {
  const iso = isoCamera(bounds)
  const target = worldToThree(iso.target)
  const away = worldToThree([iso.position[0] - iso.target[0], iso.position[1] - iso.target[1], iso.position[2] - iso.target[2]])
  const length = Math.hypot(...away)
  const vertical = (fovDeg * Math.PI) / 360
  const horizontal = Math.atan(Math.tan(vertical) * Math.max(aspect, 0.01))
  const distance = boundsRadius(bounds) / Math.sin(Math.min(vertical, horizontal))
  return {
    position: [target[0] + (away[0] / length) * distance, target[1] + (away[1] / length) * distance, target[2] + (away[2] / length) * distance],
    target,
    up: [0, 1, 0],
  }
}

/** Near and far clip distances for a piece of this size, so millimeter scenes keep
 *  depth precision at both bench and room scale. */
export function clipPlanes(bounds: Box): { near: number; far: number } {
  const radius = boundsRadius(bounds)
  return { near: radius / 100, far: radius * 60 }
}
