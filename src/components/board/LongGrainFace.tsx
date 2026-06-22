import type { BoardStrip } from '../../types'

// A long-grain top face drawn in mm: strips stacked across the width, each
// running the full length. Grain texture runs along the length, parallel to the
// glue lines between strips. Draw inside a ScaledBoardFrame at (0,0).
// Running offsets for stacked bands: tops[i] is the sum of all prior heights,
// and the final entry is the total. O(n); kept module-level so the prefix-sum
// accumulator isn't a component-body reassignment.
function stackTops(heights: number[]): number[] {
  const tops: number[] = []
  let sum = 0
  for (const height of heights) { tops.push(sum); sum += height }
  tops.push(sum)
  return tops
}

export function LongGrainFace({ strips, lengthMm }: { strips: BoardStrip[]; lengthMm: number }) {
  const heights = strips.map(strip => Math.max(0, strip.width))
  const tops = stackTops(heights)
  const bands = strips.map((strip, index) => ({ id: strip.id, speciesId: strip.speciesId, top: tops[index] ?? 0, height: heights[index] ?? 0 }))
  const totalWidth = tops[tops.length - 1] ?? 0

  return <g>
    {bands.map(band => <rect key={band.id} x={0} y={band.top} width={lengthMm} height={band.height} fill={`url(#long-${band.speciesId})`}/>)}
    {bands.slice(1).map(band => <line key={`glue-${band.id}`} className="glue-line" x1={0} y1={band.top} x2={lengthMm} y2={band.top} vectorEffect="non-scaling-stroke"/>)}
    <rect className="board-outline" x={0} y={0} width={lengthMm} height={Math.max(1, totalWidth)} fill="none" vectorEffect="non-scaling-stroke"/>
  </g>
}
