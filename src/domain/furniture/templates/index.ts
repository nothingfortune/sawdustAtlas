import type { FurnitureTemplate } from '../types'
import { basicTable } from './table'
import { desk } from './desk'
import { workbench } from './workbench'

/** The templates a new furniture project can start from, in gallery order. */
export const FURNITURE_TEMPLATES: readonly FurnitureTemplate[] = [basicTable, workbench, desk]

export function templateById(id: string): FurnitureTemplate | undefined {
  return FURNITURE_TEMPLATES.find(template => template.id === id)
}
