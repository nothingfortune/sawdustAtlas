import type { FurnitureTemplate, TemplateParameter } from '../types'
import { BACK_THICKNESS, PANEL_THICKNESS, PLYWOOD_ID, backJoints, backPanel, backRelationships, betweenPanel, betweenSides, carcassSides, dadoJoints, plywoodSheets } from './carcass'
import { faceRule, jointOf, projectOf, sheetPart, subassembly, templateValues } from './support'

// A plywood wall cabinet: sides, top, bottom, and one fixed shelf in dados, a rabbeted
// back, and a hanging cleat screwed under the top against the back. The cleat takes the
// cabinet's weight; the back is not asked to.

const PARAMETERS: TemplateParameter[] = [
  { name: 'width', label: 'Overall width', defaultValue: 600, min: 300, max: 1000 },
  { name: 'depth', label: 'Overall depth', defaultValue: 300, min: 200, max: 400 },
  { name: 'height', label: 'Overall height', defaultValue: 720, min: 400, max: 1000 },
]

export const wallCabinet: FurnitureTemplate = {
  id: 'wall-cabinet',
  name: 'Wall cabinet',
  description: 'A plywood wall cabinet with a fixed shelf, a rabbeted back, and a hanging cleat.',
  parameters: PARAMETERS,
  create(entered, projectId, updatedAt) {
    const values = templateValues(PARAMETERS, entered)
    return projectOf(wallCabinet, projectId, updatedAt, {
      parameters: values.parameters([
        { name: 't', label: 'Panel thickness', value: PANEL_THICKNESS },
        { name: 'back_t', label: 'Back thickness', value: BACK_THICKNESS },
        { name: 'cleat_w', label: 'Cleat height', value: 60 },
      ]),
      parts: [
        ...carcassSides(),
        betweenPanel({ id: 'bottom', label: 'B1', name: 'Bottom', role: 'bottom' }),
        betweenPanel({ id: 'top', label: 'T1', name: 'Top', role: 'top' }),
        betweenPanel({ id: 'shelf', label: 'H1', name: 'Shelf', role: 'shelf' }),
        sheetPart({
          id: 'cleat', label: 'C1', name: 'Hanging cleat', role: 'cleat', length: 'width - 2*t', width: 'cleat_w', thickness: 't', orientation: 'xzy',
          sheetMaterialId: PLYWOOD_ID, visibleFaces: [],
        }),
        backPanel({ length: 'height' }),
      ],
      relationships: [
        betweenSides('r-bottom-x', 'bottom'),
        betweenSides('r-top-x', 'top'),
        faceRule('r-top-z', 'top', 'top', 'side-l', 'top'),
        betweenSides('r-shelf-x', 'shelf'),
        { id: 'r-shelf-z', kind: 'distribute', partIds: ['shelf'], axis: 'z', from: { partId: 'bottom', face: 'top' }, to: { partId: 'top', face: 'bottom' } },
        betweenSides('r-cleat-x', 'cleat'),
        faceRule('r-cleat-y', 'cleat', 'back', 'back', 'front'),
        faceRule('r-cleat-z', 'cleat', 'top', 'top', 'bottom'),
        ...backRelationships(),
      ],
      joints: [
        ...dadoJoints(['bottom', 'top', 'shelf']),
        ...backJoints(['bottom', 'top']),
        jointOf('screw-cleat-top', 'screw', 'cleat', 'top'),
        jointOf('screw-cleat-back', 'screw', 'cleat', 'back'),
      ],
      sheetMaterials: plywoodSheets(),
      subassemblies: [subassembly('sub-carcass', 'Carcass', 'C', ['side-l', 'side-r', 'bottom', 'top', 'shelf', 'cleat'])],
    })
  },
}
