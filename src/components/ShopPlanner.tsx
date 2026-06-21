import { useState } from 'react'
import { Box, ChevronDown, CircleGauge, Copy, DoorOpen, Plus, Trash2, Warehouse } from 'lucide-react'
import type { ShopItem, ShopProject } from '../types'

interface Props { projects: ShopProject[]; project: ShopProject | undefined; onSelect: (id: string) => void; onCreate: () => void; onChange: (project: ShopProject) => void }
const SCALE = .094

const templates: Array<Omit<ShopItem, 'id' | 'x' | 'y'>> = [
  { name: 'Table saw', kind: 'machine', width: 1070, depth: 970, rotation: 0, clearance: 1200, color: '#d8863b' },
  { name: 'Jointer / planer', kind: 'machine', width: 1220, depth: 610, rotation: 0, clearance: 900, color: '#c76f37' },
  { name: 'Workbench', kind: 'bench', width: 1830, depth: 760, rotation: 0, clearance: 450, color: '#66826d' },
  { name: 'Cabinet', kind: 'storage', width: 915, depth: 510, rotation: 0, clearance: 200, color: '#637d89' },
  { name: 'Door', kind: 'door', width: 915, depth: 125, rotation: 0, clearance: 915, color: '#9b8365' },
]

export function ShopPlanner({ projects, project, onSelect, onCreate, onChange }: Props) {
  const [selected, setSelected] = useState<string>('')
  const [zoom, setZoom] = useState(.74)
  const item = project?.items.find(i => i.id === selected)
  const update = (patch: Partial<ShopProject>) => project && onChange({ ...project, ...patch, updatedAt: new Date().toISOString() })
  const updateItem = (id: string, patch: Partial<ShopItem>) => project && update({ items: project.items.map(i => i.id === id ? { ...i, ...patch } : i) })
  const addItem = (template: typeof templates[number]) => {
    if (!project) return
    const next = { ...template, id: crypto.randomUUID(), x: 900, y: 900 }
    update({ items: [...project.items, next] }); setSelected(next.id)
  }
  const remove = () => { if (project && item) { update({ items: project.items.filter(i => i.id !== item.id) }); setSelected('') } }

  function beginDrag(event: React.PointerEvent, target: ShopItem) {
    event.currentTarget.setPointerCapture(event.pointerId); setSelected(target.id)
    const start = { x: event.clientX, y: event.clientY, itemX: target.x, itemY: target.y }
    const move = (e: PointerEvent) => updateItem(target.id, { x: clamp(start.itemX + (e.clientX - start.x) / (SCALE * zoom), 0, (project?.width ?? 0) - target.width), y: clamp(start.itemY + (e.clientY - start.y) / (SCALE * zoom), 0, (project?.depth ?? 0) - target.depth) })
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  if (!project) return <Empty title="No workshop plans yet" action={onCreate}/>
  return <div className="designer-layout">
    <div className="designer-toolbar">
      <div><span className="eyebrow">WORKSHOP PLANNER</span><div className="project-switcher"><select value={project.id} onChange={e => onSelect(e.target.value)}>{projects.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select><ChevronDown/></div></div>
      <button className="button secondary" onClick={onCreate}><Plus/>New plan</button>
    </div>
    <div className="tool-panel left-panel">
      <h3>Objects</h3><p>Click to add to your floor plan.</p>
      <div className="template-list">{templates.map(t => <button key={t.name} onClick={() => addItem(t)}><span style={{ background: t.color }}>{t.kind === 'door' ? <DoorOpen/> : t.kind === 'storage' ? <Warehouse/> : <Box/>}</span><div><b>{t.name}</b><small>{t.width} × {t.depth} mm</small></div><Plus/></button>)}</div>
      <div className="panel-section"><h3>Room size</h3><div className="field-row"><Field label="Width (mm)" value={project.width} onChange={v => update({ width: v })}/><Field label="Depth (mm)" value={project.depth} onChange={v => update({ depth: v })}/></div></div>
    </div>
    <div className="canvas-wrap">
      <div className="canvas-controls"><button onClick={() => setZoom(z => Math.max(.35, z - .1))}>−</button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom(z => Math.min(1.25, z + .1))}>+</button></div>
      <div className="room-stage" style={{ width: project.width * SCALE * zoom + 80, height: project.depth * SCALE * zoom + 80 }}>
        <div className="room-canvas" onPointerDown={() => setSelected('')} style={{ width: project.width * SCALE, height: project.depth * SCALE, transform: `scale(${zoom})` }}>
          {project.items.map(i => <div key={i.id} className={`shop-object ${selected === i.id ? 'selected' : ''}`} onPointerDown={e => { e.stopPropagation(); beginDrag(e, i) }} style={{ left: i.x * SCALE, top: i.y * SCALE, width: i.width * SCALE, height: i.depth * SCALE, transform: `rotate(${i.rotation}deg)`, background: i.color }}>
            {i.clearance > 0 && <span className="clearance" style={{ inset: -i.clearance * SCALE }}/>}<span className="object-name">{i.name}<small>{i.width} × {i.depth} mm</small></span>
          </div>)}
          <span className="dimension width-dimension">{project.width} mm</span><span className="dimension depth-dimension">{project.depth} mm</span>
        </div>
      </div>
    </div>
    <div className="tool-panel right-panel">
      {item ? <><div className="inspector-heading"><div><span className="eyebrow">SELECTED OBJECT</span><input value={item.name} onChange={e => updateItem(item.id, { name: e.target.value })}/></div><button className="icon-button danger" onClick={remove}><Trash2/></button></div>
        <div className="field-row"><Field label="Width (mm)" value={item.width} onChange={v => updateItem(item.id, { width: v })}/><Field label="Depth (mm)" value={item.depth} onChange={v => updateItem(item.id, { depth: v })}/></div>
        <Field label="Working clearance (mm)" value={item.clearance} onChange={v => updateItem(item.id, { clearance: v })}/>
        <div className="field-label">Rotation</div><div className="rotation-buttons">{[0, 90, 180, 270].map(r => <button className={item.rotation === r ? 'active' : ''} onClick={() => updateItem(item.id, { rotation: r })} key={r}>{r}°</button>)}</div>
        <button className="button secondary full" onClick={() => { const copy = { ...item, id: crypto.randomUUID(), x: item.x + 300, y: item.y + 300 }; update({ items: [...project.items, copy] }); setSelected(copy.id) }}><Copy/>Duplicate object</button>
      </> : <div className="empty-inspector"><CircleGauge/><h3>Select an object</h3><p>Choose an item on the plan to edit its size, rotation, and working clearance.</p></div>}
    </div>
  </div>
}

function Field({ label, value, onChange }: { label: string, value: number, onChange: (value: number) => void }) { return <label className="field"><span>{label}</span><input type="number" min="0" step="1" value={value} onChange={e => onChange(Number(e.target.value))}/></label> }
function Empty({ title, action }: { title: string, action: () => void }) { return <div className="empty-page"><h2>{title}</h2><button className="button" onClick={action}><Plus/>Create one</button></div> }
function clamp(n: number, min: number, max: number) { return Math.min(Math.max(n, min), max) }
