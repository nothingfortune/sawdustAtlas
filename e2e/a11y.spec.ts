import { test, expect } from '@playwright/test'

// PLAT-008: overlays are keyboard-dismissable (Escape) and focus-managed.
test.describe('overlay keyboard dismissal', () => {
  test('Escape closes the first-run welcome', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.welcome-dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.welcome-dialog')).toHaveCount(0)
  })

  test('Escape closes the warning dropdown', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('sawdust-atlas:onboarded', '1')
      window.localStorage.setItem('sawdust-atlas:v1', JSON.stringify({
        schemaVersion: 2, shops: [],
        boards: [{ id: 'bad', name: 'Bad', construction: 'end', thickness: 20, strips: [{ id: 's', speciesId: 'walnut', width: 10, trailingAngle: -45 }], endGrain: { sourceLength: 900, stockThickness: 20, sliceThickness: 45, kerf: 3.2, trimAllowance: 20, rowFlips: [], rowRotations: [] } }],
      }))
    })
    await page.goto('/')
    await page.locator('.warning-pill').click()
    await expect(page.locator('.warning-menu')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.warning-menu')).toHaveCount(0)
  })

  test('Escape closes the import summary dialog', async ({ page }) => {
    await page.addInitScript(() => { window.localStorage.clear(); window.localStorage.setItem('sawdust-atlas:onboarded', '1') })
    await page.goto('/')
    page.on('dialog', dialog => { void dialog.accept() })
    await page.locator('input[type=file]').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ schemaVersion: 2, shops: [], boards: [] })) })
    await expect(page.locator('.import-dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.import-dialog')).toHaveCount(0)
  })
})
