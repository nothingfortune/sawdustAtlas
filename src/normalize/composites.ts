import type { AssemblyCell, BoardProject, BuildAllowances, CompositeBoard, CompositeCut, CompositePanel, CompositeRow } from '../types'
import { normalizeEndGrain, normalizeStrip } from './boards'
import { finiteNumber, isRecord, records, stringValue } from './coerce'
import type { NormalizeContext } from './context'

export function normalizeComposite(raw: Record<string, unknown>, options: { boardSink: BoardProject[]; allowances: BuildAllowances; boards: readonly BoardProject[] }, ctx: NormalizeContext): CompositeBoard {
  const droppedPanelIds = new Set<string>()
  const panels: CompositePanel[] = []
  // A composite is one construction throughout; infer it from the first panel's
  // referenced (or spawned) board when the composite itself doesn't record it.
  let inferredConstruction: 'edge' | 'end' | undefined
  for (const rawPanel of records(raw['panels'])) {
    const id = stringValue(rawPanel['id'], ctx.createId())
    // Accept both the new `cut` and the legacy `crosscut` (always axis 'x').
    const cut = normalizeCut(rawPanel['cut'] ?? rawPanel['crosscut'])
    // New shape (or legacy inline-strip migrated earlier): a direct board reference.
    if (typeof rawPanel['boardId'] === 'string') {
      panels.push({ id, boardId: rawPanel['boardId'], cut })
      if (inferredConstruction === undefined) {
        inferredConstruction = options.boards.find(b => b.id === rawPanel['boardId'])?.construction
      }
      continue
    }
    // Legacy 'rip' (inline strips) → create a board and reference it.
    if (rawPanel['kind'] === 'rip') {
      const boardId = ctx.createId()
      const thickness = finiteNumber(rawPanel['thicknessMm'], 38)
      const construction = rawPanel['construction'] === 'end' ? 'end' : 'edge'
      options.boardSink.push({
        id: boardId,
        name: stringValue(rawPanel['name'], 'Migrated panel'),
        length: 300,
        thickness,
        construction,
        // Composites read endGrain.sliceThickness (not project.thickness) for end-grain
        // donors (boardThickness() in compositeBoard.ts). Seed it from the legacy panel's
        // thicknessMm so a migrated end-construction wafer keeps its true donor thickness
        // instead of silently picking up normalizeEndGrain's 45mm default.
        endGrain: normalizeEndGrain(construction === 'end' ? { sliceThickness: thickness } : undefined, thickness),
        allowances: options.allowances,
        strips: records(rawPanel['strips']).map(s => normalizeStrip(s, 'walnut', ctx)),
        updatedAt: ctx.now,
      })
      panels.push({ id, boardId, cut })
      if (inferredConstruction === undefined) inferredConstruction = construction
      continue
    }
    // Legacy 'derived' (recursion) → dropped; any wafers referencing it drop too.
    droppedPanelIds.add(id)
  }
  const construction = raw['construction'] === 'end' || raw['construction'] === 'edge'
    ? raw['construction']
    : (inferredConstruction ?? 'edge')
  return {
    id: stringValue(raw['id'], ctx.createId()),
    name: stringValue(raw['name'], 'Composite board'),
    construction,
    panels,
    rows: normalizeRows(raw, droppedPanelIds, ctx),
    updatedAt: stringValue(raw['updatedAt'], ctx.now),
  }
}

function normalizeCut(raw: unknown): CompositeCut {
  const c = isRecord(raw) ? raw : {}
  return {
    axis: c['axis'] === 'y' ? 'y' : 'x',
    stripWidthMm: finiteNumber(c['stripWidthMm'], 25),
    kerfMm: finiteNumber(c['kerfMm'], 3),
    count: Math.max(0, Math.floor(finiteNumber(c['count'], 1))),
  }
}

function normalizeWafers(raw: unknown, droppedPanelIds: Set<string>): AssemblyCell[] {
  const list = Array.isArray(raw) ? raw : []
  return list
    .map(normalizeCell)
    .filter((w): w is AssemblyCell => w !== null && !droppedPanelIds.has(w.panelId))
}

function normalizeRows(raw: Record<string, unknown>, droppedPanelIds: Set<string>, ctx: NormalizeContext): CompositeRow[] {
  const rawRows = raw['rows']
  // New shape: rows is an array of { id, wafers }.
  if (Array.isArray(rawRows)) {
    return rawRows.filter(isRecord).map(r => ({
      id: stringValue(r['id'], ctx.createId()),
      wafers: normalizeWafers(r['wafers'], droppedPanelIds),
    }))
  }
  // Legacy grid: rows:number, cols:number, cells: row-major sparse array → one
  // CompositeRow per grid row, dropping nulls and wafers of dropped panels.
  const rowCount = Math.max(1, Math.floor(finiteNumber(rawRows, 1)))
  const colCount = Math.max(1, Math.floor(finiteNumber(raw['cols'], 1)))
  const rawCells = Array.isArray(raw['cells']) ? raw['cells'] : []
  const rows: CompositeRow[] = []
  for (let r = 0; r < rowCount; r += 1) {
    const wafers: AssemblyCell[] = []
    for (let c = 0; c < colCount; c += 1) {
      const cell = normalizeCell(rawCells[r * colCount + c])
      if (cell && !droppedPanelIds.has(cell.panelId)) wafers.push(cell)
    }
    rows.push({ id: ctx.createId(), wafers })
  }
  return rows
}

function normalizeCell(raw: unknown): AssemblyCell | null {
  if (!isRecord(raw) || typeof raw['panelId'] !== 'string') return null
  const rotateRaw = finiteNumber(raw['rotate'], 0)
  const rotate = ([0, 90, 180, 270].includes(rotateRaw) ? rotateRaw : 0) as 0 | 90 | 180 | 270
  return {
    panelId: raw['panelId'],
    pieceIndex: Math.max(0, Math.floor(finiteNumber(raw['pieceIndex'], 0))),
    rotate,
    flip: raw['flip'] === true,
  }
}
