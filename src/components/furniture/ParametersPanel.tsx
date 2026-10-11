import { Plus, Trash2, TriangleAlert } from 'lucide-react'
import { addParameter, parameterUsages, removeParameter, renameParameter } from '../../domain/furniture/editing'
import type { FurnitureIssue, FurnitureParameter, FurnitureProject, ResolvedFurniture } from '../../domain/furniture/types'
import { createId } from '../../id'
import { DimInput } from './DimInput'
import { TextField } from './TextField'

export function ParametersPanel({ project, resolved, issues, onChange }: {
  project: FurnitureProject
  resolved: ResolvedFurniture
  issues: FurnitureIssue[]
  onChange: (project: FurnitureProject) => void
}) {
  const update = (id: string, patch: Partial<FurnitureParameter>) => onChange({ ...project, parameters: project.parameters.map(parameter => parameter.id === id ? { ...parameter, ...patch } : parameter) })
  const remove = (parameter: FurnitureParameter) => {
    const usages = parameterUsages(project, parameter.name)
    if (usages.length > 0) {
      const shown = usages.slice(0, 8).map(usage => `- ${usage.description}`)
      const more = usages.length > shown.length ? [`- and ${usages.length - shown.length} more`] : []
      const message = [`${parameter.name} is used by:`, ...shown, ...more, '', 'Delete it anyway? Those dimensions will show an error until you fix them.'].join('\n')
      if (!window.confirm(message)) return
    }
    onChange(removeParameter(project, parameter.id))
  }

  return <div className="furniture-parameters-panel">
    <p className="panel-hint">Name a dimension once and use it in expressions: type <code>=height - top_t</code> in any length field.</p>
    <ul className="parameter-list">
      {project.parameters.map(parameter => {
        // A parameter never sees itself, so a self-reference reads as unknown.
        const scope = Object.fromEntries(Object.entries(resolved.parameters).filter(([name]) => name !== parameter.name))
        const own = issues.filter(issue => issue.parameterId === parameter.id)
        // Every card has Name, Label, and Value fields; the group name tells them apart.
        return <li key={parameter.id} className="parameter-row" role="group" aria-label={parameter.label || parameter.name}>
          <TextField label="Name" value={parameter.name} onCommit={name => {
            const result = renameParameter(project, parameter.id, name.trim())
            if (!result.ok) return result.message
            if (result.project !== project) onChange(result.project)
            return null
          }} />
          <TextField label="Label" value={parameter.label} onCommit={label => { update(parameter.id, { label: label.trim() }); return null }} />
          <DimInput label="Value" focusKey={`parameter:${parameter.id}`} value={parameter.value} scope={scope} onCommit={value => update(parameter.id, { value })} />
          {own.map((issue, index) => <p key={`${issue.code}-${index}`} className={`parameter-issue ${issue.severity}`}><TriangleAlert size={13} aria-hidden="true" />{issue.message}</p>)}
          <button type="button" className="button secondary danger" aria-label={`Delete parameter ${parameter.name}`} onClick={() => remove(parameter)}><Trash2 size={15} />Delete</button>
        </li>
      })}
    </ul>
    {project.parameters.length === 0 && <p className="furniture-empty">No parameters yet.</p>}
    <button type="button" className="button secondary" onClick={() => onChange(addParameter(project, createId()))}><Plus size={15} />Add parameter</button>
  </div>
}
