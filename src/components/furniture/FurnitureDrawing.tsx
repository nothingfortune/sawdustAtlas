import { useId, useMemo } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'
import { projectDrawing } from '../../domain/furniture/projection'
import type { DrawingPolygon, DrawingView, ExplodeOffsets } from '../../domain/furniture/projection'
import type { ResolvedPart } from '../../domain/furniture/types'
import { formatLength } from '../../domain/lengthUnits'
import { useUnitSystem } from '../unitSystem'
import { dimensionGeometry, drawingLayout, faceFill, isCoveredAt, labelFits, labelPolygons, polygonCenter, polygonPath, svgPoint, textWidth, viewBoxAttribute } from './drawingLayout'

export interface FurnitureDrawingProps {
  parts: readonly ResolvedPart[]
  view: DrawingView
  explodeOffsets?: ExplodeOffsets | undefined
  /** Heavy outline plus a label badge. */
  selectedIds?: readonly string[] | undefined
  /** A step's worked parts: medium outline. */
  highlightIds?: readonly string[] | undefined
  /** Earlier work or context: faded with a dashed outline. */
  ghostIds?: readonly string[] | undefined
  /** Parts with design errors: hatched, with a red outline. */
  errorIds?: readonly string[] | undefined
  showLabels?: boolean | undefined
  showDimensions?: boolean | undefined
  /** Makes the parts keyboard and touch selectable. `additive` is true for Shift, Ctrl, or Cmd. */
  onSelect?: ((partId: string, additive: boolean) => void) | undefined
  className?: string | undefined
}

const VIEW_NAMES: Record<DrawingView, string> = { front: 'Front', side: 'Side', top: 'Top', iso: 'Isometric', exploded: 'Exploded' }

interface Group { partId: string; polygons: DrawingPolygon[] }

/** Consecutive polygons of one part share a group, which keeps painter order intact. */
function groupByPart(polygons: readonly DrawingPolygon[]): Group[] {
  const groups: Group[] = []
  for (const polygon of polygons) {
    const last = groups[groups.length - 1]
    if (last && last.partId === polygon.partId) last.polygons.push(polygon)
    else groups.push({ partId: polygon.partId, polygons: [polygon] })
  }
  return groups
}

