import { DEFAULT_PRICING } from '../data'
import { DEFAULT_ALLOWANCES } from '../domain/boardAllowances'
import type { BuildAllowances, PricingSettings } from '../types'
import { finiteNumber, isRecord, nonNegativeFinite } from './coerce'

// Migrate the legacy `drumSanding` allowance to `routerTable` (same role: a
// final thickness-surfacing pass) so saved boards keep their value after the
// rename. Every field is an untrusted value from raw JSON (hand-edited backups
// can carry strings, Infinity, or be missing entirely) so each is coerced with
// finiteNumber — they are all non-negative dimensions — falling back to the
// matching DEFAULT_ALLOWANCES value when invalid.
export function normalizeAllowances(saved: (BuildAllowances & { drumSanding?: number }) | undefined): BuildAllowances {
  const record: Record<string, unknown> = isRecord(saved) ? saved : {}
  const routerTableSource = record['routerTable'] !== undefined ? record['routerTable'] : record['drumSanding']
  return {
    jointing: finiteNumber(record['jointing'], DEFAULT_ALLOWANCES.jointing),
    planing: finiteNumber(record['planing'], DEFAULT_ALLOWANCES.planing),
    routerTable: finiteNumber(routerTableSource, DEFAULT_ALLOWANCES.routerTable),
    ripAllowance: finiteNumber(record['ripAllowance'], DEFAULT_ALLOWANCES.ripAllowance),
    lengthTrim: finiteNumber(record['lengthTrim'], DEFAULT_ALLOWANCES.lengthTrim),
    widthTrim: finiteNumber(record['widthTrim'], DEFAULT_ALLOWANCES.widthTrim),
  }
}

export function normalizePricing(saved: unknown): PricingSettings {
  const s = isRecord(saved) ? saved : {}
  const tiers = isRecord(s['tierHours']) ? s['tierHours'] : {}
  const floor = isRecord(s['floor']) ? s['floor'] : {}
  return {
    materialMarkupPercent: nonNegativeFinite(s['materialMarkupPercent'], DEFAULT_PRICING.materialMarkupPercent),
    laborRatePerHour: nonNegativeFinite(s['laborRatePerHour'], DEFAULT_PRICING.laborRatePerHour),
    tierHours: {
      simple: nonNegativeFinite(tiers['simple'], DEFAULT_PRICING.tierHours.simple),
      standard: nonNegativeFinite(tiers['standard'], DEFAULT_PRICING.tierHours.standard),
      complex: nonNegativeFinite(tiers['complex'], DEFAULT_PRICING.tierHours.complex),
    },
    consumablesBase: nonNegativeFinite(s['consumablesBase'], DEFAULT_PRICING.consumablesBase),
    consumablesPerBoardFoot: nonNegativeFinite(s['consumablesPerBoardFoot'], DEFAULT_PRICING.consumablesPerBoardFoot),
    floor: {
      edge: nonNegativeFinite(floor['edge'], DEFAULT_PRICING.floor.edge),
      end: nonNegativeFinite(floor['end'], DEFAULT_PRICING.floor.end),
    },
  }
}
