import { test, expect } from '@playwright/test'

// Runs against the production build (playwright.prod.config.ts): the service worker
// only registers in prod builds over a secure context. Proves the workbench-offline
// promise: after one online visit, the app shell and the designer work with no network.
test('app shell and cutting board designer work offline via the service worker', async ({ page, context }) => {
  await page.addInitScript(() => {
    if (!window.localStorage.getItem('sawdust-atlas:onboarded')) {
      window.localStorage.setItem('sawdust-atlas:onboarded', '1')
    }
  })

  await page.goto('/')
  await expect(page.locator('.dashboard-page')).toBeVisible()

  // Wait for the worker to be active, then make sure it controls this page
  // (clients.claim() normally does; reload once if it has not yet).
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  if (!(await page.evaluate(() => navigator.serviceWorker.controller !== null))) {
    await page.reload()
  }
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)

  // Hashed build assets are cacheFirst: make sure the shell's own are cached before cutting the network.
  await expect.poll(() => page.evaluate(async () => {
    const urls = performance.getEntriesByType('resource').map(e => new URL(e.name).pathname).filter(p => p.startsWith('/assets/'))
    const hits = await Promise.all(urls.map(u => caches.match(u).then(Boolean)))
    return urls.length > 0 && hits.every(Boolean)
  })).toBe(true)

  const failedAssets: string[] = []
  page.on('requestfailed', req => {
    if (new URL(req.url()).pathname.startsWith('/assets/')) failedAssets.push(req.url())
  })

  await context.setOffline(true)
  await page.reload()

  await expect(page.getByRole('button', { name: 'Go to home' })).toBeVisible()
  await expect(page.locator('.dashboard-page')).toBeVisible()

  await page.getByRole('button', { name: 'Cutting boards' }).click()
  await page.getByRole('button', { name: /Walnut & maple daily board/ }).click()
  await expect(page.locator('[data-strip-row]').first()).toBeVisible()

  expect(failedAssets).toEqual([])
})
