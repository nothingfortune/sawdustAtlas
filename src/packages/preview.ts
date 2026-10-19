import type { AtlasData } from '../types'
import { describeProject } from './envelope'
import type { ProjectPackage } from './envelope'
import type { PackageDescription } from './kind'

export interface PackagePreview extends PackageDescription {
  /** Names of species the import would add to the library. */
  woodsAdded: string[]
  /** Names of species already in the library; the local versions are kept. */
  woodsPresent: string[]
}

export function previewProjectPackage(data: Pick<AtlasData, 'woods'>, pkg: ProjectPackage): PackagePreview {
  const local = new Set(data.woods.map(wood => wood.id))
  return {
    ...describeProject(pkg),
    woodsAdded: pkg.woods.filter(wood => !local.has(wood.id)).map(wood => wood.name),
    woodsPresent: pkg.woods.filter(wood => local.has(wood.id)).map(wood => wood.name),
  }
}
