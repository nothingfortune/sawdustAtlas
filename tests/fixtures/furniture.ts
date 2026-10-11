import { DEFAULT_ALLOWANCES } from '../../src/domain/boardAllowances'
import { defaultSpecies } from '../../src/data'
import type {
  Box, BoxFace, DimExpr, FurnitureContext, FurnitureJoint, FurniturePart, FurnitureProject, FurnitureRelationship, ResolvedPart, SheetMaterial,
} from '../../src/domain/furniture/types'

// Hand-built furniture projects shared by every furniture test. Each builder returns a
// fresh object, so tests can mutate their copy. The literal projects carry plain
// numbers only; the parametric twins express the same designs through parameters and
// relationships and must resolve to exactly the same boxes (TABLE_BOXES,
// BOOKCASE_BOXES). Numbers are millimeters at full precision.

export const UPDATED_AT = '2026-10-10T00:00:00.000Z'

export function furnitureContext(): FurnitureContext {
  return { woods: defaultSpecies.map(wood => ({ ...wood })), allowances: { ...DEFAULT_ALLOWANCES } }
}

function part(overrides: Partial<FurniturePart> & Pick<FurniturePart, 'id' | 'label' | 'name' | 'role' | 'length' | 'width' | 'thickness' | 'orientation'>): FurniturePart {
  return { kind: 'solid', position: { x: 0, y: 0, z: 0 }, visibleFaces: [], ...overrides }
}

function joint(id: string, kind: FurnitureJoint['kind'], partId: string, targetId: string, glue: boolean, params: FurnitureJoint['params'] = {}): FurnitureJoint {
  return { id, kind, partId, targetId, glue, params }
}

// ---- Basic table ---------------------------------------------------------------
//
// 1200 wide, 700 deep, 750 tall. Four maple legs, four maple aprons joined to the legs
// with mortise and tenon, and a solid walnut top (wider than maxBoardWidth, so it is an
// edge-glued panel of five boards) held by tabletop fasteners so it can move. Built as
// two leg frames, joined by the side aprons into a base, then the top goes on.

export const TABLE_BOXES: Record<string, Box> = {
  'top': { x: 0, y: 0, z: 725, sx: 1200, sy: 700, sz: 25 },
  'leg-fl': { x: 25, y: 25, z: 0, sx: 45, sy: 45, sz: 725 },
  'leg-fr': { x: 1130, y: 25, z: 0, sx: 45, sy: 45, sz: 725 },
  'leg-bl': { x: 25, y: 630, z: 0, sx: 45, sy: 45, sz: 725 },
  'leg-br': { x: 1130, y: 630, z: 0, sx: 45, sy: 45, sz: 725 },
  'apron-front': { x: 70, y: 31, z: 625, sx: 1060, sy: 20, sz: 100 },
  'apron-back': { x: 70, y: 649, z: 625, sx: 1060, sy: 20, sz: 100 },
  'apron-left': { x: 31, y: 70, z: 625, sx: 20, sy: 560, sz: 100 },
  'apron-right': { x: 1149, y: 70, z: 625, sx: 20, sy: 560, sz: 100 },
}

const TABLE_JOINTS: FurnitureJoint[] = [
  joint('mt-front-fl', 'mortise-tenon', 'apron-front', 'leg-fl', true, { depth: 30, thickness: 8, shoulder: 10 }),
  joint('mt-front-fr', 'mortise-tenon', 'apron-front', 'leg-fr', true, { depth: 30, thickness: 8, shoulder: 10 }),
  joint('mt-back-bl', 'mortise-tenon', 'apron-back', 'leg-bl', true, { depth: 30, thickness: 8, shoulder: 10 }),
  joint('mt-back-br', 'mortise-tenon', 'apron-back', 'leg-br', true, { depth: 30, thickness: 8, shoulder: 10 }),
  joint('mt-left-fl', 'mortise-tenon', 'apron-left', 'leg-fl', true, { depth: 30, thickness: 8, shoulder: 10 }),
  joint('mt-left-bl', 'mortise-tenon', 'apron-left', 'leg-bl', true, { depth: 30, thickness: 8, shoulder: 10 }),
  joint('mt-right-fr', 'mortise-tenon', 'apron-right', 'leg-fr', true, { depth: 30, thickness: 8, shoulder: 10 }),
  joint('mt-right-br', 'mortise-tenon', 'apron-right', 'leg-br', true, { depth: 30, thickness: 8, shoulder: 10 }),
  joint('tf-front', 'tabletop-fastener', 'top', 'apron-front', false, { count: 3 }),
  joint('tf-back', 'tabletop-fastener', 'top', 'apron-back', false, { count: 3 }),
  joint('tf-left', 'tabletop-fastener', 'top', 'apron-left', false, { count: 2 }),
  joint('tf-right', 'tabletop-fastener', 'top', 'apron-right', false, { count: 2 }),
]

