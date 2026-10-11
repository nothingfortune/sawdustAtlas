import { GLUED_BY_DEFAULT } from './project'
import { JOINT_PARAMETERS, validateJoints } from './joinery'
import type { JointParamKey } from './joinery'
import type { FurnitureJoint, FurnitureProject, JointKind, JointParams, ResolvedFurniture } from './types'
import { JOINT_KINDS } from './types'

// Pure joint edits behind the Joints panel. Each function returns a new project. Ids are
// inputs because the domain never generates them. A parameter the woodworker has not
// entered stays absent, so the default in joinery.ts keeps applying (and stays an
// assumption wherever it surfaces).

/** Whether a new joint of this kind is glued unless told otherwise. */
export function defaultGlue(kind: JointKind): boolean {
  return GLUED_BY_DEFAULT.includes(kind)
}

export interface KindChoices {
  /** Kinds that can join the parts as they are modeled, in vocabulary order. */
  allowed: JointKind[]
  /** Why nothing fits (the parts do not touch, one is hardware, ...); null when something does. */
  reason: string | null
}

/** Which joint kinds can join `partId` (the fitted part) to `targetId` as modeled. Each
 *  kind is planned as a probe joint with default glue and parameters by the same code
 *  that validates real joints, and allowed when that plan has no errors. */
export function jointKindChoices(resolved: ResolvedFurniture, partId: string, targetId: string): KindChoices {
  const errorsFor = (kind: JointKind) => {
    const probe: FurnitureJoint = { id: 'probe', kind, partId, targetId, glue: defaultGlue(kind), params: {} }
    const probed = { ...resolved, project: { ...resolved.project, joints: [probe] } }
    return validateJoints(probed).filter(issue => issue.severity === 'error')
  }
  const allowed = JOINT_KINDS.filter(kind => errorsFor(kind).length === 0)
  // A butt joint has the fewest requirements, so when it fails its error is the plainest reason.
  return { allowed: [...allowed], reason: allowed.length > 0 ? null : errorsFor('butt')[0]!.message }
}

export function addJoint(project: FurnitureProject, joint: { id: string; kind: JointKind; partId: string; targetId: string }): FurnitureProject {
  return { ...project, joints: [...project.joints, { ...joint, glue: defaultGlue(joint.kind), params: {} }] }
}

function mapJoint(project: FurnitureProject, jointId: string, change: (joint: FurnitureJoint) => FurnitureJoint): FurnitureProject {
  return { ...project, joints: project.joints.map(joint => joint.id === jointId ? change(joint) : joint) }
}

/** Changes the kind. Glue returns to the new kind's default and only parameters the new
 *  kind takes are kept. */
export function setJointKind(project: FurnitureProject, jointId: string, kind: JointKind): FurnitureProject {
  const kept = new Set<JointParamKey>(JOINT_PARAMETERS[kind])
  return mapJoint(project, jointId, joint => ({
    ...joint,
    kind,
    glue: defaultGlue(kind),
    params: Object.fromEntries(Object.entries(joint.params).filter(([key]) => kept.has(key as JointParamKey))) as JointParams,
  }))
}

export function setJointGlue(project: FurnitureProject, jointId: string, glue: boolean): FurnitureProject {
  return mapJoint(project, jointId, joint => ({ ...joint, glue }))
}

/** Sets one parameter, or clears it (back to the default assumption) when `value` is undefined. */
export function setJointParam(project: FurnitureProject, jointId: string, key: JointParamKey, value: number | undefined): FurnitureProject {
  return mapJoint(project, jointId, joint => {
    const { [key]: _removed, ...rest } = joint.params
    return { ...joint, params: value === undefined ? rest : { ...rest, [key]: value } }
  })
}

/** Exchanges the fitted part and the receiving part. */
export function swapJointParts(project: FurnitureProject, jointId: string): FurnitureProject {
  return mapJoint(project, jointId, joint => ({ ...joint, partId: joint.targetId, targetId: joint.partId }))
}

export function removeJoint(project: FurnitureProject, jointId: string): FurnitureProject {
  return { ...project, joints: project.joints.filter(joint => joint.id !== jointId) }
}
