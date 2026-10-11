import { useState } from 'react'
import type { TemplateParameter } from '../../domain/furniture/types'
import { FURNITURE_TEMPLATES } from '../../domain/furniture/templates'
import { formatFieldLabel, formatLengthValue, lengthUnitLabel, parseLengthInput } from '../../domain/lengthUnits'
import type { LengthUnit } from '../../domain/lengthUnits'
import { useModalDialog } from '../useModalDialog'
import { useUnitSystem } from '../unitSystem'

/** `templateId` absent means a blank project. `values` holds only the template's own parameters. */
export interface NewFurnitureRequest {
  templateId?: string
  values: Record<string, number>
}

const BLANK = 'blank'

export function NewFurnitureDialog({ onCreate, onClose }: { onCreate: (request: NewFurnitureRequest) => void; onClose: () => void }) {
  const dialogRef = useModalDialog<HTMLDivElement>(onClose)
  const { lengthUnit } = useUnitSystem()
  const [choice, setChoice] = useState(BLANK)
  // null marks a field whose text does not parse; it blocks Create until fixed.
  const [values, setValues] = useState<Record<string, number | null>>({})
  const template = FURNITURE_TEMPLATES.find(candidate => candidate.id === choice)

  const choose = (id: string) => {
    setChoice(id)
    const next = FURNITURE_TEMPLATES.find(candidate => candidate.id === id)
    setValues(Object.fromEntries((next?.parameters ?? []).map(parameter => [parameter.name, parameter.defaultValue])))
  }
  const problem = (parameter: TemplateParameter): string | null => {
    const value = values[parameter.name]
    if (value === null || value === undefined) return 'Enter a number.'
    if (value < parameter.min || value > parameter.max) return `Use ${formatRange(parameter, lengthUnit)}.`
    return null
  }
  const invalid = template?.parameters.some(parameter => problem(parameter) !== null) ?? false
  const create = () => {
    if (invalid) return
    onCreate(template
      ? { templateId: template.id, values: Object.fromEntries(template.parameters.map(parameter => [parameter.name, values[parameter.name] ?? parameter.defaultValue])) }
      : { values: {} })
  }

  return <div className="modal-scrim" role="presentation" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div ref={dialogRef} tabIndex={-1} className="import-dialog new-furniture-dialog" role="dialog" aria-modal="true" aria-label="New furniture project">
      <header><strong>New furniture project</strong></header>
      <fieldset className="template-choices">
        <legend className="field-label">Start from</legend>
        <label className={`template-choice ${choice === BLANK ? 'active' : ''}`}>
          <input type="radio" name="furniture-template" checked={choice === BLANK} onChange={() => choose(BLANK)} />
          <b>Blank</b><small>An empty project. Add parts yourself.</small>
        </label>
        {FURNITURE_TEMPLATES.map(candidate => <label key={candidate.id} className={`template-choice ${choice === candidate.id ? 'active' : ''}`}>
          <input type="radio" name="furniture-template" checked={choice === candidate.id} onChange={() => choose(candidate.id)} />
          <b>{candidate.name}</b><small>{candidate.description}</small>
        </label>)}
      </fieldset>
      {template && <div className="template-params">
        {template.parameters.map(parameter => <ParameterField key={`${parameter.name}:${lengthUnit}`} parameter={parameter} lengthUnit={lengthUnit}
          value={values[parameter.name]} error={problem(parameter)} onValue={value => setValues(current => ({ ...current, [parameter.name]: value }))} />)}
      </div>}
      <footer>
        <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="button" disabled={invalid} onClick={create}>Create project</button>
      </footer>
    </div>
  </div>
}

// A text field that keeps its own draft so typing "1200" is not clamped at "1". Lengths
// parse like the app's length inputs (fractions in imperial); counts are whole numbers.
function ParameterField({ parameter, lengthUnit, value, error, onValue }: {
  parameter: TemplateParameter
  lengthUnit: LengthUnit
  value: number | null | undefined
  error: string | null
  onValue: (value: number | null) => void
}) {
  const isCount = parameter.unit === 'count'
  const [draft, setDraft] = useState(() => value === null || value === undefined ? '' : isCount ? String(value) : formatLengthValue(value, lengthUnit))
  const errorId = `furniture-param-${parameter.name}-error`
  const parse = (raw: string): number | null => {
    if (isCount) return /^\s*\d+\s*$/.test(raw) ? Number(raw) : null
    return raw.trim() ? parseLengthInput(raw, lengthUnit) : null
  }
  return <label className="field">
    <span>{isCount ? parameter.label : formatFieldLabel(parameter.label, lengthUnit)}</span>
    <input type="text" inputMode={isCount ? 'numeric' : 'decimal'} value={draft} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined}
      onChange={event => { setDraft(event.target.value); onValue(parse(event.target.value)) }} />
    {error && <small id={errorId} className="field-error" role="alert">{error}</small>}
  </label>
}

function formatRange(parameter: TemplateParameter, lengthUnit: LengthUnit): string {
  if (parameter.unit === 'count') return `${parameter.min} to ${parameter.max}`
  return `${formatLengthValue(parameter.min, lengthUnit)} to ${formatLengthValue(parameter.max, lengthUnit)} ${lengthUnitLabel(lengthUnit)}`
}
