import type { FurnitureTemplate, TemplateParameter } from '../types'
import { leggedFrame } from './legged'
import { faceRule, jointOf, projectOf, solidPart, subassembly, templateValues } from './support'

// A writing desk: the table's legs and aprons, loose-tenon joinery on the aprons, and a
// back stretcher low between the rear legs that stiffens the frame and keeps the legs
// from racking. Knees clear under the front apron.

const PARAMETERS: TemplateParameter[] = [
  { name: 'width', label: 'Overall width', defaultValue: 1400, min: 1000, max: 2000 },
  { name: 'depth', label: 'Overall depth', defaultValue: 700, min: 500, max: 900 },
  { name: 'height', label: 'Overall height', defaultValue: 750, min: 700, max: 800 },
  { name: 'top_t', label: 'Top thickness', defaultValue: 25, min: 18, max: 40 },
  { name: 'leg', label: 'Leg size', defaultValue: 50, min: 40, max: 70 },
  { name: 'overhang', label: 'Top overhang', defaultValue: 30, min: 0, max: 75 },
  { name: 'apron_h', label: 'Apron height', defaultValue: 80, min: 60, max: 120 },
  { name: 'stretcher_rise', label: 'Stretcher height above floor', defaultValue: 300, min: 150, max: 450 },
]

export const desk: FurnitureTemplate = {
  id: 'desk',
  name: 'Desk',
  description: 'A table-height desk on loose-tenon aprons with a low back stretcher.',
  parameters: PARAMETERS,
  create(entered, projectId, updatedAt) {
    const values = templateValues(PARAMETERS, entered)
    const frame = leggedFrame({ topName: 'Top', topSpeciesId: 'white-oak', baseSpeciesId: 'cherry', apronJoint: 'loose-tenon' })
    return projectOf(desk, projectId, updatedAt, {
      parameters: values.parameters([
        { name: 'apron_t', label: 'Apron thickness', value: 20 },
        { name: 'setback', label: 'Apron setback', value: 6 },
        { name: 'stretcher_h', label: 'Stretcher height', value: 70 },
      ]),
      parts: [
        ...frame.parts,
        solidPart({
          id: 'stretcher-back', label: 'S1', name: 'Back stretcher', role: 'stretcher', length: 'width - 2*overhang - 2*leg', width: 'stretcher_h', thickness: 'apron_t',
          orientation: 'xzy', position: { z: 'stretcher_rise' }, speciesId: 'cherry', visibleFaces: ['back'],
        }),
      ],
      relationships: [
        ...frame.relationships,
        faceRule('r-stretcher-x', 'stretcher-back', 'left', 'leg-bl', 'right'),
        faceRule('r-stretcher-y', 'stretcher-back', 'back', 'leg-bl', 'back', '-setback'),
      ],
      joints: [
        ...frame.joints,
        jointOf('mt-stretcher-bl', 'mortise-tenon', 'stretcher-back', 'leg-bl'),
        jointOf('mt-stretcher-br', 'mortise-tenon', 'stretcher-back', 'leg-br'),
      ],
      subassemblies: [
        subassembly('sub-front', 'Front leg frame', 'F', ['leg-fl', 'leg-fr', 'apron-front']),
        subassembly('sub-back', 'Back leg frame', 'B', ['leg-bl', 'leg-br', 'apron-back', 'stretcher-back']),
        subassembly('sub-base', 'Base', 'S', ['apron-left', 'apron-right'], ['sub-front', 'sub-back']),
      ],
    })
  },
}
