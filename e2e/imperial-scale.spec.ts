import { test, expect } from '@playwright/test'

// Regression: Preston's button (imperial) must read the workshop floor grid in
// whole feet for ANY grid spacing — not just the 300 mm default. The first fix
// only snapped the exact default, so a 600 mm grid fell back to raw inch labels
// ("23 5/8", "47 1/4"…). This drives the real component wiring (which unit tests
// don't cover) against a non-default workshop.
test.describe("Preston's button imperial scaling", () => {
  test('workshop grid labels read in whole feet for a non-default grid spacing', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('sawdust-atlas:v1', JSON.stringify({
        schemaVersion: 2,
        shops: [{ id: 'w', name: 'Shop', width: 3600, depth: 3600, gridSize: 600, blockedZones: [], items: [], updatedAt: '' }],
        boards: [],
        composites: [],
      }))
    })
    await page.goto('/')
    await page.getByRole('button', { name: 'Workshop layout' }).click()
    await page.getByRole('button', { name: /Preston/ }).click()

    const labels = page.locator('.floor-grid-layer .grid-label')
    await expect(labels.first()).toBeVisible()
    const texts = await labels.allTextContents()
    expect(texts.length).toBeGreaterThan(0)
    // Every label is a whole number of feet (e.g. "2'") — never raw inches.
    for (const text of texts) expect(text.trim()).toMatch(/^\d+'$/)
  })
})
