import { test, expect } from '@playwright/test'

// The share dialog offers the file, the link, and a QR code for a small project.
test.describe('share dialog', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('sawdust-atlas:onboarded', '1')
      // Keep runs deterministic: no system share sheet, so the file target downloads.
      delete (Navigator.prototype as unknown as Record<string, unknown>)['share']
      delete (Navigator.prototype as unknown as Record<string, unknown>)['canShare']
    })
    await page.goto('/')
    await page.getByRole('button', { name: 'Cutting boards' }).click()
  })

  test('shares a board as a file, a link, and a QR code', async ({ page }) => {
    await page.getByRole('button', { name: /Walnut & maple daily board/ }).click()
    await page.getByRole('button', { name: 'Share project' }).click()
    const dialog = page.getByRole('dialog', { name: 'Share project' })
    await expect(dialog.getByRole('textbox', { name: 'Share link' })).toHaveValue(/^http:\/\/localhost:\d+\/#share=v1\.[A-Za-z0-9_-]+$/)
    await expect(dialog.getByRole('img', { name: 'Scan to open this project' })).toBeVisible()

    const downloadPromise = page.waitForEvent('download')
    await dialog.getByRole('button', { name: 'Download file' }).click()
    expect((await downloadPromise).suggestedFilename()).toBe('Walnut & maple daily board.sawdust-project.json')
    await expect(dialog.getByRole('status').last()).toContainText('Downloaded')

    await dialog.getByRole('button', { name: 'Done' }).click()
    await expect(dialog).toBeHidden()
  })
})
