import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Download, X } from 'lucide-react'
import type { BoardProject, BuildAllowances, WoodSpecies } from '../../types'
import { pickPart } from '../../domain/furniture/arrange'
import { addPart, duplicatePart, partTitle, removePart } from '../../domain/furniture/editing'
import { resolveFurniture } from '../../domain/furniture/geometry'
import { issueTarget } from '../../domain/furniture/issueFocus'
import type { IssuePanel } from '../../domain/furniture/issueFocus'
import type { FurnitureIssue, FurniturePartKind, FurnitureProject } from '../../domain/furniture/types'
import { validateFurniture } from '../../domain/furniture/validation'
import { formatDimensions } from '../../domain/lengthUnits'
import { createId } from '../../id'
import { useUnitSystem } from '../unitSystem'
import { deleteMessage } from './deleteMessage'
import { DesignArea } from './DesignArea'
import { FurnitureOutputs } from './FurnitureOutputs'
import { FurnitureWarnings } from './FurnitureWarnings'
import { JointsPanel } from './JointsPanel'
import { ParametersPanel } from './ParametersPanel'
import { PartInspector } from './PartInspector'
import { PartsPanel } from './PartsPanel'
import { SettingsPanel } from './SettingsPanel'
import { SubassembliesPanel } from './SubassembliesPanel'
import { TextField } from './TextField'
import { useArrange } from './useArrange'
import type { FocusRequest } from './useFocusOpen'

type LeftTab = IssuePanel | 'settings'
const LEFT_TABS: readonly { id: LeftTab; label: string }[] = [
  { id: 'parts', label: 'Parts' },
  { id: 'parameters', label: 'Parameters' },
  { id: 'joints', label: 'Joints' },
  { id: 'assemblies', label: 'Assemblies' },
  { id: 'settings', label: 'Settings' },
]

