import type { SetupValue, ToolCategory } from '../instructions/types'
import { HIGH_FACE, LOW_FACE } from './faces'
import { TOUCH_TOLERANCE, contactBetween, overlapVolume, partSurfaceAt } from './geometry'
import type {
  Axis, BoxFace, CutAllowance, FurnitureIssue, FurnitureJoint, FurniturePart, HardwareLine, JointKind, JointOperation, JointOperationName, JointParams, PartCutSize, ResolvedFurniture,
  ResolvedPart,
} from './types'

// Joinery intent turned into numbers: cut allowances, machine operations, hardware, and
// the checks that say a joint cannot be made. Pure millimeter math, nothing rounds.
//
// The modeled size is the visible size. A joint adds a reported CutAllowance on top of it
// and never edits it. Every value the woodworker did not enter comes from a named
// default below and reaches a SetupValue with source 'assumption'; entered values are
// 'design'. A value computed from both counts as an assumption.

// ---- Defaults (assumptions) -------------------------------------------------------

/** Tenon and loose-tenon thickness: a third of the part's thickness, the classic rule. */
export const DEFAULT_TENON_THICKNESS_FRACTION = 1 / 3
/** Tenon length: two thirds of the target's extent along the joint, leaving a third of a leg behind a stopped mortise. */
export const DEFAULT_TENON_DEPTH_FRACTION = 2 / 3
/** Longest default tenon: a thick post does not get a tenon as long as its width. */
export const MAX_DEFAULT_TENON_DEPTH = 50
/** Tenon shoulder on each side across the tenon width, held to a quarter of the part when the part is narrow. */
export const DEFAULT_TENON_SHOULDER = 6
/** Extra mortise depth beyond the tenon so glue and the tenon's end have room. */
export const MORTISE_CLEARANCE = 2
/** Dado, rabbet, and groove depth: a third of the target's thickness at the joint. */
export const DEFAULT_SOCKET_DEPTH_FRACTION = 1 / 3
/** Dowel diameter: a third of the thinner part's smallest dimension. */
export const DEFAULT_DOWEL_DIAMETER_FRACTION = 1 / 3
/** A dowel wider than this share of the thinner part's smallest dimension leaves walls too thin. */
export const MAX_DOWEL_DIAMETER_FRACTION = 1 / 2
/** Dowel hole depth per part, in dowel diameters. */
export const DEFAULT_DOWEL_DEPTH_FACTOR = 3
/** Default hole and mortise depths never pass this share of the shallower part's extent along the joint. */
export const MAX_DEFAULT_HOLE_DEPTH_FRACTION = 1 / 2
/** One dowel per this much contact length. */
export const DEFAULT_DOWEL_SPACING = 100
/** Loose tenon width, held to the contact length. */
export const DEFAULT_LOOSE_TENON_WIDTH = 50
/** Loose tenon mortise depth per part. */
export const DEFAULT_LOOSE_TENON_DEPTH = 25
/** One loose tenon per this much contact length. */
export const DEFAULT_LOOSE_TENON_SPACING = 150
/** Wood screw diameter, a #8. */
export const DEFAULT_SCREW_DIAMETER = 4
/** Pilot hole diameter as a share of the screw diameter. */
export const PILOT_HOLE_FRACTION = 0.7
/** One screw per this much contact length. */
export const DEFAULT_SCREW_SPACING = 150
/** Pocket-hole stepped bit diameter, the common 3/8 inch. */
export const DEFAULT_POCKET_BIT_DIAMETER = 9.5
/** One pocket screw per this much contact length. */
export const DEFAULT_POCKET_SCREW_SPACING = 150
/** One tabletop fastener per this much contact length. */
export const DEFAULT_FASTENER_SPACING = 400
/** Slot cut for a tabletop fastener: kerf width and depth. */
export const DEFAULT_FASTENER_SLOT_WIDTH = 3
export const DEFAULT_FASTENER_SLOT_DEPTH = 10
/** Glued cross-grain contact wider than this will crack with seasonal movement. */
export const CROSS_GRAIN_GLUE_LIMIT = 50

const AXES: readonly Axis[] = ['x', 'y', 'z']
const SIZE_KEY = { x: 'sx', y: 'sy', z: 'sz' } as const

