import { useEffect, useRef, useState } from 'react'

// Measures an element's content width so the board previews can resolve one
// shared px-per-mm scale. Returns a ref to attach and the current width in px.
export function useContainerWidth(initial = 800): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(initial)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(element)
    setWidth(element.clientWidth || initial)
    return () => observer.disconnect()
  }, [initial])

  return [ref, width]
}
