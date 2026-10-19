import type { ProjectPackage } from './packages'
import { projectPackageFileName } from './packages'

// DOM-only counterpart of storage.downloadData for a single-project package. Kept apart
// from src/packages so that module stays pure and unit-testable.
export function downloadProjectPackage(pkg: ProjectPackage) {
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = projectPackageFileName(pkg)
  link.click()
  URL.revokeObjectURL(url)
}
