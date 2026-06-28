import type { PricingSettings as PricingSettingsValue } from '../types'

interface Props {
  pricing: PricingSettingsValue
  onChange: (patch: Partial<PricingSettingsValue>) => void
}

// Plain non-negative number input. Deliberately not the length-aware NumberField:
// money/percent/hours must never be unit-converted or snapped to 1/32".
function PriceField({ label, value, step = 1, onChange }: { label: string; value: number; step?: number; onChange: (value: number) => void }) {
  return <label className="field">
    <span>{label}</span>
    <input type="number" min={0} step={step} value={value}
      onChange={event => onChange(Math.max(0, Number(event.target.value)))} />
  </label>
}

// Shop-wide pricing module. Markup, labor rate, per-tier hours, consumables, and
// per-construction minimums live once at the workspace level and apply to every
// board and composite at compute time.
export function PricingSettings({ pricing, onChange }: Props) {
  return <div className="page module-page">
    <div className="module-head">
      <span className="eyebrow">SHOP DEFAULTS · APPLIES TO EVERY BOARD</span>
      <h1>Pricing</h1>
      <p>Markup, labor, consumables, and the minimum price applied to every cutting board build.</p>
    </div>
    <div className="module-card">
      <div className="field-row">
        <PriceField label="Material markup (%)" value={pricing.materialMarkupPercent} step={1} onChange={value => onChange({ materialMarkupPercent: value })}/>
        <PriceField label="Labor rate ($/hr)" value={pricing.laborRatePerHour} step={1} onChange={value => onChange({ laborRatePerHour: value })}/>
      </div>
      <div className="field-row">
        <PriceField label="Simple labor (hr)" value={pricing.tierHours.simple} step={0.25} onChange={value => onChange({ tierHours: { ...pricing.tierHours, simple: value } })}/>
        <PriceField label="Standard labor (hr)" value={pricing.tierHours.standard} step={0.25} onChange={value => onChange({ tierHours: { ...pricing.tierHours, standard: value } })}/>
        <PriceField label="Complex labor (hr)" value={pricing.tierHours.complex} step={0.25} onChange={value => onChange({ tierHours: { ...pricing.tierHours, complex: value } })}/>
      </div>
      <div className="field-row">
        <PriceField label="Consumables base ($)" value={pricing.consumablesBase} step={0.5} onChange={value => onChange({ consumablesBase: value })}/>
        <PriceField label="Consumables ($/bf)" value={pricing.consumablesPerBoardFoot} step={0.5} onChange={value => onChange({ consumablesPerBoardFoot: value })}/>
      </div>
      <div className="field-row">
        <PriceField label="End-grain minimum ($)" value={pricing.floor.end} step={5} onChange={value => onChange({ floor: { ...pricing.floor, end: value } })}/>
        <PriceField label="Edge-grain minimum ($)" value={pricing.floor.edge} step={5} onChange={value => onChange({ floor: { ...pricing.floor, edge: value } })}/>
      </div>
    </div>
  </div>
}