// Designer shell: header, the left panel (parts, parameters, joints, assemblies,
// settings), the design area, and the part inspector. The project is resolved and validated
// once per change; every edit goes up through `onChange`, which commits it as one
// undoable change and stamps updatedAt.
export function FurnitureDesigner({ project, woods, boards, allowances, focusId, onChange, onExportProject, onBack }: {
  project: FurnitureProject
  woods: WoodSpecies[]
  /** Every board in the workspace; the plan generator's context. */
  boards: BoardProject[]
  allowances: BuildAllowances
  /** A part id (from the warning center) to select on open. */
  focusId?: string
  onChange: (project: FurnitureProject) => void
  onExportProject: () => void
  onBack: () => void
}) {
  const { lengthUnit } = useUnitSystem()
  const [tab, setTab] = useState<LeftTab>('parts')
  // Part ids in click order; the last is the one the inspector shows.
  const [selection, setSelection] = useState<string[]>(focusId ? [focusId] : [])
  // Announced to screen readers: add, duplicate, and delete move focus nowhere.
  const [status, setStatus] = useState('')
  const [showIssues, setShowIssues] = useState(false)
  // Set when an issue is picked: the input with this key gets focus once its panel shows.
  const [focus, setFocus] = useState<FocusRequest | null>(null)
  const resolved = useMemo(() => resolveFurniture(project, { woods, allowances }), [project, woods, allowances])
  const issues = useMemo(() => validateFurniture(resolved, { woods, allowances }), [resolved, woods, allowances])
  const selectedIds = useMemo(() => selection.filter(id => project.parts.some(part => part.id === id)), [selection, project.parts])
  const selectedId = selectedIds[selectedIds.length - 1]
  const selected = project.parts.find(part => part.id === selectedId)
  const errors = issues.filter(issue => issue.severity === 'error').length
  const size = resolved.bounds ? formatDimensions([resolved.bounds.sx, resolved.bounds.sy, resolved.bounds.sz], lengthUnit) : 'No size yet'

  const commit = (next: FurnitureProject) => { if (next !== project) onChange(next) }
  const arrange = useArrange({ project, resolved, selection: selectedIds, onChange: commit, announce: setStatus })
  useEffect(() => {
    if (!focus) return
    ;[...document.querySelectorAll<HTMLElement>('[data-focus-key]')].find(element => element.dataset['focusKey'] === focus.key)?.focus()
  }, [focus])
  useEffect(() => {
    if (!showIssues) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setShowIssues(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [showIssues])
  // Picking a tab by hand drops a pending request, so a panel that mounts later does not replay it.
  const changeTab = (next: LeftTab) => { setTab(next); setFocus(null) }
  const pickIssue = (issue: FurnitureIssue) => {
    const target = issueTarget(issue)
    setTab(target.panel)
    const partIds = target.partIds.filter(id => project.parts.some(part => part.id === id))
    if (partIds.length > 0) setSelection(partIds)
    const key = target.focus
    if (key) setFocus(current => ({ key, seq: (current?.seq ?? 0) + 1 }))
    setShowIssues(false)
    setStatus(issue.message)
  }
  const add = (kind: FurniturePartKind) => {
    const result = addPart(project, resolved, kind, selectedId, { partId: createId(), sheetMaterialId: createId() }, woods[0]?.id ?? '')
    commit(result.project)
    setSelection([result.partId])
    setStatus(`Added ${partTitle(result.project, result.partId)}.`)
  }
  const duplicate = () => {
    if (!selectedId) return
    const result = duplicatePart(project, resolved, selectedId, createId())
    if (!result) return
    commit(result.project)
    setSelection([result.partId])
    setStatus(`Duplicated as ${partTitle(result.project, result.partId)}.`)
  }
  const remove = () => {
    if (!selectedId || !window.confirm(deleteMessage(project, selectedId))) return
    const title = partTitle(project, selectedId)
    commit(removePart(project, selectedId))
    setSelection([])
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
      <button type="button" className="furniture-issue-count" aria-expanded={showIssues} aria-controls="furniture-issues" onClick={() => setShowIssues(open => !open)}>
        {issues.length} issue{issues.length === 1 ? '' : 's'}{errors > 0 ? ` (${errors} error${errors === 1 ? '' : 's'})` : ''}
      </button>
      <button type="button" className="button secondary" onClick={onExportProject} aria-label="Export project file"><Download size={15} />Export project</button>
    </header>
    {showIssues && <section id="furniture-issues" className="furniture-issues-popover" aria-label="Issues">
      <header>
        <strong>Issues</strong>
        <button type="button" className="icon-button" aria-label="Close issues" onClick={() => setShowIssues(false)}><X size={16} /></button>
      </header>
      <FurnitureWarnings project={project} issues={issues} onPick={pickIssue} />
    </section>}
    <div className="furniture-body">
      <aside className="furniture-left" aria-label="Project panels">
        <div role="tablist" aria-label="Project panels" className="furniture-tabs">
          {LEFT_TABS.map(entry => <button key={entry.id} type="button" role="tab" id={`furniture-tab-${entry.id}`} aria-selected={tab === entry.id} aria-controls={`furniture-panel-${entry.id}`} tabIndex={tab === entry.id ? 0 : -1}
            className={tab === entry.id ? 'active' : ''} onClick={() => changeTab(entry.id)}
            onKeyDown={event => {
              const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
              if (!step) return
              const next = LEFT_TABS[(LEFT_TABS.findIndex(candidate => candidate.id === tab) + step + LEFT_TABS.length) % LEFT_TABS.length]!
              changeTab(next.id)
              document.getElementById(`furniture-tab-${next.id}`)?.focus()
            }}>{entry.label}</button>)}
        </div>
        <div role="tabpanel" id={`furniture-panel-${tab}`} aria-labelledby={`furniture-tab-${tab}`} className="furniture-tabpanel">
          {tab === 'parts' && <PartsPanel project={project} resolved={resolved} issues={issues} selectedIds={selectedIds} onSelect={(id, additive) => setSelection(pickPart(selectedIds, id, additive))} onNudgeKey={arrange.onNudgeKey} onAdd={add} onDuplicate={duplicate} onDelete={remove} />}
          {tab === 'parameters' && <ParametersPanel project={project} resolved={resolved} issues={issues} onChange={commit} />}
          {tab === 'joints' && <JointsPanel project={project} resolved={resolved} issues={issues} selection={selectedIds} focus={focus} onSelect={setSelection} onChange={commit} onAnnounce={setStatus} />}
          {tab === 'assemblies' && <SubassembliesPanel project={project} issues={issues} selection={selectedIds} focus={focus} onChange={commit} onAnnounce={setStatus} />}
          {tab === 'settings' && <SettingsPanel project={project} onChange={commit} />}
        </div>
      </aside>
      <DesignArea project={project} resolved={resolved} issues={issues} context={{ woods, allowances }} selection={selectedIds} arrange={arrange} size={size}
        onSelect={setSelection} onChange={commit} onAnnounce={setStatus} />
      <aside className="furniture-right" aria-label="Inspector">
        {selected
          ? <PartInspector key={selected.id} project={project} resolved={resolved} issues={issues} part={selected} woods={woods} onChange={commit} onAnnounce={setStatus} />
          : <p className="furniture-empty">Select a part in the Parts list to edit it.</p>}
      </aside>
    </div>
    <FurnitureOutputs project={project} resolved={resolved} woods={woods} boards={boards} allowances={allowances} />
    <p className="visually-hidden" role="status" aria-live="polite">{status}</p>
  </div>
}
