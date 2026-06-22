import { WoodLibraryEditor } from './WoodLibraryEditor'
import type { WoodSpecies } from '../types'

interface Props {
  woods: WoodSpecies[]
  onAdd: () => void
  onUpdate: (id: string, patch: Partial<WoodSpecies>) => void
  onDelete: (id: string) => void
}

// Wood library module. The species list is shared by every cutting board, so it
// gets its own workspace section rather than living inside one designer's panel.
export function WoodLibrary({ woods, onAdd, onUpdate, onDelete }: Props) {
  return <div className="page module-page">
    <div className="module-head"><span className="eyebrow">SHARED LIBRARY · AVAILABLE TO EVERY BOARD</span><h1>Wood library</h1><p>Edit species, base color, grain accent, and price per board foot.</p></div>
    <div className="module-card wide"><WoodLibraryEditor woods={woods} onAdd={onAdd} onUpdate={onUpdate} onDelete={onDelete}/></div>
  </div>
}
