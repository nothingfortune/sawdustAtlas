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
// interaction (tap-vs-drag disambiguation, drag state, the composite assembly desk);
// the rest (keyboard shortcuts, dialogs, layout text order, imports…) don't exercise
// touch semantics and would just double the run for no signal.
const tabletSpecs = ['**/board.spec.ts', '**/dragState.spec.ts', '**/composite.spec.ts']

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
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
    command: 'pnpm dev --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
