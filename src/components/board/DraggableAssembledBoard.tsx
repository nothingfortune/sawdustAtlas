import { useRef, useState } from 'react'
import type { ReactNode, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { BoardProject } from '../../types'
import type { EndGrainTemplate } from '../../domain/boardGeometry'
import type { SliceState } from '../../domain/boardSlices'
import { dropTargetFromX, orderWithKeyAt } from '../sliceDrag'
import { SliceFace } from './AssembledBoard'

// Drag-to-reorder assembled board for the pop-out. One pointer per column: a
// press without movement cycles rotate/flip (as AssembledBoard does); a press
// that moves past a small threshold lifts the column, opens a dashed gap at the
// drop slot, and commits a new slot order on release. Two-finger pinch is left
// to the pop-out viewport, so single-finger gestures are unambiguously a drag.
export function DraggableAssembledBoard({ project, template, sliceCount, pxPerMm, onToggleRow, onReorder, clipIdPrefix = 'edit-slice' }: { project: BoardProject; template: EndGrainTemplate; sliceCount: number; pxPerMm: number; onToggleRow: (index: number) => void; onReorder: (order: number[]) => void; clipIdPrefix?: string }) {
  const groupRef = useRef<SVGGElement>(null)
  const rectsRef = useRef<Array<{ slot: number; mid: number; width: number }>>([])
  const [drag, setDrag] = useState<{ key: number; startX: number; dx: number; moved: boolean; effPx: number; target: number } | null>(null)
  const thickness = Math.max(project.endGrain.stockThickness, 0.001)
  const height = Math.max(template.height, 0.001)
  const k = 1 / pxPerMm
  const slots = Array.from({ length: sliceCount }, (_, index) => index)

  // Slot centres in screen px, captured at drag start (robust to pinch zoom).
  const captureRects = () => {
    const groups = Array.from(groupRef.current?.querySelectorAll('[data-slot]') ?? []) as SVGGElement[]
    rectsRef.current = groups.map(group => {
      const rect = group.getBoundingClientRect()
      return { slot: Number(group.getAttribute('data-slot')), mid: rect.left + rect.width / 2, width: rect.width }
    })
  }
  const onPointerDown = (event: ReactPointerEvent<SVGGElement>) => {
    const cell = (event.target as Element).closest('[data-slot]')
    if (!cell) return
    const slot = Number(cell.getAttribute('data-slot'))
    if (sliceCount < 2) { onToggleRow(slot); return }
    event.currentTarget.setPointerCapture(event.pointerId)
    captureRects()
    const self = rectsRef.current.find(rect => rect.slot === slot)
    setDrag({ key: slot, startX: event.clientX, dx: 0, moved: false, effPx: self && self.width > 0 ? self.width / thickness : pxPerMm, target: slot })
  }
  const onPointerMove = (event: ReactPointerEvent<SVGGElement>) => {
    const clientX = event.clientX
    // 10px slop so a tap (which jitters on touch) stays a tap and rotates,
    // rather than being read as a drag that just lifts the wafer and does nothing.
    setDrag(current => current && { ...current, dx: clientX - current.startX, moved: current.moved || Math.abs(clientX - current.startX) > 10, target: dropTargetFromX(rectsRef.current.map(rect => rect.mid), clientX) })
  }
  const endDrag = () => {
    // Read drag from state and fire the parent update OUTSIDE setDrag's updater —
    // calling onReorder/onToggleRow inside it would setState during render.
    if (drag) {
      // Only reorder if the column actually lands on a different slot; otherwise
      // (a tap, or a drag returned to origin) cycle this wafer's rotate/flip.
      if (drag.moved && drag.target !== drag.key) onReorder(orderWithKeyAt(sliceCount, drag.key, drag.target))
      else onToggleRow(drag.key)
    }
    setDrag(null)
  }

  // Keyboard operation of a slice column (parallels the pointer path): Enter/Space
  // cycles rotate/flip like a tap; Left/Right arrows move the slice one slot like a
  // drag-reorder. Columns are keyed by slot position, so focus stays on the slot the
  // pointer is at across a reorder rather than being lost.
  const onColumnKeyDown = (event: ReactKeyboardEvent<SVGGElement>, slot: number) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onToggleRow(slot); return }
    const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
    if (direction === 0 || sliceCount < 2) return
    const target = Math.min(Math.max(slot + direction, 0), sliceCount - 1)
    if (target === slot) return
    event.preventDefault()
    onReorder(orderWithKeyAt(sliceCount, slot, target))
  }
  const column = (slot: number, position: number, dragging = false) => {
    const state: SliceState = { rotated: project.endGrain.rowRotations[slot] ?? false, flipped: project.endGrain.rowFlips[slot] ?? false, offset: project.endGrain.rowOffsets?.[slot] ?? 0, sourceIndex: project.endGrain.rowOrder?.[slot] ?? slot }
    const tag = `${state.rotated ? 'R' : ''}${state.flipped ? 'F' : ''}` || 'N'
    const x = dragging ? slot * thickness + drag!.dx / drag!.effPx : position * thickness
    return <g key={dragging ? 'dragged' : `slot-${slot}`} {...(dragging ? {} : { 'data-slot': slot, tabIndex: 0, role: 'button', onKeyDown: (event: ReactKeyboardEvent<SVGGElement>) => onColumnKeyDown(event, slot) })} transform={`translate(${x} 0)`} className={`slice${dragging ? ' dragging' : ''}`} aria-label={`Slice ${slot + 1}: ${tag}`}>
      <SliceFace project={project} template={template} state={state} clipId={`${clipIdPrefix}-${slot}`}/>
      <rect className="slice-hit" width={thickness} height={height} fill="transparent"/>
      <g transform={`translate(${thickness / 2} ${height / 2}) scale(${k})`}><text className="slice-label" textAnchor="middle" dominantBaseline="middle">{tag}</text></g>
    </g>
  }

  let body: ReactNode
  if (drag && drag.moved) {
    const others = slots.filter(slot => slot !== drag.key)
    let next = 0
    const placed = slots.filter(position => position !== drag.target).map(position => column(others[next++]!, position))
    body = <>
      <rect className="drop-target" x={drag.target * thickness} y={0} width={thickness} height={height}/>
      {placed}
      {column(drag.key, drag.target, true)}
    </>
  } else {
    body = slots.map(slot => column(slot, slot))
  }

  return <g ref={groupRef} className={`assembled-editable${drag && drag.moved ? ' is-dragging' : ''}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}>{body}</g>
}
