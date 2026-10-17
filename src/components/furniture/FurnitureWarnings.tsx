import { CircleAlert, TriangleAlert } from 'lucide-react'
import { partTitle } from '../../domain/furniture/editing'
import { groupIssues } from '../../domain/furniture/issueFocus'
import type { FurnitureIssue, FurnitureProject } from '../../domain/furniture/types'

// Every issue the validator found, errors first. Picking one hands it to `onPick`, which
// selects its part and moves focus to the field that fixes it. Severity shows as an icon
// and a word, never color alone.
export function FurnitureWarnings({ project, issues, onPick }: {
  project: FurnitureProject
  issues: readonly FurnitureIssue[]
  onPick: (issue: FurnitureIssue) => void
}) {
  const { errors, warnings } = groupIssues(issues)
  if (issues.length === 0) return <p className="furniture-empty">No issues. The design resolves and every check passes.</p>

  const group = (label: string, severity: 'error' | 'warning', list: FurnitureIssue[]) => list.length === 0 ? null : <section className="issue-group" aria-label={label}>
    <h4>{label} ({list.length})</h4>
    <ul>
      {list.map((issue, index) => {
        const Icon = severity === 'error' ? CircleAlert : TriangleAlert
        const parts = (issue.partIds ?? []).map(id => partTitle(project, id))
        return <li key={`${issue.code}-${index}`}>
          <button type="button" className={`issue-row ${severity}`} onClick={() => onPick(issue)}>
            <Icon size={15} aria-hidden="true" />
            <span><b>{severity === 'error' ? 'Error' : 'Warning'}:</b> {issue.message}{parts.length > 0 && <small>{parts.join(', ')}</small>}</span>
          </button>
        </li>
      })}
    </ul>
  </section>

  return <div className="furniture-warnings">
    {group('Errors', 'error', errors)}
    {group('Warnings', 'warning', warnings)}
  </div>
}
