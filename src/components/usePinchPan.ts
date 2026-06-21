import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

export interface PinchPan {
  scale: number
  x: number
  y: number
  active: boolean
  reset: () => void
  handlers: {
    onPointerDown: (event: ReactPointerEvent) => void
    onPointerMove: (event: ReactPointerEvent) => void
    onPointerUp: (event: ReactPointerEvent) => void
    onPointerCancel: (event: ReactPointerEvent) => void
  }
}

// Two-finger pinch-zoom + pan for a touch canvas. Only engages with two active
// pointers, so single-finger taps/drags (e.g. tapping a slice) pass through and
// a mouse (one pointer) never triggers it. Apply the returned transform to the
// content element and spread handlers on its wrapper (with touch-action:none).
export function usePinchPan(min = 1, max = 4): PinchPan {
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 })
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ dist: number; cx: number; cy: number; scale: number; x: number; y: number } | null>(null)

  const begin = () => {
    const pts = [...pointers.current.values()]
    if (pts.length < 2) return
    const [a, b] = pts as [{ x: number; y: number }, { x: number; y: number }]
    gesture.current = {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
      scale: transform.scale,
      x: transform.x,
      y: transform.y,
    }
  }

  const onPointerDown = (event: ReactPointerEvent) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 2) { event.currentTarget.setPointerCapture(event.pointerId); begin() }
  }
  const onPointerMove = (event: ReactPointerEvent) => {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const start = gesture.current
    if (pointers.current.size !== 2 || !start) return
    const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }]
    const dist = Math.hypot(a.x - b.x, a.y - b.y)
    const cx = (a.x + b.x) / 2
    const cy = (a.y + b.y) / 2
    const scale = clamp(start.scale * (dist / start.dist), min, max)
    setTransform({ scale, x: start.x + (cx - start.cx), y: start.y + (cy - start.cy) })
  }
  const release = (event: ReactPointerEvent) => {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size < 2) gesture.current = null
  }

  return {
    ...transform,
    active: transform.scale !== 1 || transform.x !== 0 || transform.y !== 0,
    reset: () => setTransform({ scale: 1, x: 0, y: 0 }),
    handlers: { onPointerDown, onPointerMove, onPointerUp: release, onPointerCancel: release },
  }
}

function clamp(value: number, min: number, max: number) { return Math.min(Math.max(value, min), max) }
