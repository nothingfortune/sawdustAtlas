import { defineConfig, devices } from '@playwright/test'

// Production-build E2E: the service worker registers only in `vite build` output
// served from a secure context (localhost), so the dev-server suite in
// playwright.config.ts can never exercise offline behavior. This config builds the
// app and serves it with `vite preview`. Chromium only, to match CI.
const port = Number(process.env.E2E_PROD_PORT ?? 4173)
const baseURL = `http://localhost:${port}`

export default defineConfig({
  testDir: './e2e/prod',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
  ],
  webServer: {
    command: `pnpm build && pnpm preview --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
})
