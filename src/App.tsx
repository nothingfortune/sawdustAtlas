import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Boxes, Grid2X2, Home, Import, Menu, PanelLeftClose, Ruler, Save, Sparkles, Upload } from 'lucide-react'
import type { AtlasData, BoardProject, ShopProject, View } from './types'
import { loadData, saveData, downloadData, normalizeData } from './storage'
import { ShopPlanner } from './components/ShopPlanner'
import { BoardDesigner } from './components/BoardDesigner'
import { Dashboard } from './components/Dashboard'

export default function App() {
  const [data, setData] = useState<AtlasData>(loadData)
  const [view, setView] = useState<View>('home')
  const [activeShop, setActiveShop] = useState(data.shops[0]?.id ?? '')
  const [activeBoard, setActiveBoard] = useState(data.boards[0]?.id ?? '')
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1180)
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    saveData(data)
  }, [data])

  const updateShop = (project: ShopProject) => setData(current => ({ ...current, shops: current.shops.map(p => p.id === project.id ? project : p) }))
  const updateBoard = (project: BoardProject) => setData(current => ({ ...current, boards: current.boards.map(p => p.id === project.id ? project : p) }))

  const createShop = () => {
    const project: ShopProject = { id: crypto.randomUUID(), name: 'Untitled workshop', width: 6000, depth: 6000, items: [], updatedAt: new Date().toISOString() }
    setData(current => ({ ...current, shops: [...current.shops, project] })); setActiveShop(project.id); setView('shop')
  }
  const createBoard = () => {
    const project: BoardProject = {
      id: crypto.randomUUID(), name: 'Untitled cutting board', length: 450, thickness: 38, construction: 'edge', strips: [], updatedAt: new Date().toISOString(),
      endGrain: { sourceLength: 900, stockThickness: 38, sliceThickness: 45, kerf: 3.2, trimAllowance: 20, rowFlips: [], rowRotations: [] },
    }
    setData(current => ({ ...current, boards: [...current.boards, project] })); setActiveBoard(project.id); setView('boards')
  }

  async function importFile(file?: File) {
    if (!file) return
    try {
      const next = JSON.parse(await file.text()) as AtlasData
      if (!Array.isArray(next.shops) || !Array.isArray(next.boards)) throw new Error()
      setData(normalizeData(next)); setView('home')
    } catch { window.alert('That file is not a valid Sawdust Atlas backup.') }
  }

  return <div className="app-shell">
    <aside className={sidebarOpen ? 'sidebar' : 'sidebar collapsed'}>
      <div className="brand"><div className="brand-mark"><Ruler size={21} /></div>{sidebarOpen && <div><strong>Sawdust</strong><span>ATLAS</span></div>}</div>
      <button className="collapse-button" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle sidebar">{sidebarOpen ? <PanelLeftClose size={18}/> : <Menu size={18}/>}</button>
      <nav>
        <NavButton active={view === 'home'} icon={<Home/>} label="Home" open={sidebarOpen} onClick={() => setView('home')} />
        <p className="nav-label">{sidebarOpen ? 'DESIGN' : '—'}</p>
        <NavButton active={view === 'shop'} icon={<Grid2X2/>} label="Workshop layout" open={sidebarOpen} onClick={() => setView('shop')} />
        <NavButton active={view === 'boards'} icon={<Boxes/>} label="Cutting boards" open={sidebarOpen} onClick={() => setView('boards')} />
      </nav>
      <div className="sidebar-bottom">
        {sidebarOpen && <div className="coming-soon"><Sparkles size={16}/><div><b>Notion sync</b><span>Planned integration</span></div></div>}
        <button className="nav-button" aria-label="Import backup" onClick={() => importRef.current?.click()}><Import />{sidebarOpen && <span>Import backup</span>}</button>
        <button className="nav-button" aria-label="Export backup" onClick={() => downloadData(data)}><Upload />{sidebarOpen && <span>Export backup</span>}</button>
      </div>
    </aside>
    <main>
      <header className="topbar">
        <div className="breadcrumb"><span>Sawdust Atlas</span><b>/</b><strong>{view === 'home' ? 'Home' : view === 'shop' ? 'Workshop layout' : 'Cutting boards'}</strong></div>
        <div className="save-state"><Save size={15}/>Saved locally</div>
      </header>
      <section className="workspace">
        {view === 'home' && <Dashboard data={data} onOpenShop={id => { setActiveShop(id); setView('shop') }} onOpenBoard={id => { setActiveBoard(id); setView('boards') }} onCreateShop={createShop} onCreateBoard={createBoard}/>} 
        {view === 'shop' && <ShopPlanner projects={data.shops} project={data.shops.find(p => p.id === activeShop) ?? data.shops[0]} onSelect={setActiveShop} onCreate={createShop} onChange={updateShop}/>} 
        {view === 'boards' && <BoardDesigner projects={data.boards} project={data.boards.find(p => p.id === activeBoard) ?? data.boards[0]} onSelect={setActiveBoard} onCreate={createBoard} onChange={updateBoard}/>} 
      </section>
    </main>
    <input ref={importRef} type="file" accept="application/json" hidden onChange={e => importFile(e.target.files?.[0])}/>
  </div>
}

function NavButton({ active, icon, label, open, onClick }: { active: boolean, icon: ReactNode, label: string, open: boolean, onClick: () => void }) {
  return <button className={`nav-button ${active ? 'active' : ''}`} aria-label={label} onClick={onClick}>{icon}{open && <span>{label}</span>}</button>
}
