import type { ShopProject } from '../../types'
import type { Point2D } from '../../domain/shopGeometry'
import { getFeedClearanceZones, pointsAttribute } from '../../domain/shopGeometry'

export function FeedClearanceLayer({ project }: { project: ShopProject }) {
  return <svg className="feed-clearance-layer" viewBox={`0 0 ${project.width} ${project.depth}`} preserveAspectRatio="none" aria-hidden="true">
    {project.items.flatMap(item => getFeedClearanceZones(item).map(zone => {
      const center = polygonCenter(zone.points)
      return <g className={`feed-zone ${zone.kind}`} key={`${item.id}-${zone.kind}`}><polygon points={pointsAttribute(zone.points)}/><text x={center.x} y={center.y}>{zone.kind === 'infeed' ? 'IN' : 'OUT'}</text></g>
    }))}
  </svg>
}

function polygonCenter(points: readonly Point2D[]): Point2D {
  return { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length }
}
