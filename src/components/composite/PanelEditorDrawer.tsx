import type { SourcePanel, WoodSpecies, BoardStrip, CrosscutSpec } from '../../types'
import { StripList } from '../StripList'
import { NumberField } from '../fields'
import { createId } from '../../id'

export function PanelEditorDrawer({ panel, woods, onChange, onClose }: {
  panel: SourcePanel
  woods: WoodSpecies[]
  onChange: (panel: SourcePanel) => void
  onClose: () => void
}) {
  const setCrosscut = (patch: Partial<CrosscutSpec>) => {
    const crosscut: CrosscutSpec = {
      stripWidthMm: patch.stripWidthMm ?? panel.crosscut.stripWidthMm,
      kerfMm: patch.kerfMm ?? panel.crosscut.kerfMm,
      count: patch.count ?? panel.crosscut.count,
    }
    // Two identical-looking arms let TS narrow 'panel' to each union variant.
    if (panel.kind === 'rip') onChange({ ...panel, crosscut })
    else onChange({ ...panel, crosscut })
  }

  return (
    <aside className="panel-drawer" role="dialog" aria-label={`Edit ${panel.name}`}>
      <header className="panel-drawer-head">
        <input
          className="panel-name"
          value={panel.name}
          onChange={e => {
            if (panel.kind === 'rip') onChange({ ...panel, name: e.target.value })
            else onChange({ ...panel, name: e.target.value })
          }}
        />
        <button className="icon-button" aria-label="Close editor" onClick={onClose}>×</button>
      </header>

      <div className="field-row">
        <label className="field">
          <span>Construction</span>
          <select
            value={panel.construction}
            onChange={e => {
              const construction = e.target.value === 'end' ? 'end' as const : 'edge' as const
              if (panel.kind === 'rip') onChange({ ...panel, construction })
              else onChange({ ...panel, construction })
            }}
          >
            <option value="edge">Edge grain</option>
            <option value="end">End grain</option>
          </select>
        </label>
        <NumberField
          label="Crosscut width (mm)"
          value={panel.crosscut.stripWidthMm}
          min={1}
          step={1}
          onChange={v => setCrosscut({ stripWidthMm: v })}
        />
        <NumberField
          label="Kerf (mm)"
          value={panel.crosscut.kerfMm}
          min={0}
          step={0.1}
          onChange={v => setCrosscut({ kerfMm: v })}
        />
        <NumberField
          label="Pieces"
          value={panel.crosscut.count}
          min={0}
          step={1}
          onChange={v => setCrosscut({ count: Math.max(0, Math.floor(v)) })}
        />
      </div>

      {panel.kind === 'rip' ? (
        <>
          <NumberField
            label="Panel thickness (mm)"
            value={panel.thicknessMm}
            min={1}
            step={1}
            onChange={v => onChange({ ...panel, thicknessMm: v })}
          />
          <StripList
            strips={panel.strips}
            woods={woods}
            construction={panel.construction}
            onReorder={ids => onChange({
              ...panel,
              strips: ids
                .map(id => panel.strips.find(s => s.id === id))
                .filter((s): s is BoardStrip => Boolean(s)),
            })}
            onUpdateStrip={(id, patch) => onChange({
              ...panel,
              strips: panel.strips.map(s => s.id === id ? { ...s, ...patch } : s),
            })}
            onDeleteStrip={id => onChange({
              ...panel,
              strips: panel.strips.filter(s => s.id !== id),
            })}
          />
          <button
            className="button"
            onClick={() => onChange({
              ...panel,
              strips: [
                ...panel.strips,
                { id: createId(), speciesId: woods[0]?.id ?? 'walnut', width: 38, trailingAngle: 0 },
              ],
            })}
          >
            + Add strip
          </button>
        </>
      ) : (
        <p className="hint">Derived panel — crosscuts the finished face of &quot;{panel.sourceBoardId}&quot;.</p>
      )}
    </aside>
  )
}