function tableBase(parts: FurniturePart[], extra: Partial<FurnitureProject> = {}): FurnitureProject {
  return {
    id: 'table',
    name: 'Basic table',
    parameters: [],
    parts,
    relationships: [],
    joints: TABLE_JOINTS.map(j => ({ ...j, params: { ...j.params } })),
    subassemblies: [
      { id: 'sub-front', name: 'Front leg frame', label: 'F', partIds: ['leg-fl', 'leg-fr', 'apron-front'], childIds: [] },
      { id: 'sub-back', name: 'Back leg frame', label: 'B', partIds: ['leg-bl', 'leg-br', 'apron-back'], childIds: [] },
      { id: 'sub-base', name: 'Base', label: 'S', partIds: ['apron-left', 'apron-right'], childIds: ['sub-front', 'sub-back'] },
    ],
    sheetMaterials: [],
    maxBoardWidth: 140,
    updatedAt: UPDATED_AT,
    ...extra,
  }
}

const LEG_FACES: FurniturePart['visibleFaces'] = ['front', 'back', 'left', 'right']

export function tableProject(): FurnitureProject {
  const leg = (id: string, label: string, name: string) => {
    const box = TABLE_BOXES[id]!
    return part({ id, label, name, role: 'leg', length: 725, width: 45, thickness: 45, orientation: 'zxy', position: { x: box.x, y: box.y, z: box.z }, speciesId: 'maple', visibleFaces: [...LEG_FACES] })
  }
  const apron = (id: string, label: string, name: string, length: number, orientation: FurniturePart['orientation'], face: FurniturePart['visibleFaces'][number]) => {
    const box = TABLE_BOXES[id]!
    return part({ id, label, name, role: 'apron', length, width: 100, thickness: 20, orientation, position: { x: box.x, y: box.y, z: box.z }, speciesId: 'maple', visibleFaces: [face] })
  }
  return tableBase([
    part({ id: 'top', label: 'T', name: 'Top', role: 'top', length: 1200, width: 700, thickness: 25, orientation: 'xyz', position: { x: 0, y: 0, z: 725 }, speciesId: 'walnut', visibleFaces: ['top', 'front', 'back', 'left', 'right'] }),
    leg('leg-fl', 'L1', 'Front left leg'),
    leg('leg-fr', 'L2', 'Front right leg'),
    leg('leg-bl', 'L3', 'Back left leg'),
    leg('leg-br', 'L4', 'Back right leg'),
    apron('apron-front', 'A1', 'Front apron', 1060, 'xzy', 'front'),
    apron('apron-back', 'A2', 'Back apron', 1060, 'xzy', 'back'),
    apron('apron-left', 'A3', 'Left apron', 560, 'yzx', 'left'),
    apron('apron-right', 'A4', 'Right apron', 560, 'yzx', 'right'),
  ])
}

