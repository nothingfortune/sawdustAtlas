import { GripVertical, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { BoardStrip, WoodSpecies } from '../types'

interface Props {
  strips: BoardStrip[]
  woods: WoodSpecies[]
  construction: 'edge' | 'end'
  onReorder: (orderedIds: string[]) => void
  onUpdateStrip: (id: string, patch: Partial<BoardStrip>) => void
  onDeleteStrip: (id: string) => void
}

// First glue-up strip editor with drag-to-reorder (pointer = mouse + touch) and
// keyboard reorder (arrow keys on the grip). Reordering is previewed live and
// committed on drop; the canonical order stays in the parent.
export function StripList({ strips, woods, construction, onReorder, onUpdateStrip, onDeleteStrip }: Props) {
  const listRef = useRef<HTMLDivElement>(null)
  const [order, setOrder] = useState<string[] | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const rendered = order
    ? order.map(id => strips.find(strip => strip.id === id)).filter((strip): strip is BoardStrip => !!strip)
    : strips

  const targetIndexFromY = (clientY: number) => {
    const rows = Array.from(listRef.current?.querySelectorAll('[data-strip-row]') ?? []) as HTMLElement[]
    for (let index = 0; index < rows.length; index += 1) {
      const rect = rows[index]!.getBoundingClientRect()
      if (clientY < rect.top + rect.height / 2) return index
    }
    return Math.max(0, rows.length - 1)
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
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
        <select value={strip.speciesId} onChange={event => onUpdateStrip(strip.id, { speciesId: event.target.value })}>{woods.map(candidate => <option value={candidate.id} key={candidate.id}>{candidate.name}</option>)}</select>
        <input aria-label={`Strip ${index + 1} width`} title="Width in mm" type="number" min="1" step="1" value={strip.width} onChange={event => onUpdateStrip(strip.id, { width: Number(event.target.value) })}/>
        <span>mm</span>
        {construction === 'end' && <><input aria-label={`Strip ${index + 1} trailing angle`} title="Trailing angle" type="number" min="-89" max="89" step="1" value={strip.trailingAngle} onChange={event => onUpdateStrip(strip.id, { trailingAngle: Number(event.target.value) })}/><span>°</span></>}
        <button aria-label={`Delete strip ${index + 1}`} onClick={() => onDeleteStrip(strip.id)}><Trash2/></button>
      </div>
    })}
  </div>
}
