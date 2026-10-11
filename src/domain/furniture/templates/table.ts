import type { FurnitureTemplate, TemplateParameter } from '../types'
import { leggedFrame } from './legged'
import { projectOf, subassembly, templateValues } from './support'

// A dining or side table: four legs, four aprons mortised into them, and a solid top on
// tabletop fasteners so it can move with the seasons. Spec: "templates/".

const PARAMETERS: TemplateParameter[] = [
  { name: 'width', label: 'Overall width', defaultValue: 1200, min: 600, max: 2400 },
  { name: 'depth', label: 'Overall depth', defaultValue: 700, min: 450, max: 1200 },
  { name: 'height', label: 'Overall height', defaultValue: 750, min: 600, max: 1000 },
  { name: 'top_t', label: 'Top thickness', defaultValue: 25, min: 18, max: 50 },
  { name: 'leg', label: 'Leg size', defaultValue: 45, min: 35, max: 80 },
  { name: 'overhang', label: 'Top overhang', defaultValue: 25, min: 0, max: 75 },
  { name: 'apron_h', label: 'Apron height', defaultValue: 100, min: 60, max: 150 },
]

export const basicTable: FurnitureTemplate = {
  id: 'basic-table',
  name: 'Basic table',
  description: 'Four legs, four aprons, and a solid top held on tabletop fasteners.',
  parameters: PARAMETERS,
  create(entered, projectId, updatedAt) {
    const values = templateValues(PARAMETERS, entered)
    const frame = leggedFrame({ topName: 'Top', topSpeciesId: 'walnut', baseSpeciesId: 'maple', apronJoint: 'mortise-tenon' })
    return projectOf(basicTable, projectId, updatedAt, {
      parameters: values.parameters([
        { name: 'apron_t', label: 'Apron thickness', value: 20 },
        { name: 'setback', label: 'Apron setback', value: 6 },
      ]),
      ...frame,
      // Two leg frames first, the side aprons join them into the base, then the top.
      subassemblies: [
        subassembly('sub-front', 'Front leg frame', 'F', ['leg-fl', 'leg-fr', 'apron-front']),
        subassembly('sub-back', 'Back leg frame', 'B', ['leg-bl', 'leg-br', 'apron-back']),
        subassembly('sub-base', 'Base', 'S', ['apron-left', 'apron-right'], ['sub-front', 'sub-back']),
      ],
    })
  },
}