/** The same table driven by parameters and relationships. Resolves to TABLE_BOXES. */
export function parametricTableProject(): FurnitureProject {
  const literal = tableProject()
  const byId = new Map(literal.parts.map(p => [p.id, p]))
  const legX = { left: 'overhang', right: 'width - overhang - leg' }
  const legY = { front: 'overhang', back: 'depth - overhang - leg' }
  const leg = (id: string, x: string, y: string): FurniturePart => ({ ...byId.get(id)!, length: 'height - top_t', width: 'leg', thickness: 'leg', position: { x, y, z: 0 } })
  const apron = (id: string, length: string): FurniturePart => ({ ...byId.get(id)!, length, width: 'apron_h', thickness: 'apron_t', position: { x: 0, y: 0, z: 0 } })
  const face = (id: string, partId: string, f: BoxFace, targetId: string, targetFace: BoxFace, offset: DimExpr): FurnitureRelationship =>
    ({ id, kind: 'face', partId, face: f, target: { partId: targetId, face: targetFace }, offset })
  return tableBase([
    { ...byId.get('top')!, length: 'width', width: 'depth', thickness: 'top_t', position: { x: 0, y: 0, z: 'height - top_t' } },
    leg('leg-fl', legX.left, legY.front),
    leg('leg-fr', legX.right, legY.front),
    leg('leg-bl', legX.left, legY.back),
    leg('leg-br', legX.right, legY.back),
    apron('apron-front', 'width - 2*overhang - 2*leg'),
    apron('apron-back', 'width - 2*overhang - 2*leg'),
    apron('apron-left', 'depth - 2*overhang - 2*leg'),
    apron('apron-right', 'depth - 2*overhang - 2*leg'),
  ], {
    id: 'table-parametric',
    name: 'Parametric table',
    parameters: [
      { id: 'p-width', name: 'width', label: 'Overall width', value: 1200 },
      { id: 'p-depth', name: 'depth', label: 'Overall depth', value: 700 },
      { id: 'p-height', name: 'height', label: 'Overall height', value: 750 },
      { id: 'p-top-t', name: 'top_t', label: 'Top thickness', value: 25 },
      { id: 'p-leg', name: 'leg', label: 'Leg size', value: 45 },
      { id: 'p-overhang', name: 'overhang', label: 'Top overhang', value: 25 },
      { id: 'p-apron-h', name: 'apron_h', label: 'Apron height', value: 100 },
      { id: 'p-apron-t', name: 'apron_t', label: 'Apron thickness', value: 20 },
      { id: 'p-setback', name: 'setback', label: 'Apron setback', value: 6 },
    ],
    relationships: [
      face('r-front-x', 'apron-front', 'left', 'leg-fl', 'right', 0),
      face('r-front-y', 'apron-front', 'front', 'leg-fl', 'front', 'setback'),
      face('r-front-z', 'apron-front', 'top', 'leg-fl', 'top', 0),
      face('r-back-x', 'apron-back', 'left', 'leg-bl', 'right', 0),
      face('r-back-y', 'apron-back', 'back', 'leg-bl', 'back', '-setback'),
      face('r-back-z', 'apron-back', 'top', 'leg-bl', 'top', 0),
      face('r-left-y', 'apron-left', 'front', 'leg-fl', 'back', 0),
      face('r-left-x', 'apron-left', 'left', 'leg-fl', 'left', 'setback'),
      face('r-left-z', 'apron-left', 'top', 'leg-fl', 'top', 0),
      face('r-right-y', 'apron-right', 'front', 'leg-fr', 'back', 0),
      face('r-right-x', 'apron-right', 'right', 'leg-fr', 'right', '-setback'),
      face('r-right-z', 'apron-right', 'top', 'leg-fr', 'top', 0),
    ],
  })
}

// ---- Bookcase ------------------------------------------------------------------
//
// 800 wide, 300 deep, 1800 tall, in 18 mm birch plywood with a 6 mm plywood back.
// Top, bottom, and three fixed shelves sit in dados in the sides; the back sits in
// rabbets in the sides and is screwed to the top and bottom. The carcass is glued up
// first, then the back goes on.

export const BOOKCASE_BOXES: Record<string, Box> = {
  'side-l': { x: 0, y: 0, z: 0, sx: 18, sy: 300, sz: 1800 },
  'side-r': { x: 782, y: 0, z: 0, sx: 18, sy: 300, sz: 1800 },
  'bottom': { x: 18, y: 0, z: 0, sx: 764, sy: 294, sz: 18 },
  'top': { x: 18, y: 0, z: 1782, sx: 764, sy: 294, sz: 18 },
  'shelf-1': { x: 18, y: 0, z: 445.5, sx: 764, sy: 294, sz: 18 },
  'shelf-2': { x: 18, y: 0, z: 891, sx: 764, sy: 294, sz: 18 },
  'shelf-3': { x: 18, y: 0, z: 1336.5, sx: 764, sy: 294, sz: 18 },
  'back': { x: 18, y: 294, z: 0, sx: 764, sy: 6, sz: 1800 },
}

