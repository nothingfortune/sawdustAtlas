import type { FurnitureJoint, FurniturePart, FurnitureRelationship, JointKind } from '../types'
import { faceRule, jointOf, solidPart } from './support'

// The skeleton the table, workbench, and desk share: four legs under a top, joined by
// four aprons just below it. It reads the parameters width, depth, height, top_t, leg,
// overhang, apron_h, apron_t, and setback, so a template that uses it must define them.
// Legs stand inset by `overhang`; each apron is set back `setback` from the leg face so
// its tenon sits in the middle of the leg; the top rests on the legs and aprons.

export const LEGS = ['leg-fl', 'leg-fr', 'leg-bl', 'leg-br'] as const
export const APRONS = ['apron-front', 'apron-back', 'apron-left', 'apron-right'] as const

export interface LeggedSpec {
  topName: string
  topSpeciesId: string
  baseSpeciesId: string
  /** How the aprons meet the legs. */
  apronJoint: Extract<JointKind, 'mortise-tenon' | 'loose-tenon'>
}

export interface LeggedFrame {
  parts: FurniturePart[]
  relationships: FurnitureRelationship[]
  joints: FurnitureJoint[]
}

const LEG_NAMES = { 'leg-fl': 'Front left leg', 'leg-fr': 'Front right leg', 'leg-bl': 'Back left leg', 'leg-br': 'Back right leg' } as const
const LEG_FACES: FurniturePart['visibleFaces'] = ['front', 'back', 'left', 'right']

export function leggedFrame(spec: LeggedSpec): LeggedFrame {
  const leg = (id: typeof LEGS[number], label: string, x: string, y: string): FurniturePart =>
    solidPart({ id, label, name: LEG_NAMES[id], role: 'leg', length: 'height - top_t', width: 'leg', thickness: 'leg', orientation: 'zxy', position: { x, y }, speciesId: spec.baseSpeciesId, visibleFaces: [...LEG_FACES] })
  const apron = (id: typeof APRONS[number], label: string, name: string, length: string, orientation: 'xzy' | 'yzx', visible: 'front' | 'back' | 'left' | 'right'): FurniturePart =>
    solidPart({ id, label, name, role: 'apron', length, width: 'apron_h', thickness: 'apron_t', orientation, speciesId: spec.baseSpeciesId, visibleFaces: [visible] })
  const lengthAcross = 'width - 2*overhang - 2*leg'
  const lengthDeep = 'depth - 2*overhang - 2*leg'

  const parts: FurniturePart[] = [
    solidPart({
      id: 'top', label: 'T', name: spec.topName, role: 'top', length: 'width', width: 'depth', thickness: 'top_t', orientation: 'xyz',
      speciesId: spec.topSpeciesId, visibleFaces: ['top', 'front', 'back', 'left', 'right'],
    }),
    leg('leg-fl', 'L1', 'overhang', 'overhang'),
    leg('leg-fr', 'L2', 'width - overhang - leg', 'overhang'),
    leg('leg-bl', 'L3', 'overhang', 'depth - overhang - leg'),
    leg('leg-br', 'L4', 'width - overhang - leg', 'depth - overhang - leg'),
    apron('apron-front', 'A1', 'Front apron', lengthAcross, 'xzy', 'front'),
    apron('apron-back', 'A2', 'Back apron', lengthAcross, 'xzy', 'back'),
    apron('apron-left', 'A3', 'Left apron', lengthDeep, 'yzx', 'left'),
    apron('apron-right', 'A4', 'Right apron', lengthDeep, 'yzx', 'right'),
  ]

  const relationships: FurnitureRelationship[] = [
    faceRule('r-top-z', 'top', 'bottom', 'leg-fl', 'top'),
    faceRule('r-front-x', 'apron-front', 'left', 'leg-fl', 'right'),
    faceRule('r-front-y', 'apron-front', 'front', 'leg-fl', 'front', 'setback'),
    faceRule('r-front-z', 'apron-front', 'top', 'leg-fl', 'top'),
    faceRule('r-back-x', 'apron-back', 'left', 'leg-bl', 'right'),
    faceRule('r-back-y', 'apron-back', 'back', 'leg-bl', 'back', '-setback'),
    faceRule('r-back-z', 'apron-back', 'top', 'leg-bl', 'top'),
    faceRule('r-left-x', 'apron-left', 'left', 'leg-fl', 'left', 'setback'),
    faceRule('r-left-y', 'apron-left', 'front', 'leg-fl', 'back'),
    faceRule('r-left-z', 'apron-left', 'top', 'leg-fl', 'top'),
    faceRule('r-right-x', 'apron-right', 'right', 'leg-fr', 'right', '-setback'),
    faceRule('r-right-y', 'apron-right', 'front', 'leg-fr', 'back'),
    faceRule('r-right-z', 'apron-right', 'top', 'leg-fr', 'top'),
  ]

  const prefix = spec.apronJoint === 'mortise-tenon' ? 'mt' : 'lt'
  const apronJoints: [string, typeof APRONS[number], typeof LEGS[number]][] = [
    ['front-fl', 'apron-front', 'leg-fl'], ['front-fr', 'apron-front', 'leg-fr'],
    ['back-bl', 'apron-back', 'leg-bl'], ['back-br', 'apron-back', 'leg-br'],
    ['left-fl', 'apron-left', 'leg-fl'], ['left-bl', 'apron-left', 'leg-bl'],
    ['right-fr', 'apron-right', 'leg-fr'], ['right-br', 'apron-right', 'leg-br'],
  ]
  const joints: FurnitureJoint[] = [
    ...apronJoints.map(([suffix, apronId, legId]) => jointOf(`${prefix}-${suffix}`, spec.apronJoint, apronId, legId)),
    // Fasteners, not glue: the top must be free to move across its width.
    ...APRONS.map(apronId => jointOf(`tf-${apronId.slice('apron-'.length)}`, 'tabletop-fastener', 'top', apronId)),
  ]
  return { parts, relationships, joints }
}
