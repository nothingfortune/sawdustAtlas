import { useMemo, useState } from 'react'
import { ArrowLeftRight, ChevronDown, ChevronRight, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { JOINT_KIND_LABELS, JOINT_PARAMETERS, jointValues } from '../../domain/furniture/joinery'
import type { JointParamKey } from '../../domain/furniture/joinery'
import { addJoint, jointKindChoices, removeJoint, setJointGlue, setJointKind, setJointParam, swapJointParts } from '../../domain/furniture/jointEditing'
import { partTitle } from '../../domain/furniture/editing'
import type { FurnitureIssue, FurnitureJoint, FurnitureProject, JointKind, ResolvedFurniture } from '../../domain/furniture/types'
import { createId } from '../../id'
import { DimInput } from './DimInput'
import { TextField } from './TextField'
import { useFocusOpen } from './useFocusOpen'
import type { FocusRequest } from './useFocusOpen'

const NO_PARAMETERS: Readonly<Record<string, number>> = {}
const PARAM_LABELS: Readonly<Record<JointParamKey, string>> = {
  depth: 'Depth', thickness: 'Thickness', width: 'Width', diameter: 'Diameter', count: 'Count', shoulder: 'Shoulder',
}
// A shoulder may be zero; every other size must be above it.
const MAY_BE_ZERO: ReadonlySet<JointParamKey> = new Set(['shoulder'])

function jointTitle(project: FurnitureProject, joint: FurnitureJoint): string {
  return `${JOINT_KIND_LABELS[joint.kind]}: ${partTitle(project, joint.partId)} into ${partTitle(project, joint.targetId)}`
}

function KindSelect({ label, value, kinds, onChange }: { label: string; value: JointKind; kinds: readonly JointKind[]; onChange: (kind: JointKind) => void }) {
  const id = `joint-kind-${label.replace(/\W+/g, '-').toLowerCase()}`
  return <div className="field">
    <label htmlFor={id}>{label}</label>
    <select id={id} value={value} onChange={event => onChange(event.target.value as JointKind)}>
      {kinds.map(kind => <option key={kind} value={kind}>{JOINT_KIND_LABELS[kind]}</option>)}
    </select>
  </div>
}

function ParameterField({ joint, paramKey, shown, entered, onChange }: {
  joint: FurnitureJoint
  paramKey: JointParamKey
  shown: number
  entered: boolean
  onChange: (key: JointParamKey, value: number | undefined) => void
}) {
  const label = PARAM_LABELS[paramKey]
  const focusKey = `joint:${joint.id}.${paramKey}`
  return <div className="joint-param">
    {paramKey === 'count'
      ? <TextField label="Count" focusKey={focusKey} inputMode="decimal" value={String(shown)} onCommit={text => {
        if (!/^\s*\d+\s*$/.test(text) || Number(text) < 1) return 'Use a whole number of at least 1.'
        if (Number(text) !== shown) onChange(paramKey, Number(text))
        return null
      }} />
      : <DimInput label={label} focusKey={focusKey} value={shown} scope={NO_PARAMETERS} positive={!MAY_BE_ZERO.has(paramKey)} allowExpression={false}
        onCommit={value => { if (typeof value === 'number') onChange(paramKey, value) }} />}
    {entered
      ? <button type="button" className="button secondary" aria-label={`Use the assumed ${label.toLowerCase()} for this joint`} onClick={() => onChange(paramKey, undefined)}>Use the assumed value</button>
      : <small className="joint-assumption">Assumed. Type a value to set your own.</small>}
  </div>
}

function JointEditor({ project, resolved, joint, issues, onChange, onAnnounce }: {
  project: FurnitureProject
  resolved: ResolvedFurniture
  joint: FurnitureJoint
  issues: readonly FurnitureIssue[]
  onChange: (project: FurnitureProject) => void
  onAnnounce: (message: string) => void
}) {
  const { allowed } = jointKindChoices(resolved, joint.partId, joint.targetId)
  // The current kind stays listed even when it no longer fits, so the select shows the truth.
  const kinds = allowed.includes(joint.kind) ? allowed : [joint.kind, ...allowed]
  const values = jointValues(resolved, joint.id)
  const fields = JOINT_PARAMETERS[joint.kind].flatMap(key => {
    const entered = joint.params[key]
    const effective = entered ?? values.find(value => value.key === key)?.value
    return effective === undefined ? [] : [{ key, shown: effective, entered: entered !== undefined }]
  })
  return <div className="joint-editor">
    <KindSelect label="Kind" value={joint.kind} kinds={kinds} onChange={kind => onChange(setJointKind(project, joint.id, kind))} />
    <label className="face-pick joint-glue"><input type="checkbox" data-focus-key={`joint:${joint.id}.glue`} checked={joint.glue} onChange={event => onChange(setJointGlue(project, joint.id, event.target.checked))} />Glue this joint</label>
    {fields.length > 0 && <div className="joint-params">
      {fields.map(field => <ParameterField key={field.key} joint={joint} paramKey={field.key} shown={field.shown} entered={field.entered} onChange={(key, value) => onChange(setJointParam(project, joint.id, key, value))} />)}
    </div>}
    {issues.length > 0 && <ul className="part-issues" aria-label="Issues for this joint">
      {issues.map((issue, index) => <li key={`${issue.code}-${index}`} className={issue.severity}><TriangleAlert size={13} aria-hidden="true" /><span><b>{issue.severity === 'error' ? 'Error' : 'Warning'}:</b> {issue.message}</span></li>)}
    </ul>}
    <div className="part-actions joint-actions">
      <button type="button" className="button secondary" onClick={() => onChange(swapJointParts(project, joint.id))}><ArrowLeftRight size={15} />Swap parts</button>
      <button type="button" className="button secondary danger" onClick={() => { onChange(removeJoint(project, joint.id)); onAnnounce(`Deleted ${jointTitle(project, joint)}.`) }}><Trash2 size={15} />Delete joint</button>
    </div>
  </div>
}

// Joints between parts: add one for two selected parts (only the kinds their contact
// allows are offered), then edit its kind, glue, and sizes. A size the woodworker has not
// entered is shown as an assumption and stays one until a value is typed.
export function JointsPanel({ project, resolved, issues, selection, focus, onSelect, onChange, onAnnounce }: {
  project: FurnitureProject
  resolved: ResolvedFurniture
  issues: readonly FurnitureIssue[]
  /** Selected part ids in click order; the last is the primary one. */
  selection: readonly string[]
  focus: FocusRequest | null
  onSelect: (partIds: string[]) => void
  onChange: (project: FurnitureProject) => void
  onAnnounce: (message: string) => void
}) {
  const [scope, setScope] = useState<'all' | 'part'>('all')
  const [open, setOpen] = useFocusOpen(focus, 'joint', project.joints.map(joint => joint.id))
  const [kindChoice, setKindChoice] = useState<JointKind>('mortise-tenon')
  const [swap, setSwap] = useState<{ pair: string; on: boolean }>({ pair: '', on: false })
  const primary = selection[selection.length - 1]
  const pair = selection.length === 2 ? selection.join('|') : ''
  const [first, second] = selection.length === 2 ? [selection[0]!, selection[1]!] : ['', '']
  // The fitted part is the one whose end or edge can enter the other, which allows more
  // kinds (an apron into a leg, a shelf into a side); equal choices go to the smaller part.
  const naturalFirst = useMemo(() => {
    if (!pair) return true
    const forward = jointKindChoices(resolved, first, second).allowed.length
    const backward = jointKindChoices(resolved, second, first).allowed.length
    if (forward !== backward) return forward > backward
    const volume = (id: string) => { const box = resolved.parts.find(part => part.id === id)?.box; return box ? box.sx * box.sy * box.sz : Infinity }
    return volume(first) <= volume(second)
  }, [resolved, pair, first, second])
  const flipped = swap.pair === pair && swap.on
  const fittedId = naturalFirst !== flipped ? first : second
  const receivingId = naturalFirst !== flipped ? second : first
  const choices = pair ? jointKindChoices(resolved, fittedId, receivingId) : null
  const kind = choices?.allowed.includes(kindChoice) ? kindChoice : choices?.allowed[0]

  const shown = scope === 'part' && primary ? project.joints.filter(joint => joint.partId === primary || joint.targetId === primary) : project.joints
  const add = () => {
    if (!kind) return
    const id = createId()
    onChange(addJoint(project, { id, kind, partId: fittedId, targetId: receivingId }))
    setOpen(id)
    onAnnounce(`Added ${JOINT_KIND_LABELS[kind]} joint, ${partTitle(project, fittedId)} into ${partTitle(project, receivingId)}.`)
  }

  return <div className="furniture-joints-panel">
    <section className="joint-add" aria-label="Add joint">
      <h4>Add joint</h4>
      {!choices && <p className="panel-hint">Select two parts (Shift-click in the list) to join them.</p>}
      {choices && <>
        <p className="joint-pair">{partTitle(project, fittedId)} into {partTitle(project, receivingId)}</p>
        {choices.allowed.length > 0 && kind
          ? <KindSelect label="New joint kind" value={kind} kinds={choices.allowed} onChange={setKindChoice} />
          : <p className="field-error" role="status">{choices.reason}</p>}
        <div className="part-actions joint-actions">
          <button type="button" className="button secondary" onClick={() => setSwap({ pair, on: !flipped })}><ArrowLeftRight size={15} />Swap parts</button>
          <button type="button" className="button" disabled={!kind} onClick={add}><Plus size={15} />Add joint</button>
        </div>
      </>}
    </section>

    <div className="joint-scope" role="group" aria-label="Show joints">
      <div className="segmented">
        <button type="button" aria-pressed={scope === 'all'} className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>All ({project.joints.length})</button>
        <button type="button" aria-pressed={scope === 'part'} className={scope === 'part' ? 'active' : ''} disabled={!primary} onClick={() => setScope('part')}>Selected part</button>
      </div>
    </div>
    {shown.length === 0 && <p className="furniture-empty">{scope === 'part' ? 'The selected part has no joints.' : 'No joints yet.'}</p>}
    <ul className="joint-list">
      {shown.map(joint => {
        const mine = issues.filter(issue => issue.jointId === joint.id)
        const errors = mine.filter(issue => issue.severity === 'error').length
        const isOpen = open === joint.id
        const Chevron = isOpen ? ChevronDown : ChevronRight
        return <li key={joint.id} className="joint-item">
          <button type="button" className="joint-row" data-focus-key={`joint:${joint.id}`} aria-expanded={isOpen}
            onClick={() => { setOpen(isOpen ? null : joint.id); if (!isOpen) onSelect([joint.targetId, joint.partId]) }}>
            <Chevron size={15} aria-hidden="true" />
            <span className="joint-row-title">{jointTitle(project, joint)}</span>
            <small>{joint.glue ? 'Glued' : 'Not glued'}</small>
            {mine.length > 0 && <small className={`part-row-issue ${errors ? 'error' : 'warning'}`}><TriangleAlert size={12} aria-hidden="true" />{mine.length} issue{mine.length === 1 ? '' : 's'}</small>}
          </button>
          {isOpen && <JointEditor project={project} resolved={resolved} joint={joint} issues={mine} onChange={onChange} onAnnounce={onAnnounce} />}
        </li>
      })}
    </ul>
  </div>
}