export function bookcaseSheetMaterials(): SheetMaterial[] {
  return [
    { id: 'birch-ply-18', name: 'Birch plywood 18 mm', thickness: 18, sheetLength: 2440, sheetWidth: 1220, pricePerSheet: 95, color: '#d9c08f', grain: 'length' },
    { id: 'birch-ply-6', name: 'Birch plywood 6 mm', thickness: 6, sheetLength: 2440, sheetWidth: 1220, pricePerSheet: 45, color: '#e3cfa4', grain: 'length' },
  ]
}

const BOOKCASE_JOINTS: FurnitureJoint[] = [
  ...['bottom', 'top', 'shelf-1', 'shelf-2', 'shelf-3'].flatMap(id => [
    joint(`dado-${id}-l`, 'dado', id, 'side-l', true, { depth: 6 }),
    joint(`dado-${id}-r`, 'dado', id, 'side-r', true, { depth: 6 }),
  ]),
  joint('rabbet-back-l', 'rabbet', 'back', 'side-l', false, { depth: 6 }),
  joint('rabbet-back-r', 'rabbet', 'back', 'side-r', false, { depth: 6 }),
  joint('screw-back-bottom', 'screw', 'back', 'bottom', false, { count: 4 }),
  joint('screw-back-top', 'screw', 'back', 'top', false, { count: 4 }),
]

function bookcaseBase(parts: FurniturePart[], extra: Partial<FurnitureProject> = {}): FurnitureProject {
  return {
    id: 'bookcase',
    name: 'Bookcase',
    parameters: [],
    parts,
    relationships: [],
    joints: BOOKCASE_JOINTS.map(j => ({ ...j, params: { ...j.params } })),
    subassemblies: [
      { id: 'sub-carcass', name: 'Carcass', label: 'C', partIds: ['side-l', 'side-r', 'bottom', 'top', 'shelf-1', 'shelf-2', 'shelf-3'], childIds: [] },
    ],
    sheetMaterials: bookcaseSheetMaterials(),
    maxBoardWidth: 140,
    updatedAt: UPDATED_AT,
    ...extra,
  }
}

export function bookcaseProject(): FurnitureProject {
  const sheet = (overrides: Partial<FurniturePart> & Pick<FurniturePart, 'id' | 'label' | 'name' | 'role' | 'length' | 'width' | 'thickness' | 'orientation'>, material = 'birch-ply-18') => {
    const box = BOOKCASE_BOXES[overrides.id]!
    return part({ kind: 'sheet', sheetMaterialId: material, position: { x: box.x, y: box.y, z: box.z }, ...overrides })
  }
  const panel = (id: string, label: string, name: string, role: FurniturePart['role']) =>
    sheet({ id, label, name, role, length: 764, width: 294, thickness: 18, orientation: 'xyz', visibleFaces: ['front'] })
  return bookcaseBase([
    sheet({ id: 'side-l', label: 'S1', name: 'Left side', role: 'side', length: 1800, width: 300, thickness: 18, orientation: 'zyx', visibleFaces: ['left', 'front'] }),
    sheet({ id: 'side-r', label: 'S2', name: 'Right side', role: 'side', length: 1800, width: 300, thickness: 18, orientation: 'zyx', visibleFaces: ['right', 'front'] }),
    panel('bottom', 'B1', 'Bottom', 'bottom'),
    panel('top', 'T1', 'Top', 'top'),
    panel('shelf-1', 'H1', 'Lower shelf', 'shelf'),
    panel('shelf-2', 'H2', 'Middle shelf', 'shelf'),
    panel('shelf-3', 'H3', 'Upper shelf', 'shelf'),
    sheet({ id: 'back', label: 'K1', name: 'Back', role: 'back', length: 1800, width: 764, thickness: 6, orientation: 'zxy', visibleFaces: [] }, 'birch-ply-6'),
  ])
}

/** The same bookcase driven by parameters and relationships (between, distribute,
 *  face). Resolves to BOOKCASE_BOXES. */
