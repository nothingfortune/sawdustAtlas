import { test, expect } from '@playwright/test'

// Regression: the brand ruler glyph must not jump vertically when the sidebar collapses.
// Root cause was `.brand div:last-child` matching the lone brand-mark once the text label
// is removed, flipping it from grid-centered to flex-column (top-aligned), lifting the
// glyph ~5px. The box stayed put, so only measuring the glyph catches it.
test.describe('sidebar brand icon', () => {
  test('ruler glyph stays vertically put when collapsing', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('sawdust-atlas:onboarded', '1'))
    await page.goto('/')
    const glyph = page.locator('.brand-mark svg')
    const expanded = await glyph.boundingBox()
    await page.getByRole('button', { name: 'Toggle sidebar' }).click()
    await page.waitForTimeout(400)
    const collapsed = await glyph.boundingBox()
    const expandedCy = expanded!.y + expanded!.height / 2
    const collapsedCy = collapsed!.y + collapsed!.height / 2
    expect(Math.abs(expandedCy - collapsedCy)).toBeLessThan(1.5)
  })
})
