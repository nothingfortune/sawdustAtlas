import type { FurnitureRelationship, FurnitureTemplate, TemplateParameter } from '../types'
import { BACK_THICKNESS, PANEL_THICKNESS, backJoints, backPanel, backRelationships, betweenPanel, betweenSides, carcassSides, dadoJoints, plywoodSheets } from './carcass'
import { faceRule, projectOf, subassembly, templateValues } from './support'

// A plywood bookcase: top, bottom, and fixed shelves in dados, a rabbeted back, and the
// shelves spaced evenly between the bottom and the top by one distribute relationship.
// The shelf count decides how many shelf parts are made; the sizes stay editable.

const PARAMETERS: TemplateParameter[] = [
  { name: 'width', label: 'Overall width', defaultValue: 800, min: 400, max: 1200 },
  { name: 'depth', label: 'Overall depth', defaultValue: 300, min: 200, max: 450 },
  { name: 'height', label: 'Overall height', defaultValue: 1800, min: 600, max: 2400 },
  { name: 'shelves', label: 'Shelves', unit: 'count', defaultValue: 3, min: 1, max: 8 },
]

export const bookcase: FurnitureTemplate = {
  id: 'bookcase',
  name: 'Bookcase',
  description: 'A plywood bookcase with fixed shelves in dados and a rabbeted back.',
  parameters: PARAMETERS,
  create(entered, projectId, updatedAt) {
    const values = templateValues(PARAMETERS, entered)
    const shelfIds = Array.from({ length: values.get('shelves') }, (_, index) => `shelf-${index + 1}`)
    const panelIds = ['bottom', 'top', ...shelfIds]
    const relationships: FurnitureRelationship[] = [
      betweenSides('r-bottom-x', 'bottom'),
      betweenSides('r-top-x', 'top'),
      faceRule('r-top-z', 'top', 'top', 'side-l', 'top'),
      ...shelfIds.map(id => betweenSides(`r-${id}-x`, id)),
      { id: 'r-shelves-z', kind: 'distribute', partIds: shelfIds, axis: 'z', from: { partId: 'bottom', face: 'top' }, to: { partId: 'top', face: 'bottom' } },
      ...backRelationships(),
    ]
    return projectOf(bookcase, projectId, updatedAt, {
      parameters: values.parameters([
        { name: 't', label: 'Panel thickness', value: PANEL_THICKNESS },
        { name: 'back_t', label: 'Back thickness', value: BACK_THICKNESS },
      ]),
      parts: [
        ...carcassSides(),
        betweenPanel({ id: 'bottom', label: 'B1', name: 'Bottom', role: 'bottom' }),
        betweenPanel({ id: 'top', label: 'T1', name: 'Top', role: 'top' }),
        ...shelfIds.map((id, index) => betweenPanel({ id, label: `H${index + 1}`, name: `Shelf ${index + 1}`, role: 'shelf' })),
        backPanel({ length: 'height' }),
      ],
      relationships,
      joints: [...dadoJoints(panelIds), ...backJoints(['bottom', 'top'])],
      sheetMaterials: plywoodSheets(),
      subassemblies: [subassembly('sub-carcass', 'Carcass', 'C', ['side-l', 'side-r', ...panelIds])],
    })
  },
}
