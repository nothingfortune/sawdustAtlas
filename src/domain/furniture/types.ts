import type { BuildAllowances, WoodSpecies } from '../../types'
import type { SetupValue, ToolCategory } from '../instructions/types'
import type { WarningSeverity } from '../workspaceWarnings'

// Furniture project contracts (holistic strategy Phases 4 to 6). A furniture project is
// a canonical list of rectangular parts plus named parameters, relationships, joinery
// intent, and subassemblies. Everything else (resolved boxes, drawings, the 3D scene,
// the parts list, the instruction plan) is derived from it and never stored. Pure types
// plus vocabulary constants: no React, no DOM, no three.js.
//
// Rules every module relies on (docs/superpowers/specs/2026-10-10-furniture-modeler-design.md):
// - Millimeters at full float precision. Rounding happens only at display.
// - World axes: x runs left to right seen from the front, y runs front to back, z runs
//   up. The floor is z = 0. A part's position is the min corner (left, front, bottom)
//   of its box.
// - Parts are rectangular and axis-aligned (strategy: begin with rectangular stock).
// - A part's entered size is never changed by relationships, snapping, or joinery.
//   Relationships drive positions only. Joinery adds explicit, reported cut allowances
//   on top of the modeled size; it never rewrites the modeled size.
// - Relationships never imply joinery, and joinery never implies relationships.

// ---- Vocabulary ----------------------------------------------------------------

export type Axis = 'x' | 'y' | 'z'

/** The world axes a part's length, width, and thickness run along, in that order.
 *  'zxy' is a standing leg (length up, width left to right, thickness front to back);
 *  'xyz' is a top lying flat; 'xzy' is a front apron; 'zyx' is a cabinet side. */
export type PartOrientation = 'xyz' | 'xzy' | 'yxz' | 'yzx' | 'zxy' | 'zyx'

export const PART_ORIENTATIONS: readonly PartOrientation[] = ['xyz', 'xzy', 'yxz', 'yzx', 'zxy', 'zyx']

/** A world-space side of a box: left -x, right +x, front -y, back +y, bottom -z, top +z. */
export type BoxFace = 'left' | 'right' | 'front' | 'back' | 'bottom' | 'top'

export const BOX_FACES: readonly BoxFace[] = ['left', 'right', 'front', 'back', 'bottom', 'top']

/** A length in mm: a literal number, or an expression over the project's parameters
 *  such as "height - top_thickness" or "0.75in". Grammar in expressions.ts. */
export type DimExpr = number | string

export interface Vec3Expr {
  x: DimExpr
  y: DimExpr
  z: DimExpr
}

// ---- Project -------------------------------------------------------------------

export interface FurnitureParameter {
  id: string
  /** Identifier used in expressions: [A-Za-z_][A-Za-z0-9_]*, unique within the project. */
  name: string
  /** Human label, e.g. "Overall height". */
  label: string
  /** May reference other parameters; a cycle is an error, not a guess. */
  value: DimExpr
}

export type FurniturePartKind = 'solid' | 'sheet' | 'hardware'

export type FurniturePartRole =
  | 'leg'
  | 'apron'
  | 'rail'
  | 'stile'
  | 'stretcher'
  | 'top'
  | 'side'
  | 'bottom'
  | 'shelf'
  | 'back'
  | 'divider'
  | 'face-frame'
  | 'door'
  | 'drawer-front'
  | 'cleat'
  | 'kick'
  | 'panel'
  | 'hardware'
  | 'other'

export interface FurniturePart {
  id: string
  /** Mark written on the physical part at the bench (stress test F7), e.g. "L1", "A2". */
  label: string
  /** Human name, e.g. "Front left leg". */
  name: string
  role: FurniturePartRole
  kind: FurniturePartKind
  /** Modeled size: the finished, visible part. For solid wood, length runs along the grain. */
  length: DimExpr
  width: DimExpr
  thickness: DimExpr
  orientation: PartOrientation
  /** Min corner. An axis driven by a relationship ignores the stored value. */
  position: Vec3Expr
  /** Solid parts: a wood library species id. */
  speciesId?: string
  /** Sheet parts: an id in `FurnitureProject.sheetMaterials`. */
  sheetMaterialId?: string
  /** Faces seen on the finished piece; the instructions ask for the best stock there. */
  visibleFaces: BoxFace[]
  /** Display color override (#rrggbb). Otherwise the species or sheet material color. */
  color?: string
  /** Hardware parts: what to buy, e.g. "Drawer slide". */
  hardwareName?: string
}

export interface SheetMaterial {
  id: string
  /** E.g. "Birch plywood 18 mm" — free text, not parsed. */
  name: string
  thickness: number
  sheetLength: number
  sheetWidth: number
  pricePerSheet: number
  color: string
  /** Whether the face grain runs along the sheet's length. MDF and similar: 'none'. */
  grain: 'length' | 'none'
}

/** One side of one part, as a relationship anchor. */
export interface FaceRef {
  partId: string
  face: BoxFace
}

