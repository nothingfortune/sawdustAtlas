import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { ShopBlockedZone, ShopProject } from '../../types'
import { SCALE, DRAW_ZONE_LABEL } from './constants'

export function BlockedZoneLayer({
  project,
  draftZone,
  selectedZoneId,
  draggingId,
  dragPreview,
  onPointerDown,
  onKeyDown,
}: {
  project: ShopProject
  draftZone: ShopBlockedZone | null
  selectedZoneId: string
  draggingId: string | null
  dragPreview: { id: string; x: number; y: number } | null
  onPointerDown: (event: ReactPointerEvent, target: ShopBlockedZone) => void
  onKeyDown: (event: ReactKeyboardEvent, target: ShopBlockedZone) => void
}) {
  return <>
    {project.blockedZones.map(blockedZone => {
      const preview = dragPreview?.id === blockedZone.id ? dragPreview : blockedZone
      return <div key={blockedZone.id} role="button" tabIndex={0} aria-label={`${blockedZone.name}, blocked floor area`} aria-pressed={selectedZoneId === blockedZone.id} className={`blocked-zone ${selectedZoneId === blockedZone.id ? 'selected' : ''} ${draggingId === blockedZone.id ? 'dragging' : ''}`} onPointerDown={event => { event.stopPropagation(); onPointerDown(event, blockedZone) }} onKeyDown={event => onKeyDown(event, blockedZone)} style={{ left: preview.x * SCALE, top: preview.y * SCALE, width: blockedZone.width * SCALE, height: blockedZone.depth * SCALE }}>
      <span>{blockedZone.name}</span>
    </div>
    })}
    {draftZone && <div className="blocked-zone preview" style={{ left: draftZone.x * SCALE, top: draftZone.y * SCALE, width: draftZone.width * SCALE, height: draftZone.depth * SCALE }}><span>{DRAW_ZONE_LABEL}</span></div>}
  </>
}
