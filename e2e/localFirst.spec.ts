import { test, expect } from '@playwright/test'

// Local-first guardrail: the app must never reach a third party at runtime (fonts
// included). Records every request across the main screens and asserts same-origin.
test.describe('local-first', () => {
  test('makes only same-origin requests and loads the bundled DM Sans font', async ({ page, baseURL }) => {
    await page.addInitScript(() => window.localStorage.setItem('sawdust-atlas:onboarded', '1'))
    const origin = new URL(baseURL ?? 'http://localhost').origin
    const urls: string[] = []
    page.on('request', request => urls.push(request.url()))

    await page.goto('/')
    await expect(page.locator('.dashboard-page')).toBeVisible()

    // Cutting board designer.
    await page.getByRole('button', { name: 'Cutting boards' }).click()
    await page.getByRole('button', { name: /Walnut & maple daily board/ }).click()
    await expect(page.getByRole('button', { name: 'Make composite: build a composite board from this design' })).toBeVisible()

    // Composite screen.
    await page.getByRole('button', { name: 'Make composite: build a composite board from this design' }).click()
    await expect(page.locator('.composite-screen')).toBeVisible()

    // Wood library.
    await page.getByRole('button', { name: 'Wood library' }).click()
    await expect(page.locator('.breadcrumb strong')).toHaveText('Wood library')

    await page.evaluate(() => document.fonts.ready)
    await page.waitForLoadState('networkidle')

    expect(urls.length).toBeGreaterThan(0)
    const external = urls.filter(url => {
      const parsed = new URL(url)
      if (parsed.protocol === 'data:' || parsed.protocol === 'blob:') return false
      return parsed.origin !== origin
    })
    expect(external).toEqual([])
    expect(urls.some(url => /fonts\.(googleapis|gstatic)\.com/.test(url))).toBe(false)

    // The bundled font files were actually fetched from this origin and the face is usable.
    expect(urls.some(url => /dm-sans.*\.woff2?/i.test(url))).toBe(true)
    const loaded = await page.evaluate(() => document.fonts.ready.then(() => document.fonts.check('16px "DM Sans"')))
    expect(loaded).toBe(true)
  })
})
