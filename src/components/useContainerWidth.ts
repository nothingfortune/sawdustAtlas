import { useElementSize } from './useElementSize'

// Width-only convenience over useElementSize for the board previews, which need
// one shared px-per-mm scale. Returns a ref to attach and the measured content
// width in px, falling back to `initial` until the first measurement.
export function useContainerWidth(initial = 800): [React.RefObject<HTMLDivElement | null>, number] {
  const [ref, size] = useElementSize()
  return [ref, size.width || initial]
}
