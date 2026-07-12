import { useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2, X } from 'lucide-react'
import type { BoardProject, CompositeBoard, WoodSpecies } from '../../types'
import { deskLayout } from '../../domain/compositeBoard'
import { addRow, cycleTransform, moveRow, moveWafer, removeRow, removeWafer, transformWafer } from '../../domain/compositeAssembly'
import { createId } from '../../id'
import { useElementSize } from '../useElementSize'
import { WoodPatterns } from '../board/WoodPatterns'
import { CompositeDefs, TrimMarks, WaferFace } from './WaferFace'

export interface AssemblyDeskProps {
  composite: CompositeBoard
  boards: BoardProject[]
  woods: WoodSpecies[]
  activeRowId: string
  onSelectRow: (rowId: string) => void
  onChange: (composite: CompositeBoard) => void
}

const DRAG_SLOP = 8

export function AssemblyDesk({ composite, boards, woods, activeRowId, onSelectRow, onChange }: AssemblyDeskProps) {
  const [ref, size] = useElementSize()
  // Key the layout on the geometry inputs only, so unrelated composite edits (e.g.
  // renaming, which changes the composite object ref every keystroke) don't rebuild
  // the whole wafer layout. deskLayout reads exactly these fields off `composite`.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const layout = useMemo(() => deskLayout(composite, boards), [composite.rows, composite.panels, composite.construction, boards])
  // Fit to width (rails + padding reserved); tall stacks scroll vertically.
  const avail = Math.max(120, size.width - 180)
  const pxPerMm = Math.min(5, Math.max(0.05, avail / layout.maxRowWidthMm))

  // One-pointer drag-reorder: below the slop it's a tap (cycle transform); past it
  // we relocate the wafer to wherever the pointer is released (within/across rows).
  const drag = useRef<{ rowId: string; index: number; pointerId: number; x: number; y: number; dragging: boolean } | null>(null)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [dropRow, setDropRow] = useState<string | null>(null)

  const onWaferDown = (rowId: string, index: number) => (e: ReactPointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    drag.current = { rowId, index, pointerId: e.pointerId, x: e.clientX, y: e.clientY, dragging: false }
  }
  const onDeskMove = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d || e.pointerId !== d.pointerId) return
    if (!d.dragging) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_SLOP) return
      d.dragging = true
      setDragKey(`${d.rowId}:${d.index}`)
      e.currentTarget.setPointerCapture(d.pointerId)
    }
    setDropRow(resolveDrop(e.clientX, e.clientY)?.rowId ?? null)
  }
  const onDeskUp = (e: ReactPointerEvent) => {
    const d = drag.current
    drag.current = null
    setDragKey(null)
    setDropRow(null)
    if (!d || e.pointerId !== d.pointerId) return
    if (!d.dragging) { onChange(transformWafer(composite, d.rowId, d.index, cycleTransform)); return }
    const target = resolveDrop(e.clientX, e.clientY)
    if (!target) return
    const sameRow = target.rowId === d.rowId
    let to: number
    if (target.kind === 'wafer') {
      const raw = target.index + (target.after ? 1 : 0)
      to = sameRow && raw > d.index ? raw - 1 : raw
    } else {
      to = composite.rows.find(r => r.id === target.rowId)?.wafers.length ?? 0
    }
    onChange(moveWafer(composite, d.rowId, d.index, target.rowId, to))
  }

  return (
    <div className="assembly-desk" aria-label="Assembly desk">
      <div className="desk-toolbar">
        <button type="button" className="row-add" onClick={() => onChange(addRow(composite, 'above', createId, composite.rows[0]?.id))}><Plus size={14} /> Add row on top</button>
        <span className="muted small">Tap a row to make it active, then tap wafers in the parts bag.</span>
      </div>

      <div className="desk-canvas" ref={ref} onPointerMove={onDeskMove} onPointerUp={onDeskUp} onPointerCancel={onDeskUp}>
        <svg className="defs-only" aria-hidden><WoodPatterns woods={woods} /><CompositeDefs /></svg>
        <div className="desk-rows">
          {layout.rows.map((row, ri) => {
            const active = row.rowId === activeRowId
            return (
              <div key={row.rowId} className={`desk-row ${active ? 'active' : ''} ${dropRow === row.rowId ? 'drop-target' : ''}`}>
                <div className="row-rail">
                  <span className="row-grip" title="Row"><GripVertical size={15} /></span>
                  <button type="button" className="icon-button" aria-label="Move row up" disabled={ri === 0} onClick={() => onChange(moveRow(composite, row.rowId, ri - 1))}><ArrowUp size={14} /></button>
                  <button type="button" className="icon-button" aria-label="Move row down" disabled={ri === layout.rows.length - 1} onClick={() => onChange(moveRow(composite, row.rowId, ri + 1))}><ArrowDown size={14} /></button>
                </div>

                <div
                  className="row-body"
                  data-rowdrop
                  data-rowid={row.rowId}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectRow(row.rowId)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectRow(row.rowId) } }}
                  style={{ height: Math.max(28, row.bandHeightMm * pxPerMm) }}
                >
                  {row.wafers.length === 0 && <span className="row-empty-hint">{active ? 'Active — tap a wafer in the parts bag' : 'Empty row'}</span>}
                  {row.wafers.map((w, wi) => {
                    const key = `${row.rowId}:${wi}`
                    return (
                      <div
                        key={wi}
                        className={`desk-wafer ${dragKey === key ? 'dragging' : ''}`}
                        data-wafer
                        data-rowid={row.rowId}
                        data-index={wi}
                        style={{ width: w.footWidthMm * pxPerMm, height: w.footHeightMm * pxPerMm }}
                        onPointerDown={onWaferDown(row.rowId, wi)}
                        title="Tap to rotate/flip · drag to reorder"
                      >
                        <svg viewBox={`0 0 ${Math.max(1, w.footWidthMm)} ${Math.max(1, w.footHeightMm)}`} preserveAspectRatio="none">
                          <WaferFace piece={w.piece} cell={w.wafer} board={boards.find(b => b.id === w.piece.boardId)} />
                          <TrimMarks wafer={w} />
                        </svg>
                        <button
                          type="button"
                          className="wafer-remove"
                          aria-label="Remove wafer"
                          onPointerDown={e => e.stopPropagation()}
                          onClick={e => { e.stopPropagation(); onChange(removeWafer(composite, row.rowId, wi)) }}
                        ><X size={11} /></button>
                      </div>
                    )
                  })}
                </div>

                <div className="row-rail">
                  <button type="button" className="icon-button" aria-label="Add row below" onClick={() => onChange(addRow(composite, 'below', createId, row.rowId))}><Plus size={14} /></button>
                  <button type="button" className="icon-button" aria-label="Delete row" onClick={() => onChange(removeRow(composite, row.rowId))}><Trash2 size={14} /></button>
                </div>
              </div>
            )
          })}
          {layout.rows.length === 0 && (
            <button type="button" className="row-add big" onClick={() => onChange(addRow(composite, 'below', createId))}><Plus size={15} /> Add the first row</button>
          )}
        </div>
      </div>
    </div>
  )
}

type DropTarget =
  | { kind: 'wafer'; rowId: string; index: number; after: boolean }
  | { kind: 'row'; rowId: string }

function resolveDrop(clientX: number, clientY: number): DropTarget | null {
  const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null
  const waferEl = el?.closest('[data-wafer]') as HTMLElement | null
  const waferRowId = waferEl?.dataset['rowid']
  if (waferEl && waferRowId) {
    const rect = waferEl.getBoundingClientRect()
    return { kind: 'wafer', rowId: waferRowId, index: Number(waferEl.dataset['index']), after: clientX > rect.left + rect.width / 2 }
  }
  const rowEl = el?.closest('[data-rowdrop]') as HTMLElement | null
  const rowDropId = rowEl?.dataset['rowid']
  if (rowEl && rowDropId) return { kind: 'row', rowId: rowDropId }
  return null
}
