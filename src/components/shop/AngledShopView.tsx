import type { ShopProject } from '../../types'
import type { Point2D } from '../../domain/shopGeometry'
import { getBlockedZoneFootprint, getFeedClearanceZones, getShopItemFootprint, pointsAttribute, projectIsometric, projectPolygon } from '../../domain/shopGeometry'

export function AngledShopView({ project, selected, onSelect }: { project: ShopProject, selected: string, onSelect: (id: string) => void }) {
  const floor = projectPolygon([{ x: 0, y: 0 }, { x: project.width, y: 0 }, { x: project.width, y: project.depth }, { x: 0, y: project.depth }])
  const projectedItems = [...project.items].sort((a, b) => (a.x + a.y) - (b.x + b.y)).map(item => {
    const footprint = getShopItemFootprint(item)
    return { item, bottom: projectPolygon(footprint), top: projectPolygon(footprint, item.height) }
  })
  const feedZones = project.items.flatMap(item => getFeedClearanceZones(item).map(zone => ({ ...zone, itemId: item.id, projected: projectPolygon(zone.points) })))
  const blockedZones = project.blockedZones.map(zone => ({ zone, projected: projectPolygon(getBlockedZoneFootprint(zone)) }))
  const allPoints = [...floor, ...feedZones.flatMap(zone => zone.projected), ...blockedZones.flatMap(zone => zone.projected), ...projectedItems.flatMap(entry => [...entry.bottom, ...entry.top])]
  const bounds = getBounds(allPoints, 450)

  return <div className="angled-shop-view"><div className="angled-view-note">Angled review view · switch to Top to move objects</div><svg viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`} role="img" aria-label="Angled workshop view">
    <polygon className="iso-floor" points={pointsAttribute(floor)}/>
    {blockedZones.map(({ zone, projected }) => <polygon className={`iso-blocked-zone ${selected === `zone:${zone.id}` ? 'selected' : ''}`} points={pointsAttribute(projected)} key={zone.id}/>)}
    {feedZones.map(zone => <polygon className={`iso-feed-zone ${zone.kind}`} points={pointsAttribute(zone.projected)} key={`${zone.itemId}-${zone.kind}`}/>)}
    {projectedItems.map(({ item, bottom, top }) => <g className={`iso-object ${selected === `item:${item.id}` ? 'selected' : ''}`} role="button" tabIndex={0} aria-label={item.name} onClick={() => onSelect(`item:${item.id}`)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') onSelect(`item:${item.id}`) }} key={item.id}>
      {getBoxSides(bottom, top).map((side, index) => <polygon className="iso-side" style={{ fill: item.color }} points={pointsAttribute(side)} key={index}/>)}
      <polygon className="iso-top" style={{ fill: item.color }} points={pointsAttribute(top)}/>
      <text x={projectIsometric({ x: item.x + item.width / 2, y: item.y + item.depth / 2, z: item.height }).x} y={projectIsometric({ x: item.x + item.width / 2, y: item.y + item.depth / 2, z: item.height }).y}>{item.name}</text>
    </g>)}
  </svg></div>
}

function getBoxSides(
  bottom: [Point2D, Point2D, Point2D, Point2D],
  top: [Point2D, Point2D, Point2D, Point2D],
): Array<[Point2D, Point2D, Point2D, Point2D]> {
  return [
    [bottom[0], bottom[1], top[1], top[0]],
    [bottom[1], bottom[2], top[2], top[1]],
    [bottom[2], bottom[3], top[3], top[2]],
    [bottom[3], bottom[0], top[0], top[3]],
  ]
}

function getBounds(points: readonly Point2D[], padding: number) {
  const xs = points.map(point => point.x)
  const ys = points.map(point => point.y)
  const minX = Math.min(...xs) - padding
  const maxX = Math.max(...xs) + padding
  const minY = Math.min(...ys) - padding
  const maxY = Math.max(...ys) + padding
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
