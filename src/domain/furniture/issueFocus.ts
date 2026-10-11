import type { FurnitureIssue } from './types'

// Where an issue is fixed: which left panel, which parts to select, and which field to
// focus. A field is named by a focus key that the matching input carries as
// `data-focus-key`: `part:<field>` (a part dimension or position), `parameter:<id>`,
// `joint:<id>` or `joint:<id>.<param>`, `assembly:<id>`, or `relationship:<id>`.

export type IssuePanel = 'parts' | 'parameters' | 'joints' | 'assemblies'

export interface IssueTarget {
  panel: IssuePanel
  /** Parts to select; the first listed becomes the one the inspector shows. */
  partIds: string[]
  /** The focus key of the input that fixes it, or null when the whole part is the fix. */
  focus: string | null
}

export function issueTarget(issue: FurnitureIssue): IssueTarget {
  const partIds = [...(issue.partIds ?? [])].reverse()
  if (issue.parameterId) return { panel: 'parameters', partIds, focus: `parameter:${issue.parameterId}` }
  if (issue.jointId) return { panel: 'joints', partIds, focus: `joint:${issue.jointId}${issue.field ? `.${issue.field}` : ''}` }
  if (issue.subassemblyId) return { panel: 'assemblies', partIds, focus: `assembly:${issue.subassemblyId}` }
  if (issue.relationshipId) return { panel: 'parts', partIds, focus: `relationship:${issue.relationshipId}` }
  return { panel: 'parts', partIds, focus: issue.field ? `part:${issue.field}` : null }
}

export interface GroupedIssues {
  errors: FurnitureIssue[]
  warnings: FurnitureIssue[]
}

/** Issues split by severity, each group keeping the validator's order. */
export function groupIssues(issues: readonly FurnitureIssue[]): GroupedIssues {
  return { errors: issues.filter(issue => issue.severity === 'error'), warnings: issues.filter(issue => issue.severity === 'warning') }
}
