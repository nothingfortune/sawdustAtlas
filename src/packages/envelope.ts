import { LATEST_SCHEMA_VERSION } from '../domain/migrations'
import { defaultNormalizeContext } from '../normalize/context'
import type { AtlasData, WoodSpecies } from '../types'
import type { KindMergeSummary, PackageDescription, ReadContext } from './kind'
import { findKind } from './kinds'
import type { ProjectPayload, ProjectType } from './kinds'
import { fail, isPlainRecord, mergeWoods, woodsUsedBy } from './shared'

export const PROJECT_PACKAGE_KIND = 'sawdust-atlas/project-package'
export const SUPPORTED_PACKAGE_VERSION = 1
export const NEWER_VERSION_ERROR = 'This project was made with a newer version of SawdustAtlas. Update this app to open it.'

export interface ProjectPackage {
  kind: typeof PROJECT_PACKAGE_KIND
  packageVersion: typeof SUPPORTED_PACKAGE_VERSION
  schemaVersion: number
  exportedAt: string
  project: ProjectPayload
  /** Only the species the project uses. */
  woods: WoodSpecies[]
}

export interface ProjectMergeSummary extends KindMergeSummary {
  woodsAdded: number
  woodsKept: number
}

export type PackageReadResult = { ok: true; pkg: ProjectPackage } | { ok: false; error: string }

function schemaVersionOf(raw: Record<string, unknown>): number {
  const version = raw['schemaVersion']
  return typeof version === 'number' && Number.isFinite(version) ? version : 1
}

// Files exported before the field was checked carry no usable packageVersion; they are version 1.
function packageVersionOf(raw: Record<string, unknown>): number {
  const version = raw['packageVersion']
  return typeof version === 'number' && Number.isInteger(version) ? version : 1
}

export function buildProjectPackage(data: AtlasData, ref: { type: ProjectType; id: string }, exportedAt: string): ProjectPackage | null {
  const entry = findKind(ref.type)
  const project = entry?.build(data, ref.id)
  if (!entry || !project) return null
  return { kind: PROJECT_PACKAGE_KIND, packageVersion: SUPPORTED_PACKAGE_VERSION, schemaVersion: data.schemaVersion, exportedAt, project, woods: woodsUsedBy(data.woods, entry.usedWoodIds(project)) }
}

export function readProjectPackage(parsed: unknown, ctx: ReadContext = defaultNormalizeContext()): PackageReadResult {
  if (!isPlainRecord(parsed) || parsed['kind'] !== PROJECT_PACKAGE_KIND) return fail('This file is not a SawdustAtlas project package.')
  if (packageVersionOf(parsed) > SUPPORTED_PACKAGE_VERSION || schemaVersionOf(parsed) > LATEST_SCHEMA_VERSION) return fail(NEWER_VERSION_ERROR)
  const project = parsed['project']
  if (!isPlainRecord(project)) return fail('The project package has no project in it.')
  const entry = findKind(project['type'])
  if (!entry) return fail('The project package holds an unknown kind of project.')
  const read = entry.read({ project, woods: Array.isArray(parsed['woods']) ? parsed['woods'] : [], schemaVersion: schemaVersionOf(parsed) }, ctx)
  if (!read.ok) return read
  return {
    ok: true,
    pkg: {
      kind: PROJECT_PACKAGE_KIND,
      packageVersion: SUPPORTED_PACKAGE_VERSION,
      schemaVersion: LATEST_SCHEMA_VERSION,
      exportedAt: typeof parsed['exportedAt'] === 'string' ? parsed['exportedAt'] : '',
      project: read.payload,
      woods: woodsUsedBy(read.woods, entry.usedWoodIds(read.payload)),
    },
  }
}

export function mergeProjectPackage(data: AtlasData, pkg: ProjectPackage, createId: () => string): { data: AtlasData; summary: ProjectMergeSummary } {
  const entry = findKind(pkg.project.type)
  if (!entry) throw new Error(`No package kind is registered for "${pkg.project.type}".`)
  const merged = entry.merge(data, pkg.project, { createId })
  const woods = mergeWoods(merged.data.woods, pkg.woods)
  return { data: { ...merged.data, woods: woods.woods }, summary: { ...merged.summary, woodsAdded: woods.added, woodsKept: woods.kept } }
}

export function describeProject(pkg: ProjectPackage): PackageDescription {
  return findKind(pkg.project.type)?.describe(pkg.project) ?? { name: 'project', label: 'Project', size: '' }
}

/** The download name for a package: `<project name>.sawdust-project.json`, made filesystem-safe. */
export function projectPackageFileName(pkg: ProjectPackage): string {
  // eslint-disable-next-line no-control-regex
  const safe = describeProject(pkg).name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').trim().replace(/^\.+/, '')
  return `${safe || 'project'}.sawdust-project.json`
}
