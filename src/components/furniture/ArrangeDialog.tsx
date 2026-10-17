import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import {
  addRelationship, alignRelationship, betweenRelationship, centerRelationship, distributeRelationship, faceRelationship, placedSelection, relationshipProblem,
  suggestAlign, suggestAttach, suggestBetween, suggestCenterAxis, suggestDistribute,
} from '../../domain/furniture/arrange'
import type { PlacedBox } from '../../domain/furniture/arrange'
import { describeRelationship, partTitle } from '../../domain/furniture/editing'
import { HIGH_FACE, LOW_FACE, faceAxis, isHighFace } from '../../domain/furniture/faces'
import { BOX_FACES } from '../../domain/furniture/types'
import type { Axis, BoxFace, DimExpr, FurnitureContext, FurnitureProject, FurnitureRelationship, ResolvedFurniture } from '../../domain/furniture/types'
import { createId } from '../../id'
import { useModalDialog } from '../useModalDialog'
import { DimInput } from './DimInput'
import { FACE_LABELS } from './partVocabulary'

export type ArrangeMode = 'attach' | 'align' | 'center' | 'between' | 'distribute'

const AXES: readonly Axis[] = ['x', 'y', 'z']
const TITLES: Record<ArrangeMode, string> = {
  attach: 'Attach parts',
  align: 'Align parts',
  center: 'Center a part',
  between: 'Center between two parts',
  distribute: 'Distribute parts',
}
const HINTS: Record<ArrangeMode, string> = {
  attach: 'Puts one face of the moving part against a face of the other part. Only the moving part\'s position changes, never its size.',
  align: 'Puts the same face of both parts on one plane. Only the moving part\'s position changes.',
  center: 'Centers the moving part on the other along one axis.',
  between: 'Centers the part in the gap between the other two, keeping its size. If it does not fit, validation reports the collision.',
  distribute: 'Spaces the other parts with equal gaps between the two end parts, in their current order.',
}

function oppositeFace(face: BoxFace): BoxFace {
  const axis = faceAxis(face)
  return isHighFace(face) ? LOW_FACE[axis] : HIGH_FACE[axis]
}

interface Seed { face: BoxFace; targetFace: BoxFace; axis: Axis }

function seedFor(mode: ArrangeMode, mover: PlacedBox | undefined, target: PlacedBox | undefined, parts: readonly PlacedBox[]): Seed {
  if (mode === 'attach' && mover && target) return { ...suggestAttach(mover.box, target.box), axis: 'x' }
  if (mode === 'align' && mover && target) return { face: suggestAlign(mover.box, target.box), targetFace: suggestAlign(mover.box, target.box), axis: 'x' }
  if (mode === 'center' && mover && target) return { face: 'left', targetFace: 'right', axis: suggestCenterAxis(mover.box, target.box) }
  if (mode === 'between') return { face: 'left', targetFace: 'right', axis: suggestBetween(parts).axis }
  if (mode === 'distribute') return { face: 'left', targetFace: 'right', axis: suggestDistribute(parts).axis }
  return { face: 'left', targetFace: 'right', axis: 'x' }
}

function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (value: T) => void }) {
  const id = useId()
  return <div className="field">
    <label htmlFor={id}>{label}</label>
    <select id={id} value={value} onChange={event => onChange(event.target.value as T)}>
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </div>
}

