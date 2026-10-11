import { useState } from 'react'

/** A request to focus the input with this `data-focus-key`. `seq` changes on every
 *  request, so asking for the same key twice still counts. */
export interface FocusRequest {
  key: string
  seq: number
}

/** Which row of an accordion is open. A focus request for `<prefix>:<id>` or
 *  `<prefix>:<id>.<field>` opens that row, in the same render (also when the panel mounts
 *  because of the request), so the input it names exists by the time the designer moves
 *  focus to it. */
export function useFocusOpen(focus: FocusRequest | null, prefix: string, ids: readonly string[]): [string | null, (id: string | null) => void] {
  const [open, setOpen] = useState<string | null>(null)
  const [handled, setHandled] = useState<number | undefined>(undefined)
  if (focus && focus.seq !== handled) {
    setHandled(focus.seq)
    const rest = focus.key.startsWith(`${prefix}:`) ? focus.key.slice(prefix.length + 1) : null
    const match = rest === null ? undefined : ids.find(id => rest === id || rest.startsWith(`${id}.`))
    if (match !== undefined) setOpen(match)
  }
  return [open, setOpen]
}
