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

  test('flags an incomplete composite and opens it from the warning', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('sawdust-atlas:onboarded', '1')
      window.localStorage.setItem('sawdust-atlas:v1', JSON.stringify({
        schemaVersion: 2, shops: [],
        boards: [{
          id: 'donor', name: 'Donor board', construction: 'edge', length: 450, thickness: 20,
          strips: [{ id: 's', speciesId: 'walnut', width: 50, trailingAngle: 0 }],
        }],
        composites: [{
          id: 'comp', name: 'Mosaic', construction: 'edge',
          panels: [{ id: 'p1', boardId: 'donor', cut: { axis: 'x', stripWidthMm: 50, kerfMm: 3, count: 3 } }],
          rows: [{ id: 'r1', wafers: [{ panelId: 'p1', pieceIndex: 0, rotate: 0, flip: false }] }, { id: 'r2', wafers: [] }],
        }],
      }))
    })
    await page.goto('/')

    await page.locator('.warning-pill').click()
    const row = page.locator('.warning-row', { hasText: 'Mosaic' })
    await expect(row).toContainText(/row 2 is empty/i)

    await row.click()
    await expect(page.locator('.composite-screen')).toBeVisible()
  })
})