/** The part's `face` plane sits at the target face plane plus `offset` along that axis
 *  (positive is toward +axis). `face` and `target.face` must lie on the same axis:
 *  opposite faces put parts against each other, equal faces align them flush. */
export interface FaceRelationship {
  id: string
  kind: 'face'
  partId: string
  face: BoxFace
  target: FaceRef
  offset: DimExpr
}

/** Centers the part on the target part along `axis`, plus `offset`. */
export interface CenterRelationship {
  id: string
  kind: 'center'
  partId: string
  axis: Axis
  targetId: string
  offset: DimExpr
}

/** Centers the part in the gap between two face planes along `axis`. It never resizes
 *  the part: a part that does not fill the gap leaves clearance, one that is too big
 *  collides (and validation says so). */
export interface BetweenRelationship {
  id: string
  kind: 'between'
  partId: string
  axis: Axis
  from: FaceRef
  to: FaceRef
}

/** Spaces the parts along `axis` between two face planes with equal clear gaps, in
 *  array order (shelves between a bottom and a top). */
export interface DistributeRelationship {
  id: string
  kind: 'distribute'
  partIds: string[]
  axis: Axis
  from: FaceRef
  to: FaceRef
}

export type FurnitureRelationship = FaceRelationship | CenterRelationship | BetweenRelationship | DistributeRelationship

export type JointKind =
  | 'mortise-tenon'
  | 'loose-tenon'
  | 'dowel'
  | 'dado'
  | 'rabbet'
  | 'groove'
  | 'pocket-screw'
  | 'screw'
  | 'tabletop-fastener'
  | 'butt'

export const JOINT_KINDS: readonly JointKind[] = ['mortise-tenon', 'loose-tenon', 'dowel', 'dado', 'rabbet', 'groove', 'pocket-screw', 'screw', 'tabletop-fastener', 'butt']

/** Kind-specific sizes, mm (count is a plain number). Absent values take the defaults in
 *  joinery.ts, which are tagged as assumptions wherever they surface. */
export interface JointParams {
  /** Tenon length; dado, rabbet, or groove depth; loose-tenon mortise depth per part;
   *  dowel hole depth per part. */
  depth?: number
  /** Tenon or loose-tenon thickness. */
  thickness?: number
  /** Tenon or loose-tenon width. */
  width?: number
  /** Dowel or screw diameter. */
  diameter?: number
  /** Dowels, screws, loose tenons, or fasteners in this joint. */
  count?: number
  /** Tenon shoulder, mm, on each side across the tenon width. */
  shoulder?: number
}

export interface FurnitureJoint {
  id: string
  kind: JointKind
  /** The part that is inserted or fastened: the tenoned apron, the shelf in a dado,
   *  the panel in a groove, the top on its fasteners. */
  partId: string
  /** The part that receives it: the mortised leg, the side with the dado. */
  targetId: string
  glue: boolean
  params: JointParams
}

/** A unit that is assembled (and usually glued) before it joins its parent. The final
 *  assembly is implicit: every top-level subassembly plus every part in none. */
export interface FurnitureSubassembly {
  id: string
  /** E.g. "Front leg frame". */
  name: string
  /** Mark written on the assembled unit, e.g. "F". */
  label: string
  partIds: string[]
  /** Subassemblies built first and joined into this one, in assembly order. */
  childIds: string[]
}

export interface FurnitureProject {
  id: string
  name: string
  parameters: FurnitureParameter[]
  parts: FurniturePart[]
  relationships: FurnitureRelationship[]
  joints: FurnitureJoint[]
  subassemblies: FurnitureSubassembly[]
  sheetMaterials: SheetMaterial[]
  /** Widest solid board assumed available. A wider solid part becomes an edge-glued
   *  panel in the parts list and the instructions. */
  maxBoardWidth: number
  /** Template that created the project. Informational only: after creation the project
   *  is ordinary editable data and nothing reads this to change behavior. */
  templateId?: string
  updatedAt: string
}

// ---- Derived ---------------------------------------------------------------------

export interface FurnitureContext {
  woods: readonly WoodSpecies[]
  /** Shop-wide milling allowances: rough sizes add these to cut sizes. */
  allowances: BuildAllowances
}

/** An axis-aligned box: min corner plus extent along each world axis, mm. */
export interface Box {
  x: number
  y: number
  z: number
  sx: number
  sy: number
  sz: number
}

export interface PartDims {
  length: number
  width: number
  thickness: number
}

export interface ResolvedPart {
  id: string
  part: FurniturePart
  /** Evaluated modeled size. */
  size: PartDims
  box: Box
  /** The color override, else the species or sheet material color, else a neutral. */
  color: string
  /** Position axes a relationship drives; the stored position is ignored on these. */
  drivenAxes: Axis[]
}

export interface ResolvedFurniture {
  project: FurnitureProject
  /** Evaluated parameters by name. A parameter that fails to evaluate is absent. */
  parameters: Record<string, number>
  /** Parts whose size and position resolved, in project order. A part that failed is
   *  absent here and explained in `issues`. */
  parts: ResolvedPart[]
  /** Expression, parameter, and relationship issues found while resolving. */
  issues: FurnitureIssue[]
  /** Bounding box of every resolved part; null when none resolved. */
  bounds: Box | null
}

