import { describeRelationship, partTitle, removalImpact } from '../../domain/furniture/editing'
import type { FurnitureProject } from '../../domain/furniture/types'

/** The confirmation text for deleting a part: what goes with it, in plain words. */
export function deleteMessage(project: FurnitureProject, partId: string): string {
  const impact = removalImpact(project, partId)
  const lines = [`Delete ${partTitle(project, partId)}?`]
  const list = (heading: string, items: string[]) => { if (items.length) lines.push('', `${heading}:`, ...items.map(item => `- ${item}`)) }
  list('These joints are removed', impact.joints.map(joint => `${joint.kind} joint between ${partTitle(project, joint.partId)} and ${partTitle(project, joint.targetId)}`))
  list('These relationships are removed', impact.relationships.map(relationship => describeRelationship(project, relationship)))
  list('These spacing relationships lose this part', impact.adjusted.map(relationship => describeRelationship(project, relationship)))
  list('It leaves these subassemblies', impact.subassemblies.map(group => group.name))
  return lines.join('\n')
}
