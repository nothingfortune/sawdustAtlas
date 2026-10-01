import { test, expect } from '@playwright/test'

// There was no e2e coverage of the composite-board flow. This drives the happy path:
// turn an existing design into a composite, add a second panel inline (designed fresh,
// cut as a rip), place one of its wafers into the assembly desk, and confirm both the
// build sheet and the boards list pick up the change.
test.describe('composite board designer', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { window.localStorage.clear(); window.localStorage.setItem('sawdust-atlas:onboarded', '1') })
    await page.goto('/')
    await page.getByRole('button', { name: 'Cutting boards' }).click()
  })

  test('creates a composite, adds an inline rip panel, places a wafer, and updates the build sheet + boards list', async ({ page }) => {
    // Turn the seeded edge-grain board into a composite's first panel.
    await page.getByRole('button', { name: /Walnut & maple daily board/ }).click()
    await page.getByRole('button', { name: 'Make a composite board from this design' }).click()

    const screen = page.locator('.composite-screen')
    await expect(screen).toBeVisible()

    // Add a second panel inline — design a fresh board for it, give it a strip so it
    // actually yields wafers, then return to the composite (the panel editor's "Back"
    // routes to the composite it was opened from).
    await page.getByRole('button', { name: 'Add panel' }).click()
    await page.getByRole('button', { name: 'Design a new board' }).click()
    await page.locator('.add-strip').click()
    await page.getByRole('button', { name: 'Back to boards' }).click()
    await expect(screen).toBeVisible()

    // Cut the new panel as a rip (the default is a crosscut) and place its wafer.
    const inlinePanel = page.locator('.panel-card', { hasText: 'Untitled panel' })
    await inlinePanel.getByRole('button', { name: 'Rip ↔' }).click()
    const chip = inlinePanel.locator('.wafer-chip').first()
    await expect(chip).toBeVisible()
    await chip.click()

    // The grid picked it up — there's already one empty row from composite creation.
    await expect(page.locator('.desk-wafer')).toHaveCount(1)

    // The build sheet reflects real, non-zero material now that something's placed.
    const summary = page.locator('.composite-summary')
    await expect(summary.locator('.plan-table')).not.toContainText('No wafers placed yet')
    await expect(summary.locator('.plan-table')).toContainText(/bf/)

    // The inline panel is a real, independent board — it shows up in the boards list.
    await page.locator('.composite-screen-head').getByRole('button', { name: 'Boards' }).click()
    await expect(page.getByRole('button', { name: /Untitled panel/ })).toBeVisible()
  })
})

// PLAT-004 covers import; export is the other half of the backup round trip and is
// trivial to check with page.waitForEvent('download').
test.describe('export backup download', () => {
  test('downloads a dated JSON backup from the topbar', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('sawdust-atlas:onboarded', '1'))
    await page.goto('/')
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('.topbar').getByRole('button', { name: 'Export backup' }).click(),
    ])
    expect(download.suggestedFilename()).toMatch(/^sawdust-atlas-\d{4}-\d{2}-\d{2}\.json$/)
  })
})
