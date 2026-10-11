import { useMemo, useState } from 'react'
import type { MouseEvent } from 'react'
import { AlignHorizontalJustifyStart, ArrowLeftRight, Link2, Rows3, ScanLine } from 'lucide-react'
import { GRID_STEPS, arrangeAvailability, moveBlocker, pickPart } from '../../domain/furniture/arrange'
import type { GridStep } from '../../domain/furniture/arrange'
import { partTitle } from '../../domain/furniture/editing'
import { explodeOffsets } from '../../domain/furniture/projection'
import type { Axis, FurnitureContext, FurnitureIssue, FurnitureProject, ResolvedFurniture } from '../../domain/furniture/types'
import { formatLengthValue, lengthUnitLabel } from '../../domain/lengthUnits'
import { useUnitSystem } from '../unitSystem'
import { ArrangeDialog } from './ArrangeDialog'
import type { ArrangeMode } from './ArrangeDialog'
import { FurnitureDrawing } from './FurnitureDrawing'
import { FurnitureViewport } from './FurnitureViewport'
import { VIEW_CHOICES } from './useArrange'
import type { Arrange } from './useArrange'

const AXES: readonly Axis[] = ['x', 'y', 'z']
const ARRANGE_ACTIONS: readonly { mode: ArrangeMode; label: string; icon: typeof Link2; needs: string }[] = [
  { mode: 'attach', label: 'Attach', icon: Link2, needs: 'two parts' },
  { mode: 'align', label: 'Align', icon: AlignHorizontalJustifyStart, needs: 'two parts' },
  { mode: 'center', label: 'Center', icon: ScanLine, needs: 'two parts' },
  { mode: 'between', label: 'Between', icon: ArrowLeftRight, needs: 'three parts' },
  { mode: 'distribute', label: 'Distribute', icon: Rows3, needs: 'two end parts and the parts to space, four or more in all' },
]

function gridLabel(step: GridStep, lengthUnit: 'metric' | 'imperial'): string {
  return step === 0 ? 'Off' : `${formatLengthValue(step, lengthUnit)} ${lengthUnitLabel(lengthUnit)}`
}

// The center of the designer: the view switcher, the drawing or 3D view, the arranging
// actions, and the controls for moving parts by hand. Selection is owned by the
// designer; every project change goes up through `onChange`.
export function DesignArea({ project, resolved, issues, context, selection, arrange, size, onSelect, onChange, onAnnounce }: {
  project: FurnitureProject
  resolved: ResolvedFurniture
  issues: readonly FurnitureIssue[]
  context: FurnitureContext
  selection: readonly string[]
  arrange: Arrange
  /** The overall size, already formatted. */
  size: string
  onSelect: (selection: string[]) => void
  onChange: (project: FurnitureProject) => void
  onAnnounce: (message: string) => void
}) {
  const { lengthUnit } = useUnitSystem()
  const { view, setView, grid, setGrid, dragAxis, setDragAxis, explode, setExplode, onNudgeKey, drag } = arrange
  const [dialog, setDialog] = useState<ArrangeMode | null>(null)
  const available = arrangeAvailability(selection.length)
  const errorIds = useMemo(() => issues.filter(issue => issue.severity === 'error').flatMap(issue => issue.partIds ?? []), [issues])
  const offsets = useMemo(() => {
    if (view !== 'exploded' || !resolved.bounds) return undefined
    const { sx, sy, sz } = resolved.bounds
    return explodeOffsets(project, resolved.parts, (Math.max(sx, sy, sz) * explode) / 100)
  }, [view, project, resolved, explode])
  const pick = (partId: string, additive: boolean) => onSelect(pickPart(selection, partId, additive))
  // A click on empty drawing space clears the selection; a click on a part is its own.
  const clearOnBackground = (event: MouseEvent<HTMLElement>) => {
    if (!(event.target as Element).closest('[data-part-id]')) onSelect([])
  }

  const selectedId = selection[selection.length - 1]
  const selectionLine = selection.length === 0 ? 'No part selected'
    : selection.length === 1 ? `Selected: ${partTitle(project, selection[0]!)}`
    : `${selection.length} parts selected: ${selection.map(id => partTitle(project, id)).join(', ')}`
  const blocked = view === '3d' && selectedId ? moveBlocker(project, selectedId, dragAxis) : null

  return <section className="furniture-center" aria-label="Design area">
    <div className="design-toolbar">
      <div className="segmented" role="group" aria-label="View">
        {VIEW_CHOICES.map(choice => <button key={choice.id} type="button" aria-pressed={view === choice.id} className={view === choice.id ? 'active' : ''} onClick={() => setView(choice.id)}>{choice.label}</button>)}
      </div>
      {view === '3d' && <div className="segmented" role="group" aria-label="Drag along">
        {AXES.map(axis => <button key={axis} type="button" aria-pressed={dragAxis === axis} className={dragAxis === axis ? 'active' : ''} aria-label={`Drag along ${axis.toUpperCase()}`} onClick={() => setDragAxis(axis)}>{axis.toUpperCase()}</button>)}
      </div>}
      <div className="field design-grid">
        <label htmlFor="design-grid">Snap grid</label>
        <select id="design-grid" value={grid} onChange={event => setGrid(Number(event.target.value) as GridStep)}>
          {GRID_STEPS.map(step => <option key={step} value={step}>{gridLabel(step, lengthUnit)}</option>)}
        </select>
      </div>
      {view === 'exploded' && <div className="field design-explode">
        <label htmlFor="design-explode">Explode distance</label>
        <input id="design-explode" type="range" min={0} max={100} step={5} value={explode} onChange={event => setExplode(Number(event.target.value))} />
      </div>}
    </div>
    <div className="design-toolbar" role="group" aria-label="Arrange selected parts">
      {ARRANGE_ACTIONS.map(({ mode, label, icon: Icon, needs }) => <button key={mode} type="button" className="button secondary" disabled={!available[mode]} title={available[mode] ? undefined : `Select ${needs}`} onClick={() => setDialog(mode)}><Icon size={15} aria-hidden="true" />{label}</button>)}
    </div>
    {blocked && <p className="design-note" aria-live="polite">{blocked}</p>}
    <div className="design-stage" role="presentation" onKeyDown={onNudgeKey} onClick={view === '3d' ? undefined : clearOnBackground}>
      <div className="design-canvas">
      {resolved.parts.length === 0
        ? <p className="furniture-empty">Nothing to draw yet. Add a part from the Parts panel.</p>
        : view === '3d'
          ? <FurnitureViewport parts={resolved.parts} selectedIds={selection} errorIds={errorIds} drag={drag} onSelect={pick}
            onFallback={() => { setView('iso'); onAnnounce('The 3D view is unavailable, so the isometric view is showing.') }} />
          : <FurnitureDrawing parts={resolved.parts} view={view} explodeOffsets={offsets} selectedIds={selection} errorIds={errorIds} showLabels onSelect={pick} />}
    </div>
    </div>
    <div className="design-footer">
      <b className="furniture-selection-line">{selectionLine}</b>
      <span>Overall size: {size}</span>
      {view !== '3d' && <span className="panel-hint">Arrow keys nudge the selection, Shift for ten times as far.</span>}
    </div>
    {dialog && <ArrangeDialog mode={dialog} project={project} resolved={resolved} context={context} selection={selection}
      onApply={(next, summary) => { setDialog(null); onChange(next); onAnnounce(summary) }} onClose={() => setDialog(null)} />}
  </section>
}
