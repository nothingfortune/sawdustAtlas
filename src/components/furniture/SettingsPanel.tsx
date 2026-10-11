import { Plus, Trash2 } from 'lucide-react'
import { addSheetMaterial, removeSheetMaterial, sheetMaterialUsers } from '../../domain/furniture/editing'
import type { FurnitureProject, SheetMaterial } from '../../domain/furniture/types'
import { createId } from '../../id'
import { DimInput } from './DimInput'
import { TextField } from './TextField'

const NO_PARAMETERS: Readonly<Record<string, number>> = {}

// Project-wide settings: the widest solid board on hand and the sheet materials parts
// can use. These are plain numbers, not expressions.
export function SettingsPanel({ project, onChange }: { project: FurnitureProject; onChange: (project: FurnitureProject) => void }) {
  const update = (id: string, patch: Partial<SheetMaterial>) => onChange({ ...project, sheetMaterials: project.sheetMaterials.map(material => material.id === id ? { ...material, ...patch } : material) })
  const remove = (material: SheetMaterial) => {
    const next = removeSheetMaterial(project, material.id)
    if (next) onChange(next)
    else window.alert(`${material.name} is used by ${sheetMaterialUsers(project, material.id).length} part(s). Point those parts at another material first.`)
  }
  return <div className="furniture-settings-panel">
    <section>
      <h4>Solid wood</h4>
      <DimInput label="Widest board on hand" value={project.maxBoardWidth} scope={NO_PARAMETERS} positive allowExpression={false} onCommit={value => { if (typeof value === 'number') onChange({ ...project, maxBoardWidth: value }) }} />
      <p className="panel-hint">Solid parts wider than this become edge-glued panels in the parts list.</p>
    </section>
    <section>
      <h4>Sheet materials</h4>
      <ul className="sheet-list">
        {project.sheetMaterials.map(material => <li key={material.id} className="sheet-row">
          <TextField label="Material name" value={material.name} onCommit={name => name.trim() ? (update(material.id, { name: name.trim() }), null) : 'A material needs a name.'} />
          <DimInput label="Thickness" value={material.thickness} scope={NO_PARAMETERS} positive allowExpression={false} onCommit={value => { if (typeof value === 'number') update(material.id, { thickness: value }) }} />
          <DimInput label="Sheet length" value={material.sheetLength} scope={NO_PARAMETERS} positive allowExpression={false} onCommit={value => { if (typeof value === 'number') update(material.id, { sheetLength: value }) }} />
          <DimInput label="Sheet width" value={material.sheetWidth} scope={NO_PARAMETERS} positive allowExpression={false} onCommit={value => { if (typeof value === 'number') update(material.id, { sheetWidth: value }) }} />
          <TextField label="Price per sheet" value={String(material.pricePerSheet)} inputMode="decimal" onCommit={raw => {
            const price = Number(raw)
            if (raw.trim() === '' || !Number.isFinite(price) || price < 0) return 'Enter a price of zero or more.'
            update(material.id, { pricePerSheet: price })
            return null
          }} />
          <div className="field"><label htmlFor={`grain-${material.id}`}>Grain</label>
            <select id={`grain-${material.id}`} value={material.grain} onChange={event => update(material.id, { grain: event.target.value === 'none' ? 'none' : 'length' })}>
              <option value="length">Along the sheet length</option>
              <option value="none">None (MDF and similar)</option>
            </select></div>
          <div className="field color-field"><label htmlFor={`color-${material.id}`}>Color</label>
            <input id={`color-${material.id}`} type="color" value={material.color} onChange={event => update(material.id, { color: event.target.value })} /></div>
          <button type="button" className="button secondary danger" aria-label={`Delete sheet material ${material.name}`} onClick={() => remove(material)}><Trash2 size={15} />Delete</button>
        </li>)}
      </ul>
      {project.sheetMaterials.length === 0 && <p className="furniture-empty">No sheet materials yet.</p>}
      <button type="button" className="button secondary" onClick={() => onChange(addSheetMaterial(project, createId()))}><Plus size={15} />Add sheet material</button>
    </section>
  </div>
}
