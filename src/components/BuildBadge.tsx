import { buildInfo } from '../buildInfo'

// Fixed bottom-corner badge showing which branch / commit / environment this
// bundle was built from, so previews and test builds are identifiable at a glance.
// Values are baked in at build time (see resolveBuildInfo in vite.config.ts).
export function BuildBadge() {
  const { branch, buildNumber, sha, env, builtAt } = buildInfo
  return (
    <div
      className="build-badge"
      data-build-env={env}
      title={builtAt ? `Built ${builtAt}` : undefined}
    >
      {branch} · build {buildNumber} · {sha} · {env}
    </div>
  )
}
