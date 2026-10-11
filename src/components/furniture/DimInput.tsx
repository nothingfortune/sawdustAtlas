import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { evaluateDim } from '../../domain/furniture/expressions'
import type { DimExpr } from '../../domain/furniture/types'
import { formatLengthValue, lengthUnitLabel, parseLengthInput } from '../../domain/lengthUnits'
import { useUnitSystem } from '../unitSystem'

interface DimInputProps {
  label: string
  value: DimExpr
  /** Evaluated parameters an expression may use, by name. */
  scope: Readonly<Record<string, number>>
  /** Sizes must come out above zero; positions and parameters may be zero or negative. */
  positive?: boolean
  /** False for fields that hold a plain number (sheet sizes, board width). */
  allowExpression?: boolean
  disabled?: boolean
  /** Extra line under the field, e.g. what drives a read-only position. */
  note?: ReactNode
  onCommit: (value: DimExpr) => void
}

// A length in the current display units, or, when the entry starts with "=", an
// expression in millimeters over the project's parameters. Typed text is only a draft:
// it commits on blur or Enter, and an entry that does not parse or evaluate shows its
// error in place and is never committed. Unlike LengthInput there is no half-inch snap
// in imperial, because furniture parts need true fractions such as 3/4".
export function DimInput({ label, value, scope, positive = false, allowExpression = true, disabled = false, note, onCommit }: DimInputProps) {
  const { lengthUnit } = useUnitSystem()
  const id = useId()
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const unit = lengthUnitLabel(lengthUnit)
  const isExpression = typeof value === 'string'
  const resting = isExpression ? `=${value}` : formatLengthValue(value, lengthUnit)
  const shown = draft ?? resting
  const evaluated = evaluateDim(value, scope)
  const editingExpression = allowExpression && draft !== null && draft.trim().startsWith('=')
  const preview = editingExpression ? evaluateDim(draft.trim().slice(1).trim(), scope) : null

  const reject = (message: string) => { setError(message); return false }
  const check = (raw: string): boolean => {
    const text = raw.trim()
    if (text.startsWith('=')) {
      if (!allowExpression) return reject('This field takes a plain length, not an expression.')
      const source = text.slice(1).trim()
      if (!source) return reject('Enter an expression after "=".')
      const result = evaluateDim(source, scope)
      if (!result.ok) return reject(result.message)
      if (positive && result.value <= 0) return reject('This must be greater than zero.')
      if (source !== value) onCommit(source)
      return true
    }
    const parsed = text ? parseLengthInput(text, lengthUnit) : null
    if (parsed === null) return reject(`Enter a length in ${unit}, or start with = for an expression.`)
    if (positive && parsed <= 0) return reject('This must be greater than zero.')
    if (parsed !== value) onCommit(parsed)
    return true
  }
  const commit = () => {
    if (draft === null) return
    if (draft.trim() === resting || check(draft)) { setDraft(null); setError(null) }
  }
  const cancel = () => { setDraft(null); setError(null) }
  const restingError = !evaluated.ok && draft === null ? evaluated.message : null
  const shownError = error ?? restingError
  const errorId = `${id}-error`
  const previewText = preview?.ok ? `= ${formatLengthValue(preview.value, lengthUnit)} ${unit}` : null

  return <div className="field dim-field">
    <label htmlFor={id}>{label} ({unit})</label>
    <div className="dim-input-row">
      {(isExpression || editingExpression) && <span className="dim-fx" aria-hidden="true">fx</span>}
      <input id={id} type="text" inputMode="decimal" spellCheck={false} autoComplete="off" value={shown} disabled={disabled}
        aria-invalid={shownError ? true : undefined} aria-describedby={shownError ? errorId : undefined}
        onChange={event => { setDraft(event.target.value); setError(null) }}
        onBlur={commit}
        onKeyDown={event => {
          if (event.key === 'Enter') commit()
          if (event.key === 'Escape') cancel()
        }} />
    </div>
    {isExpression && draft === null && evaluated.ok && <small className="dim-evaluated">= {formatLengthValue(evaluated.value, lengthUnit)} {unit}</small>}
    {previewText && !error && <small className="dim-evaluated" aria-live="polite">{previewText}</small>}
    {shownError && <small id={errorId} className="field-error" role="alert">{shownError}</small>}
    {note}
  </div>
}
