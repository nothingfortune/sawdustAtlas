import type { ReactNode } from 'react'
import type { WoodSpecies } from '../../types'
import { WoodPatterns } from './WoodPatterns'
import { Ruler } from './Ruler'
import { ScaleBar } from './ScaleBar'

// Reusable true-to-scale board canvas. 1 SVG user unit = 1 mm; pixel size is
// mm * pxPerMm so the drawing is genuinely to scale, and rulers/scale-bar share
// the same coordinate space (a tick is provably N mm next to the wood). The
// scroll wrapper lets long boards overflow horizontally without distorting.
export function ScaledBoardFrame({ lengthMm, widthMm, pxPerMm, rulers = [], scaleBar = false, ariaLabel, children, woods }: {
  lengthMm: number
  widthMm: number
  pxPerMm: number
  rulers?: ('top' | 'left')[]
  scaleBar?: boolean
  ariaLabel?: string
  children: ReactNode
  woods: readonly WoodSpecies[]
}) {
  const k = 1 / pxPerMm
  const safeLength = Math.max(1, lengthMm)
  const safeWidth = Math.max(1, widthMm)
  const topGutter = (rulers.includes('top') ? 26 : 4) * k
  const leftGutter = (rulers.includes('left') ? 34 : 4) * k
  const bottomGutter = (scaleBar ? 30 : 6) * k
  const rightGutter = 12 * k
  const vbWidth = leftGutter + safeLength + rightGutter
  const vbHeight = topGutter + safeWidth + bottomGutter

  return <div className="scaled-board-scroll">
    <svg
      className="scaled-board"
      width={vbWidth * pxPerMm}
      height={vbHeight * pxPerMm}
      viewBox={`${-leftGutter} ${-topGutter} ${vbWidth} ${vbHeight}`}
      role="img"
      aria-label={ariaLabel}
    >
      <WoodPatterns woods={woods}/>
      {children}
      {rulers.includes('top') && <Ruler dimMm={safeLength} pxPerMm={pxPerMm} orientation="top"/>}
      {rulers.includes('left') && <Ruler dimMm={safeWidth} pxPerMm={pxPerMm} orientation="left"/>}
      {scaleBar && <g transform={`translate(0 ${safeWidth + 16 * k})`}><ScaleBar pxPerMm={pxPerMm}/></g>}
    </svg>
  </div>
}