/** Plain names for the joint kinds, used in issue messages and the joint editor. */
export const JOINT_KIND_LABELS: Readonly<Record<JointKind, string>> = {
  'mortise-tenon': 'Mortise and tenon',
  'loose-tenon': 'Loose tenon',
  'dowel': 'Dowel',
  'dado': 'Dado',
  'rabbet': 'Rabbet',
  'groove': 'Groove',
  'pocket-screw': 'Pocket screw',
  'screw': 'Screw',
  'tabletop-fastener': 'Tabletop fastener',
  'butt': 'Butt',
}

// Joints that grow the inserted part: the end or edge that enters the target.
const SOCKET_KINDS: ReadonlySet<JointKind> = new Set(['mortise-tenon', 'dado', 'rabbet', 'groove'])

const OPERATION_TOOL: Record<JointOperationName, ToolCategory> = {
  'tenon': 'table-saw',
  'mortise': 'mortiser',
  'dado': 'table-saw',
  'rabbet': 'router-table',
  'groove': 'table-saw',
  'dowel-holes': 'doweling-jig',
  'pocket-holes': 'pocket-hole-jig',
  'pilot-holes': 'drill',
  'fastener-slots': 'router',
}

const DRILL_OPERATIONS: ReadonlySet<JointOperationName> = new Set(['dowel-holes', 'pocket-holes', 'pilot-holes'])

// ---- Contact ----------------------------------------------------------------------

/** How the part meets its target: the world axis of the joint, the part's face toward
 *  the target, and the longer side of the shared rectangle. */
interface Engagement {
  axis: Axis
  partFace: BoxFace
  longSide: number
}

function shared(a: ResolvedPart, b: ResolvedPart, axis: Axis): number {
  return Math.min(a.box[axis] + a.box[SIZE_KEY[axis]], b.box[axis] + b.box[SIZE_KEY[axis]]) - Math.max(a.box[axis], b.box[axis])
}

/** Parts that touch face to face use that contact. Parts modeled overlapping (the
 *  visible tenon drawn inside the leg) are engaged along the axis where the part sticks
 *  out of the target (the least overlapped one if several), from the side the part sits
 *  on; none of this resizes anything. Null when the parts neither touch nor overlap. */
function engagementOf(part: ResolvedPart, target: ResolvedPart): Engagement | null {
  const contact = contactBetween(part.box, target.box)
  if (contact) return { axis: contact.axis, partFace: contact.aFace, longSide: Math.max(contact.rect.u1 - contact.rect.u0, contact.rect.v1 - contact.rect.v0) }
  if (overlapVolume(part.box, target.box) === 0) return null
  const sticksOut = (along: Axis) => part.box[along] < target.box[along] - TOUCH_TOLERANCE
    || part.box[along] + part.box[SIZE_KEY[along]] > target.box[along] + target.box[SIZE_KEY[along]] + TOUCH_TOLERANCE
  const candidates = AXES.filter(sticksOut)
  const axis = (candidates.length > 0 ? candidates : AXES).reduce((least, next) => (shared(part, target, next) < shared(part, target, least) ? next : least))
  const center = (resolved: ResolvedPart) => resolved.box[axis] + resolved.box[SIZE_KEY[axis]] / 2
  const longSide = Math.max(...AXES.filter(other => other !== axis).map(other => shared(part, target, other)))
  return { axis, partFace: center(part) < center(target) ? HIGH_FACE[axis] : LOW_FACE[axis], longSide }
}

function engagedDimension(part: ResolvedPart, engagement: Engagement): 'length' | 'width' | 'thickness' {
  const surface = partSurfaceAt(part.part.orientation, engagement.partFace)
  return surface === 'end' ? 'length' : surface === 'edge' ? 'width' : 'thickness'
}

// ---- Joint plans ------------------------------------------------------------------

interface Sized { value: number; entered: boolean }

function sized(entered: number | undefined, fallback: number): Sized {
  return entered === undefined ? { value: fallback, entered: false } : { value: entered, entered: true }
}

function setting(label: string, value: number, designed: boolean): SetupValue {
  return { label, value, unit: 'mm', source: designed ? 'design' : 'assumption' }
}

/** Identity only: tolerant of float noise so equal settings batch. */
function keyNumber(value: number): string {
  return String(Number(value.toFixed(3)))
}

