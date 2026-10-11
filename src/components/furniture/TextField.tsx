import { useId, useState } from 'react'

// A labelled text input that holds a draft and commits on blur or Enter. `onCommit`
// returns an error message to refuse the entry; the draft and the message then stay in
// place until the entry is fixed or Escape restores the saved value.
export function TextField({ label, value, hideLabel = false, inputMode, focusKey, onCommit }: {
  label: string
  value: string
  hideLabel?: boolean
  inputMode?: 'text' | 'decimal'
  /** Names the input for the issue list's "go to the field" (see issueFocus.ts). */
  focusKey?: string
  onCommit: (value: string) => string | null
}) {
  const id = useId()
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const refusal = draft === value ? null : onCommit(draft)
    setError(refusal)
    if (!refusal) setDraft(null)
  }
  return <div className="field">
    <label htmlFor={id} className={hideLabel ? 'visually-hidden' : undefined}>{label}</label>
    <input id={id} data-focus-key={focusKey} type="text" inputMode={inputMode ?? 'text'} autoComplete="off" value={draft ?? value} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined}
      onChange={event => { setDraft(event.target.value); setError(null) }}
      onBlur={commit}
      onKeyDown={event => {
        if (event.key === 'Enter') commit()
        if (event.key === 'Escape') { setDraft(null); setError(null) }
      }} />
    {error && <small id={`${id}-error`} className="field-error" role="alert">{error}</small>}
  </div>
}
