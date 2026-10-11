import type { FurnitureTemplate } from '../types'
import { baseCabinet } from './baseCabinet'
import { bookcase } from './bookcase'
import { desk } from './desk'
import { basicTable } from './table'
import { wallCabinet } from './wallCabinet'
import { workbench } from './workbench'

/** The templates a new furniture project can start from, in gallery order. */
export const FURNITURE_TEMPLATES: readonly FurnitureTemplate[] = [basicTable, workbench, desk, bookcase, baseCabinet, wallCabinet]

export function templateById(id: string): FurnitureTemplate | undefined {
  return FURNITURE_TEMPLATES.find(template => template.id === id)
}
