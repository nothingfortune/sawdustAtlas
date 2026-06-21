import { ArrowRight, Boxes, Grid2X2, Plus } from 'lucide-react'
import type { AtlasData } from '../types'

interface Props {
  data: AtlasData
  onOpenShop: (id: string) => void
  onOpenBoard: (id: string) => void
  onCreateShop: () => void
  onCreateBoard: () => void
}

export function Dashboard({ data, onOpenShop, onOpenBoard, onCreateShop, onCreateBoard }: Props) {
  return <div className="page dashboard-page">
    <div className="hero-copy"><span className="eyebrow">YOUR DIGITAL WORKSHOP</span><h1>Plan the space.<br/><em>Build the thing.</em></h1><p>A practical home for the projects your shop deserves. Start with the room, then work all the way down to the grain.</p></div>
    <div className="action-grid">
      <button className="action-card shop-action" onClick={onCreateShop}><span className="action-icon"><Grid2X2/></span><div><small>NEW PLAN</small><h2>Lay out a workshop</h2><p>Map machines, benches, storage, and the room needed to work safely.</p></div><ArrowRight/></button>
      <button className="action-card board-action" onClick={onCreateBoard}><span className="action-icon"><Boxes/></span><div><small>NEW DESIGN</small><h2>Design a cutting board</h2><p>Explore wood species, strip widths, dimensions, and material estimates.</p></div><ArrowRight/></button>
    </div>
    <div className="section-heading"><div><span className="eyebrow">PICK UP WHERE YOU LEFT OFF</span><h2>Recent work</h2></div></div>
    <div className="project-grid">
      {data.shops.map(project => <button className="project-card" key={project.id} onClick={() => onOpenShop(project.id)}>
        <div className="project-preview shop-preview"><div className="mini-room"><i/><i/><i/></div></div><ProjectMeta type="WORKSHOP" name={project.name} detail={`${formatMetres(project.width)} × ${formatMetres(project.depth)} · ${project.items.length} objects`}/>
      </button>)}
      {data.boards.map(project => <button className="project-card" key={project.id} onClick={() => onOpenBoard(project.id)}>
        <div className="project-preview board-preview">{project.strips.map(strip => <i key={strip.id} style={{ flex: strip.width, background: woodColor(strip.speciesId) }}/>)}</div><ProjectMeta type="CUTTING BOARD" name={project.name} detail={`${project.length} mm long · ${project.strips.reduce((n, s) => n + s.width, 0)} mm wide`}/>
      </button>)}
      <button className="project-card new-project" onClick={onCreateBoard}><Plus/><span>Start something new</span></button>
    </div>
  </div>
}

function ProjectMeta({ type, name, detail }: { type: string, name: string, detail: string }) {
  return <div className="project-meta"><small>{type}</small><h3>{name}</h3><p>{detail}</p></div>
}

function woodColor(id: string) {
  return ({ walnut: '#5a3828', maple: '#dbc59b', cherry: '#a85637', padauk: '#b64221', purpleheart: '#65435f', 'white-oak': '#b39161' } as Record<string, string>)[id] ?? '#8c6a48'
}
function formatMetres(mm: number) { return `${Number((mm / 1000).toFixed(2))} m` }