export function parametricBookcaseProject(): FurnitureProject {
  const literal = bookcaseProject()
  const byId = new Map(literal.parts.map(p => [p.id, p]))
  const panel = (id: string, z: string | number): FurniturePart => ({ ...byId.get(id)!, length: 'width - 2*t', width: 'depth - back_t', thickness: 't', position: { x: 0, y: 0, z } })
  const between = (id: string, partId: string): FurnitureRelationship =>
    ({ id, kind: 'between', partId, axis: 'x', from: { partId: 'side-l', face: 'right' }, to: { partId: 'side-r', face: 'left' } })
  return bookcaseBase([
    { ...byId.get('side-l')!, length: 'height', width: 'depth', thickness: 't', position: { x: 0, y: 0, z: 0 } },
    { ...byId.get('side-r')!, length: 'height', width: 'depth', thickness: 't', position: { x: 'width - t', y: 0, z: 0 } },
    panel('bottom', 0),
    panel('top', 0),
    panel('shelf-1', 0),
    panel('shelf-2', 0),
    panel('shelf-3', 0),
    { ...byId.get('back')!, length: 'height', width: 'width - 2*t', thickness: 'back_t', position: { x: 0, y: 0, z: 0 } },
  ], {
    id: 'bookcase-parametric',
    name: 'Parametric bookcase',
    parameters: [
      { id: 'p-width', name: 'width', label: 'Overall width', value: 800 },
      { id: 'p-depth', name: 'depth', label: 'Overall depth', value: 300 },
      { id: 'p-height', name: 'height', label: 'Overall height', value: 1800 },
      { id: 'p-t', name: 't', label: 'Panel thickness', value: 18 },
      { id: 'p-back-t', name: 'back_t', label: 'Back thickness', value: 6 },
    ],
    relationships: [
      between('r-bottom-x', 'bottom'),
      between('r-top-x', 'top'),
      { id: 'r-top-z', kind: 'face', partId: 'top', face: 'top', target: { partId: 'side-l', face: 'top' }, offset: 0 },
      between('r-shelf-1-x', 'shelf-1'),
      between('r-shelf-2-x', 'shelf-2'),
      between('r-shelf-3-x', 'shelf-3'),
      { id: 'r-shelves-z', kind: 'distribute', partIds: ['shelf-1', 'shelf-2', 'shelf-3'], axis: 'z', from: { partId: 'bottom', face: 'top' }, to: { partId: 'top', face: 'bottom' } },
      { id: 'r-back-x', kind: 'face', partId: 'back', face: 'left', target: { partId: 'side-l', face: 'right' }, offset: 0 },
      { id: 'r-back-y', kind: 'face', partId: 'back', face: 'back', target: { partId: 'side-l', face: 'back' }, offset: 0 },
    ],
  })
}

// ---- Resolved parts for consumers that do not resolve ---------------------------

/** ResolvedPart[] for a literal project and its expected boxes, without running the
 *  resolver: for projection, drawing, and viewport tests that only consume boxes. */
export function resolvedPartsOf(project: FurnitureProject, boxes: Record<string, Box>, context: FurnitureContext = furnitureContext()): ResolvedPart[] {
  return project.parts.map(p => {
    const box = boxes[p.id]
    if (!box || typeof p.length !== 'number' || typeof p.width !== 'number' || typeof p.thickness !== 'number') {
      throw new Error(`resolvedPartsOf needs a literal part with a box: ${p.id}`)
    }
    const color = p.color
      ?? context.woods.find(wood => wood.id === p.speciesId)?.color
      ?? project.sheetMaterials.find(material => material.id === p.sheetMaterialId)?.color
      ?? '#b9a48a'
    return { id: p.id, part: p, size: { length: p.length, width: p.width, thickness: p.thickness }, box: { ...box }, color, drivenAxes: [] }
  })
}

export function tableResolvedParts(): ResolvedPart[] {
  return resolvedPartsOf(tableProject(), TABLE_BOXES)
}

export function bookcaseResolvedParts(): ResolvedPart[] {
  return resolvedPartsOf(bookcaseProject(), BOOKCASE_BOXES)
}
