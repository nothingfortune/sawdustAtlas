import type { BuildAllowances } from '../types'
import { NumberField as Field } from './fields'

interface Props {
  allowances: BuildAllowances
  onChange: (patch: Partial<BuildAllowances>) => void
}

// Shop-wide milling allowances module. These describe the user's machines
// (jointer, planer, router table, saw kerf) so they live once at the workspace
// level and apply to every cutting board, not per design.
export function MillingAllowances({ allowances, onChange }: Props) {
  return <div className="page module-page">
    <div className="module-head"><span className="eyebrow">SHOP DEFAULTS · APPLIES TO EVERY BOARD</span><h1>Milling allowances</h1><p>Rough stock removed reaching finished faces, edges, and ends. Set these once to match your machines.</p></div>
    <div className="module-card">
      <div className="field-row"><Field label="Jointing (mm)" value={allowances.jointing} step={0.5} onChange={value => onChange({ jointing: value })}/><Field label="Planing (mm)" value={allowances.planing} step={0.5} onChange={value => onChange({ planing: value })}/></div>
      <div className="field-row"><Field label="Router table (mm)" value={allowances.routerTable} step={0.5} onChange={value => onChange({ routerTable: value })}/><Field label="Rip per strip (mm)" value={allowances.ripAllowance} step={0.1} onChange={value => onChange({ ripAllowance: value })}/></div>
      <div className="field-row"><Field label="Length trim (mm)" value={allowances.lengthTrim} onChange={value => onChange({ lengthTrim: value })}/><Field label="Width trim (mm)" value={allowances.widthTrim} onChange={value => onChange({ widthTrim: value })}/></div>
    </div>
  </div>
}
