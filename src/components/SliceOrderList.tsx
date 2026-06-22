import { GripVertical } from 'lucide-react'
import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { SliceState } from '../domain/boardSlices'

interface Props {
  states: SliceState[]
  onReorder: (order: number[]) => void
  onCycle: (index: number) => void
}

// BOARD-009 slice reorder strip. Each chip is one final slice; drag the grip
// (pointer = mouse + touch) or use arrow keys to reorder, and tap the body to
// cycle its rotate/flip orientation. Mirrors StripList: reordering previews
// live and commits on drop, with the canonical order held by the parent.
export function SliceOrderList({ states, onReorder, onCycle }: Props) {
  const listRef = useRef<HTMLDivElement>(null)
  const slotMidsRef = useRef<number[]>([])
  const [order, setOrder] = useState<number[] | null>(null)
  const [draggingKey, setDraggingKey] = useState<number | null>(null)

  const baseOrder = states.map((_, index) => index)
  const rendered = order ?? baseOrder

  // Fixed slot mid-lines captured at drag start so pointermove maps to a target
  // index without re-measuring layout on every move.
  const targetIndexFromX = (clientX: number) => {
    const mids = slotMidsRef.current
    for (let index = 0; index < mids.length; index += 1) if (clientX < mids[index]!) return index
    return Math.max(0, mids.length - 1)
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>, key: number) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const cells = Array.from(listRef.current?.querySelectorAll('[data-slice-cell]') ?? []) as HTMLElement[]
    slotMidsRef.current = cells.map(cell => { const rect = cell.getBoundingClientRect(); return rect.left + rect.width / 2 })
    setOrder(baseOrder)
    setDraggingKey(key)
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (draggingKey === null || !order) return
    const current = order.indexOf(draggingKey)
    const target = targetIndexFromX(event.clientX)
    if (current === -1 || target === current) return
    const next = [...order]
    next.splice(current, 1)
    next.splice(target, 0, draggingKey)
    setOrder(next)
  }
  const endDrag = () => {
    if (draggingKey !== null && order) onReorder(order)
    setDraggingKey(null)
    setOrder(null)
  }
  const moveByKey = (key: number, direction: -1 | 1) => {
    const index = baseOrder.indexOf(key)
    const swap = index + direction
    if (index === -1 || swap < 0 || swap >= baseOrder.length) return
    const next = [...baseOrder]
    next[index] = next[swap]!
    next[swap] = key
    onReorder(next)
  }

  if (states.length === 0) return null
  return <div className="slice-order" ref={listRef}>
    {rendered.map((key, index) => {
      const state = states[key]
      if (!state) return null
      return <div className={`slice-chip${draggingKey === key ? ' dragging' : ''}`} key={key} data-slice-cell>
        <button
          className="grip-handle"
          aria-label={`Reorder slice ${index + 1} (arrow keys)`}
          onPointerDown={event => onPointerDown(event, key)}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={event => {
            if (event.key === 'ArrowLeft') { event.preventDefault(); moveByKey(key, -1) }
            if (event.key === 'ArrowRight') { event.preventDefault(); moveByKey(key, 1) }
          }}
        ><GripVertical/></button>
        <button className="slice-chip-body" onClick={() => onCycle(key)} aria-label={`Slice ${index + 1}: ${tag(state)}. Tap to change orientation`}>
          <b>{index + 1}</b><span>{tag(state)}</span>
        </button>
      </div>
    })}
  </div>
}

function tag(state: SliceState) { return `${state.rotated ? 'R' : ''}${state.flipped ? 'F' : ''}` || 'N' }
