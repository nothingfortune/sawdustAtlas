import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

// Opening a share link previews the project, imports it on request, and leaves Back, Forward, and Undo working.
test.describe('share link', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (!window.sessionStorage.getItem('seeded')) {
        window.localStorage.clear()
        window.localStorage.setItem('sawdust-atlas:onboarded', '1')
        window.sessionStorage.setItem('seeded', '1')
      }
    })
  })

  async function boardLink(page: Page): Promise<string> {
    await page.goto('/')
    await page.getByRole('button', { name: 'Cutting boards' }).click()
    await page.getByRole('button', { name: /Walnut & maple daily board/ }).click()
    await page.getByRole('button', { name: 'Share project' }).click()
    const link = await page.getByRole('dialog', { name: 'Share project' }).getByRole('textbox', { name: 'Share link' }).inputValue()
    await page.getByRole('dialog', { name: 'Share project' }).getByRole('button', { name: 'Done' }).click()
    return link
  }

  test('previews, imports, and undoes a shared board', async ({ page }) => {
    const link = await boardLink(page)
    // A hash-only change does not reload; leave the app first so the link loads it fresh.
    await page.goto('about:blank')
    await page.goto(link)

    const dialog = page.getByRole('dialog', { name: 'Import shared project' })
    await expect(dialog).toContainText('Walnut & maple daily board')
    await expect(dialog).toContainText('Cutting board')
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('')
    // Clearing the fragment must keep the screen stored in history.state, or Back stops working.
    expect(await page.evaluate(() => (window.history.state as { view?: string } | null)?.view)).toBe('home')

    await dialog.getByRole('button', { name: 'Import' }).click()
    await expect(page.locator('.board-intro h2')).toHaveText('Walnut & maple daily board (imported)')

    await page.goBack()
    await expect(page.locator('.breadcrumb strong')).toHaveText('Home')
    await page.goForward()
    await expect(page.locator('.board-intro h2')).toHaveText('Walnut & maple daily board (imported)')

    await page.getByRole('button', { name: 'Undo' }).click()
    await page.getByRole('button', { name: 'Back to boards' }).click()
    await expect(page.getByRole('button', { name: /Walnut & maple daily board \(imported\)/ })).toHaveCount(0)
  })

  test('opens a link in a tab that already has the app loaded', async ({ page }) => {
    const link = await boardLink(page)
    // No about:blank here: this is a same-document fragment navigation, so the app does not remount.
    await page.getByRole('button', { name: 'Back to boards' }).click()
    await page.evaluate(href => { window.location.href = href }, link)
    const dialog = page.getByRole('dialog', { name: 'Import shared project' })
    await expect(dialog).toContainText('Walnut & maple daily board')
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('')
    await dialog.getByRole('button', { name: 'Import' }).click()
    await expect(page.locator('.board-intro h2')).toHaveText('Walnut & maple daily board (imported)')
  })

  test('cancel imports nothing', async ({ page }) => {
    const link = await boardLink(page)
    await page.goto('about:blank')
    await page.goto(link)
    await page.getByRole('dialog', { name: 'Import shared project' }).getByRole('button', { name: 'Cancel' }).click()
    await page.getByRole('button', { name: 'Cutting boards' }).click()
    await expect(page.getByRole('button', { name: /Walnut & maple daily board \(imported\)/ })).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('')
  })

  test('a damaged link shows the error and changes nothing', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Cutting boards' }).click()
    const before = await page.locator('.gallery-card').count()
    await page.goto('about:blank')
    await page.goto('/#share=v1.AAAA')

    const dialog = page.getByRole('dialog', { name: 'Shared project could not open' })
    await expect(dialog).toContainText('This share link is damaged or incomplete. Ask for the file instead.')
    await dialog.getByRole('button', { name: 'Close' }).click()
    await page.getByRole('button', { name: 'Cutting boards' }).click()
    await expect(page.locator('.gallery-card')).toHaveCount(before)
  })
})
