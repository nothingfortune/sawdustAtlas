import { GripVertical } from 'lucide-react'
import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { SliceState } from '../domain/boardSlices'

interface Props {
  states: SliceState[]
  onReorder: (order: number[]) => void
  onCycle: (index: number) => void
  onSelect?: (index: number) => void
}

// BOARD-009 slice reorder strip. Each chip is one final slice; drag the grip
// (pointer = mouse + touch) or use arrow keys to reorder, and tap the body to
// cycle its rotate/flip orientation. Mirrors StripList: reordering previews
// live and commits on drop, with the canonical order held by the parent.
export function SliceOrderList({ states, onReorder, onCycle, onSelect }: Props) {
  const listRef = useRef<HTMLDivElement>(null)
  const slotRectsRef = useRef<Array<{ index: number; midX: number; midY: number; top: number; bottom: number }>>([])
  const [order, setOrder] = useState<number[] | null>(null)
  const [draggingKey, setDraggingKey] = useState<number | null>(null)

  const baseOrder = states.map((_, index) => index)
  const rendered = order ?? baseOrder

  // Fixed slot rects captured at drag start. The chips can wrap, so target by
  // row first and then by x-position within that row.
  const targetIndexFromPoint = (clientX: number, clientY: number) => {
    const rects = slotRectsRef.current
    if (rects.length === 0) return 0
    const containingRow = rects.filter(rect => clientY >= rect.top && clientY <= rect.bottom)
    const row = containingRow.length > 0
      ? containingRow
      : rects.filter(rect => {
        const nearestY = Math.min(...rects.map(candidate => Math.abs(candidate.midY - clientY)))
        return Math.abs(rect.midY - clientY) === nearestY
      })
    const orderedRow = [...row].sort((a, b) => a.midX - b.midX)
    for (const rect of orderedRow) if (clientX < rect.midX) return rect.index
    return orderedRow.at(-1)?.index ?? rects.length - 1
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>, key: number) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const cells = Array.from(listRef.current?.querySelectorAll('[data-slice-cell]') ?? []) as HTMLElement[]
    slotRectsRef.current = cells.map((cell, index) => {
      const rect = cell.getBoundingClientRect()
      return { index, midX: rect.left + rect.width / 2, midY: rect.top + rect.height / 2, top: rect.top, bottom: rect.bottom }
    })
    setOrder(baseOrder)
    setDraggingKey(key)
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (draggingKey === null || !order) return
    const current = order.indexOf(draggingKey)
    const target = targetIndexFromPoint(event.clientX, event.clientY)
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
        <button
          className="slice-chip-body"
          onPointerEnter={() => onSelect?.(key)}
          onFocus={() => onSelect?.(key)}
          onClick={() => { onSelect?.(key); onCycle(key) }}
          aria-label={`Slice ${state.sourceIndex + 1}: ${tag(state)} in slot ${index + 1}. Tap to preview and change orientation`}
        >
          <b>{state.sourceIndex + 1}</b><small>slot {index + 1}</small><span>{tag(state)}</span>
        </button>
      </div>
    })}
  </div>
}

function tag(state: SliceState) { return `${state.rotated ? 'R' : ''}${state.flipped ? 'F' : ''}` || 'N' }
