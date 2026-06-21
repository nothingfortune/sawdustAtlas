import type { BoardStrip } from '../../types'
import { patternSpeciesId } from './patternId'

// A long-grain top face drawn in mm: strips stacked across the width, each
// running the full length. Grain texture runs along the length, parallel to the
// glue lines between strips. Draw inside a ScaledBoardFrame at (0,0).
export function LongGrainFace({ strips, lengthMm }: { strips: BoardStrip[]; lengthMm: number }) {
  const bandHeight = (strip: BoardStrip) => Math.max(0, strip.width)
  const bands = strips.map((strip, index) => ({
    id: strip.id,
    speciesId: patternSpeciesId(strip.speciesId),
    top: strips.slice(0, index).reduce((sum, prev) => sum + bandHeight(prev), 0),
    height: bandHeight(strip),
  }))
  const totalWidth = strips.reduce((sum, strip) => sum + bandHeight(strip), 0)

  return <g>
    {bands.map(band => <rect key={band.id} x={0} y={band.top} width={lengthMm} height={band.height} fill={`url(#long-${band.speciesId})`}/>)}
    {bands.slice(1).map(band => <line key={`glue-${band.id}`} className="glue-line" x1={0} y1={band.top} x2={lengthMm} y2={band.top} vectorEffect="non-scaling-stroke"/>)}
    <rect className="board-outline" x={0} y={0} width={lengthMm} height={Math.max(1, totalWidth)} fill="none" vectorEffect="non-scaling-stroke"/>
  </g>
}
