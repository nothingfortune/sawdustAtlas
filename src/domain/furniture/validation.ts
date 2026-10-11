import type { WorkspaceWarning } from '../workspaceWarnings'
import { TOUCH_TOLERANCE, contactBetween, overlapVolume, resolveFurniture } from './geometry'
import { stronglyConnectedComponents } from './graph'
import { cutSizes, validateJoints } from './joinery'
import type { FurnitureContext, FurnitureIssue, FurnitureProject, FurnitureSubassembly, ResolvedFurniture, ResolvedPart } from './types'

// Everything wrong or doubtful about a furniture project, in one list: what resolving
// reported, the joint checks, materials, subassemblies, labels, and how the parts sit
// against each other. Pure. The order is fixed: the resolver's issues, then each rule
// in the order below, each sorted by the ids it concerns so it never depends on how the
// arrays happen to be ordered.
//
// Hardware parts (bought, positioned only to show where they go) are left out of the
// collision, unattached, and floating checks: a slide sits inside the cabinet by design.

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

const issue = (code: FurnitureIssue['code'], severity: FurnitureIssue['severity'], message: string, rest: Omit<FurnitureIssue, 'code' | 'severity' | 'message'> = {}): FurnitureIssue =>
  ({ code, severity, message, ...rest })

export function validateFurniture(resolved: ResolvedFurniture, context: FurnitureContext): FurnitureIssue[] {
  const { project } = resolved
  const parts = [...project.parts].sort((a, b) => compareIds(a.id, b.id))
  return [
    ...resolved.issues,
    ...materialIssues(project, parts, resolved, context),
    ...subassemblyIssues(project),
    ...labelIssues(parts),
    // Stable sort: one joint's issues keep their order.
    ...validateJoints(resolved).sort((a, b) => compareIds(a.jointId ?? '', b.jointId ?? '')),
    ...placementIssues(resolved),
  ]
}

// ---- Materials -----------------------------------------------------------------

function materialIssues(project: FurnitureProject, parts: FurnitureProject['parts'], resolved: ResolvedFurniture, context: FurnitureContext): FurnitureIssue[] {
  const missing: FurnitureIssue[] = []
  const thickness: FurnitureIssue[] = []
  const exceeds: FurnitureIssue[] = []
  const resolvedById = new Map(resolved.parts.map(part => [part.id, part]))
  const cutById = new Map(cutSizes(resolved).map(line => [line.partId, line.cut]))
  const sheets = new Map(project.sheetMaterials.map(material => [material.id, material]))
  for (const part of parts) {
    if (part.kind === 'solid' && !context.woods.some(wood => wood.id === part.speciesId)) {
      missing.push(issue('material-missing', 'error', `${part.name}: choose a wood from the library.`, { partIds: [part.id], field: 'speciesId' }))
    }
    if (part.kind !== 'sheet') continue
    const material = part.sheetMaterialId === undefined ? undefined : sheets.get(part.sheetMaterialId)
    if (!material) {
      missing.push(issue('material-missing', 'error', `${part.name}: choose a sheet material.`, { partIds: [part.id], field: 'sheetMaterialId' }))
      continue
    }
    const size = resolvedById.get(part.id)?.size
    if (size && Math.abs(size.thickness - material.thickness) > TOUCH_TOLERANCE) {
      thickness.push(issue('sheet-thickness-mismatch', 'warning', `${part.name}: the part is not the thickness of ${material.name}. Match the part to the sheet or pick another sheet.`, { partIds: [part.id], field: 'thickness' }))
    }
    const cut = cutById.get(part.id)
    if (cut && !fitsSheet(cut, material)) {
      exceeds.push(issue('part-exceeds-sheet', 'error', `${part.name}: the cut part is larger than a sheet of ${material.name}.`, { partIds: [part.id], field: 'length' }))
    }
  }
  return [...missing, ...thickness, ...exceeds]
}

