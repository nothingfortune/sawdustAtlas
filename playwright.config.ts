import { defineConfig, devices } from '@playwright/test'

// E2E smoke tests run against a real Chromium driving the dev server. They cover
// the interaction bugs unit tests can't reach (pointer drag vs tap, SVG layout).
//
// The app is touch-first ("tablet at the bench" — see the workshop floor planner and
// the cutting board designer), so a second `tablet` project drives the same engine
// with a real touch-capable, iPad-landscape-shaped context. CI installs chromium
// only, so both projects force `browserName: 'chromium'` — never spread a device
// preset's `defaultBrowserType` unguarded, or the tablet project would try to launch
// WebKit and fail in CI. Scoped to the specs that are actually about touch/pointer
// interaction (tap-vs-drag disambiguation, drag state, the composite assembly desk,
// the furniture views and 3D drag, the furniture session); the rest (keyboard
// shortcuts, dialogs, layout text order, imports…) don't exercise touch semantics and
// would just double the run for no signal.
const tabletSpecs = ['**/board.spec.ts', '**/dragState.spec.ts', '**/composite.spec.ts', '**/boardWorkflow.spec.ts', '**/shopWorkflow.spec.ts', '**/furnitureViews.spec.ts', '**/furniture.spec.ts', '**/furniturePackage.spec.ts']

// E2E_PORT lets several checkouts (git worktrees) run the suite side by side without
// one run silently reusing another checkout's dev server. Defaults to Vite's 5173.
const port = Number(process.env.E2E_PORT ?? 5173)

export default defineConfig({
  testDir: './e2e',
  testIgnore: '**/prod/**', // production-build specs run via playwright.prod.config.ts
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
    {
      name: 'tablet',
      testMatch: tabletSpecs,
      use: { ...devices['iPad Pro 11 landscape'], browserName: 'chromium' },
    },
  ],
  webServer: {
    command: `pnpm dev --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
