import { useEffect, useRef, useState } from 'react'

// Measures an element's content box (width + height) so the floating studio /
// pop-out previews can fit-scale a board into whatever space they're given.
// Mirrors useContainerWidth but tracks both axes.
export function useElementSize(): [React.RefObject<HTMLDivElement | null>, { width: number; height: number }] {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(element)
    setSize({ width: element.clientWidth, height: element.clientHeight })
    return () => observer.disconnect()
  }, [])

  return [ref, size]
}
