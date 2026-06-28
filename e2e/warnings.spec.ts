import { test, expect } from '@playwright/test'

// UX-006: the topbar warning center aggregates workspace issues app-wide and each row
// links to the input that fixes it.
test.describe('warning center', () => {
  test('surfaces a bad-geometry board and navigates to it', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('sawdust-atlas:onboarded', '1')
      // An end-grain board whose strip closes/crosses (width 10, -45°, 20 mm stock).
      window.localStorage.setItem('sawdust-atlas:v1', JSON.stringify({
        schemaVersion: 2, shops: [],
        boards: [{
          id: 'bad', name: 'Bad board', construction: 'end', thickness: 20,
          strips: [{ id: 's', speciesId: 'walnut', width: 10, trailingAngle: -45 }],
          endGrain: { sourceLength: 900, stockThickness: 20, sliceThickness: 45, kerf: 3.2, trimAllowance: 20, rowFlips: [], rowRotations: [] },
        }],
      }))
    })
    await page.goto('/')

    const pill = page.locator('.warning-pill')
    await expect(pill).toBeVisible()
    await pill.click()

    const row = page.locator('.warning-row', { hasText: 'Bad board' })
    await expect(row).toBeVisible()
    await expect(row).toContainText(/closes or crosses/i)

    await row.click()
    // Landed on that board's designer, which shows the same geometry error in place.
    await expect(page.locator('.geometry-errors')).toBeVisible()
  })
})