export type FurnitureIssueCode =
  | 'expression-invalid'
  | 'unknown-parameter'
  | 'duplicate-parameter'
  | 'parameter-cycle'
  | 'dimension-not-positive'
  | 'relationship-invalid'
  | 'relationship-conflict'
  | 'relationship-cycle'
  | 'parts-collide'
  | 'parts-overlap-at-joint'
  | 'part-unattached'
  | 'part-floating'
  | 'joint-invalid'
  | 'joint-parts-not-touching'
  | 'joint-params-invalid'
  | 'cross-grain-glue'
  | 'end-grain-glue'
  | 'material-missing'
  | 'sheet-thickness-mismatch'
  | 'part-exceeds-sheet'
  | 'subassembly-invalid'
  | 'duplicate-label'

export interface FurnitureIssue {
  code: FurnitureIssueCode
  severity: WarningSeverity
  message: string
  partIds?: string[]
  jointId?: string
  relationshipId?: string
  parameterId?: string
  subassemblyId?: string
  /** The input that fixes it, for UI focus: 'length', 'width', 'thickness',
   *  'position.x', 'position.y', 'position.z', 'value', or a JointParams key. */
  field?: string
}

/** Extra material a joint needs beyond the modeled size (a tenon, the part of a shelf
 *  that sits in a dado). Reported line by line, never folded silently into the size. */
export interface CutAllowance {
  jointId: string
  /** Part-local dimension that grows. */
  dimension: 'length' | 'width'
  amount: number
  /** Plain words, no unit-bearing numbers: "Tenon into the front left leg". */
  reason: string
}

export interface PartCutSize {
  partId: string
  modeled: PartDims
  allowances: CutAllowance[]
  /** Modeled plus allowances. */
  cut: PartDims
}

export type JointOperationName =
  | 'tenon'
  | 'mortise'
  | 'dado'
  | 'rabbet'
  | 'groove'
  | 'dowel-holes'
  | 'pocket-holes'
  | 'pilot-holes'
  | 'fastener-slots'

export interface JointOperation {
  /** Stable: `${jointId}:${partId}:${operation}`. */
  key: string
  jointId: string
  /** The part this operation machines. */
  partId: string
  operation: JointOperationName
  kind: 'machine-joinery' | 'drill'
  tool: ToolCategory
  /** Repetitions on this part for this joint (dowel holes, pocket holes, slots). */
  count: number
  settings: SetupValue[]
  /** Operations with the same setupKey share one machine setup and batch into one step. */
  setupKey: string
}

export interface HardwareLine {
  /** Stable, from the hardware identity, e.g. 'tabletop-fastener', 'dowel:8x40'. */
  key: string
  name: string
  quantity: number
  /** Joints or hardware parts this line comes from. */
  sourceIds: string[]
}

export interface PartsListLine {
  /** Stable, from material plus cut size, so equal parts group into one line. */
  key: string
  partIds: string[]
  labels: string[]
  name: string
  role: FurniturePartRole
  kind: 'solid' | 'sheet'
  materialId: string
  materialName: string
  quantity: number
  modeled: PartDims
  allowances: CutAllowance[]
  cut: PartDims
  /** Solid parts: cut size plus milling allowances. Sheet parts: null. */
  rough: PartDims | null
  /** Rough board feet for the whole line (solid); 0 for sheet parts. */
  boardFeet: number
  /** Solid parts wider than maxBoardWidth are edge-glued from `boards` boards. */
  panel?: { boards: number; boardWidth: number }
}

export interface SpeciesTotal {
  speciesId: string
  name: string
  boardFeet: number
  cost: number
}

export interface SheetTotal {
  sheetMaterialId: string
  name: string
  /** Sum of cut part areas, mm². */
  partArea: number
  /** An estimate (area plus a waste factor), not a nested layout. */
  sheets: number
  cost: number
}

export interface FurniturePartsList {
  lines: PartsListLine[]
  species: SpeciesTotal[]
  sheets: SheetTotal[]
  hardware: HardwareLine[]
  totalCost: number
  /** Plain-language assumptions behind the numbers (waste factor, allowances). */
  assumptions: string[]
}

/** A template generates an ordinary editable project. A table never stays an opaque
 *  table object after creation (strategy, design workspace). */
export interface TemplateParameter {
  name: string
  label: string
  defaultValue: number
  min: number
  max: number
}

export interface FurnitureTemplate {
  id: string
  name: string
  description: string
  parameters: TemplateParameter[]
  /** Pure: same values and ids give the same project. `values` may omit parameters
   *  (defaults apply); `projectId` and `updatedAt` are inputs because the domain never
   *  reads the clock or generates random ids. */
  create(values: Partial<Record<string, number>>, projectId: string, updatedAt: string): FurnitureProject
}
