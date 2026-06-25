import { useEffect, useRef, useState } from 'react'
import { Box, ChevronDown, CircleGauge, Copy, DoorOpen, Plus, SlidersHorizontal, Trash2, Warehouse, X } from 'lucide-react'
import type { ShopItem, ShopItemKind, ShopProject } from '../types'
import { createId } from '../id'
import { createShopItem, SHOP_ITEM_KINDS, SHOP_OBJECT_TEMPLATES } from '../domain/shopObjects'
import type { ShopObjectDefinition } from '../domain/shopObjects'
import { getFeedClearanceZones, getShopItemFootprint, pointsAttribute, projectIsometric, projectPolygon } from '../domain/shopGeometry'
import type { Point2D } from '../domain/shopGeometry'

interface Props { projects: ShopProject[]; project: ShopProject | undefined; onSelect: (id: string) => void; onCreate: () => void; onChange: (project: ShopProject) => void; onDelete: (id: string) => void }
const SCALE = .094

const DEFAULT_CUSTOM_OBJECT: ShopObjectDefinition = {
  name: 'Custom object',
  kind: 'custom',
  width: 600,
  depth: 600,
  height: 900,
  clearance: 300,
  color: '#66766d',
}

export function ShopPlanner({ projects, project, onSelect, onCreate, onChange, onDelete }: Props) {
  const [selected, setSelected] = useState<string>('')
  const [zoom, setZoom] = useState(.74)
  // Mirror zoom into a ref so an in-progress drag reads the live value: a pinch
  // (which updates zoom) during a one-finger object drag must not use a stale zoom.
  const zoomRef = useRef(zoom)
  useEffect(() => { zoomRef.current = zoom }, [zoom])
  const [viewMode, setViewMode] = useState<'top' | 'angled'>('top')
  const [customObject, setCustomObject] = useState<ShopObjectDefinition>(DEFAULT_CUSTOM_OBJECT)
  const [leftOpen, setLeftOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)
  // Clear a stale selection when the active project changes so the inspector
  // doesn't point at an item from the previous plan (render-time reset pattern).
  const [lastProjectId, setLastProjectId] = useState(project?.id)
  if (project?.id !== lastProjectId) { setLastProjectId(project?.id); setSelected('') }
  const item = project?.items.find(i => i.id === selected)
  const update = (patch: Partial<ShopProject>) => project && onChange({ ...project, ...patch, updatedAt: new Date().toISOString() })
  const updateItem = (id: string, patch: Partial<ShopItem>) => project && update({ items: project.items.map(i => i.id === id ? { ...i, ...patch } : i) })
  const addItem = (definition: ShopObjectDefinition) => {
    if (!project) return
    const next = createShopItem({ ...definition, name: definition.name.trim() || 'Custom object' }, project, createId())
    update({ items: [...project.items, next] }); setSelected(next.id); setLeftOpen(false); setRightOpen(true)
  }
  const remove = () => { if (project && item) { update({ items: project.items.filter(i => i.id !== item.id) }); setSelected('') } }
  // Keyboard equivalent of select-and-drag for the top-view objects: Enter/Space
  // selects, arrows nudge (Shift = coarse), clamped to the room like the pointer drag.
  const onObjectKeyDown = (event: React.KeyboardEvent, target: ShopItem) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(target.id); return }
    const step = event.shiftKey ? 100 : 10
    const delta: [number, number] | null = event.key === 'ArrowLeft' ? [-step, 0] : event.key === 'ArrowRight' ? [step, 0] : event.key === 'ArrowUp' ? [0, -step] : event.key === 'ArrowDown' ? [0, step] : null
    if (!delta || !project) return
    event.preventDefault(); setSelected(target.id)
    updateItem(target.id, { x: clamp(target.x + delta[0], 0, project.width - target.width), y: clamp(target.y + delta[1], 0, project.depth - target.depth) })
  }

  function beginDrag(event: React.PointerEvent, target: ShopItem) {
    event.currentTarget.setPointerCapture(event.pointerId); setSelected(target.id)
    const start = { x: event.clientX, y: event.clientY, itemX: target.x, itemY: target.y }
    const move = (e: PointerEvent) => updateItem(target.id, { x: clamp(start.itemX + (e.clientX - start.x) / (SCALE * zoomRef.current), 0, (project?.width ?? 0) - target.width), y: clamp(start.itemY + (e.clientY - start.y) / (SCALE * zoomRef.current), 0, (project?.depth ?? 0) - target.depth) })
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up)
  }

  // Two-finger pinch on the room scales the existing zoom state (so item-drag
  // coordinate math, which divides by SCALE*zoom, stays correct). Single-finger
  // gestures fall through to selection/drag.
  const pinchPointers = useRef(new Map<number, { x: number; y: number }>())
  const pinchStart = useRef<{ dist: number; zoom: number } | null>(null)
  const pinchDist = () => { const [a, b] = [...pinchPointers.current.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0 }
  const onStagePointerDown = (event: React.PointerEvent) => {
    pinchPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pinchPointers.current.size === 2) pinchStart.current = { dist: pinchDist() || 1, zoom }
  }
  const onStagePointerMove = (event: React.PointerEvent) => {
    if (!pinchPointers.current.has(event.pointerId)) return
    pinchPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pinchPointers.current.size === 2 && pinchStart.current) setZoom(clamp(pinchStart.current.zoom * (pinchDist() / pinchStart.current.dist), .35, 1.25))
  }
  const onStagePointerEnd = (event: React.PointerEvent) => {
    pinchPointers.current.delete(event.pointerId)
    if (pinchPointers.current.size < 2) pinchStart.current = null
  }

  if (!project) return <Empty title="No workshop plans yet" action={onCreate}/>
  return <div className="designer-layout">
    <div className="designer-toolbar">
      <div><span className="eyebrow">WORKSHOP PLANNER</span><div className="project-switcher"><select value={project.id} onChange={e => onSelect(e.target.value)}>{projects.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select><ChevronDown/></div></div>
      <div className="toolbar-actions"><button className="button secondary" onClick={onCreate}><Plus/>New plan</button><button className="button secondary danger" onClick={() => onDelete(project.id)} aria-label="Delete this workshop"><Trash2/>Delete</button></div>
    </div>
    <div className={`tool-panel left-panel${leftOpen ? ' open' : ''}`}>
      <button className="drawer-close" onClick={() => setLeftOpen(false)} aria-label="Close objects panel"><X/></button>
      <h3>Objects</h3><p>Click to add to your floor plan.</p>
      <div className="template-list">{SHOP_OBJECT_TEMPLATES.map(template => <button key={template.name} onClick={() => addItem(template)}><span style={{ background: template.color }}><ObjectIcon kind={template.kind}/></span><div><b>{template.name}</b><small>{template.width} × {template.depth} mm</small></div><Plus/></button>)}</div>
      <div className="panel-section custom-object-form">
        <h3>Add custom object</h3><p>Define anything that is not in the catalog.</p>
        <TextField label="Name" value={customObject.name} onChange={name => setCustomObject(current => ({ ...current, name }))}/>
        <KindField value={customObject.kind} onChange={kind => setCustomObject(current => ({ ...current, kind }))}/>
        <div className="field-row"><Field label="Width (mm)" value={customObject.width} min={1} onChange={width => setCustomObject(current => ({ ...current, width }))}/><Field label="Depth (mm)" value={customObject.depth} min={1} onChange={depth => setCustomObject(current => ({ ...current, depth }))}/></div>
        <Field label="Height (mm)" value={customObject.height} min={1} onChange={height => setCustomObject(current => ({ ...current, height }))}/>
        <Field label="Working clearance (mm)" value={customObject.clearance} onChange={clearance => setCustomObject(current => ({ ...current, clearance }))}/>
        <ColorField value={customObject.color} onChange={color => setCustomObject(current => ({ ...current, color }))}/>
        <button className="button full" onClick={() => addItem(customObject)}><Plus/>Add custom object</button>
      </div>
      <div className="panel-section"><h3>Room size</h3><div className="field-row"><Field label="Width (mm)" value={project.width} onChange={v => update({ width: v })}/><Field label="Depth (mm)" value={project.depth} onChange={v => update({ depth: v })}/></div></div>
    </div>
    <div className="canvas-wrap">
      <div className="view-mode-toggle"><button className={viewMode === 'top' ? 'active' : ''} onClick={() => setViewMode('top')}>Top</button><button className={viewMode === 'angled' ? 'active' : ''} onClick={() => setViewMode('angled')}>Angled</button></div>
      {viewMode === 'top' ? <>
        <div className="canvas-controls"><button onClick={() => setZoom(z => Math.max(.35, z - .1))}>−</button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom(z => Math.min(1.25, z + .1))}>+</button></div>
        <div className="room-stage" onPointerDown={onStagePointerDown} onPointerMove={onStagePointerMove} onPointerUp={onStagePointerEnd} onPointerCancel={onStagePointerEnd} style={{ width: project.width * SCALE * zoom + 80, height: project.depth * SCALE * zoom + 80, touchAction: 'none' }}>
          <div className="room-canvas" onPointerDown={() => setSelected('')} style={{ width: project.width * SCALE, height: project.depth * SCALE, transform: `scale(${zoom})` }}>
            <FeedClearanceLayer project={project}/>
            {project.items.map(i => <div key={i.id} role="button" tabIndex={0} aria-label={`${i.name}, ${i.width} by ${i.depth} millimetres`} aria-pressed={selected === i.id} className={`shop-object ${selected === i.id ? 'selected' : ''}`} onPointerDown={e => { e.stopPropagation(); beginDrag(e, i) }} onKeyDown={e => onObjectKeyDown(e, i)} style={{ left: i.x * SCALE, top: i.y * SCALE, width: i.width * SCALE, height: i.depth * SCALE, transform: `rotate(${i.rotation}deg)`, background: i.color }}>
              {i.clearance > 0 && <span className="clearance" style={{ inset: -i.clearance * SCALE }}/>}<span className="object-name">{i.name}<small>{i.width} × {i.depth} mm</small></span>
            </div>)}
            <span className="dimension width-dimension">{project.width} mm</span><span className="dimension depth-dimension">{project.depth} mm</span>
          </div>
        </div>
      </> : <AngledShopView project={project} selected={selected} onSelect={setSelected}/>}
    </div>
    <div className={`tool-panel right-panel${rightOpen ? ' open' : ''}`}>
      <button className="drawer-close" onClick={() => setRightOpen(false)} aria-label="Close inspector"><X/></button>
      {item ? <><div className="inspector-heading"><div><span className="eyebrow">SELECTED OBJECT</span><input value={item.name} onChange={e => updateItem(item.id, { name: e.target.value })}/></div><button className="icon-button danger" onClick={remove}><Trash2/></button></div>
        <div className="field-row"><Field label="Width (mm)" value={item.width} min={1} onChange={v => updateItem(item.id, { width: v })}/><Field label="Depth (mm)" value={item.depth} min={1} onChange={v => updateItem(item.id, { depth: v })}/></div>
        <Field label="Height (mm)" value={item.height} min={1} onChange={v => updateItem(item.id, { height: v })}/>
        <Field label="Working clearance (mm)" value={item.clearance} onChange={v => updateItem(item.id, { clearance: v })}/>
        <KindField value={item.kind} onChange={kind => updateItem(item.id, { kind })}/>
        <ColorField value={item.color} onChange={color => updateItem(item.id, { color })}/>
        <div className="field-label">Rotation</div><div className="rotation-buttons">{[0, 90, 180, 270].map(r => <button className={item.rotation === r ? 'active' : ''} onClick={() => updateItem(item.id, { rotation: r })} key={r}>{r}°</button>)}</div>
        <div className="panel-section feed-settings"><h3>Infeed / outfeed</h3><p>Direction is relative to the object and follows its rotation.</p>
          <div className="feed-direction-buttons"><button className={item.feedDirection === null ? 'active' : ''} onClick={() => updateItem(item.id, { feedDirection: null })}>Off</button>{([0, 90, 180, 270] as const).map(direction => <button className={item.feedDirection === direction ? 'active' : ''} onClick={() => updateItem(item.id, { feedDirection: direction })} key={direction}>{direction === 0 ? '→' : direction === 90 ? '↓' : direction === 180 ? '←' : '↑'}</button>)}</div>
          {item.feedDirection !== null && <><div className="field-row"><Field label="Infeed (mm)" value={item.infeedClearance} onChange={infeedClearance => updateItem(item.id, { infeedClearance })}/><Field label="Outfeed (mm)" value={item.outfeedClearance} onChange={outfeedClearance => updateItem(item.id, { outfeedClearance })}/></div><Field label="Side margin (mm)" value={item.sideClearance} onChange={sideClearance => updateItem(item.id, { sideClearance })}/></>}
        </div>
        <button className="button secondary full" onClick={() => { const copy = { ...item, id: createId(), x: item.x + 300, y: item.y + 300 }; update({ items: [...project.items, copy] }); setSelected(copy.id) }}><Copy/>Duplicate object</button>
      </> : <div className="empty-inspector"><CircleGauge/><h3>Select an object</h3><p>Choose an item on the plan to edit its size, rotation, and working clearance.</p></div>}
    </div>
    {(leftOpen || rightOpen) && <div className="panel-scrim" role="presentation" onClick={() => { setLeftOpen(false); setRightOpen(false) }}/>}
    <div className="shop-fabs"><button className="panel-fab" onClick={() => { setLeftOpen(open => !open); setRightOpen(false) }} aria-label="Toggle objects panel"><Box/>Objects</button><button className="panel-fab" onClick={() => { setRightOpen(open => !open); setLeftOpen(false) }} aria-label="Toggle inspector"><SlidersHorizontal/>Inspector</button></div>
  </div>
}

