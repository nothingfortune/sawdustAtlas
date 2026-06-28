import { test, expect } from '@playwright/test'

// User-feedback fixes (2026-06-25):
// - the top-left brand always returns home
// - room size is the first thing shown when setting up a workshop
test.describe('app shell + shop setup', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('sawdust-atlas:onboarded', '1'))
  })

  test('the top-left brand icon returns to home from anywhere', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Cutting boards' }).click()
    await expect(page.locator('.dashboard-page')).toHaveCount(0)
    await page.getByRole('button', { name: 'Go to home' }).click()
    await expect(page.locator('.dashboard-page')).toBeVisible()
  })

  test('room size appears before the object catalog in the workshop panel', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Workshop layout' }).click()
    const panel = page.locator('.left-panel')
    const text = await panel.innerText()
    expect(text.indexOf('Room size')).toBeGreaterThanOrEqual(0)
    expect(text.indexOf('Room size')).toBeLessThan(text.indexOf('Objects'))
  })
})
