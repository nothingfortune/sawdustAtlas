import { test, expect } from '@playwright/test'

// BOARD-026: the standalone geometry calculator — place points, read measurements, and the
// scratchpad survives reload.
test.describe('geometry calculator', () => {
  test.beforeEach(async ({ page }) => {
    // No clear() here: it re-runs on reload and would wipe the persisted sketch. Each test
    // gets a fresh empty context anyway.
    await page.addInitScript(() => { window.localStorage.setItem('sawdust-atlas:onboarded', '1') })
    await page.goto('/')
    await page.getByRole('button', { name: 'Geometry' }).click()
  })

  test('places points, reads a distance, and connects a member', async ({ page }) => {
    const canvas = page.locator('.geo-canvas')
    await expect(canvas).toBeVisible()
    const box = (await canvas.boundingBox())!
    await page.mouse.click(box.x + 160, box.y + 360)
    await page.mouse.click(box.x + 460, box.y + 200)
    await expect(page.locator('.geo-point')).toHaveCount(2)
    // two selected points -> a distance readout
    await expect(page.locator('.geo-readout')).toContainText(/distance/i)
    await expect(page.locator('.geo-readout')).toContainText(/mm/)
    // connect them into a member
    await page.getByRole('button', { name: 'Connect' }).click()
    await expect(page.locator('.geo-member')).toHaveCount(1)
    await expect(page.locator('.geo-readout')).toContainText(/bearing/i)
  })

  test('persists the sketch across reload', async ({ page }) => {
    const box = (await page.locator('.geo-canvas').boundingBox())!
    await page.mouse.click(box.x + 200, box.y + 200)
    await expect(page.locator('.geo-point')).toHaveCount(1)
    await page.reload()
    await page.getByRole('button', { name: 'Geometry' }).click()
    await expect(page.locator('.geo-point')).toHaveCount(1)
  })
})
