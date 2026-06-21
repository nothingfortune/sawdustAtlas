import type { TemplatePolygon } from '../../domain/boardGeometry'
import { patternSpeciesId } from './patternId'

// One end-grain slice cross-section: the strip polygons (already in mm from
// buildEndGrainTemplate) filled with the end-grain motif. Used per slice in the
// assembled board and for the angled cross-section callout.
export function EndGrainFace({ polygons }: { polygons: readonly TemplatePolygon[] }) {
  return <>{polygons.map(polygon => <polygon
    key={polygon.id}
    points={polygon.points}
    fill={`url(#end-${patternSpeciesId(polygon.speciesId)})`}
    stroke="#1b211d"
    strokeWidth="0.4"
    vectorEffect="non-scaling-stroke"
  />)}</>
}