/** A part's length runs along the sheet's face grain. A sheet without grain may turn. */
function fitsSheet(cut: { length: number; width: number }, sheet: { sheetLength: number; sheetWidth: number; grain: 'length' | 'none' }): boolean {
  const straight = cut.length <= sheet.sheetLength && cut.width <= sheet.sheetWidth
  const turned = cut.length <= sheet.sheetWidth && cut.width <= sheet.sheetLength
  return straight || (sheet.grain === 'none' && turned)
}

// ---- Subassemblies -------------------------------------------------------------

function subassemblyIssues(project: FurnitureProject): FurnitureIssue[] {
  const subassemblies = [...project.subassemblies].sort((a, b) => compareIds(a.id, b.id))
  const partIds = new Set(project.parts.map(part => part.id))
  const known = new Map(subassemblies.map(sub => [sub.id, sub]))
  const issues: FurnitureIssue[] = []
  const invalid = (sub: FurnitureSubassembly, message: string, partIdList?: string[]) =>
    issues.push(issue('subassembly-invalid', 'error', `${sub.name}: ${message}`, { subassemblyId: sub.id, ...(partIdList ? { partIds: partIdList } : {}) }))

  const owners = new Map<string, string[]>()
  const parents = new Map<string, string[]>()
  for (const sub of subassemblies) {
    const unknownParts = sub.partIds.filter(id => !partIds.has(id))
    if (unknownParts.length > 0) invalid(sub, 'it lists a part that no longer exists.')
    if (sub.childIds.some(id => !known.has(id))) invalid(sub, 'it lists a subassembly that no longer exists.')
    for (const id of new Set(sub.partIds)) if (partIds.has(id)) owners.set(id, [...(owners.get(id) ?? []), sub.id])
    for (const id of new Set(sub.childIds)) if (known.has(id)) parents.set(id, [...(parents.get(id) ?? []), sub.id])
  }
  for (const [partId, subIds] of [...owners].sort(([a], [b]) => compareIds(a, b))) {
    if (subIds.length > 1) invalid(known.get(subIds[0]!)!, `a part is in more than one subassembly (${subIds.map(id => known.get(id)!.name).join(', ')}).`, [partId])
  }
  for (const [childId, parentIds] of [...parents].sort(([a], [b]) => compareIds(a, b))) {
    if (parentIds.length > 1) invalid(known.get(childId)!, `it is built into more than one subassembly (${parentIds.map(id => known.get(id)!.name).join(', ')}).`)
  }

  const children = (sub: FurnitureSubassembly) => sub.childIds.flatMap(id => known.get(id) ?? [])
  for (const group of stronglyConnectedComponents(subassemblies, children)) {
    const [first] = group
    if (!first) continue
    // A lone subassembly is a cycle only when it contains itself.
    if (group.length === 1 && !first.childIds.includes(first.id)) continue
    invalid(first, group.length === 1 ? 'it contains itself.' : `it and ${group.slice(1).map(sub => sub.name).join(', ')} contain each other.`)
  }
  return issues
}

// ---- Labels --------------------------------------------------------------------

function labelIssues(parts: FurnitureProject['parts']): FurnitureIssue[] {
  const byLabel = new Map<string, string[]>()
  for (const part of parts) {
    const label = part.label.trim()
    if (label) byLabel.set(label, [...(byLabel.get(label) ?? []), part.id])
  }
  return [...byLabel].sort(([a], [b]) => compareIds(a, b)).flatMap(([label, ids]) =>
    ids.length > 1 ? [issue('duplicate-label', 'warning', `Parts share the bench label "${label}". Give each part its own mark so they can be told apart.`, { partIds: ids })] : [])
}

// ---- Placement -----------------------------------------------------------------

