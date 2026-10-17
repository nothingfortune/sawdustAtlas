import type {
  Axis, BoxFace, DimExpr, FaceRef, FurnitureJoint, FurnitureParameter, FurniturePart, FurniturePartKind, FurniturePartRole, FurnitureProject,
  FurnitureRelationship, FurnitureSubassembly, JointKind, JointParams, PartOrientation, SheetMaterial, Vec3Expr,
} from './types'
import { BOX_FACES, JOINT_KINDS, PART_ORIENTATIONS } from './types'

// Furniture project defaults and the normalizer that storage.ts runs on every load and
// import. It coerces untrusted shapes into valid current-schema projects. It does not
// judge the design: a negative expression result, a dangling part reference, or a
// duplicate label stays in the data and validation reports it, so nothing the
// woodworker entered disappears silently. Only records that cannot be represented at
// all (a relationship of an unknown kind, a joint missing its parts) are dropped.

/** Widest solid board assumed on hand (about a nominal 6 inch board, surfaced). */
export const DEFAULT_MAX_BOARD_WIDTH = 140

export const PART_ROLES: readonly FurniturePartRole[] = [
  'leg', 'apron', 'rail', 'stile', 'stretcher', 'top', 'side', 'bottom', 'shelf', 'back', 'divider', 'face-frame', 'door', 'drawer-front', 'cleat', 'kick', 'panel', 'hardware', 'other',
]
const KINDS: readonly FurniturePartKind[] = ['solid', 'sheet', 'hardware']
const AXES: readonly Axis[] = ['x', 'y', 'z']
/** Joints that are glued unless the data says otherwise. */
export const GLUED_BY_DEFAULT: readonly JointKind[] = ['mortise-tenon', 'loose-tenon', 'dowel', 'dado', 'rabbet', 'groove']
const MAX_EXPRESSION_LENGTH = 200

export interface NormalizeFurnitureOptions {
  createId: () => string
  /** ISO timestamp for a missing updatedAt. */
  now: string
  /** Species for a solid part that has none. */
  fallbackSpeciesId: string
}

export function emptyFurnitureProject(id: string, name: string, updatedAt: string): FurnitureProject {
  return { id, name, parameters: [], parts: [], relationships: [], joints: [], subassemblies: [], sheetMaterials: [], maxBoardWidth: DEFAULT_MAX_BOARD_WIDTH, updatedAt }
}

/**
 * Templates name default species (walnut, maple, ...) that a workspace may not have, for
 * example after importing a custom wood library. Points every solid part whose species is
 * missing at the first available one so a new project starts free of material errors. With
 * no woods at all the project is returned unchanged and validation reports the gap.
 */
export function remapMissingSpecies(project: FurnitureProject, availableIds: readonly string[]): FurnitureProject {
  const [fallback] = availableIds
  if (fallback === undefined) return project
  const available = new Set(availableIds)
  if (project.parts.every(part => part.speciesId === undefined || available.has(part.speciesId))) return project
  return { ...project, parts: project.parts.map(part => part.speciesId === undefined || available.has(part.speciesId) ? part : { ...part, speciesId: fallback }) }
}

export function normalizeFurnitureProject(raw: unknown, options: NormalizeFurnitureOptions): FurnitureProject | null {
  if (!isRecord(raw)) return null
  const project: FurnitureProject = {
    id: text(raw['id'], options.createId()),
    name: text(raw['name'], 'Imported furniture'),
    parameters: records(raw['parameters']).map(p => normalizeParameter(p, options)),
    parts: records(raw['parts']).map(p => normalizePart(p, options)),
    relationships: records(raw['relationships']).flatMap(r => normalizeRelationship(r, options) ?? []),
    joints: records(raw['joints']).flatMap(j => normalizeJoint(j, options) ?? []),
    subassemblies: records(raw['subassemblies']).map(s => normalizeSubassembly(s, options)),
    sheetMaterials: records(raw['sheetMaterials']).map(m => normalizeSheetMaterial(m, options)),
    maxBoardWidth: positive(raw['maxBoardWidth'], DEFAULT_MAX_BOARD_WIDTH),
    updatedAt: text(raw['updatedAt'], options.now),
  }
  if (typeof raw['templateId'] === 'string' && raw['templateId'].trim()) project.templateId = raw['templateId']
  return project
}