function operation(joint: FurnitureJoint, partId: string, name: JointOperationName, count: number, settings: SetupValue[], tool: ToolCategory = OPERATION_TOOL[name]): JointOperation {
  // The source is part of the key: a batch must not show an assumption as a design value.
  const setupKey = [name, tool, ...settings.map(value => `${value.label}=${keyNumber(value.value)}${value.unit}:${value.source}`)].join('|')
  return { key: `${joint.id}:${partId}:${name}`, jointId: joint.id, partId, operation: name, kind: DRILL_OPERATIONS.has(name) ? 'drill' : 'machine-joinery', tool, count, settings, setupKey }
}

interface HardwareDraft { key: string; name: string; quantity: number }

/** A joint parameter's effective value: what the woodworker entered, or the default
 *  (an assumption) when `entered` is false. */
export interface JointValue {
  key: JointParamKey
  value: number
  entered: boolean
}

export type JointParamKey = keyof JointParams

/** The parameters each joint kind takes, in the order the editor shows them. */
export const JOINT_PARAMETERS: Readonly<Record<JointKind, readonly JointParamKey[]>> = {
  'mortise-tenon': ['thickness', 'width', 'shoulder', 'depth'],
  'loose-tenon': ['thickness', 'width', 'depth', 'count'],
  'dowel': ['diameter', 'depth', 'count'],
  'dado': ['depth'],
  'rabbet': ['depth'],
  'groove': ['depth'],
  'pocket-screw': ['count'],
  'screw': ['diameter', 'count'],
  'tabletop-fastener': ['count'],
  'butt': [],
}

interface Usable {
  part: ResolvedPart
  target: ResolvedPart
  engagement: Engagement
  allowance: { dimension: 'length' | 'width'; amount: number; reason: string } | null
  operations: JointOperation[]
  hardware: HardwareDraft | null
  values: JointValue[]
}

interface JointPlan {
  joint: FurnitureJoint
  issues: FurnitureIssue[]
  /** Present when the joint has no errors. A joint whose parts did not resolve has
   *  neither issues here (the part explains itself) nor a usable plan. */
  usable?: Usable
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
}

function smallestDimension(part: ResolvedPart): number {
  return Math.min(part.size.length, part.size.width, part.size.thickness)
}

function planJoints(resolved: ResolvedFurniture): JointPlan[] {
  const projectParts = new Map(resolved.project.parts.map(part => [part.id, part]))
  const byId = new Map(resolved.parts.map(part => [part.id, part]))
  return resolved.project.joints.map(joint => planJoint(joint, projectParts, byId))
}

