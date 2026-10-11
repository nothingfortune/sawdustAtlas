import { useMemo, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { moveBlocker, movePart, nudgeDirection, nudgeDistance, nudgeParts, snapMove } from '../../domain/furniture/arrange'
import type { GridStep } from '../../domain/furniture/arrange'
import { partTitle } from '../../domain/furniture/editing'
import type { DrawingView } from '../../domain/furniture/projection'
import type { Axis, FurnitureProject, ResolvedFurniture } from '../../domain/furniture/types'
import { formatLength } from '../../domain/lengthUnits'
import { useUnitSystem } from '../unitSystem'
import type { PartDrag } from './FurnitureViewport3D'

export type DesignView = '3d' | DrawingView

export const VIEW_CHOICES: readonly { id: DesignView; label: string }[] = [
  { id: '3d', label: '3D' },
  { id: 'front', label: 'Front' },
  { id: 'side', label: 'Side' },
  { id: 'top', label: 'Top' },
  { id: 'iso', label: 'Iso' },
  { id: 'exploded', label: 'Exploded' },
]

export interface Arrange {
  view: DesignView
  setView: (view: DesignView) => void
  grid: GridStep
  setGrid: (grid: GridStep) => void
  dragAxis: Axis
  setDragAxis: (axis: Axis) => void
  /** Explode distance, percent of the piece's largest dimension. */
  explode: number
  setExplode: (percent: number) => void
  /** Moves the selection with the arrow and page keys; ignores everything else. */
  onNudgeKey: (event: KeyboardEvent<HTMLElement>) => void
  /** Drag settings for the 3D view. */
  drag: PartDrag
}

const EDITABLE = new Set(['INPUT', 'SELECT', 'TEXTAREA'])

// The designer's view, grid, and drag state, plus the two ways to move parts by hand:
// arrow-key nudges and the 3D drag. Both write literal positions through `onChange`
// (one commit each) and never resize anything.
export function useArrange({ project, resolved, selection, onChange, announce }: {
  project: FurnitureProject
  resolved: ResolvedFurniture
  selection: readonly string[]
  onChange: (project: FurnitureProject) => void
  announce: (message: string) => void
}): Arrange {
  const { lengthUnit } = useUnitSystem()
  const [view, setView] = useState<DesignView>('iso')
  const [grid, setGrid] = useState<GridStep>(0)
  const [dragAxis, setDragAxis] = useState<Axis>('x')
  const [explode, setExplode] = useState(25)

  const onNudgeKey = (event: KeyboardEvent<HTMLElement>) => {
    const direction = nudgeDirection(event.key, view)
    if (!direction || selection.length === 0 || event.altKey || event.ctrlKey || event.metaKey || EDITABLE.has((event.target as HTMLElement).tagName)) return
    event.preventDefault()
    const distance = nudgeDistance(grid, event.shiftKey)
    const result = nudgeParts(project, resolved, selection, direction.axis, direction.sign * distance)
    if (result.moved.length > 0) onChange(result.project)
    const what = result.moved.length === 1 ? partTitle(project, result.moved[0]!) : `${result.moved.length} parts`
    const blocked = result.blocked[0]?.reason
    announce([
      result.moved.length > 0 ? `Moved ${what} ${formatLength(distance, lengthUnit)} ${direction.sign > 0 ? '+' : '-'}${direction.axis.toUpperCase()}.` : '',
      blocked ?? '',
    ].filter(Boolean).join(' '))
  }

  const drag = useMemo<PartDrag>(() => ({
    axis: dragAxis,
    blocker: partId => moveBlocker(project, partId, dragAxis),
    snap: (partId, proposed, tolerance) => {
      const box = resolved.parts.find(part => part.id === partId)?.box
      if (!box) return proposed
      const others = resolved.parts.filter(part => part.id !== partId).map(part => part.box)
      return snapMove(box, dragAxis, proposed, others, grid, tolerance).value
    },
    onMove: (partId, value) => {
      const next = movePart(project, partId, dragAxis, value)
      if (!next) return
      onChange(next)
      announce(`Moved ${partTitle(project, partId)} to ${formatLength(value, lengthUnit)} on ${dragAxis.toUpperCase()}.`)
    },
    onBlocked: partId => announce(moveBlocker(project, partId, dragAxis) ?? ''),
  }), [project, resolved, dragAxis, grid, lengthUnit, onChange, announce])

  return { view, setView, grid, setGrid, dragAxis, setDragAxis, explode, setExplode, onNudgeKey, drag }
}
