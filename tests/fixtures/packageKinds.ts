import { starterData } from '../../src/data'
import { makeComposite } from '../../src/domain/workspace/composites'
import { createFurniture } from '../../src/domain/workspace/furniture'
import { normalizeData } from '../../src/storage'
import type { AtlasData } from '../../src/types'
import { fixedContext } from './context'

export interface KindFixture {
  data: AtlasData
  id: string
}

function starter(): AtlasData {
  return normalizeData(structuredClone(starterData), fixedContext())
}

/** One workspace per registered package kind; the contract suite fails for a kind without one. */
export const PACKAGE_KIND_FIXTURES: Readonly<Record<string, () => KindFixture>> = {
  board: () => {
    const data = starter()
    return { data, id: data.boards[0]!.id }
  },
  composite: () => {
    const data = starter()
    const created = makeComposite(data, data.boards[0]!.id, fixedContext())!
    return { data: normalizeData(created.data, fixedContext()), id: created.id }
  },
  furniture: () => {
    // No template mixes sheet and solid parts, so a solid edge band is added to base-cabinet: sheets, a subassembly, and a species all round-trip.
    const base = starter()
    const created = createFurniture(base, { templateId: 'base-cabinet', values: {} }, fixedContext())
    const project = created.data.furniture.find(p => p.id === created.id)!
    const { sheetMaterialId: _sheet, ...template } = project.parts[0]!
    const solid = { ...template, id: 'edge-band', name: 'Edge band', kind: 'solid' as const, speciesId: base.woods[0]!.id }
    const data = { ...created.data, furniture: created.data.furniture.map(p => p.id === created.id ? { ...p, parts: [...p.parts, solid] } : p) }
    return { data: normalizeData(data, fixedContext()), id: created.id }
  },
}