function planJoint(joint: FurnitureJoint, projectParts: ReadonlyMap<string, FurniturePart>, byId: ReadonlyMap<string, ResolvedPart>): JointPlan {
  const partIds = [joint.partId, joint.targetId].filter((id, index, ids) => projectParts.has(id) && ids.indexOf(id) === index)
  const fail = (code: FurnitureIssue['code'], message: string, field?: string): JointPlan => ({
    joint,
    issues: [{ code, severity: 'error', message, partIds, jointId: joint.id, ...(field ? { field } : {}) }],
  })

  const part = projectParts.get(joint.partId)
  const target = projectParts.get(joint.targetId)
  if (!part || !target) return fail('joint-invalid', `Joint ${joint.id} refers to a part that no longer exists.`)
  const label = `${JOINT_KIND_LABELS[joint.kind]} joint, ${part.name} to ${target.name}`
  if (joint.partId === joint.targetId) return fail('joint-invalid', `${label}: a part cannot be joined to itself.`)
  if (part.kind === 'hardware' || target.kind === 'hardware') return fail('joint-invalid', `${label}: hardware is bought, not joined. Join the wooden parts instead.`)
  if (joint.kind === 'tabletop-fastener' && joint.glue) return fail('joint-invalid', `${label}: a tabletop fastener lets the top move, so it cannot be glued.`, 'glue')

  const resolvedPart = byId.get(joint.partId)
  const resolvedTarget = byId.get(joint.targetId)
  if (!resolvedPart || !resolvedTarget) return { joint, issues: [] }

  const engagement = engagementOf(resolvedPart, resolvedTarget)
  if (!engagement) return fail('joint-parts-not-touching', `${label}: the parts do not touch. Move them together or remove the joint.`)

  const engaged = engagedDimension(resolvedPart, engagement)
  if (SOCKET_KINDS.has(joint.kind) && engaged === 'thickness') {
    return fail('joint-invalid', `${label}: this joint needs an end or an edge of ${part.name} against ${target.name}, not a face.`)
  }

  const params = joint.params
  const paramFail = (field: string, message: string) => fail('joint-params-invalid', `${label}: ${message}`, field)
  for (const field of ['depth', 'thickness', 'width', 'diameter'] as const) {
    const value = params[field]
    if (value !== undefined && !(Number.isFinite(value) && value > 0)) return paramFail(field, `${field} must be greater than zero.`)
  }
  if (params.shoulder !== undefined && !(Number.isFinite(params.shoulder) && params.shoulder >= 0)) return paramFail('shoulder', 'shoulder cannot be negative.')
  if (params.count !== undefined && !(Number.isInteger(params.count) && params.count >= 1)) return paramFail('count', 'count must be a whole number of at least one.')

  const along = (resolved: ResolvedPart) => resolved.box[SIZE_KEY[engagement.axis]]
  const targetExtent = along(resolvedTarget)
  const shallowest = Math.min(along(resolvedPart), targetExtent)
  const thinner = Math.min(smallestDimension(resolvedPart), smallestDimension(resolvedTarget))
  const countFor = (spacing: number) => sized(params.count, Math.max(1, Math.round(engagement.longSide / spacing)))
  const value = (key: JointParamKey, { value: amount, entered }: Sized): JointValue => ({ key, value: amount, entered })
  const usable = (extra: Partial<Pick<Usable, 'allowance' | 'operations' | 'hardware' | 'values'>>): JointPlan => ({
    joint,
    issues: [],
    usable: { part: resolvedPart, target: resolvedTarget, engagement, allowance: null, operations: [], hardware: null, values: [], ...extra },
  })

  switch (joint.kind) {
    case 'mortise-tenon': {
      const across = { thickness: resolvedPart.size.thickness, width: engaged === 'length' ? resolvedPart.size.width : resolvedPart.size.length }
      const thickness = sized(params.thickness, across.thickness * DEFAULT_TENON_THICKNESS_FRACTION)
      const shoulder = sized(params.shoulder, Math.min(DEFAULT_TENON_SHOULDER, across.width / 4))
      // An entered width wins over the shoulder.
      const width: Sized = params.width !== undefined ? { value: params.width, entered: true } : { value: across.width - 2 * shoulder.value, entered: shoulder.entered }
      const depth = sized(params.depth, Math.min(targetExtent * DEFAULT_TENON_DEPTH_FRACTION, MAX_DEFAULT_TENON_DEPTH))
      if (thickness.value > across.thickness) return paramFail('thickness', 'the tenon is thicker than the part it is cut on.')
      if (width.value > across.width) return paramFail('width', 'the tenon is wider than the part it is cut on.')
      if (width.value <= 0) return paramFail('shoulder', 'the shoulders leave no room for the tenon.')
      if (depth.value + MORTISE_CLEARANCE >= targetExtent) return paramFail('depth', `the mortise would go all the way through ${target.name}.`)
      return usable({
        values: [value('thickness', thickness), value('width', width), value('shoulder', shoulder), value('depth', depth)],
        allowance: { dimension: engaged === 'length' ? 'length' : 'width', amount: depth.value, reason: `Tenon into the ${lowerFirst(target.name)}` },
        operations: [
          operation(joint, joint.partId, 'tenon', 1, [
            setting('Tenon thickness', thickness.value, thickness.entered),
            setting('Tenon width', width.value, width.entered),
            setting('Tenon length', depth.value, depth.entered),
          ]),
          operation(joint, joint.targetId, 'mortise', 1, [
            setting('Mortise width', thickness.value, thickness.entered),
            setting('Mortise length', width.value, width.entered),
            // The clearance is an assumption, so the depth is too.
            setting('Mortise depth', depth.value + MORTISE_CLEARANCE, false),
          ]),
        ],
      })
    }
    case 'dado':
    case 'rabbet':
    case 'groove': {
      const depth = sized(params.depth, targetExtent * DEFAULT_SOCKET_DEPTH_FRACTION)
      if (depth.value >= targetExtent) return paramFail('depth', `the ${joint.kind} would go all the way through ${target.name}.`)
      const name = joint.kind
      return usable({
        values: [value('depth', depth)],
        allowance: { dimension: engaged === 'length' ? 'length' : 'width', amount: depth.value, reason: `Sits in a ${name} in the ${lowerFirst(target.name)}` },
        operations: [operation(joint, joint.targetId, name, 1, [
          setting(`${JOINT_KIND_LABELS[joint.kind]} width`, resolvedPart.size.thickness, true),
          setting(`${JOINT_KIND_LABELS[joint.kind]} depth`, depth.value, depth.entered),
        ])],
      })
    }
    case 'dowel': {
      const diameter = sized(params.diameter, thinner * DEFAULT_DOWEL_DIAMETER_FRACTION)
      const depth = sized(params.depth, Math.min(diameter.value * DEFAULT_DOWEL_DEPTH_FACTOR, shallowest * MAX_DEFAULT_HOLE_DEPTH_FRACTION))
      const count = countFor(DEFAULT_DOWEL_SPACING)
      if (diameter.value > thinner * MAX_DOWEL_DIAMETER_FRACTION) return paramFail('diameter', 'the dowel is too wide for the thinner part.')
      if (depth.value >= shallowest) return paramFail('depth', 'the dowel holes would go all the way through a part.')
      const settings = [setting('Hole diameter', diameter.value, diameter.entered), setting('Hole depth', depth.value, depth.entered)]
      return usable({
        values: [value('diameter', diameter), value('depth', depth), value('count', count)],
        operations: [
          operation(joint, joint.partId, 'dowel-holes', count.value, settings),
          operation(joint, joint.targetId, 'dowel-holes', count.value, settings),
        ],
        hardware: { key: `dowel:${keyNumber(diameter.value)}x${keyNumber(2 * depth.value)}`, name: 'Dowel', quantity: count.value },
      })
    }
    case 'loose-tenon': {
      const thickness = sized(params.thickness, thinner * DEFAULT_TENON_THICKNESS_FRACTION)
      const width = sized(params.width, Math.min(DEFAULT_LOOSE_TENON_WIDTH, engagement.longSide))
      const depth = sized(params.depth, Math.min(DEFAULT_LOOSE_TENON_DEPTH, shallowest * MAX_DEFAULT_HOLE_DEPTH_FRACTION))
      const count = countFor(DEFAULT_LOOSE_TENON_SPACING)
      if (thickness.value > thinner) return paramFail('thickness', 'the loose tenon is thicker than the thinner part.')
      if (width.value > engagement.longSide) return paramFail('width', 'the loose tenon is wider than the joint.')
      if (depth.value >= shallowest) return paramFail('depth', 'the mortises would go all the way through a part.')
      const settings = [
        setting('Mortise width', thickness.value, thickness.entered),
        setting('Mortise length', width.value, width.entered),
        setting('Mortise depth', depth.value, depth.entered),
      ]
      return usable({
        values: [value('thickness', thickness), value('width', width), value('depth', depth), value('count', count)],
        operations: [
          operation(joint, joint.partId, 'mortise', count.value, settings, 'loose-tenon-joiner'),
          operation(joint, joint.targetId, 'mortise', count.value, settings, 'loose-tenon-joiner'),
        ],
        hardware: { key: `loose-tenon:${keyNumber(thickness.value)}x${keyNumber(width.value)}x${keyNumber(2 * depth.value)}`, name: 'Loose tenon', quantity: count.value },
      })
    }
    case 'pocket-screw': {
      const count = countFor(DEFAULT_POCKET_SCREW_SPACING)
      return usable({
        values: [value('count', count)],
        operations: [operation(joint, joint.partId, 'pocket-holes', count.value, [
          setting('Bit diameter', DEFAULT_POCKET_BIT_DIAMETER, false),
          setting('Stock thickness', resolvedPart.size.thickness, true),
        ])],
        hardware: { key: 'pocket-screw', name: 'Pocket screw', quantity: count.value },
      })
    }
    case 'screw': {
      const diameter = sized(params.diameter, DEFAULT_SCREW_DIAMETER)
      const count = countFor(DEFAULT_SCREW_SPACING)
      return usable({
        values: [value('diameter', diameter), value('count', count)],
        operations: [operation(joint, joint.partId, 'pilot-holes', count.value, [
          setting('Screw diameter', diameter.value, diameter.entered),
          setting('Pilot hole diameter', diameter.value * PILOT_HOLE_FRACTION, false),
        ])],
        hardware: { key: `screw:${keyNumber(diameter.value)}`, name: 'Screw', quantity: count.value },
      })
    }
    case 'tabletop-fastener': {
      const count = countFor(DEFAULT_FASTENER_SPACING)
      return usable({
        values: [value('count', count)],
        operations: [operation(joint, joint.targetId, 'fastener-slots', count.value, [
          setting('Slot width', DEFAULT_FASTENER_SLOT_WIDTH, false),
          setting('Slot depth', DEFAULT_FASTENER_SLOT_DEPTH, false),
        ])],
        hardware: { key: 'tabletop-fastener', name: 'Tabletop fastener', quantity: count.value },
      })
    }
    case 'butt':
      return usable({})
  }
}

