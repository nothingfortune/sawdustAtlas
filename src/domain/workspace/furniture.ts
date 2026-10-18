import { emptyFurnitureProject, remapMissingSpecies } from '../furniture/project'
import { templateById } from '../furniture/templates'
import type { FurnitureProject } from '../furniture/types'
import type { AtlasData } from '../../types'
import type { Created, WorkspaceContext } from './context'

export interface NewFurnitureOptions {
  templateId?: string
  values: Record<string, number>
}

export function createFurniture(data: AtlasData, request: NewFurnitureOptions, ctx: WorkspaceContext): Created {
  const template = request.templateId ? templateById(request.templateId) : undefined
  const project = template
    ? remapMissingSpecies(template.create(request.values, ctx.createId(), ctx.now), data.woods.map(wood => wood.id))
    : emptyFurnitureProject(ctx.createId(), 'Untitled furniture', ctx.now)
  return { data: { ...data, furniture: [...data.furniture, project] }, id: project.id }
}

// Part, joint, and relationship ids are project-scoped, so a copy keeps them and stays valid.
export function duplicateFurniture(data: AtlasData, id: string, ctx: WorkspaceContext): Created | null {
  const source = data.furniture.find(p => p.id === id)
  if (!source) return null
  const copy: FurnitureProject = { ...structuredClone(source), id: ctx.createId(), name: `${source.name} copy`, updatedAt: ctx.now }
  return { data: { ...data, furniture: [...data.furniture, copy] }, id: copy.id }
}

export function updateFurniture(data: AtlasData, project: FurnitureProject, ctx: WorkspaceContext): AtlasData {
  return { ...data, furniture: data.furniture.map(p => p.id === project.id ? { ...project, updatedAt: ctx.now } : p) }
}

export function deleteFurniture(data: AtlasData, id: string): AtlasData {
  return { ...data, furniture: data.furniture.filter(p => p.id !== id) }
}
