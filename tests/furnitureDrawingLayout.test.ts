import { describe, expect, it } from 'vitest'
import { projectDrawing } from '../src/domain/furniture/projection'
import {
  dimensionGeometry, drawingLayout, faceFill, isCoveredAt, labelFits, labelPolygons, polygonArea, polygonCenter, polygonPath, shadeColor, svgPoint, textWidth, viewBoxAttribute,
} from '../src/components/furniture/drawingLayout'
import { bookcaseResolvedParts, tableResolvedParts } from './fixtures/furniture'

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

describe('svg path helpers', () => {
  it('flips y and closes the path', () => {
    expect(svgPoint([3, 4])).toEqual([3, -4])
    expect(polygonPath([[0, 0], [10, 0], [10, 5]])).toBe('M0 0L10 0L10 -5Z')
  })

  it('computes area and centroid', () => {
    const square: Array<[number, number]> = [[0, 0], [4, 0], [4, 2], [0, 2]]
    expect(polygonArea(square)).toBe(8)
    expect(polygonCenter(square)).toEqual([2, 1])
    expect(polygonCenter([[1, 1], [3, 3], [5, 5]])).toEqual([3, 3])
  })
})

describe('shading', () => {
  it('mixes toward white and black', () => {
    expect(shadeColor('#808080', 1)).toBe('#ffffff')
    expect(shadeColor('#808080', -1)).toBe('#000000')
    expect(shadeColor('#808080', 0)).toBe('#808080')
    expect(shadeColor('#fff', 0)).toBe('#ffffff')
    expect(shadeColor('#102030', 5)).toBe('#ffffff')
  })

  it('falls back to the neutral stock color for unparseable input', () => {
    expect(shadeColor('rebeccapurple', 0)).toBe('#b9a48a')
  })

  it('lights the top and shades the side in iso so the box reads as 3D', () => {
    const [top, front, side] = (['top', 'front', 'side'] as const).map(face => luminance(faceFill('#a0703c', face, 'iso')))
    expect(top!).toBeGreaterThan(front!)
    expect(front!).toBeGreaterThan(side!)
    expect(faceFill('#a0703c', 'top', 'exploded')).toBe(faceFill('#a0703c', 'top', 'iso'))
  })

  it('draws orthographic faces flat in the part color', () => {
    for (const view of ['front', 'side', 'top'] as const) expect(faceFill('#a0703c', 'front', view)).toBe('#a0703c')
  })
})

describe('labels', () => {
  it('picks each part\'s largest face', () => {
    const faces = labelPolygons(projectDrawing(tableResolvedParts(), 'iso').polygons)
    expect(faces.size).toBe(9)
    // A top lying flat shows its top face largest.
    expect(faces.get('top')!.face).toBe('top')
    // A standing leg shows a side or front face, never its small top.
    expect(faces.get('leg-fl')!.face).not.toBe('top')
  })

  it('fits text only inside a big enough polygon', () => {
    const wide: Array<[number, number]> = [[0, 0], [100, 0], [100, 20], [0, 20]]
    const thin: Array<[number, number]> = [[0, 0], [5, 0], [5, 200], [0, 200]]
    expect(labelFits(wide, 'T1', 10)).toBe(true)
    expect(labelFits(thin, 'T1', 10)).toBe(false)
    expect(labelFits(wide, 'LONGLABEL', 10)).toBe(true)
    expect(labelFits(wide, 'A'.repeat(30), 10)).toBe(false)
    expect(textWidth('ab', 10)).toBeCloseTo(12.4)
  })
})

describe('isCoveredAt', () => {
  it('reports a label point covered by a nearer part drawn later', () => {
    const { polygons } = projectDrawing(bookcaseResolvedParts(), 'top')
    const bottomIndex = polygons.findIndex(p => p.partId === 'bottom')
    expect(isCoveredAt([400, 150], polygons, bottomIndex)).toBe(true)
    // Nothing is drawn after the last polygon.
    expect(isCoveredAt([400, 150], polygons, polygons.length - 1)).toBe(false)
  })

  it('is not covered outside every later polygon', () => {
    const { polygons } = projectDrawing(bookcaseResolvedParts(), 'top')
    expect(isCoveredAt([-50, -50], polygons, 0)).toBe(false)
  })

  it('treats points on a shared edge as covered and handles either winding', () => {
    const clockwise = [{ partId: 'b', face: 'top' as const, depth: 0, points: [[0, 0], [0, 10], [10, 10], [10, 0]] as Array<[number, number]> }]
    const first = { partId: 'a', face: 'top' as const, depth: 1, points: [[0, 0], [1, 0], [1, 1]] as Array<[number, number]> }
    expect(isCoveredAt([5, 5], [first, ...clockwise], 0)).toBe(true)
    expect(isCoveredAt([0, 5], [first, ...clockwise], 0)).toBe(true)
  })
})

describe('drawingLayout', () => {
  it('pads the viewBox around the flipped bounds and reserves room for dimensions', () => {
    const drawing = projectDrawing(tableResolvedParts(), 'front')
    const bare = drawingLayout(drawing, false)
    const withDims = drawingLayout(drawing, true)
    expect(bare.viewBox.x).toBeLessThan(0)
    expect(bare.viewBox.y).toBeLessThan(-750)
    expect(bare.viewBox.x + bare.viewBox.width).toBeGreaterThan(1200)
    expect(bare.viewBox.y + bare.viewBox.height).toBeGreaterThan(0)
    expect(withDims.viewBox.width).toBeGreaterThan(bare.viewBox.width)
    expect(withDims.viewBox.height).toBeGreaterThan(bare.viewBox.height)
    expect(withDims.fontSize).toBeCloseTo(1200 / 42)
    expect(viewBoxAttribute(bare).split(' ')).toHaveLength(4)
  })

  it('does not reserve dimension room in iso, which has no dimensions', () => {
    const drawing = projectDrawing(bookcaseResolvedParts(), 'iso')
    expect(drawingLayout(drawing, true)).toEqual(drawingLayout(drawing, false))
  })

  it('gives an empty drawing a usable viewBox', () => {
    const layout = drawingLayout(projectDrawing([], 'front'), true)
    expect(layout.viewBox.width).toBeGreaterThan(0)
    expect(layout.fontSize).toBeGreaterThan(0)
  })
})

describe('dimensionGeometry', () => {
  const [horizontal, vertical] = projectDrawing(tableResolvedParts(), 'front').dimensions as [ReturnType<typeof projectDrawing>['dimensions'][number], ReturnType<typeof projectDrawing>['dimensions'][number]]

  it('puts a horizontal dimension line below the drawing', () => {
    const geometry = dimensionGeometry(horizontal, 20)
    // SVG y grows downward, so below the bottom edge (y = 0) is positive.
    expect(geometry.line).toEqual([[0, horizontal.offset], [1200, horizontal.offset]])
    expect(geometry.text.rotate).toBe(0)
    expect(geometry.text.x).toBe(600)
    expect(geometry.text.y).toBeGreaterThan(horizontal.offset)
    expect(geometry.extensions).toHaveLength(2)
    expect(geometry.ticks).toHaveLength(2)
  })

  it('puts a vertical dimension line to the right, with rotated text', () => {
    const geometry = dimensionGeometry(vertical, 20)
    expect(geometry.line).toEqual([[1200 + vertical.offset, -0], [1200 + vertical.offset, -750]])
    expect(geometry.text.rotate).toBe(-90)
    expect(geometry.text.x).toBeGreaterThan(1200 + vertical.offset)
    expect(geometry.text.y).toBe(-375)
  })
})
