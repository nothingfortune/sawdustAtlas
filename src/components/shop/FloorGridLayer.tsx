import type { ShopProject } from '../../types'
import { formatLengthValue, MM_PER_FOOT, snapMmToFoot } from '../../domain/lengthUnits'
import { useUnitSystem } from '../unitSystem'

export function FloorGridLayer({ project }: { project: ShopProject }) {
  const { lengthUnit } = useUnitSystem()
  // Preston's button: snap the grid to the nearest foot with foot labels so the
  // floor reads in round feet, whatever the underlying mm spacing.
  const footGrid = lengthUnit === 'imperial'
  const grid = footGrid ? snapMmToFoot(project.gridSize) : project.gridSize
  const xs = gridSeries(project.width, grid)
  const ys = gridSeries(project.depth, grid)
  const labelEvery = grid >= 500 ? 1 : 2
  const gridLabel = (value: number) => footGrid ? `${Math.round(value / MM_PER_FOOT)}'` : formatLengthValue(value, lengthUnit)

  return <svg className="floor-grid-layer" viewBox={`0 0 ${project.width} ${project.depth}`} preserveAspectRatio="none" aria-hidden="true">
    {xs.map((x, index) => <line className={index % labelEvery === 0 ? 'major' : ''} x1={x} y1={0} x2={x} y2={project.depth} key={`x-${x}`}/>)}
    {ys.map((y, index) => <line className={index % labelEvery === 0 ? 'major' : ''} x1={0} y1={y} x2={project.width} y2={y} key={`y-${y}`}/>)}
    {xs.filter((_, index) => index % labelEvery === 0 && index > 0).map(x => <text className="grid-label" x={x - 12} y={95} key={`xlabel-${x}`}>{gridLabel(x)}</text>)}
    {ys.filter((_, index) => index % labelEvery === 0 && index > 0).map(y => <text className="grid-label" x={28} y={y - 18} key={`ylabel-${y}`}>{gridLabel(y)}</text>)}
  </svg>
}

function gridSeries(size: number, step: number) {
  const values: number[] = []
  for (let value = 0; value <= size; value += step) values.push(value)
  if (values.at(-1) !== size) values.push(size)
  return values
}