function placementIssues(resolved: ResolvedFurniture): FurnitureIssue[] {
  const solid = resolved.parts.filter(part => part.part.kind !== 'hardware').sort((a, b) => compareIds(a.id, b.id))
  const names = new Map(solid.map(part => [part.id, part.part.name]))
  const pairKey = (a: string, b: string) => (compareIds(a, b) <= 0 ? `${a}\u0000${b}` : `${b}\u0000${a}`)
  const jointed = new Map<string, string>()
  const inAJoint = new Set<string>()
  for (const joint of [...resolved.project.joints].sort((a, b) => compareIds(a.id, b.id))) {
    const key = pairKey(joint.partId, joint.targetId)
    if (!jointed.has(key)) jointed.set(key, joint.id)
    inAJoint.add(joint.partId)
    inAJoint.add(joint.targetId)
  }

  const collide: FurnitureIssue[] = []
  const overlapAtJoint: FurnitureIssue[] = []
  const touching = new Map<string, number>(solid.map(part => [part.id, 0]))
  for (let i = 0; i < solid.length; i += 1) {
    for (let j = i + 1; j < solid.length; j += 1) {
      const a = solid[i]!
      const b = solid[j]!
      const overlaps = overlapVolume(a.box, b.box) > 0
      if (overlaps || contactBetween(a.box, b.box)) {
        touching.set(a.id, touching.get(a.id)! + 1)
        touching.set(b.id, touching.get(b.id)! + 1)
      }
      if (!overlaps) continue
      const jointId = jointed.get(pairKey(a.id, b.id))
      if (jointId === undefined) {
        collide.push(issue('parts-collide', 'error', `${a.part.name} and ${b.part.name} occupy the same space and no joint connects them.`, { partIds: [a.id, b.id] }))
      } else {
        overlapAtJoint.push(issue('parts-overlap-at-joint', 'warning', `${a.part.name} and ${b.part.name} overlap at their joint. Model the visible size; the joinery allowances are added for you.`, { partIds: [a.id, b.id], jointId }))
      }
    }
  }
  overlapAtJoint.sort((a, b) => compareIds(a.jointId!, b.jointId!))

  const unattached: FurnitureIssue[] = []
  const floating: FurnitureIssue[] = []
  for (const part of solid) {
    const contacts = touching.get(part.id)!
    if (contacts > 0 && !inAJoint.has(part.id)) {
      unattached.push(issue('part-unattached', 'warning', `${names.get(part.id)} touches other parts but is not joined to any. Add a joint, or leave a gap if it is meant to be loose.`, { partIds: [part.id] }))
    }
    if (contacts === 0 && solid.length > 1 && !onFloor(part)) {
      floating.push(issue('part-floating', 'warning', `${names.get(part.id)} touches nothing. Move it against another part or the floor.`, { partIds: [part.id] }))
    }
  }
  return [...collide, ...overlapAtJoint, ...unattached, ...floating]
}

/** Standing on the floor counts as support. */
function onFloor(part: ResolvedPart): boolean {
  return Math.abs(part.box.z) <= TOUCH_TOLERANCE
}

// ---- Workspace warnings --------------------------------------------------------

/** The project's issues as warning-center entries, each linked to the first part involved. */
export function furnitureWarnings(project: FurnitureProject, context: FurnitureContext): WorkspaceWarning[] {
  const name = project.name.trim() || 'Untitled furniture'
  const seen = new Map<string, number>()
  return validateFurniture(resolveFurniture(project, context), context).map((found): WorkspaceWarning => {
    const subject = found.jointId ?? found.relationshipId ?? found.parameterId ?? found.subassemblyId ?? (found.partIds?.join('+') || 'project')
    const base = `furniture:${project.id}:${found.code}:${subject}${found.field ? `.${found.field}` : ''}`
    // Two issues about the same subject and field still need distinct ids.
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    const focusId = found.partIds?.[0]
    return {
      id: count === 1 ? base : `${base}#${count}`,
      severity: found.severity,
      message: `${name}: ${found.message}`,
      location: { view: 'furniture', targetId: project.id, ...(focusId ? { focusId } : {}) },
    }
  })
}
