import { Plus, Trash2 } from 'lucide-react'
import type { WoodSpecies } from '../types'

interface Props {
  woods: WoodSpecies[]
  onAdd: () => void
  onUpdate: (id: string, patch: Partial<WoodSpecies>) => void
  onDelete: (id: string) => void
}

export function WoodLibraryEditor({ woods, onAdd, onUpdate, onDelete }: Props) {
  return <div className="wood-library-editor">
    <div className="panel-title-row"><div><h3>Species</h3><p>Custom species are saved in this workspace.</p></div><button className="icon-button" onClick={onAdd} aria-label="Add custom wood"><Plus/></button></div>
    <div className="wood-editor-list">{woods.map(wood => <div className="wood-editor-row" key={wood.id}>
      <span className="wood-use static"><i style={{ background: wood.color }}/></span>
      <input aria-label="Wood name" value={wood.name} onChange={event => onUpdate(wood.id, { name: event.target.value })}/>
      <label title="Base color"><input type="color" aria-label={`${wood.name} base color`} value={wood.color} onChange={event => onUpdate(wood.id, { color: event.target.value })}/></label>
      <label title="Grain accent"><input type="color" aria-label={`${wood.name} grain color`} value={wood.accent} onChange={event => onUpdate(wood.id, { accent: event.target.value })}/></label>
      <input className="wood-price" aria-label={`${wood.name} price per board foot`} title="Price per board foot" type="number" min="0" step="0.25" value={wood.pricePerBoardFoot} onChange={event => onUpdate(wood.id, { pricePerBoardFoot: Number(event.target.value) })}/>
      <span>$/bf</span>
      <button className="wood-delete" aria-label={`Delete ${wood.name}`} onClick={() => onDelete(wood.id)}><Trash2/></button>
    </div>)}</div>
  </div>
}