function normalizeParameter(raw: Record<string, unknown>, options: NormalizeFurnitureOptions): FurnitureParameter {
  return {
    id: text(raw['id'], options.createId()),
    name: text(raw['name'], 'param'),
    label: text(raw['label'], text(raw['name'], 'Parameter')),
    value: dimExpr(raw['value'], 0, true),
  }
}

function normalizePart(raw: Record<string, unknown>, options: NormalizeFurnitureOptions): FurniturePart {
  const kind = oneOf<FurniturePartKind>(raw['kind'], KINDS, 'solid')
  const part: FurniturePart = {
    id: text(raw['id'], options.createId()),
    label: typeof raw['label'] === 'string' ? raw['label'] : '',
    name: text(raw['name'], 'Part'),
    role: oneOf<FurniturePartRole>(raw['role'], PART_ROLES, 'other'),
    kind,
    length: dimExpr(raw['length'], 500, false),
    width: dimExpr(raw['width'], 100, false),
    thickness: dimExpr(raw['thickness'], 20, false),
    orientation: oneOf<PartOrientation>(raw['orientation'], PART_ORIENTATIONS, 'xyz'),
    position: vec3(raw['position']),
    visibleFaces: [...new Set(strings(raw['visibleFaces']).filter((face): face is BoxFace => (BOX_FACES as readonly string[]).includes(face)))],
  }
  const speciesId = typeof raw['speciesId'] === 'string' && raw['speciesId'] ? raw['speciesId'] : undefined
  if (speciesId) part.speciesId = speciesId
  else if (kind === 'solid') part.speciesId = options.fallbackSpeciesId
  if (typeof raw['sheetMaterialId'] === 'string' && raw['sheetMaterialId']) part.sheetMaterialId = raw['sheetMaterialId']
  if (typeof raw['color'] === 'string' && /^#[0-9a-f]{6}$/i.test(raw['color'])) part.color = raw['color']
  if (typeof raw['hardwareName'] === 'string' && raw['hardwareName'].trim()) part.hardwareName = raw['hardwareName']
  return part
}

function normalizeRelationship(raw: Record<string, unknown>, options: NormalizeFurnitureOptions): FurnitureRelationship | null {
  const id = text(raw['id'], options.createId())
  const partId = typeof raw['partId'] === 'string' && raw['partId'] ? raw['partId'] : null
  switch (raw['kind']) {
    case 'face': {
      const face = oneOf<BoxFace | null>(raw['face'], BOX_FACES, null)
      const target = faceRef(raw['target'])
      return partId && face && target ? { id, kind: 'face', partId, face, target, offset: dimExpr(raw['offset'], 0, true) } : null
    }
    case 'center': {
      const axis = oneOf<Axis | null>(raw['axis'], AXES, null)
      const targetId = typeof raw['targetId'] === 'string' && raw['targetId'] ? raw['targetId'] : null
      return partId && axis && targetId ? { id, kind: 'center', partId, axis, targetId, offset: dimExpr(raw['offset'], 0, true) } : null
    }
    case 'between': {
      const axis = oneOf<Axis | null>(raw['axis'], AXES, null)
      const from = faceRef(raw['from'])
      const to = faceRef(raw['to'])
      return partId && axis && from && to ? { id, kind: 'between', partId, axis, from, to } : null
    }
    case 'distribute': {
      const axis = oneOf<Axis | null>(raw['axis'], AXES, null)
      const from = faceRef(raw['from'])
      const to = faceRef(raw['to'])
      const partIds = strings(raw['partIds']).filter(Boolean)
      return partIds.length && axis && from && to ? { id, kind: 'distribute', partIds, axis, from, to } : null
    }
    default:
      return null
  }
}

function normalizeJoint(raw: Record<string, unknown>, options: NormalizeFurnitureOptions): FurnitureJoint | null {
  const kind = oneOf<JointKind | null>(raw['kind'], JOINT_KINDS, null)
  const partId = typeof raw['partId'] === 'string' && raw['partId'] ? raw['partId'] : null
  const targetId = typeof raw['targetId'] === 'string' && raw['targetId'] ? raw['targetId'] : null
  if (!kind || !partId || !targetId) return null
  return {
    id: text(raw['id'], options.createId()),
    kind,
    partId,
    targetId,
    glue: typeof raw['glue'] === 'boolean' ? raw['glue'] : GLUED_BY_DEFAULT.includes(kind),
    params: jointParams(raw['params']),
  }
}

function jointParams(raw: unknown): JointParams {
  const params: JointParams = {}
  if (!isRecord(raw)) return params
  for (const key of ['depth', 'thickness', 'width', 'diameter', 'shoulder'] as const) {
    const value = raw[key]
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) params[key] = value
  }
  const count = raw['count']
  if (typeof count === 'number' && Number.isInteger(count) && count >= 1) params.count = count
  return params
}

