import { DEFAULT_MAX_BOARD_WIDTH } from '../project'
import type {
  BoxFace, DimExpr, FurnitureJoint, FurnitureParameter, FurniturePart, FurnitureProject, FurnitureRelationship, FurnitureSubassembly, JointKind, JointParams, SheetMaterial,
  TemplateParameter, Vec3Expr,
} from '../types'

// Shared plumbing for the furniture templates: clamping the entered values, turning
// them into project parameters, and small builders that keep each template readable.
// A template never computes geometry itself. Every size and position it writes is an
// expression over the parameters, or a relationship, so editing a parameter later
// re-flows the design.

export interface ExtraParameter {
  name: string
  label: string
  value: DimExpr
}

export interface TemplateValues {
  /** The clamped value of one of the template's own parameters. */
  get(name: string): number
  /** Project parameters: the template's own, then fixed design constants. Equal names
   *  to the template's parameters, so the woodworker edits the same names. */
  parameters(extras?: readonly ExtraParameter[]): FurnitureParameter[]
}

/** Values outside [min, max] are clamped, a missing or non-numeric value takes the
 *  default, and a count is a whole number. */
export function templateValues(definitions: readonly TemplateParameter[], entered: Partial<Record<string, number>>): TemplateValues {
  const values = new Map<string, number>()
  for (const definition of definitions) {
    const raw = entered[definition.name]
    const start = typeof raw === 'number' && Number.isFinite(raw) ? raw : definition.defaultValue
    const clamped = Math.min(definition.max, Math.max(definition.min, start))
    values.set(definition.name, definition.unit === 'count' ? Math.round(clamped) : clamped)
  }
  return {
    get(name) {
      const value = values.get(name)
      if (value === undefined) throw new Error(`Unknown template parameter: ${name}`)
      return value
    },
    parameters(extras = []) {
      return [
        ...definitions.map(({ name, label }) => ({ id: `p-${name}`, name, label, value: values.get(name)! })),
        ...extras.map(({ name, label, value }) => ({ id: `p-${name}`, name, label, value })),
      ]
    },
  }
}

export interface PartSpec {
  id: string
  label: string
  name: string
  role: FurniturePart['role']
  length: DimExpr
  width: DimExpr
  thickness: DimExpr
  orientation: FurniturePart['orientation']
  /** Axes a relationship drives may be left out; they default to 0. */
  position?: Partial<Vec3Expr>
  visibleFaces: BoxFace[]
  speciesId?: string
  sheetMaterialId?: string
}

export function solidPart(spec: PartSpec & { speciesId: string }): FurniturePart {
  return buildPart(spec, 'solid')
}

export function sheetPart(spec: PartSpec & { sheetMaterialId: string }): FurniturePart {
  return buildPart(spec, 'sheet')
}

function buildPart({ position, ...rest }: PartSpec, kind: FurniturePart['kind']): FurniturePart {
  return { ...rest, kind, position: { x: 0, y: 0, z: 0, ...position } }
}

export function faceRule(id: string, partId: string, face: BoxFace, targetId: string, targetFace: BoxFace, offset: DimExpr = 0): FurnitureRelationship {
  return { id, kind: 'face', partId, face, target: { partId: targetId, face: targetFace }, offset }
}

const GLUED: readonly JointKind[] = ['mortise-tenon', 'loose-tenon', 'dowel', 'dado', 'rabbet', 'groove']

/** Joints that normally take glue do; fasteners and screws never do. */
export function jointOf(id: string, kind: JointKind, partId: string, targetId: string, params: JointParams = {}): FurnitureJoint {
  return { id, kind, partId, targetId, glue: GLUED.includes(kind), params }
}

export function subassembly(id: string, name: string, label: string, partIds: string[], childIds: string[] = []): FurnitureSubassembly {
  return { id, name, label, partIds, childIds }
}

export function projectOf(
  template: { id: string; name: string }, projectId: string, updatedAt: string,
  content: Pick<FurnitureProject, 'parameters' | 'parts' | 'relationships' | 'joints' | 'subassemblies'> & { sheetMaterials?: SheetMaterial[] },
): FurnitureProject {
  return { id: projectId, name: template.name, sheetMaterials: [], maxBoardWidth: DEFAULT_MAX_BOARD_WIDTH, templateId: template.id, updatedAt, ...content }
}
