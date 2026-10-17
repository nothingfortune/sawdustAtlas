import type { FurnitureJoint, FurniturePart, FurnitureRelationship, SheetMaterial, DimExpr } from '../types'
import { faceRule, jointOf, sheetPart } from './support'

// What the three plywood templates share: a pair of sides, panels that sit between them
// in dados, and a thin back let into rabbets in the sides. It reads the parameters
// width, depth, height, t (panel thickness), and back_t (back thickness).

export const PLYWOOD_ID = 'birch-ply-18'
export const BACK_PLYWOOD_ID = 'birch-ply-6'

/** Panel and back thicknesses are fixed design constants: the parts must match the
 *  sheet they are cut from, so they are not template parameters. */
export const PANEL_THICKNESS = 18
export const BACK_THICKNESS = 6

export function plywoodSheets(): SheetMaterial[] {
  return [
    { id: PLYWOOD_ID, name: 'Birch plywood 18 mm', thickness: PANEL_THICKNESS, sheetLength: 2440, sheetWidth: 1220, pricePerSheet: 95, color: '#d9c08f', grain: 'length' },
    { id: BACK_PLYWOOD_ID, name: 'Birch plywood 6 mm', thickness: BACK_THICKNESS, sheetLength: 2440, sheetWidth: 1220, pricePerSheet: 45, color: '#e3cfa4', grain: 'length' },
  ]
}

export function carcassSides(): FurniturePart[] {
  const side = (id: string, label: string, name: string, x: DimExpr, visible: 'left' | 'right') =>
    sheetPart({
      id, label, name, role: 'side', length: 'height', width: 'depth', thickness: 't', orientation: 'zyx', position: { x },
      sheetMaterialId: PLYWOOD_ID, visibleFaces: [visible, 'front'],
    })
  return [side('side-l', 'S1', 'Left side', 0, 'left'), side('side-r', 'S2', 'Right side', 'width - t', 'right')]
}

/** A panel that spans the gap between the sides, in front of the back. Its height
 *  comes from the caller: a stored position or a relationship. */
export function betweenPanel(spec: { id: string; label: string; name: string; role: FurniturePart['role']; z?: DimExpr }): FurniturePart {
  return sheetPart({
    id: spec.id, label: spec.label, name: spec.name, role: spec.role, length: 'width - 2*t', width: 'depth - back_t', thickness: 't', orientation: 'xyz',
    position: spec.z === undefined ? {} : { z: spec.z }, sheetMaterialId: PLYWOOD_ID, visibleFaces: ['front'],
  })
}

export function betweenSides(id: string, partId: string): FurnitureRelationship {
  return { id, kind: 'between', partId, axis: 'x', from: { partId: 'side-l', face: 'right' }, to: { partId: 'side-r', face: 'left' } }
}

export function backPanel(spec: { length: DimExpr; z?: DimExpr }): FurniturePart {
  return sheetPart({
    id: 'back', label: 'K1', name: 'Back', role: 'back', length: spec.length, width: 'width - 2*t', thickness: 'back_t', orientation: 'zxy',
    position: spec.z === undefined ? {} : { z: spec.z }, sheetMaterialId: BACK_PLYWOOD_ID, visibleFaces: [],
  })
}

/** The back fills the opening between the sides, flush with their rear edges. */
export function backRelationships(): FurnitureRelationship[] {
  return [
    faceRule('r-back-x', 'back', 'left', 'side-l', 'right'),
    faceRule('r-back-y', 'back', 'back', 'side-l', 'back'),
  ]
}

/** Each panel sits in a glued dado in both sides. */
export function dadoJoints(partIds: readonly string[]): FurnitureJoint[] {
  return partIds.flatMap(id => [jointOf(`dado-${id}-l`, 'dado', id, 'side-l'), jointOf(`dado-${id}-r`, 'dado', id, 'side-r')])
}

/** The back is let into a rabbet in each side, then screwed to the panels it meets so
 *  the carcass is held square. */
export function backJoints(screwedTo: readonly string[]): FurnitureJoint[] {
  return [
    jointOf('rabbet-back-l', 'rabbet', 'back', 'side-l'),
    jointOf('rabbet-back-r', 'rabbet', 'back', 'side-r'),
    ...screwedTo.map(id => jointOf(`screw-back-${id}`, 'screw', 'back', id)),
  ]
}
