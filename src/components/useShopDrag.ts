import { useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { ShopBlockedZone, ShopItem, ShopProject } from '../types'
import type { Point2D } from '../domain/shopGeometry'
import { createId } from '../id'
import { SCALE, DRAW_ZONE_LABEL } from './shop/constants'
import { clamp, fitZoneToRoom } from './shop/shopPlannerHelpers'

// Pointer-drag, pinch-zoom, and no-go-zone-draw wiring for the workshop floor
// plan. State (draggingId, dragPreview, zoom, draftZone) stays owned by
// ShopPlanner — this hook is handed the current values and their setters each
// render and returns the event handlers that drive them, so it re-closes over
// fresh state exactly as the inline closures it replaces did.
export function useShopDrag({
  project,
  onChange,
  update,
  zoom,
  setZoom,
  setDraggingId,
  setDragPreview,
  draftZone,
  setDraftZone,
  setSelected,
  setRightOpen,
}: {
  project: ShopProject | undefined
  onChange: (project: ShopProject) => void
  update: (patch: Partial<ShopProject>) => void
  zoom: number
  setZoom: (zoom: number) => void
  setDraggingId: (id: string | null) => void
  setDragPreview: (preview: { id: string; x: number; y: number } | null) => void
  draftZone: ShopBlockedZone | null
  setDraftZone: (zone: ShopBlockedZone | null) => void
  setSelected: (id: string) => void
  setRightOpen: (open: boolean) => void
}) {
  const zoomRef = useRef(zoom)
  // Latest project, so a drag committed on pointer-up reads current data rather than
  // the drag-start snapshot (removes intra-drag clobbering / stale-closure writes).
  const projectRef = useLiveRef(project)
  const canvasRef = useRef<HTMLDivElement>(null)
  const drawStartRef = useRef<Point2D | null>(null)

  useEffect(() => { zoomRef.current = zoom }, [zoom])

  // Shared drag loop: preview the move with local state, and commit exactly one
  // change on release (never on cancel/Escape), reading the latest project so the
  // single write can't clobber a concurrent edit. commit() applies the finished
  // position through onChange for whichever kind (item or zone) is being dragged.
  function beginDrag(event: ReactPointerEvent, id: string, startX: number, startY: number, widthMm: number, depthMm: number, commit: (x: number, y: number) => void) {
    event.currentTarget.setPointerCapture(event.pointerId)
    setDraggingId(id)
    const origin = { x: event.clientX, y: event.clientY }
    let latest = { x: startX, y: startY }
    let moved = false
    const move = (next: PointerEvent) => {
      const proj = projectRef.current
      const x = clamp(startX + (next.clientX - origin.x) / (SCALE * zoomRef.current), 0, Math.max(0, (proj?.width ?? 0) - widthMm))
      const y = clamp(startY + (next.clientY - origin.y) / (SCALE * zoomRef.current), 0, Math.max(0, (proj?.depth ?? 0) - depthMm))
      latest = { x, y }
      moved = true
      setDragPreview({ id, x, y })
    }
    const cleanup = () => {
      setDraggingId(null)
      setDragPreview(null)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', onKey)
    }
    const up = () => { if (moved) commit(latest.x, latest.y); cleanup() }
    const cancel = () => cleanup()
    const onKey = (keyEvent: KeyboardEvent) => { if (keyEvent.key === 'Escape') cleanup() }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', onKey)
  }

  function beginItemDrag(event: ReactPointerEvent, target: ShopItem) {
    setSelected(`item:${target.id}`)
    beginDrag(event, target.id, target.x, target.y, target.width, target.depth, (x, y) => {
      const proj = projectRef.current
      if (proj) onChange({ ...proj, items: proj.items.map(candidate => candidate.id === target.id ? { ...candidate, x, y } : candidate), updatedAt: new Date().toISOString() })
    })
  }

  function beginZoneDrag(event: ReactPointerEvent, target: ShopBlockedZone) {
    setSelected(`zone:${target.id}`)
    beginDrag(event, target.id, target.x, target.y, target.width, target.depth, (x, y) => {
      const proj = projectRef.current
      if (proj) onChange({ ...proj, blockedZones: proj.blockedZones.map(candidate => candidate.id === target.id ? fitZoneToRoom({ ...candidate, x, y }, proj) : candidate), updatedAt: new Date().toISOString() })
    })
  }

  const draftZoneRef = useLiveRef(draftZone)

  function beginZoneDraw(event: ReactPointerEvent<HTMLDivElement>) {
    if (!project || event.target !== event.currentTarget) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const start = getCanvasPoint(event.clientX, event.clientY, canvasRef.current, zoomRef.current, project)
    if (!start) return
    drawStartRef.current = start
    setDraftZone(zoneFromPoints(start, start))
    const move = (next: PointerEvent) => {
      const current = getCanvasPoint(next.clientX, next.clientY, canvasRef.current, zoomRef.current, project)
      if (!current || !drawStartRef.current) return
      setDraftZone(zoneFromPoints(drawStartRef.current, current))
    }
    const up = () => {
      const nextDraft = draftZoneRef.current
      if (project && nextDraft && nextDraft.width >= 120 && nextDraft.depth >= 120) {
        const created = fitZoneToRoom({ ...nextDraft, id: createId(), name: `${DRAW_ZONE_LABEL} ${project.blockedZones.length + 1}` }, project)
        update({ blockedZones: [...project.blockedZones, created] })
        setSelected(`zone:${created.id}`)
        setRightOpen(true)
      }
      drawStartRef.current = null
      setDraftZone(null)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const pinchPointers = useRef(new Map<number, { x: number; y: number }>())
  const pinchStart = useRef<{ dist: number; zoom: number } | null>(null)
  const pinchDist = () => { const [a, b] = [...pinchPointers.current.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0 }
  const onStagePointerDown = (event: ReactPointerEvent) => {
    pinchPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pinchPointers.current.size === 2) pinchStart.current = { dist: pinchDist() || 1, zoom }
  }
  const onStagePointerMove = (event: ReactPointerEvent) => {
    if (!pinchPointers.current.has(event.pointerId)) return
    pinchPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pinchPointers.current.size === 2 && pinchStart.current) setZoom(clamp(pinchStart.current.zoom * (pinchDist() / pinchStart.current.dist), .35, 1.25))
  }
  const onStagePointerEnd = (event: ReactPointerEvent) => {
    pinchPointers.current.delete(event.pointerId)
    if (pinchPointers.current.size < 2) pinchStart.current = null
  }

  return { canvasRef, beginItemDrag, beginZoneDrag, beginZoneDraw, onStagePointerDown, onStagePointerMove, onStagePointerEnd }
}

function zoneFromPoints(start: Point2D, end: Point2D): ShopBlockedZone {
  return {
    id: 'draft',
    name: DRAW_ZONE_LABEL,
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.max(1, Math.abs(end.x - start.x)),
    depth: Math.max(1, Math.abs(end.y - start.y)),
  }
}

function getCanvasPoint(clientX: number, clientY: number, canvas: HTMLDivElement | null, zoom: number, project: ShopProject): Point2D | null {
  if (!canvas) return null
  const bounds = canvas.getBoundingClientRect()
  const x = clamp((clientX - bounds.left) / zoom / SCALE, 0, project.width)
  const y = clamp((clientY - bounds.top) / zoom / SCALE, 0, project.depth)
  return { x, y }
}

function useLiveRef<T>(value: T) {
  const ref = useRef(value)
  useEffect(() => { ref.current = value }, [value])
  return ref
}
