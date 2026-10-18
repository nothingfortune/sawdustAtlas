/// <reference types="vitest/config" />
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Stamp build provenance into the bundle so the running app can show which
// branch / commit / environment a preview was built from. Sourced from git when
// the repo is present (local dev, `pnpm build`); the Docker image strips .git via
// .dockerignore, so there we fall back to BUILD_* env vars, then to safe defaults.
// Args are passed as an array (no shell), so nothing is interpolated into a command.
function git(...args: string[]): string {
  try {
    return execFileSync('git', args, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
}

function resolveBuildInfo(command: 'build' | 'serve') {
  const env = process.env
  const sha = env['BUILD_SHA'] || git('rev-parse', '--short', 'HEAD') || 'unknown'
  // Only a git-derived sha can be flagged dirty; an injected sha is taken as-is.
  const dirty = !env['BUILD_SHA'] && git('status', '--porcelain') ? '+' : ''
  return {
    branch: env['BUILD_BRANCH'] || git('rev-parse', '--abbrev-ref', 'HEAD') || 'unknown',
    // Commit count: the monotonically iterating build number.
    buildNumber: env['BUILD_NUMBER'] || git('rev-list', '--count', 'HEAD') || '0',
    sha: sha + dirty,
    // Dev server is always 'dev'. A production build is 'production' only when the
    // Docker/CI build declares it; otherwise it's a local production build ('local').
    env: command === 'serve' ? 'dev' : env['BUILD_ENV'] || 'local',
    builtAt: new Date().toISOString(),
  }
}

// public/sw.js is copied verbatim (no bundling step for it), so its cache name is
// static in source: `sawdust-atlas-__SW_BUILD__`. The service worker's activate
// handler deletes any cache whose name isn't the current CACHE, so stamping a
// distinct id into that placeholder on every production build makes old, stale
// caches (previous deploys' hashed /assets/ chunks) get pruned automatically the
// next time the SW activates. Dev (`command === 'serve'`) never touches dist/, so
// this plugin is a no-op there.
//
// The same step replaces the quoted '__SW_ASSETS__' placeholder with a JSON array of
// every file emitted under dist/assets, so install precaches lazy chunks (a route's
// code-split bundle is not referenced by the shell HTML or CSS, and would otherwise
// fail the first time it is opened offline). Source maps and the .woff fallbacks are
// left out: no supported browser fetches the latter when woff2 is offered.
function listBuildAssets(assetsDir: string): string[] {
  if (!existsSync(assetsDir)) return []
  return (readdirSync(assetsDir, { recursive: true, encoding: 'utf8' }))
    .filter(file => statSync(resolve(assetsDir, file)).isFile() && !file.endsWith('.map') && !file.endsWith('.woff'))
    .map(file => `/assets/${file.split(sep).join('/')}`)
    .sort()
}

function swVersionStampPlugin(buildId: string): Plugin {
  let outDir = 'dist'
  let root = process.cwd()
  return {
    name: 'sw-version-stamp',
    apply: 'build',
    configResolved(config) {
      root = config.root
      outDir = config.build.outDir
    },
    closeBundle() {
      const swPath = resolve(root, outDir, 'sw.js')
      if (!existsSync(swPath)) return
      const contents = readFileSync(swPath, 'utf8')
      const assets = JSON.stringify(listBuildAssets(resolve(root, outDir, 'assets')))
      const stamped = contents.replaceAll('__SW_BUILD__', buildId).replaceAll("'__SW_ASSETS__'", assets)
      if (stamped !== contents) writeFileSync(swPath, stamped)
    },
  }
}

export default defineConfig(({ command }) => {
  const buildInfo = resolveBuildInfo(command)
  // Prefer the resolved commit sha; fall back to 'dev' when it couldn't be
  // determined (e.g. .git stripped from the Docker build context and no
  // BUILD_SHA env var supplied).
  const swBuildId = buildInfo.sha !== 'unknown' ? buildInfo.sha : 'dev'
  return {
    plugins: [react(), swVersionStampPlugin(swBuildId)],
    define: { __BUILD_INFO__: JSON.stringify(buildInfo) },
    // e2e/ holds Playwright specs (run via `pnpm test:e2e`); keep them out of vitest.
    test: {
      exclude: ['**/node_modules/**', '**/dist/**', '**/.worktrees/**', '**/e2e/**'],
      coverage: {
        provider: 'v8',
        reporter: ['text-summary', 'json-summary'],
        include: ['src/domain/**', 'src/normalize/**', 'src/storage.ts', 'src/projectPackage.ts', 'src/data.ts', 'src/id.ts'],
        // Floor on the pure logic layer the test suite actually exercises. UI
        // components are not unit-tested yet (tracked separately); this gate guards
        // the geometry/persistence code where regressions are most costly.
        thresholds: { lines: 90, functions: 85, branches: 75, statements: 88 },
      },
    },
  }
})
