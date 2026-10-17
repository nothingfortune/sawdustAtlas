import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Trash2, TriangleAlert, X } from 'lucide-react'
import {
  addPartsToSubassembly, assemblyRows, canNest, createSubassembly, labelSubassembly, moveSubassembly, nestSubassembly, parentOf, removePartFromSubassembly, removeSubassembly, renameSubassembly,
} from '../../domain/furniture/assemblies'
import { partTitle } from '../../domain/furniture/editing'
import type { FurnitureIssue, FurnitureProject, FurnitureSubassembly } from '../../domain/furniture/types'
import { createId } from '../../id'
import { TextField } from './TextField'
import { useFocusOpen } from './useFocusOpen'
import type { FocusRequest } from './useFocusOpen'

function siblingsOf(project: FurnitureProject, id: string): string[] {
  const parent = parentOf(project, id)
  if (parent) return parent.childIds
  const isChild = new Set(project.subassemblies.flatMap(sub => sub.childIds))
  return project.subassemblies.filter(sub => !isChild.has(sub.id)).map(sub => sub.id)
}

function AssemblyEditor({ project, sub, issues, selection, onChange, onAnnounce }: {
  project: FurnitureProject
  sub: FurnitureSubassembly
  issues: readonly FurnitureIssue[]
  selection: readonly string[]
  onChange: (project: FurnitureProject) => void
  onAnnounce: (message: string) => void
}) {
  const siblings = siblingsOf(project, sub.id)
  const index = siblings.indexOf(sub.id)
  const parent = parentOf(project, sub.id)
  const parents = project.subassemblies.filter(other => canNest(project, sub.id, other.id))
  const addable = selection.filter(id => !sub.partIds.includes(id))
  const name = sub.name || 'this assembly'
  return <div className="assembly-editor">
    <div className="field-row">
      <TextField label="Name" value={sub.name} onCommit={value => value.trim() ? (onChange(renameSubassembly(project, sub.id, value.trim())), null) : 'An assembly needs a name.'} />
      <TextField label="Mark" value={sub.label} onCommit={value => { onChange(labelSubassembly(project, sub.id, value.trim())); return null }} />
    </div>
    <div className="field">
      <label htmlFor={`assembly-parent-${sub.id}`}>Built into</label>
      <select id={`assembly-parent-${sub.id}`} value={parent?.id ?? ''} onChange={event => {
        const next = nestSubassembly(project, sub.id, event.target.value || null)
        if (next) onChange(next)
      }}>
        <option value="">Nothing (top level)</option>
        {parents.map(other => <option key={other.id} value={other.id}>{other.name}</option>)}
      </select>
    </div>
    <div className="part-actions joint-actions" role="group" aria-label={`Build order of ${name}`}>
      <button type="button" className="button secondary" disabled={index <= 0} onClick={() => onChange(moveSubassembly(project, sub.id, -1))}><ArrowUp size={15} />Build earlier</button>
      <button type="button" className="button secondary" disabled={index < 0 || index >= siblings.length - 1} onClick={() => onChange(moveSubassembly(project, sub.id, 1))}><ArrowDown size={15} />Build later</button>
    </div>
    <h4 className="field-label">Parts ({sub.partIds.length})</h4>
    {sub.partIds.length === 0 && <p className="furniture-empty">No parts yet.</p>}
    <ul className="assembly-parts">
      {sub.partIds.map(partId => <li key={partId}>
        <span>{partTitle(project, partId)}</span>
        <button type="button" className="icon-button" aria-label={`Remove ${partTitle(project, partId)} from ${name}`} onClick={() => onChange(removePartFromSubassembly(project, sub.id, partId))}><X size={15} /></button>
      </li>)}
    </ul>
    {issues.length > 0 && <ul className="part-issues" aria-label="Issues for this assembly">
      {issues.map((issue, i) => <li key={`${issue.code}-${i}`} className={issue.severity}><TriangleAlert size={13} aria-hidden="true" /><span><b>{issue.severity === 'error' ? 'Error' : 'Warning'}:</b> {issue.message}</span></li>)}
    </ul>}
    <div className="part-actions joint-actions">
      <button type="button" className="button secondary" disabled={addable.length === 0} onClick={() => { onChange(addPartsToSubassembly(project, sub.id, addable)); onAnnounce(`Added ${addable.length} part${addable.length === 1 ? '' : 's'} to ${name}.`) }}><Plus size={15} />Add selected parts</button>
      <button type="button" className="button secondary danger" onClick={() => { onChange(removeSubassembly(project, sub.id)); onAnnounce(`Deleted ${name}. Its parts are loose.`) }}><Trash2 size={15} />Delete assembly</button>
    </div>
  </div>
}

// Subassemblies are units built (and usually glued) before they join their parent. Create
// one from the selected parts, then name and mark it, build it into another, and order it.
export function SubassembliesPanel({ project, issues, selection, focus, onChange, onAnnounce }: {
  project: FurnitureProject
  issues: readonly FurnitureIssue[]
  selection: readonly string[]
  focus: FocusRequest | null
  onChange: (project: FurnitureProject) => void
  onAnnounce: (message: string) => void
}) {
  const [open, setOpen] = useFocusOpen(focus, 'assembly', project.subassemblies.map(sub => sub.id))
  const rows = assemblyRows(project)
  const create = () => {
    const id = createId()
    const next = createSubassembly(project, id, selection)
    onChange(next)
    setOpen(id)
    const made = next.subassemblies.find(sub => sub.id === id)
    onAnnounce(`Created ${made?.name ?? 'an assembly'} with ${made?.partIds.length ?? 0} part${made?.partIds.length === 1 ? '' : 's'}.`)
  }
  return <div className="furniture-assemblies-panel">
    <p className="panel-hint">An assembly is built and glued up before it joins its parent. Order sets the build order in the instructions.</p>
    <button type="button" className="button secondary" disabled={selection.length === 0} onClick={create}><Plus size={15} />Create from selection</button>
    {rows.length === 0 && <p className="furniture-empty">No assemblies yet. Select parts, then create one.</p>}
    <ul className="assembly-list">
      {rows.map(({ subassembly: sub, depth }) => {
        const mine = issues.filter(issue => issue.subassemblyId === sub.id)
        const isOpen = open === sub.id
        const Chevron = isOpen ? ChevronDown : ChevronRight
        return <li key={sub.id} className="assembly-item" style={{ marginLeft: depth * 14 }}>
          <button type="button" className="joint-row" data-focus-key={`assembly:${sub.id}`} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : sub.id)}>
            <Chevron size={15} aria-hidden="true" />
            <span className="joint-row-title">{sub.name}{sub.label ? ` (${sub.label})` : ''}</span>
            <small>{sub.partIds.length} part{sub.partIds.length === 1 ? '' : 's'}</small>
            {mine.length > 0 && <small className="part-row-issue error"><TriangleAlert size={12} aria-hidden="true" />{mine.length} issue{mine.length === 1 ? '' : 's'}</small>}
          </button>
          {isOpen && <AssemblyEditor project={project} sub={sub} issues={mine} selection={selection} onChange={onChange} onAnnounce={onAnnounce} />}
        </li>
      })}
    </ul>
  </div>
}