function glueIssues(plan: JointPlan): FurnitureIssue[] {
  const { joint, usable } = plan
  if (!usable || !joint.glue) return []
  const { part, target, engagement } = usable
  const label = `${JOINT_KIND_LABELS[joint.kind]} joint, ${part.part.name} to ${target.part.name}`
  const grain = (resolved: ResolvedPart) => resolved.part.orientation.charAt(0) as Axis
  const issues: FurnitureIssue[] = []
  const warn = (code: FurnitureIssue['code'], message: string) => issues.push({ code, severity: 'warning', message: `${label}: ${message}`, partIds: [part.id, target.id], jointId: joint.id })
  if (part.part.kind === 'solid' && target.part.kind === 'solid') {
    const [a, b] = [grain(part), grain(target)]
    // Both grains lie in the glued plane and cross: the parts move in different directions.
    if (a !== engagement.axis && b !== engagement.axis && a !== b && engagement.longSide > CROSS_GRAIN_GLUE_LIMIT) {
      warn('cross-grain-glue', 'the grain of the two parts crosses across a wide glued area, so seasonal movement will crack the joint. Use a fastener that lets one part move, or narrow the glued area.')
    }
  }
  if (joint.kind === 'butt') {
    const endGrain = [part, target].some(resolved => resolved.part.kind === 'solid' && grain(resolved) === engagement.axis)
    if (endGrain) warn('end-grain-glue', 'glue alone holds poorly on end grain. Add a dowel, loose tenon, or mortise and tenon.')
  }
  return issues
}

