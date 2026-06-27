import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Boxes, Grid2X2, Home, Import, Menu, PanelLeftClose, Redo2, Ruler, Save, TriangleAlert, Trees, Undo2, Upload, Wrench } from 'lucide-react'
import type { AtlasData, BoardProject, BuildAllowances, CompositeBoard, ShopProject, View, WoodSpecies } from './types'
import { loadData, saveData, downloadData, normalizeData, savePreImportSnapshot, loadPreImportSnapshot, clearPreImportSnapshot } from './storage'
import { ShopPlanner } from './components/ShopPlanner'
import { BoardDesigner } from './components/BoardDesigner'
import { BoardGallery } from './components/BoardGallery'
import { CompositeScreen } from './components/composite/CompositeScreen'
import { Dashboard } from './components/Dashboard'
import { WoodLibrary } from './components/WoodLibrary'
import { MillingAllowances } from './components/MillingAllowances'
import { UnitSystemProvider } from './components/unitSystem'
import { createId } from './id'
import { emptyHistory, record, redo as redoHistory, undo as undoHistory } from './history'
import type { History } from './history'
import type { LengthUnit } from './domain/lengthUnits'

interface Snapshot { data: AtlasData; activeShop: string; activeBoard: string }

export default function App() {
  const [data, setData] = useState<AtlasData>(loadData)
  const [view, setView] = useState<View>('home')
  const [activeShop, setActiveShop] = useState(data.shops[0]?.id ?? '')
  const [activeBoard, setActiveBoard] = useState(data.boards[0]?.id ?? '')
  const [activeComposite, setActiveComposite] = useState('')
  const [boardsMode, setBoardsMode] = useState<'gallery' | 'board' | 'composite'>('gallery')
  const [boardBackTo, setBoardBackTo] = useState<'gallery' | 'composite'>('gallery')
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1180)
  const [history, setHistory] = useState<History<Snapshot>>(emptyHistory)
  const [saveOk, setSaveOk] = useState(true)
  const [lengthUnit, setLengthUnit] = useState<LengthUnit>('metric')
  // Workspace captured before the last import, recoverable across reloads.
  const [preImport, setPreImport] = useState<AtlasData | null>(loadPreImportSnapshot)
  const importRef = useRef<HTMLInputElement>(null)
  const dataRef = useRef(data)

  useEffect(() => {
    // Autosave is a genuine side effect; surfacing whether the write succeeded is
    // not derivable during render, so syncing it into state here is intentional.
    const ok = saveData(data)
    dataRef.current = data
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaveOk(prev => (prev === ok ? prev : ok))
  }, [data])

  const commitData = (updater: (current: AtlasData) => AtlasData) => {
    const current = dataRef.current
    const next = updater(current)
    if (next === current) return
    setHistory(past => record(past, { data: current, activeShop, activeBoard }))
    dataRef.current = next
    setData(next)
  }
  // Step the undo or redo stack, restoring the data AND the active selection that
  // was current at that point (so undoing a delete re-selects what came back).
  const applyHistory = (step: typeof undoHistory) => {
    const result = step(history, { data: dataRef.current, activeShop, activeBoard })
    if (!result) return
    setHistory(result.history)
    dataRef.current = result.restored.data
    setData(result.restored.data)
    setActiveShop(result.restored.activeShop)
    setActiveBoard(result.restored.activeBoard)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      event.preventDefault()
      applyHistory(event.shiftKey ? redoHistory : undoHistory)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // applyHistory is recreated each render from these values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, activeShop, activeBoard])

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
    const project: ShopProject = { id: createId(), name: 'Untitled workshop', width: 6000, depth: 6000, gridSize: 300, blockedZones: [], items: [], updatedAt: new Date().toISOString() }
    commitData(current => ({ ...current, shops: [...current.shops, project] })); setActiveShop(project.id); setView('shop')
  }
  const createBoard = () => {
    const project: BoardProject = {
      id: createId(), name: 'Untitled cutting board', length: 450, thickness: 38, construction: 'end', strips: [], updatedAt: new Date().toISOString(),
      endGrain: { sourceLength: 900, stockThickness: 38, sliceThickness: 45, kerf: 3.2, trimAllowance: 20, rowFlips: [], rowRotations: [], rowOffsets: [], rowOrder: [] },
      allowances: { ...data.allowances },
    }
    commitData(current => ({ ...current, boards: [...current.boards, project] })); setActiveBoard(project.id); setView('boards'); setBoardBackTo('gallery'); setBoardsMode('board')
  }
  // Composite handlers (composites live inside the Cutting Boards module).
  const updateComposite = (project: CompositeBoard) => commitData(current => ({ ...current, composites: current.composites.map(p => p.id === project.id ? { ...project, updatedAt: new Date().toISOString() } : p) }))
  const openBoard = (id: string) => { setActiveBoard(id); setBoardBackTo('gallery'); setBoardsMode('board') }
  const openComposite = (id: string) => { setActiveComposite(id); setBoardsMode('composite') }
  const editPanelBoard = (boardId: string) => { setActiveBoard(boardId); setBoardBackTo('composite'); setBoardsMode('board') }
  const createBoardForPanel = (): string => {
    const project: BoardProject = {
      id: createId(), name: 'Untitled panel', length: 450, thickness: 38, construction: 'edge', strips: [], updatedAt: new Date().toISOString(),
      endGrain: { sourceLength: 900, stockThickness: 38, sliceThickness: 45, kerf: 3.2, trimAllowance: 20, rowFlips: [], rowRotations: [], rowOffsets: [], rowOrder: [] },
      allowances: { ...data.allowances },
    }
    commitData(current => ({ ...current, boards: [...current.boards, project] }))
    return project.id
  }
  const makeComposite = (board: BoardProject) => {
    const composite: CompositeBoard = {
      id: createId(), name: `${board.name} composite`,
      panels: [{ id: createId(), boardId: board.id, crosscut: { stripWidthMm: 25, kerfMm: 3, count: 4 } }],
      rows: 1, cols: 1, cells: [null], updatedAt: new Date().toISOString(),
    }
    commitData(current => ({ ...current, composites: [...current.composites, composite] }))
    setActiveComposite(composite.id); setBoardsMode('composite')
  }

  async function importFile(file?: File) {
    if (!file) return
    if (!window.confirm('Import this backup and replace the projects currently saved in this browser? Export a backup first if you may need the current work.')) return
    try {
      const next = JSON.parse(await file.text()) as AtlasData
      if (!Array.isArray(next.shops) || !Array.isArray(next.boards)) throw new Error()
      const normalized = normalizeData(next)
      const previous = dataRef.current
      savePreImportSnapshot(previous)
      setPreImport(previous)
      commitData(() => normalized)
      setActiveShop(normalized.shops[0]?.id ?? '')
      setActiveBoard(normalized.boards[0]?.id ?? '')
      setView('home')
    } catch { window.alert('That file is not a valid SawdustAtlas backup.') }
  }
  const restorePreImport = () => {
    if (!preImport) return
    commitData(() => preImport)
    setActiveShop(preImport.shops[0]?.id ?? '')
    setActiveBoard(preImport.boards[0]?.id ?? '')
    clearPreImportSnapshot()
    setPreImport(null)
  }

  const toggleLengthUnit = () => setLengthUnit(current => current === 'metric' ? 'imperial' : 'metric')

  return <UnitSystemProvider lengthUnit={lengthUnit} toggleLengthUnit={toggleLengthUnit}>
    <div className="app-shell">
    <aside className={sidebarOpen ? 'sidebar' : 'sidebar collapsed'}>
      <div className="brand"><div className="brand-mark"><Ruler size={21} /></div>{sidebarOpen && <div><strong>Sawdust</strong><span>ATLAS</span></div>}</div>
      <button className="collapse-button" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle sidebar">{sidebarOpen ? <PanelLeftClose size={18} /> : <Menu size={18} />}</button>
      <nav>
        <NavButton active={view === 'home'} icon={<Home />} label="Home" open={sidebarOpen} onClick={() => setView('home')} />
        <p className="nav-label">{sidebarOpen ? 'DESIGN' : '—'}</p>
        <NavButton active={view === 'shop'} icon={<Grid2X2 />} label="Workshop layout" open={sidebarOpen} onClick={() => setView('shop')} />
        <NavButton active={view === 'boards'} icon={<Boxes />} label="Cutting boards" open={sidebarOpen} onClick={() => { setView('boards'); setBoardsMode('gallery') }} />
        <p className="nav-label">{sidebarOpen ? 'LIBRARY' : '—'}</p>
        <NavButton active={view === 'woods'} icon={<Trees />} label="Wood library" open={sidebarOpen} onClick={() => setView('woods')} />
        <NavButton active={view === 'allowances'} icon={<Wrench />} label="Milling allowances" open={sidebarOpen} onClick={() => setView('allowances')} />
      </nav>
      <div className="sidebar-bottom">
        <button className="nav-button" aria-label="Import backup" onClick={() => importRef.current?.click()}><Import />{sidebarOpen && <span>Import backup</span>}</button>
        <button className="nav-button" aria-label="Export backup" onClick={() => downloadData(data)}><Upload />{sidebarOpen && <span>Export backup</span>}</button>
        {preImport && <button className="nav-button" aria-label="Restore the workspace from before the last import" onClick={restorePreImport}><Undo2 />{sidebarOpen && <span>Undo import</span>}</button>}
      </div>
    </aside>
    <main>
      <header className="topbar">
        <div className="breadcrumb"><button type="button" className="breadcrumb-home" onClick={() => setView('home')}>SawdustAtlas</button><b>/</b><strong>{view === 'home' ? 'Home' : view === 'shop' ? 'Workshop layout' : view === 'woods' ? 'Wood library' : view === 'allowances' ? 'Milling allowances' : 'Cutting boards'}</strong></div>
        <div className="topbar-actions">
          {saveOk
            ? <div className="save-state" title="Projects are saved in this browser on this device."><Save size={15} />Saved in this browser</div>
            : <div className="save-state save-state-error" title="Storage is full or unavailable, so recent changes are not saved. Export a backup now to avoid losing work."><TriangleAlert size={15} />Not saved — export a backup</div>}
          <button className="backup-button" onClick={toggleLengthUnit} title="Toggle imperial / metric units">
            <Ruler size={15} />{lengthUnit === 'imperial' ? "Preston's Button: on" : "Preston's Button"}
          </button>
          <button className="backup-button" disabled={!history.undo.length} onClick={() => applyHistory(undoHistory)} title={history.undo.length ? 'Undo last change (Ctrl/Cmd+Z)' : 'No change to undo'}><Undo2 size={15} />Undo</button>
          <button className="backup-button" disabled={!history.redo.length} onClick={() => applyHistory(redoHistory)} title={history.redo.length ? 'Redo (Ctrl/Cmd+Shift+Z)' : 'No change to redo'}><Redo2 size={15} />Redo</button>
          <button className="backup-button" onClick={() => downloadData(data)}><Upload size={15} />Export backup</button>
        </div>
      </header>
      <section className="workspace">
        {view === 'home' && <Dashboard data={data} onOpenShop={id => { setActiveShop(id); setView('shop') }} onOpenBoard={id => { openBoard(id); setView('boards') }} onCreateShop={createShop} onCreateBoard={createBoard} />}
        {view === 'shop' && <ShopPlanner projects={data.shops} project={data.shops.find(p => p.id === activeShop) ?? data.shops[0]} onSelect={setActiveShop} onCreate={createShop} onChange={updateShop} onDelete={deleteShop} />}
        {view === 'boards' && boardsMode === 'gallery' && (
          <BoardGallery boards={data.boards} composites={data.composites} woods={data.woods} onOpenBoard={openBoard} onOpenComposite={openComposite} onCreateBoard={createBoard} />
        )}
        {view === 'boards' && boardsMode === 'board' && (
          <BoardDesigner
            projects={data.boards}
            project={data.boards.find(p => p.id === activeBoard) ?? data.boards[0]}
            woods={data.woods}
            onSelect={setActiveBoard}
            onCreate={createBoard}
            onChange={updateBoard}
            onDelete={deleteBoard}
            onMakeComposite={makeComposite}
            onBack={() => setBoardsMode(boardBackTo)}
          />
        )}
        {view === 'boards' && boardsMode === 'composite' && (() => {
          const composite = data.composites.find(c => c.id === activeComposite)
          return composite
            ? (
              <CompositeScreen
                composite={composite}
                boards={data.boards}
                woods={data.woods}
                onChange={updateComposite}
                onCreateBoardForPanel={createBoardForPanel}
                onEditBoard={editPanelBoard}
                onBack={() => setBoardsMode('gallery')}
              />
            )
            : <BoardGallery boards={data.boards} composites={data.composites} woods={data.woods} onOpenBoard={openBoard} onOpenComposite={openComposite} onCreateBoard={createBoard} />
        })()}
        {view === 'woods' && <WoodLibrary woods={data.woods} onAdd={addWood} onUpdate={updateWood} onDelete={deleteWood} />}
        {view === 'allowances' && <MillingAllowances allowances={data.allowances} onChange={updateAllowances} />}
      </section>
    </main>
    <input ref={importRef} type="file" accept="application/json" hidden onChange={e => { void importFile(e.target.files?.[0]); e.currentTarget.value = '' }} />
    </div>
  </UnitSystemProvider>
}

function NavButton({ active, icon, label, open, onClick }: { active: boolean, icon: ReactNode, label: string, open: boolean, onClick: () => void }) {
  return <button className={`nav-button ${active ? 'active' : ''}`} aria-label={label} onClick={onClick}>{icon}{open && <span>{label}</span>}</button>
}
