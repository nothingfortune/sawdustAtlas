import { useEffect, useRef } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Shared modal-dialog behaviour: focus the dialog on open, restore focus to the
// previously-focused element on close, close on Escape, and trap Tab focus within
// the dialog. Attach the returned ref to a container with tabIndex={-1}.
export function useModalDialog<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null)
  // Keep the latest onClose in a ref so the mount/unmount effect can stay
  // dependency-free: callers pass an inline arrow, and depending on it would
  // re-run the effect on every parent re-render, re-grabbing focus mid-interaction.
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  // Focus capture/restore and the key listener run exactly once per open/close.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onCloseRef.current(); return }
      if (event.key !== 'Tab' || !ref.current) return
      const focusable = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => el.offsetParent !== null)
      if (focusable.length === 0) { event.preventDefault(); ref.current.focus(); return }
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      const active = document.activeElement
      if (event.shiftKey && (active === first || active === ref.current)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); previouslyFocused?.focus?.() }
  }, [])
  return ref
}