function normalizeSubassembly(raw: Record<string, unknown>, options: NormalizeFurnitureOptions): FurnitureSubassembly {
  return {
    id: text(raw['id'], options.createId()),
    name: text(raw['name'], 'Subassembly'),
    label: typeof raw['label'] === 'string' ? raw['label'] : '',
    partIds: strings(raw['partIds']).filter(Boolean),
    childIds: strings(raw['childIds']).filter(Boolean),
  }
}

function normalizeSheetMaterial(raw: Record<string, unknown>, options: NormalizeFurnitureOptions): SheetMaterial {
  return {
    id: text(raw['id'], options.createId()),
    name: text(raw['name'], 'Sheet material'),
    thickness: positive(raw['thickness'], 18),
    sheetLength: positive(raw['sheetLength'], 2440),
    sheetWidth: positive(raw['sheetWidth'], 1220),
    pricePerSheet: typeof raw['pricePerSheet'] === 'number' && Number.isFinite(raw['pricePerSheet']) && raw['pricePerSheet'] >= 0 ? raw['pricePerSheet'] : 0,
    color: typeof raw['color'] === 'string' && /^#[0-9a-f]{6}$/i.test(raw['color']) ? raw['color'] : '#d9c08f',
    grain: raw['grain'] === 'none' ? 'none' : 'length',
  }
}

function faceRef(raw: unknown): FaceRef | null {
  if (!isRecord(raw)) return null
  const partId = typeof raw['partId'] === 'string' && raw['partId'] ? raw['partId'] : null
  const face = oneOf<BoxFace | null>(raw['face'], BOX_FACES, null)
  return partId && face ? { partId, face } : null
}

function vec3(raw: unknown): Vec3Expr {
  const value = isRecord(raw) ? raw : {}
  return { x: dimExpr(value['x'], 0, true), y: dimExpr(value['y'], 0, true), z: dimExpr(value['z'], 0, true) }
}

/** A literal keeps full precision; sizes clamp to non-negative (CLAUDE.md finiteNumber
 *  rule) while positions and offsets keep their sign. An expression string is kept as
 *  entered (trimmed, length-capped) for the expression evaluator to judge. */
function dimExpr(value: unknown, fallback: number, signed: boolean): DimExpr {
  if (typeof value === 'number' && Number.isFinite(value)) return signed ? value : Math.max(0, value)
  if (typeof value === 'string' && value.trim()) return value.trim().slice(0, MAX_EXPRESSION_LENGTH)
  return fallback
}

function positive(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

function oneOf<T>(value: unknown, allowed: readonly NonNullable<T>[], fallback: T): T {
  return (allowed as readonly unknown[]).includes(value) ? (value as T) : fallback
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
