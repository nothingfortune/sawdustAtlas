import type { BoardProject, BoardStrip, BuildAllowances, EndGrainSettings } from '../types'
import { finiteNumber, isRecord, records, signedFinite, stringValue } from './coerce'
import type { NormalizeContext } from './context'

export function normalizeStrip(raw: Record<string, unknown>, fallbackSpeciesId: string, ctx: NormalizeContext): BoardStrip {
  return {
    id: stringValue(raw['id'], ctx.createId()),
    speciesId: stringValue(raw['speciesId'], fallbackSpeciesId),
    width: finiteNumber(raw['width'], 38),
    trailingAngle: signedFinite(raw['trailingAngle'], 0),
  }
}

export function normalizeEndGrain(value: unknown, stockThickness: number): EndGrainSettings {
  const saved = isRecord(value) ? value : {}
  return {
    sourceLength: finiteNumber(saved['sourceLength'], 900),
    stockThickness: finiteNumber(saved['stockThickness'], stockThickness),
    sliceThickness: finiteNumber(saved['sliceThickness'], 45),
    kerf: finiteNumber(saved['kerf'], 3.2),
    trimAllowance: finiteNumber(saved['trimAllowance'], 20),
    rowFlips: Array.isArray(saved['rowFlips']) ? saved['rowFlips'].map(Boolean) : [],
    rowRotations: Array.isArray(saved['rowRotations']) ? saved['rowRotations'].map(Boolean) : [],
    rowOffsets: Array.isArray(saved['rowOffsets']) ? saved['rowOffsets'].map(value => signedFinite(value, 0)) : [],
    rowOrder: Array.isArray(saved['rowOrder']) ? saved['rowOrder'].map(value => Math.trunc(finiteNumber(value, 0))) : [],
  }
}

export function normalizeBoard(raw: Record<string, unknown>, options: { allowances: BuildAllowances; fallbackSpeciesId: string }, ctx: NormalizeContext): BoardProject {
  // Strips first so ids issue in the same order as the original inline code.
  const strips = records(raw['strips']).map(strip => normalizeStrip(strip, options.fallbackSpeciesId, ctx))
  const endGrain = normalizeEndGrain(raw['endGrain'], finiteNumber(raw['thickness'], 38))
  return {
    id: stringValue(raw['id'], ctx.createId()),
    name: stringValue(raw['name'], 'Imported cutting board'),
    length: finiteNumber(raw['length'], 450),
    thickness: finiteNumber(raw['thickness'], 38),
    updatedAt: stringValue(raw['updatedAt'], ctx.now),
    construction: raw['construction'] === 'end' ? 'end' : 'edge',
    allowances: options.allowances,
    strips,
    endGrain,
  }
}