export function FurnitureDrawing({
  parts, view, explodeOffsets, selectedIds, highlightIds, ghostIds, errorIds, showLabels = false, showDimensions = true, onSelect, className,
}: FurnitureDrawingProps) {
  const { lengthUnit } = useUnitSystem()
  const hatchId = `furniture-hatch-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const drawing = useMemo(() => projectDrawing(parts, view, explodeOffsets ? { explodeOffsets } : {}), [parts, view, explodeOffsets])
  const layout = useMemo(() => drawingLayout(drawing, showDimensions), [drawing, showDimensions])
  const byId = useMemo(() => new Map(parts.map(part => [part.id, part])), [parts])
  const groups = useMemo(() => groupByPart(drawing.polygons), [drawing])
  const labelFaces = useMemo(() => labelPolygons(drawing.polygons), [drawing])
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])
  const highlighted = useMemo(() => new Set(highlightIds), [highlightIds])
  const ghosted = useMemo(() => new Set(ghostIds), [ghostIds])
  const errored = useMemo(() => new Set(errorIds), [errorIds])
  const interactive = !!onSelect
  const { fontSize } = layout

  const activate = (partId: string, additive: boolean) => onSelect?.(partId, additive)
  const onClick = (event: MouseEvent, partId: string) => activate(partId, event.shiftKey || event.ctrlKey || event.metaKey)
  const onKeyDown = (event: KeyboardEvent, partId: string) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    activate(partId, event.shiftKey || event.ctrlKey || event.metaKey)
  }

  const labelled = groups.filter(group => byId.has(group.partId))
  const description = `${VIEW_NAMES[view]} view, ${parts.length} part${parts.length === 1 ? '' : 's'}`

  return <svg
    className={`furniture-drawing${className ? ` ${className}` : ''}`}
    viewBox={viewBoxAttribute(layout)}
    preserveAspectRatio="xMidYMid meet"
    role={interactive ? 'group' : 'img'}
    aria-label={description}
    data-view={view}
  >
    <defs>
      <pattern id={hatchId} patternUnits="userSpaceOnUse" width={fontSize * 0.5} height={fontSize * 0.5} patternTransform="rotate(45)">
        <line className="furniture-hatch-line" x1="0" y1="0" x2="0" y2={fontSize * 0.5}/>
      </pattern>
    </defs>

    <g className="furniture-part-layer">
      {groups.map(({ partId, polygons }) => {
        const part = byId.get(partId)
        if (!part) return null
        const state = [selected.has(partId) && 'selected', highlighted.has(partId) && 'highlight', ghosted.has(partId) && 'ghost', errored.has(partId) && 'error'].filter(Boolean).join(' ')
        const name = `${part.part.label} ${part.part.name}`.trim()
        const interactiveProps = interactive
          ? { role: 'button', tabIndex: 0, 'aria-label': name, 'aria-pressed': selected.has(partId), onClick: (event: MouseEvent) => onClick(event, partId), onKeyDown: (event: KeyboardEvent) => onKeyDown(event, partId) }
          : { 'aria-hidden': true }
        return <g key={partId} className={`furniture-part ${state}`.trim()} data-part-id={partId} {...interactiveProps}>
          {polygons.map(polygon => <path key={polygon.face} className="furniture-face" d={polygonPath(polygon.points)} fill={faceFill(part.color, polygon.face, view)} data-face={polygon.face}/>)}
          {errored.has(partId) && polygons.map(polygon => <path key={`hatch-${polygon.face}`} className="furniture-error-hatch" d={polygonPath(polygon.points)} fill={`url(#${hatchId})`}/>)}
          {interactive && polygons.map(polygon => <path key={`hit-${polygon.face}`} className="furniture-hit" d={polygonPath(polygon.points)}/>)}
        </g>
      })}
    </g>

    {/* Selection and highlight outlines sit above the parts so a part hidden behind a
        nearer one still shows where it is. */}
    <g className="furniture-outlines" aria-hidden="true">
      {labelled.filter(({ partId }) => selected.has(partId) || highlighted.has(partId)).map(({ partId, polygons }) =>
        polygons.map(polygon => <path key={`${partId}-${polygon.face}`} className={selected.has(partId) ? 'furniture-select-outline' : 'furniture-highlight-outline'} d={polygonPath(polygon.points)}/>))}
    </g>

    {/* Badges come last so a plain label drawn later can never print over one. */}
    <g className="furniture-labels" aria-hidden="true">
      {[false, true].flatMap(badges => labelled.filter(({ partId }) => selected.has(partId) === badges).map(({ partId }) => {
        const part = byId.get(partId)!
        const face = labelFaces.get(partId)
        const text = part.part.label || part.part.name
        if (!face || !text) return null
        const [cx, cy] = svgPoint(polygonCenter(face.points))
        if (badges) {
          const width = textWidth(text, fontSize) + fontSize * 0.9
          return <g key={partId} className="furniture-badge">
            <rect x={cx - width / 2} y={cy - fontSize * 0.85} width={width} height={fontSize * 1.7} rx={fontSize * 0.3}/>
            <text x={cx} y={cy} fontSize={fontSize} textAnchor="middle" dominantBaseline="central">{text}</text>
          </g>
        }
        if (!showLabels || !labelFits(face.points, text, fontSize) || isCoveredAt(polygonCenter(face.points), drawing.polygons, drawing.polygons.indexOf(face))) return null
        return <text key={partId} className="furniture-label" x={cx} y={cy} fontSize={fontSize} textAnchor="middle" dominantBaseline="central">{text}</text>
      }))}
    </g>

    {showDimensions && drawing.dimensions.length > 0 && <g className="furniture-dimensions" aria-hidden="true">
      {drawing.dimensions.map((dimension, index) => {
        const geometry = dimensionGeometry(dimension, fontSize)
        const { x, y, rotate } = geometry.text
        return <g key={index} className="furniture-dimension">
          {[...geometry.extensions, geometry.line, ...geometry.ticks].map(([a, b], i) => <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]}/>)}
          <text x={x} y={y} fontSize={fontSize} textAnchor="middle" dominantBaseline="central" transform={rotate ? `rotate(${rotate} ${x} ${y})` : undefined}>{formatLength(dimension.value, lengthUnit)}</text>
        </g>
      })}
    </g>}
  </svg>
}
