import type { FurnitureTemplate, TemplateParameter } from '../types'
import { leggedFrame } from './legged'
import { faceRule, jointOf, projectOf, solidPart, subassembly, templateValues } from './support'

// A heavy woodworking bench: thick legs, aprons under a laminated maple top, and four
// low stretchers that make the base rigid. The end frames (legs, end apron, end
// stretcher) are glued first, the long aprons and stretchers join them into the base,
// and the top goes on last.

const PARAMETERS: TemplateParameter[] = [
  { name: 'width', label: 'Overall width', defaultValue: 1800, min: 1200, max: 3000 },
  { name: 'depth', label: 'Overall depth', defaultValue: 600, min: 500, max: 900 },
  { name: 'height', label: 'Overall height', defaultValue: 900, min: 800, max: 1000 },
  { name: 'top_t', label: 'Top thickness', defaultValue: 60, min: 40, max: 100 },
  { name: 'leg', label: 'Leg size', defaultValue: 90, min: 70, max: 100 },
  { name: 'overhang', label: 'Top overhang', defaultValue: 40, min: 0, max: 100 },
  { name: 'apron_h', label: 'Apron height', defaultValue: 120, min: 80, max: 180 },
  { name: 'stretcher_rise', label: 'Stretcher height above floor', defaultValue: 150, min: 100, max: 250 },
]

const STRETCHERS = [
  { id: 'stretcher-front', label: 'S1', name: 'Front stretcher', orientation: 'xzy', length: 'width - 2*overhang - 2*leg', visible: 'front', legs: ['leg-fl', 'leg-fr'] },
  { id: 'stretcher-back', label: 'S2', name: 'Back stretcher', orientation: 'xzy', length: 'width - 2*overhang - 2*leg', visible: 'back', legs: ['leg-bl', 'leg-br'] },
  { id: 'stretcher-left', label: 'S3', name: 'Left stretcher', orientation: 'yzx', length: 'depth - 2*overhang - 2*leg', visible: 'left', legs: ['leg-fl', 'leg-bl'] },
  { id: 'stretcher-right', label: 'S4', name: 'Right stretcher', orientation: 'yzx', length: 'depth - 2*overhang - 2*leg', visible: 'right', legs: ['leg-fr', 'leg-br'] },
] as const

export const workbench: FurnitureTemplate = {
  id: 'workbench',
  name: 'Workbench',
  description: 'A heavy bench with a laminated maple top, thick legs, and low stretchers.',
  parameters: PARAMETERS,
  create(entered, projectId, updatedAt) {
    const values = templateValues(PARAMETERS, entered)
    const frame = leggedFrame({ topName: 'Laminated top', topSpeciesId: 'maple', baseSpeciesId: 'maple', apronJoint: 'mortise-tenon' })
    return projectOf(workbench, projectId, updatedAt, {
      parameters: values.parameters([
        { name: 'apron_t', label: 'Apron thickness', value: 40 },
        { name: 'setback', label: 'Apron setback', value: 10 },
        { name: 'stretcher_h', label: 'Stretcher height', value: 90 },
      ]),
      parts: [
        ...frame.parts,
        ...STRETCHERS.map(s => solidPart({
          id: s.id, label: s.label, name: s.name, role: 'stretcher', length: s.length, width: 'stretcher_h', thickness: 'apron_t', orientation: s.orientation,
          position: { z: 'stretcher_rise' }, speciesId: 'maple', visibleFaces: [s.visible],
        })),
      ],
      relationships: [
        ...frame.relationships,
        // Each stretcher takes its place from the aprons' own rules: same setback, same legs.
        faceRule('r-stretcher-front-x', 'stretcher-front', 'left', 'leg-fl', 'right'),
        faceRule('r-stretcher-front-y', 'stretcher-front', 'front', 'leg-fl', 'front', 'setback'),
        faceRule('r-stretcher-back-x', 'stretcher-back', 'left', 'leg-bl', 'right'),
        faceRule('r-stretcher-back-y', 'stretcher-back', 'back', 'leg-bl', 'back', '-setback'),
        faceRule('r-stretcher-left-x', 'stretcher-left', 'left', 'leg-fl', 'left', 'setback'),
        faceRule('r-stretcher-left-y', 'stretcher-left', 'front', 'leg-fl', 'back'),
        faceRule('r-stretcher-right-x', 'stretcher-right', 'right', 'leg-fr', 'right', '-setback'),
        faceRule('r-stretcher-right-y', 'stretcher-right', 'front', 'leg-fr', 'back'),
      ],
      joints: [
        ...frame.joints,
        ...STRETCHERS.flatMap(s => s.legs.map(legId => jointOf(`mt-${s.id}-${legId.slice('leg-'.length)}`, 'mortise-tenon', s.id, legId))),
      ],
      subassemblies: [
        subassembly('sub-left', 'Left end frame', 'E1', ['leg-fl', 'leg-bl', 'apron-left', 'stretcher-left']),
        subassembly('sub-right', 'Right end frame', 'E2', ['leg-fr', 'leg-br', 'apron-right', 'stretcher-right']),
        subassembly('sub-base', 'Base', 'S', ['apron-front', 'apron-back', 'stretcher-front', 'stretcher-back'], ['sub-left', 'sub-right']),
      ],
    })
  },
}
