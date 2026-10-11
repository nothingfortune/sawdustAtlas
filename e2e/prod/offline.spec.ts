import { readdirSync } from 'node:fs'
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

// FD11: the build stamps every emitted asset into sw.js, so lazy chunks (which neither
// the shell HTML nor the stylesheet reference) are cached before the first offline visit.
test('the service worker precaches every asset the build emitted', async ({ page, request }) => {
  await page.addInitScript(() => window.localStorage.setItem('sawdust-atlas:onboarded', '1'))
  await page.goto('/')
  await page.evaluate(async () => { await navigator.serviceWorker.ready })

  const source = await (await request.get('/sw.js')).text()
  const stamped = /const BUILD_ASSETS = (\[[^\]]*\])/.exec(source)
  expect(stamped, 'sw.js should carry the stamped asset list, not the placeholder').not.toBeNull()
  const listed = JSON.parse(stamped![1]!) as string[]
  expect(listed.length).toBeGreaterThan(0)

  // The list is exactly the build output minus source maps and .woff fallbacks.
  const emitted = readdirSync('dist/assets').filter(file => !file.endsWith('.map') && !file.endsWith('.woff')).map(file => `/assets/${file}`).sort()
  expect(listed).toEqual(emitted)
  expect(listed.some(url => url.endsWith('.js'))).toBe(true)
  expect(listed.some(url => url.endsWith('.css'))).toBe(true)
  expect(listed.some(url => url.endsWith('.woff') || url.endsWith('.map'))).toBe(false)
  // The case this exists for: the furniture 3D viewport is a lazy chunk nothing else references.
  expect(listed.some(url => /\/FurnitureViewport3D-[^/]+\.js$/.test(url)), 'the lazy three.js viewport chunk is listed').toBe(true)

  await expect.poll(() => page.evaluate(async urls => {
    const hits = await Promise.all(urls.map(url => caches.match(url, { ignoreVary: true }).then(Boolean)))
    return urls.filter((_, index) => !hits[index])
  }, listed)).toEqual([])
})
