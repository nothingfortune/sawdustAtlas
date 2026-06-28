import { test, expect } from '@playwright/test'

// UX-004: first-run welcome shows once, persists its dismissal across reloads, and is
// reopenable from Home. A fresh Playwright context starts with empty storage, so the
// first load is a genuine first run.
test.describe('first-run welcome', () => {
  test('shows once, stays dismissed on reload, and reopens from Home', async ({ page }) => {
    await page.goto('/')
    const dialog = page.locator('.welcome-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(/this browser/i)

    await page.getByRole('button', { name: 'Got it' }).click()
    await expect(dialog).toHaveCount(0)

    // Dismissal persists — a reload (same context) must not show it again.
    await page.reload()
    await expect(page.locator('.welcome-dialog')).toHaveCount(0)

    // Reopenable from the Home link.
    await page.getByRole('button', { name: /How SawdustAtlas works/i }).click()
    await expect(page.locator('.welcome-dialog')).toBeVisible()
  })
})
