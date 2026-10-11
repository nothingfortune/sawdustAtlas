import type { FurnitureTemplate, TemplateParameter } from '../types'
import { BACK_THICKNESS, PANEL_THICKNESS, PLYWOOD_ID, backJoints, backPanel, backRelationships, betweenPanel, betweenSides, carcassSides, dadoJoints, plywoodSheets } from './carcass'
import { faceRule, jointOf, projectOf, sheetPart, subassembly, templateValues } from './support'

// A plywood base cabinet: full-height sides, a raised bottom and one fixed shelf in
// dados, front and back top rails that tie the sides together and carry the counter, a
// toe kick board recessed between the sides, and a rabbeted back above the toe space.

const PARAMETERS: TemplateParameter[] = [
  { name: 'width', label: 'Overall width', defaultValue: 600, min: 300, max: 1200 },
  { name: 'depth', label: 'Overall depth', defaultValue: 560, min: 450, max: 700 },
  { name: 'height', label: 'Overall height', defaultValue: 870, min: 700, max: 950 },
  { name: 'toe_h', label: 'Toe kick height', defaultValue: 100, min: 70, max: 150 },
]

export const baseCabinet: FurnitureTemplate = {
  id: 'base-cabinet',
  name: 'Base cabinet',
  description: 'A plywood base cabinet with top rails, a toe kick, a fixed shelf, and a rabbeted back.',
  parameters: PARAMETERS,
  create(entered, projectId, updatedAt) {
    const values = templateValues(PARAMETERS, entered)
    const rail = (id: string, label: string, name: string) =>
      sheetPart({
        id, label, name, role: 'rail', length: 'width - 2*t', width: 'rail_w', thickness: 't', orientation: 'xyz', sheetMaterialId: PLYWOOD_ID,
        visibleFaces: id === 'rail-front' ? ['front', 'top'] : ['top'],
      })
    return projectOf(baseCabinet, projectId, updatedAt, {
      parameters: values.parameters([
        { name: 't', label: 'Panel thickness', value: PANEL_THICKNESS },
        { name: 'back_t', label: 'Back thickness', value: BACK_THICKNESS },
        { name: 'rail_w', label: 'Top rail width', value: 80 },
        { name: 'toe_depth', label: 'Toe kick setback', value: 75 },
      ]),
      parts: [
        ...carcassSides(),
        betweenPanel({ id: 'bottom', label: 'B1', name: 'Bottom', role: 'bottom', z: 'toe_h' }),
        betweenPanel({ id: 'shelf', label: 'H1', name: 'Shelf', role: 'shelf' }),
        rail('rail-front', 'R1', 'Front top rail'),
        rail('rail-back', 'R2', 'Back top rail'),
        sheetPart({
          id: 'kick', label: 'K2', name: 'Toe kick', role: 'kick', length: 'width - 2*t', width: 'toe_h', thickness: 't', orientation: 'xzy', position: { y: 'toe_depth' },
          sheetMaterialId: PLYWOOD_ID, visibleFaces: ['front'],
        }),
        backPanel({ length: 'height - toe_h', z: 'toe_h' }),
      ],
      relationships: [
        betweenSides('r-bottom-x', 'bottom'),
        betweenSides('r-shelf-x', 'shelf'),
        { id: 'r-shelf-z', kind: 'distribute', partIds: ['shelf'], axis: 'z', from: { partId: 'bottom', face: 'top' }, to: { partId: 'side-l', face: 'top' } },
        betweenSides('r-rail-front-x', 'rail-front'),
        faceRule('r-rail-front-z', 'rail-front', 'top', 'side-l', 'top'),
        betweenSides('r-rail-back-x', 'rail-back'),
        faceRule('r-rail-back-y', 'rail-back', 'back', 'back', 'front'),
        faceRule('r-rail-back-z', 'rail-back', 'top', 'side-l', 'top'),
        betweenSides('r-kick-x', 'kick'),
        ...backRelationships(),
      ],
      joints: [
        ...dadoJoints(['bottom', 'shelf']),
        // Rails and the kick board go on with pocket screws: plywood edges glue poorly and the carcass stays serviceable.
        jointOf('pk-rail-front-l', 'pocket-screw', 'rail-front', 'side-l'),
        jointOf('pk-rail-front-r', 'pocket-screw', 'rail-front', 'side-r'),
        jointOf('pk-rail-back-l', 'pocket-screw', 'rail-back', 'side-l'),
        jointOf('pk-rail-back-r', 'pocket-screw', 'rail-back', 'side-r'),
        jointOf('pk-kick-l', 'pocket-screw', 'kick', 'side-l'),
        jointOf('pk-kick-r', 'pocket-screw', 'kick', 'side-r'),
        ...backJoints(['bottom', 'rail-back']),
      ],
      sheetMaterials: plywoodSheets(),
      subassemblies: [subassembly('sub-carcass', 'Carcass', 'C', ['side-l', 'side-r', 'bottom', 'shelf', 'rail-front', 'rail-back', 'kick'])],
    })
  },
}
