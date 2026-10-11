import { resolveFurniture } from '../../domain/furniture/geometry'
import type { FurnitureContext, FurnitureProject, ResolvedFurniture } from '../../domain/furniture/types'
import { validateFurniture } from '../../domain/furniture/validation'

export interface FurnitureSummary {
  /** Overall width × depth × height of the resolved parts, mm; null when nothing resolved. */
  size: [number, number, number] | null
  partCount: number
  errors: number
  warnings: number
}

export function summarizeResolved(resolved: ResolvedFurniture, context: FurnitureContext): FurnitureSummary {
  const issues = validateFurniture(resolved, context)
  const { bounds } = resolved
  return {
    size: bounds ? [bounds.sx, bounds.sy, bounds.sz] : null,
    partCount: resolved.project.parts.length,
    errors: issues.filter(issue => issue.severity === 'error').length,
    warnings: issues.filter(issue => issue.severity === 'warning').length,
  }
}

export function summarizeFurniture(project: FurnitureProject, context: FurnitureContext): FurnitureSummary {
  return summarizeResolved(resolveFurniture(project, context), context)
}
