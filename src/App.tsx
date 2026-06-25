import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Boxes, Grid2X2, Home, Import, Menu, PanelLeftClose, Ruler, Save, Sparkles, Trees, Undo2, Upload, Wrench } from 'lucide-react'
import type { AtlasData, BoardProject, BuildAllowances, ShopProject, View, WoodSpecies } from './types'
import { loadData, saveData, downloadData, normalizeData } from './storage'
import { ShopPlanner } from './components/ShopPlanner'
import { BoardDesigner } from './components/BoardDesigner'
import { Dashboard } from './components/Dashboard'
import { WoodLibrary } from './components/WoodLibrary'
import { MillingAllowances } from './components/MillingAllowances'
import { createId } from './id'

export default function App() {
  const [data, setData] = useState<AtlasData>(loadData)
  const [view, setView] = useState<View>('home')
  const [activeShop, setActiveShop] = useState(data.shops[0]?.id ?? '')
  const [activeBoard, setActiveBoard] = useState(data.boards[0]?.id ?? '')
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1180)
  const [undoData, setUndoData] = useState<AtlasData | null>(null)
  const [saveOk, setSaveOk] = useState(true)
  const importRef = useRef<HTMLInputElement>(null)
  const dataRef = useRef(data)

  // Persist on every committed change (the single mutation funnel) and reflect
  // whether the write actually succeeded, so the topbar can't claim "Saved" when
  // localStorage is full/unavailable.
  const persist = (next: AtlasData) => {
    dataRef.current = next
    setData(next)
    setSaveOk(saveData(next))
  }
  const commitData = (updater: (current: AtlasData) => AtlasData) => {
    const current = dataRef.current
    const next = updater(current)
    if (next === current) return
    setUndoData(current)
    persist(next)
  }
  const undoLastChange = () => {
    if (!undoData) return
    persist(undoData)
    setUndoData(null)
  }

  const updateShop = (project: ShopProject) => commitData(current => ({ ...current, shops: current.shops.map(p => p.id === project.id ? project : p) }))
  const updateBoard = (project: BoardProject) => commitData(current => ({ ...current, boards: current.boards.map(p => p.id === project.id ? project : p) }))
  const addWood = () => {
    const wood: WoodSpecies = { id: createId(), name: 'Custom wood', color: '#8c6a48', accent: '#b18a5e', pricePerBoardFoot: 8 }
    commitData(current => ({ ...current, woods: [...current.woods, wood] }))
  }
  const updateWood = (id: string, patch: Partial<WoodSpecies>) => commitData(current => ({
    ...current,
    woods: current.woods.map(wood => wood.id === id ? { ...wood, ...patch, id: wood.id } : wood),
  }))
  // Milling allowances are shop-wide: update the global setup and write it
  // through to every board so each design's plan reflects the same machines.
  const updateAllowances = (patch: Partial<BuildAllowances>) => commitData(current => {
    const allowances = { ...current.allowances, ...patch }
    return { ...current, allowances, boards: current.boards.map(board => ({ ...board, allowances })) }
  })
  const deleteWood = (id: string) => {
    const wood = data.woods.find(candidate => candidate.id === id)
    if (!wood) return
    if (data.boards.some(board => board.strips.some(strip => strip.speciesId === id))) { window.alert(`${wood.name} is used by a cutting board and cannot be deleted.`); return }
    if (data.woods.length === 1) { window.alert('Keep at least one wood in the library.'); return }
    if (window.confirm(`Delete ${wood.name} from the wood library?`)) commitData(current => ({ ...current, woods: current.woods.filter(candidate => candidate.id !== id) }))
  }

  const deleteShop = (id: string) => {
    const project = data.shops.find(p => p.id === id)
    if (!project || !window.confirm(`Delete workshop "${project.name}"?`)) return
    const remaining = data.shops.filter(p => p.id !== id)
    commitData(current => ({ ...current, shops: current.shops.filter(p => p.id !== id) }))
    if (activeShop === id) setActiveShop(remaining[0]?.id ?? '')
  }
  const deleteBoard = (id: string) => {
    const project = data.boards.find(p => p.id === id)
    if (!project || !window.confirm(`Delete board "${project.name}"?`)) return
    const remaining = data.boards.filter(p => p.id !== id)
    commitData(current => ({ ...current, boards: current.boards.filter(p => p.id !== id) }))
    if (activeBoard === id) setActiveBoard(remaining[0]?.id ?? '')
  }

  const createShop = () => {
    const project: ShopProject = { id: createId(), name: 'Untitled workshop', width: 6000, depth: 6000, items: [], updatedAt: new Date().toISOString() }
    commitData(current => ({ ...current, shops: [...current.shops, project] })); setActiveShop(project.id); setView('shop')
  }
  const createBoard = () => {
    const project: BoardProject = {
      id: createId(), name: 'Untitled cutting board', length: 450, thickness: 38, construction: 'end', strips: [], updatedAt: new Date().toISOString(),
      endGrain: { sourceLength: 900, stockThickness: 38, sliceThickness: 45, kerf: 3.2, trimAllowance: 20, rowFlips: [], rowRotations: [], rowOffsets: [], rowOrder: [] },
      allowances: { ...data.allowances },
    }
    commitData(current => ({ ...current, boards: [...current.boards, project] })); setActiveBoard(project.id); setView('boards')
  }

  async function importFile(file?: File) {
    if (!file) return
    if (!window.confirm('Import this backup and replace the projects currently saved in this browser? Export a backup first if you may need the current work.')) return
    try {
      const next = JSON.parse(await file.text()) as AtlasData
      if (!Array.isArray(next.shops) || !Array.isArray(next.boards)) throw new Error()
      const normalized = normalizeData(next)
      commitData(() => normalized)
      setActiveShop(normalized.shops[0]?.id ?? '')
      setActiveBoard(normalized.boards[0]?.id ?? '')
      setView('home')
    } catch { window.alert('That file is not a valid SawdustAtlas backup.') }
  }

  return <div className="app-shell">
    <aside className={sidebarOpen ? 'sidebar' : 'sidebar collapsed'}>
      <div className="brand"><div className="brand-mark"><Ruler size={21} /></div>{sidebarOpen && <div><strong>Sawdust</strong><span>ATLAS</span></div>}</div>
      <button className="collapse-button" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle sidebar">{sidebarOpen ? <PanelLeftClose size={18} /> : <Menu size={18} />}</button>
      <nav>
        <NavButton active={view === 'home'} icon={<Home />} label="Home" open={sidebarOpen} onClick={() => setView('home')} />
        <p className="nav-label">{sidebarOpen ? 'DESIGN' : '—'}</p>
        <NavButton active={view === 'shop'} icon={<Grid2X2 />} label="Workshop layout" open={sidebarOpen} onClick={() => setView('shop')} />
        <NavButton active={view === 'boards'} icon={<Boxes />} label="Cutting boards" open={sidebarOpen} onClick={() => setView('boards')} />
        <p className="nav-label">{sidebarOpen ? 'LIBRARY' : '—'}</p>
        <NavButton active={view === 'woods'} icon={<Trees />} label="Wood library" open={sidebarOpen} onClick={() => setView('woods')} />
        <NavButton active={view === 'allowances'} icon={<Wrench />} label="Milling allowances" open={sidebarOpen} onClick={() => setView('allowances')} />
      </nav>
      <div className="sidebar-bottom">
        {sidebarOpen && <div className="coming-soon"><Sparkles size={16} /><div><b>Notion sync</b><span>Planned integration</span></div></div>}
        <button className="nav-button" aria-label="Import backup" onClick={() => importRef.current?.click()}><Import />{sidebarOpen && <span>Import backup</span>}</button>
        <button className="nav-button" aria-label="Export backup" onClick={() => downloadData(data)}><Upload />{sidebarOpen && <span>Export backup</span>}</button>
      </div>
    </aside>
    <main>
      <header className="topbar">
        <div className="breadcrumb"><span>SawdustAtlas</span><b>/</b><strong>{view === 'home' ? 'Home' : view === 'shop' ? 'Workshop layout' : view === 'woods' ? 'Wood library' : view === 'allowances' ? 'Milling allowances' : 'Cutting boards'}</strong></div>
        <div className="topbar-actions">
          {saveOk
            ? <div className="save-state" title="Projects are saved in this browser on this device."><Save size={15} />Saved in this browser</div>
            : <div className="save-state error" title="Storage is full or unavailable — your changes are NOT being saved. Export a backup now."><Save size={15} />Not saved — storage full</div>}
          <button className="backup-button" disabled={!undoData} onClick={undoLastChange} title={undoData ? 'Undo last change' : 'No change to undo'}><Undo2 size={15} />Undo</button>
          <button className="backup-button" onClick={() => downloadData(data)}><Upload size={15} />Export backup</button>
        </div>
      </header>
      <section className="workspace">
        {view === 'home' && <Dashboard data={data} onOpenShop={id => { setActiveShop(id); setView('shop') }} onOpenBoard={id => { setActiveBoard(id); setView('boards') }} onCreateShop={createShop} onCreateBoard={createBoard} />}
        {view === 'shop' && <ShopPlanner projects={data.shops} project={data.shops.find(p => p.id === activeShop) ?? data.shops[0]} onSelect={setActiveShop} onCreate={createShop} onChange={updateShop} onDelete={deleteShop} />}
        {view === 'boards' && <BoardDesigner projects={data.boards} project={data.boards.find(p => p.id === activeBoard) ?? data.boards[0]} woods={data.woods} onSelect={setActiveBoard} onCreate={createBoard} onChange={updateBoard} onDelete={deleteBoard} />}
        {view === 'woods' && <WoodLibrary woods={data.woods} onAdd={addWood} onUpdate={updateWood} onDelete={deleteWood} />}
        {view === 'allowances' && <MillingAllowances allowances={data.allowances} onChange={updateAllowances} />}
      </section>
    </main>
    <input ref={importRef} type="file" accept="application/json" hidden onChange={e => { void importFile(e.target.files?.[0]); e.currentTarget.value = '' }} />
  </div>
}

function NavButton({ active, icon, label, open, onClick }: { active: boolean, icon: ReactNode, label: string, open: boolean, onClick: () => void }) {
  return <button className={`nav-button ${active ? 'active' : ''}`} aria-label={label} onClick={onClick}>{icon}{open && <span>{label}</span>}</button>
}
