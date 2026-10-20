import { describe, expect, it } from 'vitest'
import { starterData } from '../src/data'
import { calculateEndGrainMetrics } from '../src/domain/boardGeometry'
import { addStrip, cycleSliceRow, deleteStrip, duplicatePattern, mirrorPattern, reorderStrips, reverseStrips, setRowPattern, updateEndGrain, updateStrip } from '../src/domain/boardEditing'
import type { BoardProject } from '../src/types'
import { fixedContext } from './fixtures/context'

const base = (): BoardProject => ({
  ...starterData.boards[0]!,
  construction: 'end',
  strips: [
    { id: 'a', speciesId: 'walnut', width: 30, trailingAngle: 0 },
    { id: 'b', speciesId: 'maple', width: 40, trailingAngle: -15 },
  ],
})

describe('strip edits', () => {
  it('addStrip appends a 38 mm square strip', () => {
    expect(addStrip(base(), 'cherry', fixedContext()).strips.at(-1)).toEqual({ id: 'id-1', speciesId: 'cherry', width: 38, trailingAngle: 0 })
  })

  it('updateStrip patches one strip, deleteStrip removes one', () => {
    expect(updateStrip(base(), 'b', { width: 12 }).strips[1]).toMatchObject({ id: 'b', width: 12, trailingAngle: -15 })
    expect(deleteStrip(base(), 'a').strips.map(s => s.id)).toEqual(['b'])
  })

  it('reorderStrips follows the given ids and drops unknown ones', () => {
    expect(reorderStrips(base(), ['b', 'zzz', 'a']).strips.map(s => s.id)).toEqual(['b', 'a'])
  })

  it('duplicate and mirror append fresh-id copies; reverse flips order', () => {
    expect(duplicatePattern(base(), fixedContext()).strips.map(s => s.id)).toEqual(['a', 'b', 'id-1', 'id-2'])
    const mirrored = mirrorPattern(base(), fixedContext()).strips
    expect(mirrored.map(s => s.speciesId)).toEqual(['walnut', 'maple', 'maple', 'walnut'])
    expect(mirrored[2]?.trailingAngle).toBe(-15)
    expect(reverseStrips(base()).strips.map(s => s.id)).toEqual(['b', 'a'])
  })
})

describe('end-grain edits', () => {
  it('updateEndGrain clamps slice transforms to the new slice count', () => {
    const wide = updateEndGrain(base(), { rowFlips: Array.from({ length: 40 }, () => true) })
    const count = calculateEndGrainMetrics(wide).sliceCount
    expect(wide.endGrain.rowFlips.length).toBeLessThanOrEqual(count)
    const thicker = updateEndGrain(wide, { sliceThickness: wide.endGrain.sliceThickness * 3 })
    expect(calculateEndGrainMetrics(thicker).sliceCount).toBeLessThan(count)
    expect(thicker.endGrain.rowFlips.length).toBeLessThanOrEqual(calculateEndGrainMetrics(thicker).sliceCount)
    const back = updateEndGrain(thicker, { sliceThickness: wide.endGrain.sliceThickness })
    expect(back.endGrain.rowFlips).toEqual(thicker.endGrain.rowFlips)
  })

  it('setRowPattern flip flips every other slice and clears offsets', () => {
    const project = setRowPattern({ ...base(), endGrain: { ...base().endGrain, rowOffsets: [0.5] } }, 'flip')
    const count = calculateEndGrainMetrics(project).sliceCount
    expect(project.endGrain.rowFlips.slice(0, Math.min(count, 4))).toEqual([false, true, false, true].slice(0, Math.min(count, 4)))
    expect(project.endGrain.rowOffsets).toEqual([])
  })

  it('cycleSliceRow steps none → rotate → flip → both → none', () => {
    let project = base()
    const states: Array<[boolean, boolean]> = []
    for (let i = 0; i < 4; i += 1) {
      project = cycleSliceRow(project, 0)
      states.push([project.endGrain.rowRotations[0] ?? false, project.endGrain.rowFlips[0] ?? false])
    }
    expect(states).toEqual([[true, false], [false, true], [true, true], [false, false]])
  })
})