// ---- Public API -------------------------------------------------------------------

/** Modeled size, joint allowances, and cut size for every resolved part, in project order. */
export function cutSizes(resolved: ResolvedFurniture): PartCutSize[] {
  const allowances = new Map<string, CutAllowance[]>()
  for (const { joint, usable } of planJoints(resolved)) {
    if (!usable?.allowance) continue
    const list = allowances.get(joint.partId) ?? []
    list.push({ jointId: joint.id, ...usable.allowance })
    allowances.set(joint.partId, list)
  }
  return resolved.parts.map(({ id, size }) => {
    const list = allowances.get(id) ?? []
    const grow = (dimension: CutAllowance['dimension']) => list.filter(line => line.dimension === dimension).reduce((total, line) => total + line.amount, 0)
    return {
      partId: id,
      modeled: { ...size },
      allowances: list,
      cut: { length: size.length + grow('length'), width: size.width + grow('width'), thickness: size.thickness },
    }
  })
}

/** Machine and drill operations for every joint that can be made, in joint order. */
export function jointOperations(resolved: ResolvedFurniture): JointOperation[] {
  return planJoints(resolved).flatMap(plan => plan.usable?.operations ?? [])
}

/** Hardware to buy for the joints, one line per hardware identity. */
export function jointHardware(resolved: ResolvedFurniture): HardwareLine[] {
  const lines = new Map<string, HardwareLine>()
  for (const { joint, usable } of planJoints(resolved)) {
    const draft = usable?.hardware
    if (!draft) continue
    const line = lines.get(draft.key)
    if (line) {
      line.quantity += draft.quantity
      line.sourceIds.push(joint.id)
    } else {
      lines.set(draft.key, { key: draft.key, name: draft.name, quantity: draft.quantity, sourceIds: [joint.id] })
    }
  }
  return [...lines.values()]
}

/** Joint errors and glue warnings, in joint order: structure, then sizes, then glue. */
export function validateJoints(resolved: ResolvedFurniture): FurnitureIssue[] {
  return planJoints(resolved).flatMap(plan => [...plan.issues, ...glueIssues(plan)])
}

/** The effective parameters of a joint that can be made: entered values and, where the
 *  woodworker entered none, the defaults, which are assumptions. Empty when the joint
 *  has an error, does not exist, or takes no parameters. */
export function jointValues(resolved: ResolvedFurniture, jointId: string): JointValue[] {
  return planJoints(resolved).find(plan => plan.joint.id === jointId)?.usable?.values ?? []
}
