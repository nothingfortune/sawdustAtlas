export interface BuildInfo {
  /** Git branch the bundle was built from. */
  branch: string
  /** Monotonically iterating build number (git commit count). */
  buildNumber: string
  /** Short commit hash, with a trailing '+' when the tree was dirty. */
  sha: string
  /** 'dev' | 'local' | 'production' (see resolveBuildInfo in vite.config.ts). */
  env: string
  /** ISO timestamp of when the bundle was built. */
  builtAt: string
}

// Injected at build time by vite.config.ts via `define`. Guard with typeof so any
// context where the define is absent (e.g. a raw vitest run) falls back instead of
// throwing on an undeclared global.
declare const __BUILD_INFO__: BuildInfo

export const buildInfo: BuildInfo =
  typeof __BUILD_INFO__ === 'undefined'
    ? { branch: 'dev', buildNumber: '0', sha: 'local', env: 'dev', builtAt: '' }
    : __BUILD_INFO__
