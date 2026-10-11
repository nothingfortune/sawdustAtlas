import { useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { BuildAllowances, WoodSpecies } from '../../types'
import { addPart, duplicatePart, partTitle, removePart } from '../../domain/furniture/editing'
import { resolveFurniture } from '../../domain/furniture/geometry'
import type { FurniturePartKind, FurnitureProject } from '../../domain/furniture/types'
import { validateFurniture } from '../../domain/furniture/validation'
import { formatDimensions } from '../../domain/lengthUnits'
import { createId } from '../../id'
import { useUnitSystem } from '../unitSystem'
import { deleteMessage } from './deleteMessage'
import { ParametersPanel } from './ParametersPanel'
import { PartInspector } from './PartInspector'
import { PartsPanel } from './PartsPanel'
import { SettingsPanel } from './SettingsPanel'
import { TextField } from './TextField'

type LeftTab = 'parts' | 'parameters' | 'settings'
const LEFT_TABS: readonly { id: LeftTab; label: string }[] = [
  { id: 'parts', label: 'Parts' },
  { id: 'parameters', label: 'Parameters' },
  { id: 'settings', label: 'Settings' },
]

// Designer shell: header, the left panel (parts, parameters, settings), a reserved
// center for the views, and the part inspector. The project is resolved and validated
// once per change; every edit goes up through `onChange`, which commits it as one
// undoable change and stamps updatedAt.
export function FurnitureDesigner({ project, woods, allowances, focusId, onChange, onBack }: {
  project: FurnitureProject
  woods: WoodSpecies[]
  allowances: BuildAllowances
  /** A part id (from the warning center) to select on open. */
  focusId?: string
  onChange: (project: FurnitureProject) => void
  onBack: () => void
}) {
  const { lengthUnit } = useUnitSystem()
  const [tab, setTab] = useState<LeftTab>('parts')
  const [selection, setSelection] = useState(focusId)
  // Announced to screen readers: add, duplicate, and delete move focus nowhere.
  const [status, setStatus] = useState('')
  const resolved = useMemo(() => resolveFurniture(project, { woods, allowances }), [project, woods, allowances])
  const issues = useMemo(() => validateFurniture(resolved, { woods, allowances }), [resolved, woods, allowances])
  const selectedId = project.parts.some(part => part.id === selection) ? selection : undefined
  const selected = project.parts.find(part => part.id === selectedId)
  const errors = issues.filter(issue => issue.severity === 'error').length
  const size = resolved.bounds ? formatDimensions([resolved.bounds.sx, resolved.bounds.sy, resolved.bounds.sz], lengthUnit) : 'No size yet'

  const commit = (next: FurnitureProject) => { if (next !== project) onChange(next) }
  const add = (kind: FurniturePartKind) => {
    const result = addPart(project, resolved, kind, selectedId, { partId: createId(), sheetMaterialId: createId() }, woods[0]?.id ?? '')
    commit(result.project)
    setSelection(result.partId)
    setStatus(`Added ${partTitle(result.project, result.partId)}.`)
  }
  const duplicate = () => {
    if (!selectedId) return
    const result = duplicatePart(project, resolved, selectedId, createId())
    if (!result) return
    commit(result.project)
    setSelection(result.partId)
    setStatus(`Duplicated as ${partTitle(result.project, result.partId)}.`)
  }
  const remove = () => {
    if (!selectedId || !window.confirm(deleteMessage(project, selectedId))) return
    const title = partTitle(project, selectedId)
    commit(removePart(project, selectedId))
    setSelection(undefined)
    setStatus(`Deleted ${title}.`)
  }

  return <div className="furniture-designer">
    <header className="furniture-header">
      <button type="button" className="button secondary" onClick={onBack}><ArrowLeft size={15} />Furniture</button>
      <div className="furniture-name">
        <TextField label="Project name" hideLabel value={project.name} onCommit={name => name.trim() ? (commit({ ...project, name: name.trim() }), null) : 'A project needs a name.'} />
      </div>
      <span className="furniture-size">{size}</span>
      <span className="furniture-parts">{project.parts.length} part{project.parts.length === 1 ? '' : 's'}</span>
      <span className="furniture-issue-count">{issues.length} issue{issues.length === 1 ? '' : 's'}{errors > 0 ? ` (${errors} error${errors === 1 ? '' : 's'})` : ''}</span>
    </header>
    <div className="furniture-body">
      <aside className="furniture-left" aria-label="Project panels">
        <div role="tablist" aria-label="Project panels" className="furniture-tabs">
          {LEFT_TABS.map(entry => <button key={entry.id} type="button" role="tab" id={`furniture-tab-${entry.id}`} aria-selected={tab === entry.id} aria-controls={`furniture-panel-${entry.id}`} tabIndex={tab === entry.id ? 0 : -1}
            className={tab === entry.id ? 'active' : ''} onClick={() => setTab(entry.id)}
            onKeyDown={event => {
              const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
              if (!step) return
              const next = LEFT_TABS[(LEFT_TABS.findIndex(candidate => candidate.id === tab) + step + LEFT_TABS.length) % LEFT_TABS.length]!
              setTab(next.id)
              document.getElementById(`furniture-tab-${next.id}`)?.focus()
            }}>{entry.label}</button>)}
        </div>
        <div role="tabpanel" id={`furniture-panel-${tab}`} aria-labelledby={`furniture-tab-${tab}`} className="furniture-tabpanel">
          {tab === 'parts' && <PartsPanel project={project} resolved={resolved} issues={issues} selectedId={selectedId} onSelect={setSelection} onAdd={add} onDuplicate={duplicate} onDelete={remove} />}
          {tab === 'parameters' && <ParametersPanel project={project} resolved={resolved} issues={issues} onChange={commit} />}
          {tab === 'settings' && <SettingsPanel project={project} onChange={commit} />}
        </div>
      </aside>
      <section className="furniture-center" aria-label="Design area">
        <p><b>{selected ? `Selected: ${partTitle(project, selected.id)}` : 'No part selected'}</b></p>
        <p>Overall size: {size}</p>
        <p className="panel-hint">The 3D and drawing views open in this area. Everything is editable from the panels on either side.</p>
      </section>
      <aside className="furniture-right" aria-label="Inspector">
        {selected
          ? <PartInspector key={selected.id} project={project} resolved={resolved} issues={issues} part={selected} woods={woods} onChange={commit} />
          : <p className="furniture-empty">Select a part in the Parts list to edit it.</p>}
      </aside>
    </div>
    <p className="visually-hidden" role="status" aria-live="polite">{status}</p>
  </div>
}
