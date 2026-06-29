import { GripVertical, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { BoardStrip, WoodSpecies } from '../types'
import { formatLength, lengthUnitLabel } from '../domain/lengthUnits'
import { angledFaceWidth } from '../domain/boardAngle'
import { SQUARE_ANGLE_TOLERANCE_DEG } from '../domain/units'
import { LengthInput } from './fields'
import { useUnitSystem } from './unitSystem'

interface Props {
  strips: BoardStrip[]
  woods: WoodSpecies[]
  construction: 'edge' | 'end'
  /** End-grain stock thickness, used to show an angled strip's opposite-face width. */
  stockThicknessMm?: number
  onReorder: (orderedIds: string[]) => void
  onUpdateStrip: (id: string, patch: Partial<BoardStrip>) => void
  onDeleteStrip: (id: string) => void
}

// First glue-up strip editor with drag-to-reorder (pointer = mouse + touch) and
// keyboard reorder (arrow keys on the grip). Reordering is previewed live and
// committed on drop; the canonical order stays in the parent.
export function StripList({ strips, woods, construction, stockThicknessMm = 0, onReorder, onUpdateStrip, onDeleteStrip }: Props) {
  const { lengthUnit } = useUnitSystem()
  const listRef = useRef<HTMLDivElement>(null)
  const slotMidsRef = useRef<number[]>([])
  const [order, setOrder] = useState<string[] | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const stripById = new Map(strips.map(strip => [strip.id, strip]))
  // Use the in-progress drag order only while it still exactly matches the
  // current strips; if it's stale (a drag that didn't clean up, or strips
  // regenerated with new ids), fall back to the real strips so the list can
  // never render empty and "lose" the user's strips.
  const orderValid = !!order && order.length === strips.length && order.every(id => stripById.has(id))
  const rendered = order && orderValid ? order.map(id => stripById.get(id)!) : strips

  // Fixed slot mid-lines captured once at drag start, so pointermove maps to a
  // target index without reading layout (getBoundingClientRect) on every move.
  const targetIndexFromY = (clientY: number) => {
    const mids = slotMidsRef.current
    for (let index = 0; index < mids.length; index += 1) {
      if (clientY < mids[index]!) return index
    }
    return Math.max(0, mids.length - 1)
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const rows = Array.from(listRef.current?.querySelectorAll('[data-strip-row]') ?? []) as HTMLElement[]
    slotMidsRef.current = rows.map(row => { const rect = row.getBoundingClientRect(); return rect.top + rect.height / 2 })
    setOrder(strips.map(strip => strip.id))
    setDraggingId(id)
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!draggingId || !order) return
    const current = order.indexOf(draggingId)
    const target = targetIndexFromY(event.clientY)
    if (current === -1 || target === current) return
    const next = [...order]
    next.splice(current, 1)
    next.splice(target, 0, draggingId)
    setOrder(next)
  }
  const endDrag = () => {
    if (draggingId && order) onReorder(order)
    setDraggingId(null)
    setOrder(null)
  }
  const moveByKey = (id: string, direction: -1 | 1) => {
    const ids = strips.map(strip => strip.id)
    const index = ids.indexOf(id)
    const swap = index + direction
    if (index === -1 || swap < 0 || swap >= ids.length) return
    ids[index] = ids[swap]!
    ids[swap] = id
    onReorder(ids)
  }

  return <div className="strip-list" ref={listRef}>
    {rendered.map((strip, index) => {
      const wood = woods.find(candidate => candidate.id === strip.speciesId) ?? woods[0]
      return <div className={`strip-row${draggingId === strip.id ? ' dragging' : ''}`} key={strip.id} data-strip-row>
        <button
          className="grip-handle"
          aria-label={`Reorder strip ${index + 1} (arrow keys)`}
          onPointerDown={event => onPointerDown(event, strip.id)}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={event => {
            if (event.key === 'ArrowUp') { event.preventDefault(); moveByKey(strip.id, -1) }
            if (event.key === 'ArrowDown') { event.preventDefault(); moveByKey(strip.id, 1) }
          }}
        ><GripVertical/></button>
        <span className="swatch" style={{ background: wood?.color ?? '#8c6a48' }}/>
        <select aria-label={`Strip ${index + 1} species`} value={strip.speciesId} onChange={event => onUpdateStrip(strip.id, { speciesId: event.target.value })}>{woods.map(candidate => <option value={candidate.id} key={candidate.id}>{candidate.name}</option>)}</select>
        <LengthInput ariaLabel={`Strip ${index + 1} width`} title={`Width in ${lengthUnitLabel(lengthUnit)}`} value={strip.width} min={1} onChange={value => onUpdateStrip(strip.id, { width: value })}/>
        <span>{lengthUnitLabel(lengthUnit)}</span>
        {construction === 'end' && <><input aria-label={`Strip ${index + 1} trailing angle`} title="Trailing angle" type="number" min="-89" max="89" step="1" value={strip.trailingAngle} onChange={event => onUpdateStrip(strip.id, { trailingAngle: Number(event.target.value) })}/><span>°</span></>}
        <button aria-label={`Delete strip ${index + 1}`} onClick={() => onDeleteStrip(strip.id)}><Trash2/></button>
        {construction === 'end' && Math.abs(strip.trailingAngle) > SQUARE_ANGLE_TOLERANCE_DEG && <span className="strip-face-hint" title="The two faces of this angled strip: the width you set, and the opposite (angled) face.">Faces {formatLength(strip.width, lengthUnit)} → {formatLength(angledFaceWidth(strip.width, stockThicknessMm, strip.trailingAngle), lengthUnit)}</span>}
      </div>
    })}
  </div>
}