// The small dialog behind Attach, Align, Center, Between, and Distribute. It starts from
// the faces and axis that are already closest, builds one relationship, and refuses it
// here (with the resolver's own explanation) when it would loop or fight another one.
export function ArrangeDialog({ mode, project, resolved, context, selection, onApply, onClose }: {
  mode: ArrangeMode
  project: FurnitureProject
  resolved: ResolvedFurniture
  context: FurnitureContext
  selection: readonly string[]
  onApply: (project: FurnitureProject, summary: string) => void
  onClose: () => void
}) {
  const dialogRef = useModalDialog<HTMLDivElement>(onClose)
  const parts = placedSelection(resolved, selection)
  const title = (id: string) => partTitle(project, id)
  const partOptions = parts.map(part => ({ value: part.id, label: title(part.id) }))
  const faceOptions = BOX_FACES.map(face => ({ value: face, label: `${FACE_LABELS[face]} face` }))
  const axisOptions = AXES.map(axis => ({ value: axis, label: `${axis.toUpperCase()} axis` }))

  const initialMover = mode === 'between' ? suggestBetween(parts).partId : parts[parts.length - 1]?.id ?? ''
  const [moverId, setMoverId] = useState(initialMover)
  const targetOf = (mover: string) => parts.find(part => part.id !== mover)
  const initial = seedFor(mode, parts.find(part => part.id === initialMover), targetOf(initialMover), parts)
  const [face, setFace] = useState(initial.face)
  const [targetFace, setTargetFace] = useState(initial.targetFace)
  const [axis, setAxis] = useState(initial.axis)
  const [offset, setOffset] = useState<DimExpr>(0)
  const spread = mode === 'distribute' ? suggestDistribute(parts) : undefined
  const [fromId, setFromId] = useState(spread?.fromId ?? '')
  const [toId, setToId] = useState(spread?.toId ?? '')
  const [error, setError] = useState<string | null>(null)

  const mover = parts.find(part => part.id === moverId)
  const target = targetOf(moverId)
  const changeMover = (id: string) => {
    setMoverId(id)
    const seed = seedFor(mode, parts.find(part => part.id === id), targetOf(id), parts)
    setFace(seed.face)
    setTargetFace(seed.targetFace)
    if (mode !== 'between') setAxis(seed.axis)
    setError(null)
  }
  const changeFace = (next: BoxFace) => {
    setFace(next)
    setTargetFace(mode === 'align' ? next : oppositeFace(next))
    setError(null)
  }

  const build = (id: string): FurnitureRelationship | null => {
    switch (mode) {
      case 'attach': return mover && target ? faceRelationship(id, mover.id, face, { partId: target.id, face: targetFace }, offset) : null
      case 'align': return mover && target ? alignRelationship(id, mover.id, target.id, face, offset) : null
      case 'center': return mover && target ? centerRelationship(id, mover.id, target.id, axis, offset) : null
      case 'between': {
        const anchors = parts.filter(part => part.id !== moverId)
        return mover && anchors.length === 2 ? betweenRelationship(id, mover.id, axis, [anchors[0]!, anchors[1]!]) : null
      }
      case 'distribute': {
        const from = parts.find(part => part.id === fromId)
        const to = parts.find(part => part.id === toId)
        const spaced = parts.filter(part => part.id !== fromId && part.id !== toId)
        return from && to && from.id !== to.id && spaced.length > 0 ? distributeRelationship(id, axis, [from, to], spaced) : null
      }
    }
  }
  const draft = build('draft')
  const apply = () => {
    const id = createId()
    const relationship = build(id)
    if (!relationship) {
      setError(mode === 'distribute' ? 'Choose two different end parts.' : 'Choose the parts to arrange.')
      return
    }
    const added = addRelationship(project, relationship)
    if (!added.ok) { setError(added.message); return }
    const problem = relationshipProblem(added.project, context, id)
    if (problem) { setError(problem); return }
    onApply(added.project, `${describeRelationship(added.project, relationship)}.`)
  }

  const showMover = mode !== 'distribute'
  const showOffset = mode === 'attach' || mode === 'align' || mode === 'center'
  const field = (children: ReactNode) => <div className="field-row">{children}</div>
  const axisFaceOptions = (value: BoxFace) => [LOW_FACE[faceAxis(value)], HIGH_FACE[faceAxis(value)]].map(option => ({ value: option, label: `${FACE_LABELS[option]} face` }))

  return <div className="modal-scrim" role="presentation" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div ref={dialogRef} tabIndex={-1} className="import-dialog arrange-dialog" role="dialog" aria-modal="true" aria-label={TITLES[mode]}>
      <header><strong>{TITLES[mode]}</strong></header>
      <p className="panel-hint">{HINTS[mode]}</p>
      {showMover && <Select label={mode === 'between' ? 'Part to center' : 'Part that moves'} value={moverId} options={partOptions} onChange={changeMover} />}
      {mode === 'attach' && target && field(<>
        <Select label="Moving face" value={face} options={faceOptions} onChange={changeFace} />
        <Select label={`Meets ${title(target.id)}`} value={targetFace} options={axisFaceOptions(face)} onChange={value => { setTargetFace(value); setError(null) }} />
      </>)}
      {mode === 'align' && target && <Select label={`Face to line up with ${title(target.id)}`} value={face} options={faceOptions} onChange={changeFace} />}
      {(mode === 'center' || mode === 'between' || mode === 'distribute') && <Select label="Along" value={axis} options={axisOptions} onChange={value => { setAxis(value); setError(null) }} />}
      {mode === 'distribute' && field(<>
        <Select label="From end part" value={fromId} options={partOptions} onChange={value => { setFromId(value); setError(null) }} />
        <Select label="To end part" value={toId} options={partOptions} onChange={value => { setToId(value); setError(null) }} />
      </>)}
      {showOffset && <DimInput label="Offset" value={offset} scope={resolved.parameters} onCommit={value => { setOffset(value); setError(null) }} />}
      {draft && <p className="arrange-result" aria-live="polite"><b>Result:</b> {describeRelationship(project, draft)}</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
      <footer>
        <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="button" onClick={apply}>Create relationship</button>
      </footer>
    </div>
  </div>
}
