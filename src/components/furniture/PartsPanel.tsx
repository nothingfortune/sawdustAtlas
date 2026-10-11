import { Copy, Plus, Trash2, TriangleAlert } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import { groupBySubassembly } from '../../domain/furniture/editing'
import type { PartGroup } from '../../domain/furniture/editing'
import type { FurnitureIssue, FurniturePart, FurniturePartKind, FurnitureProject, ResolvedFurniture } from '../../domain/furniture/types'
import { formatDimensions } from '../../domain/lengthUnits'
import { useUnitSystem } from '../unitSystem'
import { KIND_LABELS, roleLabel } from './partVocabulary'

export function PartsPanel({ project, resolved, issues, selectedIds, onSelect, onNudgeKey, onAdd, onDuplicate, onDelete }: {
  project: FurnitureProject
  resolved: ResolvedFurniture
  issues: FurnitureIssue[]
  /** In click order; the last is the primary selection that Duplicate and Delete act on. */
  selectedIds: readonly string[]
  /** `additive` is true for Shift, Ctrl, or Cmd. */
  onSelect: (id: string, additive: boolean) => void
  /** Arrow keys on a row nudge the selection. */
  onNudgeKey: (event: KeyboardEvent<HTMLElement>) => void
  onAdd: (kind: FurniturePartKind) => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const { lengthUnit } = useUnitSystem()
  const selectedId = selectedIds[selectedIds.length - 1]
  const groups = groupBySubassembly(project)
  const sizeOf = (partId: string) => {
    const size = resolved.parts.find(part => part.id === partId)?.size
    return size ? formatDimensions([size.length, size.width, size.thickness], lengthUnit) : 'size unresolved'
  }
  const issuesOf = (partId: string) => issues.filter(issue => issue.partIds?.includes(partId))

  const row = (part: FurniturePart) => {
    const partIssues = issuesOf(part.id)
    const errors = partIssues.filter(issue => issue.severity === 'error').length
    return <li key={part.id}>
      <button type="button" className={`part-row ${selectedIds.includes(part.id) ? 'selected' : ''}`} aria-pressed={selectedIds.includes(part.id)} onClick={event => onSelect(part.id, event.shiftKey || event.ctrlKey || event.metaKey)}>
        <span className="part-row-title"><b>{part.label || '–'}</b> {part.name}</span>
        <small>{KIND_LABELS[part.kind]} · {roleLabel(part.role)} · {sizeOf(part.id)}</small>
        {partIssues.length > 0 && <small className={`part-row-issue ${errors ? 'error' : 'warning'}`}><TriangleAlert size={12} aria-hidden="true" />{partIssues.length} issue{partIssues.length === 1 ? '' : 's'}</small>}
      </button>
    </li>
  }
  const group = (entry: PartGroup, depth: number) => <section key={entry.subassembly?.id ?? 'loose'} className="part-group" style={{ marginLeft: depth * 12 }} aria-label={entry.subassembly?.name ?? 'Loose parts'}>
    <h4>{entry.subassembly ? `${entry.subassembly.name}${entry.subassembly.label ? ` (${entry.subassembly.label})` : ''}` : 'Loose parts'}</h4>
    {entry.parts.length > 0 && <ul>{entry.parts.map(row)}</ul>}
    {entry.children.map(child => group(child, depth + 1))}
  </section>

  return <div className="furniture-parts-panel">
    <div className="part-actions" role="group" aria-label="Part actions">
      <button type="button" className="button secondary" onClick={() => onAdd('solid')}><Plus size={15} />Solid part</button>
      <button type="button" className="button secondary" onClick={() => onAdd('sheet')}><Plus size={15} />Sheet part</button>
      <button type="button" className="button secondary" onClick={() => onAdd('hardware')}><Plus size={15} />Hardware</button>
      <button type="button" className="button secondary" disabled={!selectedId} onClick={onDuplicate}><Copy size={15} />Duplicate</button>
      <button type="button" className="button secondary danger" disabled={!selectedId} onClick={onDelete}><Trash2 size={15} />Delete</button>
    </div>
    {project.parts.length > 0 && <p className="panel-hint">Shift-click to select several parts. Arrow keys nudge the selection, Shift for ten times as far.</p>}
    {project.parts.length === 0 && <p className="furniture-empty">No parts yet. Add a solid, sheet, or hardware part.</p>}
    <div role="presentation" onKeyDown={onNudgeKey}><nav aria-label="Parts">{groups.map(entry => group(entry, 0))}</nav></div>
  </div>
}
