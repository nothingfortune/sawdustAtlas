import { useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { Link2, Minus, Plus, Square, Trash2, X } from 'lucide-react'
import type { Sketch, SketchMember, SketchPoint, Vec } from '../domain/geometry2d'
import { angleBetweenDeg, angleToAxes, bearingDeg, distance, lineIntersection, memberRectangle } from '../domain/geometry2d'
import { createId } from '../id'
import { formatLength, formatNumber } from '../domain/lengthUnits'
import { LengthInput } from './fields'
import { CompoundAngleCalculator } from './CompoundAngleCalculator'
import { useElementSize } from './useElementSize'
import { useUnitSystem } from './unitSystem'

const PADDING = 28
const GRID_MM = 10
const snap = (mm: number) => Math.round(mm / GRID_MM) * GRID_MM

// BOARD-026: a free-form geometry scratchpad. Place points, connect real-width members,
// edit exact values, and read distance / length+bearing / angle / intersection. Pure math
// lives in domain/geometry2d; this is interaction + rendering. Built standalone but
// self-contained (sketch + onChange) so it can be embedded in the board designer later.
export function GeometryCalculator({ sketch, onChange }: { sketch: Sketch; onChange: (next: Sketch) => void }) {
  const { lengthUnit } = useUnitSystem()
  const [containerRef, size] = useElementSize()
  const svgRef = useRef<SVGSVGElement>(null)
  const [zoom, setZoom] = useState(1)
  // Selection holds up to 2 tokens, FIFO: 'p:<id>' points, 'm:<id>' members.
  const [selected, setSelected] = useState<string[]>([])
  const [mode, setMode] = useState<'sketch' | 'compound'>('sketch')

  const pxPerMm = 1.1 * zoom
  const toScreen = (p: Vec) => ({ x: PADDING + p.x * pxPerMm, y: size.height - PADDING - p.y * pxPerMm })
  const toMm = (clientX: number, clientY: number): Vec => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: (clientX - rect.left - PADDING) / pxPerMm, y: (rect.height - (clientY - rect.top) - PADDING) / pxPerMm }
  }

  const pointById = new Map(sketch.points.map(point => [point.id, point]))
  const memberById = new Map(sketch.members.map(member => [member.id, member]))
  const selectedPoints = selected.filter(token => token.startsWith('p:')).map(token => pointById.get(token.slice(2))).filter((p): p is SketchPoint => !!p)
  const selectedMembers = selected.filter(token => token.startsWith('m:')).map(token => memberById.get(token.slice(2))).filter((m): m is SketchMember => !!m)
  const ends = (member: SketchMember): [Vec, Vec] | null => {
    const a = pointById.get(member.aId), b = pointById.get(member.bId)
    return a && b ? [a, b] : null
  }

  const toggle = (token: string) => setSelected(prev => prev.includes(token) ? prev.filter(other => other !== token) : [...prev, token].slice(-2))

  const addPoint = (event: ReactMouseEvent) => {
    const mm = toMm(event.clientX, event.clientY)
    const point: SketchPoint = { id: createId(), x: Math.max(0, snap(mm.x)), y: Math.max(0, snap(mm.y)) }
    onChange({ ...sketch, points: [...sketch.points, point] })
    setSelected(prev => [...prev, `p:${point.id}`].slice(-2))
  }
  const updatePoint = (id: string, patch: Partial<SketchPoint>) =>
    onChange({ ...sketch, points: sketch.points.map(point => point.id === id ? { ...point, ...patch } : point) })
  // Drag a point to move it; a press with no movement is treated as a select (toggle).
  const dragRef = useRef<{ id: string; moved: boolean } | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const onPointDown = (event: ReactPointerEvent, id: string) => {
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { id, moved: false }
    setDraggingId(id)
  }
  const onPointMove = (event: ReactPointerEvent) => {
    if (!dragRef.current) return
    const mm = toMm(event.clientX, event.clientY)
    dragRef.current.moved = true
    updatePoint(dragRef.current.id, { x: Math.max(0, snap(mm.x)), y: Math.max(0, snap(mm.y)) })
  }
  const onPointUp = (id: string) => {
    const drag = dragRef.current
    dragRef.current = null
    setDraggingId(null)
    if (drag && !drag.moved) toggle(`p:${id}`)
  }
  const connect = () => {
    if (selectedPoints.length !== 2) return
    const member: SketchMember = { id: createId(), aId: selectedPoints[0]!.id, bId: selectedPoints[1]!.id, widthMm: 18 }
    onChange({ ...sketch, members: [...sketch.members, member] })
    setSelected([`m:${member.id}`])
  }
  // From two opposite corners, build an axis-aligned rectangle: the two missing corners,
  // four sides, and two diagonals (width 0 = construction lines). The diagonals bisect each
  // corner, so selecting a diagonal + an adjacent side reads the bisection angle.
  const makeRectangle = () => {
    if (selectedPoints.length !== 2) return
    const [p1, p3] = selectedPoints as [SketchPoint, SketchPoint]
    if (p1.x === p3.x || p1.y === p3.y) return // degenerate (corners share an edge)
    const p2: SketchPoint = { id: createId(), x: p3.x, y: p1.y }
    const p4: SketchPoint = { id: createId(), x: p1.x, y: p3.y }
    const line = (aId: string, bId: string): SketchMember => ({ id: createId(), aId, bId, widthMm: 0 })
    const sides = [line(p1.id, p2.id), line(p2.id, p3.id), line(p3.id, p4.id), line(p4.id, p1.id)]
    const diagAC = line(p1.id, p3.id)
    const diagBD = line(p2.id, p4.id)
    onChange({ points: [...sketch.points, p2, p4], members: [...sketch.members, ...sides, diagAC, diagBD] })
    // Pre-select a diagonal + the side sharing p1 so the bisection angle shows immediately.
    setSelected([`m:${diagAC.id}`, `m:${sides[0]!.id}`])
  }
  // Re-derive a member's far endpoint from a length + bearing off its near (a) end.
  const setMemberGeometry = (member: SketchMember, lengthMm: number, bearing: number) => {
    const a = pointById.get(member.aId)
    if (!a) return
    const rad = bearing * Math.PI / 180
    updatePoint(member.bId, { x: a.x + Math.cos(rad) * lengthMm, y: a.y + Math.sin(rad) * lengthMm })
  }
  const updateMember = (id: string, patch: Partial<SketchMember>) =>
    onChange({ ...sketch, members: sketch.members.map(member => member.id === id ? { ...member, ...patch } : member) })
  const deleteSelected = () => {
    const pointIds = new Set(selectedPoints.map(point => point.id))
    const memberIds = new Set(selectedMembers.map(member => member.id))
    onChange({
      points: sketch.points.filter(point => !pointIds.has(point.id)),
      members: sketch.members.filter(member => !memberIds.has(member.id) && !pointIds.has(member.aId) && !pointIds.has(member.bId)),
    })
    setSelected([])
  }
  const clear = () => { onChange({ points: [], members: [] }); setSelected([]) }

  // Readouts driven by the current selection.
  const readouts: { label: string; value: string }[] = []
  if (selectedPoints.length === 2 && selectedMembers.length === 0) {
    readouts.push({ label: 'Distance', value: formatLength(distance(selectedPoints[0]!, selectedPoints[1]!), lengthUnit) })
  }
  if (selectedMembers.length === 1) {
    const e = ends(selectedMembers[0]!)
    if (e) {
      const axes = angleToAxes(e[0], e[1])
      readouts.push(
        { label: 'Length', value: formatLength(distance(e[0], e[1]), lengthUnit) },
        { label: 'Bearing', value: `${formatNumber(bearingDeg(e[0], e[1]))}°` },
        { label: 'From horizontal', value: `${formatNumber(axes.fromHorizontalDeg)}°` },
        { label: 'From vertical (cut off plumb)', value: `${formatNumber(axes.fromVerticalDeg)}°` },
      )
    }
  }
  let intersection: Vec | null = null
  if (selectedMembers.length === 2) {
    const e1 = ends(selectedMembers[0]!), e2 = ends(selectedMembers[1]!)
    if (e1 && e2) {
      const inside = angleBetweenDeg(e1[0], e1[1], e2[0], e2[1]) // [0,180]
      readouts.push(
        { label: 'Inside angle', value: `${formatNumber(inside)}°` },
        { label: 'Outside angle', value: `${formatNumber(180 - inside)}°` },
        { label: 'Miter each (½)', value: `${formatNumber((180 - inside) / 2)}°` },
      )
      const hit = lineIntersection(e1[0], e1[1], e2[0], e2[1])
      intersection = hit?.point ?? null
      readouts.push({ label: 'Intersection', value: hit ? `${formatLength(hit.point.x, lengthUnit)}, ${formatLength(hit.point.y, lengthUnit)}${hit.withinBoth ? '' : ' (on extension)'}` : 'Parallel — none' })
    }
  }

  const single = selected.length === 1 ? selected[0]! : null
  const singlePoint = single?.startsWith('p:') ? pointById.get(single.slice(2)) : undefined
  const singleMember = single?.startsWith('m:') ? memberById.get(single.slice(2)) : undefined
  const singleMemberEnds = singleMember ? ends(singleMember) : null

  // On-canvas visualization so the readouts read at a glance: an arc (with degree label)
  // at the vertex two members share, plus dimension lines/labels rendered inline below.
  const arcAt = (center: Vec, towardA: Vec, towardB: Vec, label: string) => {
    const c = toScreen(center), pa = toScreen(towardA), pb = toScreen(towardB)
    const r = 32
    const a1 = Math.atan2(pa.y - c.y, pa.x - c.x), a2 = Math.atan2(pb.y - c.y, pb.x - c.x)
    let delta = a2 - a1
    while (delta > Math.PI) delta -= 2 * Math.PI
    while (delta < -Math.PI) delta += 2 * Math.PI
    const start = { x: c.x + r * Math.cos(a1), y: c.y + r * Math.sin(a1) }
    const end = { x: c.x + r * Math.cos(a2), y: c.y + r * Math.sin(a2) }
    const mid = a1 + delta / 2
    return { d: `M ${start.x} ${start.y} A ${r} ${r} 0 0 ${delta > 0 ? 1 : 0} ${end.x} ${end.y}`, label, lx: c.x + (r + 18) * Math.cos(mid), ly: c.y + (r + 18) * Math.sin(mid) }
  }
  const angleArc = (() => {
    if (selectedMembers.length !== 2) return null
    const [m1, m2] = selectedMembers as [SketchMember, SketchMember]
    const sharedId = [m1.aId, m1.bId].find(id => id === m2.aId || id === m2.bId)
    if (!sharedId) return null
    const vertex = pointById.get(sharedId)
    const otherA = pointById.get(m1.aId === sharedId ? m1.bId : m1.aId)
    const otherB = pointById.get(m2.aId === sharedId ? m2.bId : m2.aId)
    if (!vertex || !otherA || !otherB) return null
    return arcAt(vertex, otherA, otherB, `${formatNumber(angleBetweenDeg(vertex, otherA, vertex, otherB))}°`)
  })()

  return <div className={`geometry-layout${mode === 'compound' ? ' single' : ''}`}>
    <div className="geo-main">
      <div className="geo-toolbar">
        <div className="geo-modes" role="tablist">
          <button role="tab" aria-selected={mode === 'sketch'} className={mode === 'sketch' ? 'active' : ''} onClick={() => setMode('sketch')}>Sketch</button>
          <button role="tab" aria-selected={mode === 'compound'} className={mode === 'compound' ? 'active' : ''} onClick={() => setMode('compound')}>Compound angle</button>
        </div>
        {mode === 'sketch' && <div className="geo-toolbar-actions">
          <button className="button secondary" disabled={selectedPoints.length !== 2} onClick={connect}><Link2 size={15}/>Connect</button>
          <button className="button secondary" disabled={selectedPoints.length !== 2} onClick={makeRectangle} title="Build a rectangle from two opposite corners (with diagonals to bisect)"><Square size={15}/>Rectangle</button>
          <button className="button secondary" disabled={selected.length === 0} onClick={deleteSelected}><Trash2 size={15}/>Delete</button>
          <button className="button secondary" disabled={sketch.points.length === 0} onClick={clear}><X size={15}/>Clear</button>
          <button className="icon-button" aria-label="Zoom out" onClick={() => setZoom(z => Math.max(0.4, z - 0.2))}><Minus size={15}/></button>
          <button className="icon-button" aria-label="Zoom in" onClick={() => setZoom(z => Math.min(3, z + 0.2))}><Plus size={15}/></button>
        </div>}
      </div>
      {mode === 'compound' && <CompoundAngleCalculator/>}
      {mode === 'sketch' && <div className="geo-canvas-wrap" ref={containerRef}>
        <svg ref={svgRef} className="geo-canvas" width="100%" height="100%" role="img" aria-label="Geometry sketch">
          <rect x={0} y={0} width="100%" height="100%" fill="transparent" onClick={addPoint}/>
          {singleMemberEnds && (() => { const s = toScreen(singleMemberEnds[0]); return <g className="geo-ref">
            <line x1={0} y1={s.y} x2={size.width} y2={s.y}/>
            <line x1={s.x} y1={0} x2={s.x} y2={size.height}/>
          </g> })()}
          {sketch.members.map(member => {
            const e = ends(member)
            if (!e) return null
            const corners = memberRectangle(e[0], e[1], member.widthMm).map(toScreen)
            const a = toScreen(e[0]), b = toScreen(e[1])
            const on = selected.includes(`m:${member.id}`)
            return <g key={member.id} className={`geo-member${on ? ' selected' : ''}`} data-geo-member onClick={event => { event.stopPropagation(); toggle(`m:${member.id}`) }}>
              <polygon points={corners.map(c => `${c.x},${c.y}`).join(' ')}/>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}/>
            </g>
          })}
          {intersection && <circle className="geo-intersection" cx={toScreen(intersection).x} cy={toScreen(intersection).y} r={5}/>}
          {sketch.points.map(point => {
            const s = toScreen(point)
            const on = selected.includes(`p:${point.id}`)
            return <circle key={point.id} className={`geo-point${on ? ' selected' : ''}${draggingId === point.id ? ' dragging' : ''}`} data-geo-point cx={s.x} cy={s.y} r={draggingId === point.id ? 9 : 7}
              onPointerDown={event => onPointDown(event, point.id)} onPointerMove={onPointMove} onPointerUp={() => onPointUp(point.id)} onPointerCancel={() => { dragRef.current = null; setDraggingId(null) }}/>
          })}
          {/* Visualized readouts */}
          {selectedPoints.length === 2 && selectedMembers.length === 0 && (() => {
            const a = toScreen(selectedPoints[0]!), b = toScreen(selectedPoints[1]!)
            return <g className="geo-annot">
              <line className="geo-dim" x1={a.x} y1={a.y} x2={b.x} y2={b.y}/>
              <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 7} textAnchor="middle">{formatLength(distance(selectedPoints[0]!, selectedPoints[1]!), lengthUnit)}</text>
            </g>
          })()}
          {selectedMembers.length === 1 && singleMemberEnds && (() => {
            const a = toScreen(singleMemberEnds[0]), b = toScreen(singleMemberEnds[1])
            return <text className="geo-annot" x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 9} textAnchor="middle">{formatLength(distance(singleMemberEnds[0], singleMemberEnds[1]), lengthUnit)}</text>
          })()}
          {angleArc && <g className="geo-annot"><path className="geo-arc" d={angleArc.d}/><text x={angleArc.lx} y={angleArc.ly} textAnchor="middle">{angleArc.label}</text></g>}
        </svg>
        {sketch.points.length === 0 && <div className="geo-empty">Tap anywhere to place your first point.</div>}
      </div>}
    </div>
    {mode === 'sketch' && <aside className="geo-inspector">
      <h3>Sketch</h3>
      <p className="geo-hint">Tap to place points · select two and Connect · select members to measure.</p>

      {singlePoint && <div className="panel-section">
        <span className="eyebrow">POINT</span>
        <div className="field-row">
          <div className="field"><span>X</span><LengthInput ariaLabel="Point X" value={singlePoint.x} onChange={value => updatePoint(singlePoint.id, { x: value })}/></div>
          <div className="field"><span>Y</span><LengthInput ariaLabel="Point Y" value={singlePoint.y} onChange={value => updatePoint(singlePoint.id, { y: value })}/></div>
        </div>
      </div>}

      {singleMember && singleMemberEnds && <div className="panel-section">
        <span className="eyebrow">MEMBER</span>
        <div className="field"><span>Width</span><LengthInput ariaLabel="Member width" value={singleMember.widthMm} onChange={value => updateMember(singleMember.id, { widthMm: value })}/></div>
        <div className="field-row">
          <div className="field"><span>Length</span><LengthInput ariaLabel="Member length" min={1} value={Math.round(distance(singleMemberEnds[0], singleMemberEnds[1]))} onChange={value => setMemberGeometry(singleMember, value, bearingDeg(singleMemberEnds[0], singleMemberEnds[1]))}/></div>
          <div className="field"><span>Bearing °</span><input aria-label="Member bearing" type="number" min={-180} max={180} step={1} value={Math.round(bearingDeg(singleMemberEnds[0], singleMemberEnds[1]))} onChange={event => setMemberGeometry(singleMember, distance(singleMemberEnds[0], singleMemberEnds[1]), Number(event.target.value))}/></div>
        </div>
      </div>}

      <div className="panel-section">
        <span className="eyebrow">READOUTS</span>
        {readouts.length === 0
          ? <p className="geo-hint">Select two points, a member, or two members.</p>
          : <div className="geo-readout">{readouts.map(readout => <div key={readout.label} className="geo-readout-row"><span>{readout.label}</span><b>{readout.value}</b></div>)}</div>}
      </div>
    </aside>}
  </div>
}