function FeedClearanceLayer({ project }: { project: ShopProject }) {
  return <svg className="feed-clearance-layer" viewBox={`0 0 ${project.width} ${project.depth}`} preserveAspectRatio="none" aria-hidden="true">
    {project.items.flatMap(item => getFeedClearanceZones(item).map(zone => {
      const center = polygonCenter(zone.points)
      return <g className={`feed-zone ${zone.kind}`} key={`${item.id}-${zone.kind}`}><polygon points={pointsAttribute(zone.points)}/><text x={center.x} y={center.y}>{zone.kind === 'infeed' ? 'IN' : 'OUT'}</text></g>
    }))}
  </svg>
}

function AngledShopView({ project, selected, onSelect }: { project: ShopProject, selected: string, onSelect: (id: string) => void }) {
  const floor = projectPolygon([{ x: 0, y: 0 }, { x: project.width, y: 0 }, { x: project.width, y: project.depth }, { x: 0, y: project.depth }])
  const projectedItems = [...project.items].sort((a, b) => (a.x + a.y) - (b.x + b.y)).map(item => {
    const footprint = getShopItemFootprint(item)
    return { item, footprint, bottom: projectPolygon(footprint), top: projectPolygon(footprint, item.height) }
  })
  const feedZones = project.items.flatMap(item => getFeedClearanceZones(item).map(zone => ({ ...zone, itemId: item.id, projected: projectPolygon(zone.points) })))
  const allPoints = [...floor, ...feedZones.flatMap(zone => zone.projected), ...projectedItems.flatMap(entry => [...entry.bottom, ...entry.top])]
  const bounds = getBounds(allPoints, 450)

  return <div className="angled-shop-view"><div className="angled-view-note">Angled review view · switch to Top to move objects</div><svg viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`} role="img" aria-label="Angled workshop view">
    <polygon className="iso-floor" points={pointsAttribute(floor)}/>
    {feedZones.map(zone => <polygon className={`iso-feed-zone ${zone.kind}`} points={pointsAttribute(zone.projected)} key={`${zone.itemId}-${zone.kind}`}/>) }
    {projectedItems.map(({ item, bottom, top }) => <g className={`iso-object ${selected === item.id ? 'selected' : ''}`} role="button" tabIndex={0} aria-label={item.name} onClick={() => onSelect(item.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') onSelect(item.id) }} key={item.id}>
      {getBoxSides(bottom, top).map((side, index) => <polygon className="iso-side" style={{ fill: item.color }} points={pointsAttribute(side)} key={index}/>) }
      <polygon className="iso-top" style={{ fill: item.color }} points={pointsAttribute(top)}/>
      <text x={projectIsometric({ x: item.x + item.width / 2, y: item.y + item.depth / 2, z: item.height }).x} y={projectIsometric({ x: item.x + item.width / 2, y: item.y + item.depth / 2, z: item.height }).y}>{item.name}</text>
    </g>)}
  </svg></div>
}

function polygonCenter(points: readonly Point2D[]): Point2D {
  return { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length }
}

function getBoxSides(
  bottom: [Point2D, Point2D, Point2D, Point2D],
  top: [Point2D, Point2D, Point2D, Point2D],
): Array<[Point2D, Point2D, Point2D, Point2D]> {
  return [
    [bottom[0], bottom[1], top[1], top[0]],
    [bottom[1], bottom[2], top[2], top[1]],
    [bottom[2], bottom[3], top[3], top[2]],
    [bottom[3], bottom[0], top[0], top[3]],
  ]
}

function getBounds(points: readonly Point2D[], padding: number) {
  const xs = points.map(point => point.x)
  const ys = points.map(point => point.y)
  const minX = Math.min(...xs) - padding
  const maxX = Math.max(...xs) + padding
  const minY = Math.min(...ys) - padding
  const maxY = Math.max(...ys) + padding
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function ObjectIcon({ kind }: { kind: ShopItemKind }) { return kind === 'door' ? <DoorOpen/> : kind === 'storage' ? <Warehouse/> : <Box/> }
function TextField({ label, value, onChange }: { label: string, value: string, onChange: (value: string) => void }) { return <label className="field"><span>{label}</span><input value={value} onChange={e => onChange(e.target.value)}/></label> }
function KindField({ value, onChange }: { value: ShopItemKind, onChange: (value: ShopItemKind) => void }) { return <label className="field"><span>Category</span><select value={value} onChange={e => onChange(e.target.value as ShopItemKind)}>{SHOP_ITEM_KINDS.map(kind => <option value={kind.value} key={kind.value}>{kind.label}</option>)}</select></label> }
function ColorField({ value, onChange }: { value: string, onChange: (value: string) => void }) { return <label className="field color-field"><span>Color</span><input type="color" value={value} onChange={e => onChange(e.target.value)}/></label> }
function Field({ label, value, min = 0, onChange }: { label: string, value: number, min?: number, onChange: (value: number) => void }) { return <label className="field"><span>{label}</span><input type="number" min={min} step="1" value={value} onChange={e => onChange(Number(e.target.value))}/></label> }
function Empty({ title, action }: { title: string, action: () => void }) { return <div className="empty-page"><h2>{title}</h2><button className="button" onClick={action}><Plus/>Create one</button></div> }
function clamp(n: number, min: number, max: number) { return Math.min(Math.max(n, min), max) }
