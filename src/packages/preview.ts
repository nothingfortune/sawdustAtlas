import type { AtlasData } from '../types'
import { describeProject, mergeProjectPackage } from './envelope'
import type { ProjectPackage } from './envelope'
import type { PackageDescription } from './kind'

export interface PackagePreview extends PackageDescription {
  /** Names of species the import would add to the library. */
  woodsAdded: string[]
  /** Names of species already in the library; the local versions are kept. */
  woodsPresent: string[]
  /** True when the workspace already has this project, so the import lands as a suffixed copy. */
  importsAsCopy: boolean
}

export function previewProjectPackage(data: AtlasData, pkg: ProjectPackage): PackagePreview {
  const local = new Set(data.woods.map(wood => wood.id))
  return {
    ...describeProject(pkg),
    woodsAdded: pkg.woods.filter(wood => !local.has(wood.id)).map(wood => wood.name),
    woodsPresent: pkg.woods.filter(wood => local.has(wood.id)).map(wood => wood.name),
    importsAsCopy: mergeProjectPackage(data, pkg, () => 'preview').summary.importedAsCopy,
  }
}
