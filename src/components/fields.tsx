import { useState } from 'react'
import { formatFieldLabel, formatLengthValue, lengthUnitLabel, parseLengthInput } from '../domain/lengthUnits'
import { useUnitSystem } from './unitSystem'

interface LengthInputProps {
  value: number
  min?: number
  max?: number
  step?: number
  ariaLabel?: string
  title?: string
  className?: string
  onChange: (value: number) => void
}

// Shared labelled dimension input used across the editor panels. Metric mode
// keeps the current number-input behavior; imperial mode accepts inches as text
// and snaps the committed value to a display-friendly 1/32".
export function NumberField({ label, value, min = 0, step = 1, onChange }: { label: string; value: number; min?: number; step?: number; onChange: (value: number) => void }) {
  const { lengthUnit } = useUnitSystem()
  return <label className="field"><span>{formatFieldLabel(label, lengthUnit)}</span><LengthInput value={value} min={min} step={step} onChange={onChange}/></label>
}

export function LengthInput({ value, min = 0, max, step = 1, ariaLabel, title, className, onChange }: LengthInputProps) {
  const { lengthUnit } = useUnitSystem()
  const [draft, setDraft] = useState(() => formatLengthValue(value, lengthUnit))
  const [focused, setFocused] = useState(false)

  if (lengthUnit === 'metric') {
    return <input
      className={className}
      aria-label={ariaLabel}
      title={title}
      type="number"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={event => onChange(clamp(Number(event.target.value), min, max))}
    />
  }

  const displayValue = focused ? draft : formatLengthValue(value, lengthUnit)
  const commit = (raw: string) => {
    const parsed = parseLengthInput(raw, lengthUnit)
    if (parsed === null) {
      setDraft(formatLengthValue(value, lengthUnit))
      return
    }
    const next = clamp(parsed, min, max)
    onChange(next)
    setDraft(formatLengthValue(next, lengthUnit))
  }

  return <input
    className={className}
    aria-label={ariaLabel}
    title={title ?? `Value in ${lengthUnitLabel(lengthUnit)}`}
    type="text"
    inputMode="decimal"
    value={displayValue}
    onFocus={() => {
      setFocused(true)
      setDraft(formatLengthValue(value, lengthUnit))
    }}
    onBlur={event => {
      setFocused(false)
      commit(event.target.value)
    }}
    onChange={event => setDraft(event.target.value)}
    onKeyDown={event => {
      if (event.key === 'Enter') event.currentTarget.blur()
      if (event.key === 'Escape') {
        setDraft(formatLengthValue(value, lengthUnit))
        event.currentTarget.blur()
      }
    }}
  />
}

function clamp(value: number, min?: number, max?: number): number {
  const floor = min ?? -Infinity
  const ceiling = max ?? Infinity
  return Math.min(Math.max(Number.isFinite(value) ? value : 0, floor), ceiling)
}
