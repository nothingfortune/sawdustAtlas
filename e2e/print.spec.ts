import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

// The printed build sheet is what a woodworker carries to the saw. Under print media
// the app chrome must disappear and the sheet (header facts, bench numbers, cut plan,
// rip & stock list, assumptions) must remain. Composite boards have no print path
// (no window.print / print-only markup in src/components/composite), so there is no
// composite print test here.

async function openSeedBoard(page: Page) {
  await page.getByRole('button', { name: 'Cutting boards' }).click()
  await page.getByRole('button', { name: /Walnut & maple daily board/ }).click()
  await expect(page.getByRole('heading', { name: 'Stock, cuts, and sequence' })).toBeVisible()
}

test.describe('printed build sheet', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { window.localStorage.clear(); window.localStorage.setItem('sawdust-atlas:onboarded', '1') })
    await page.goto('/')
    await openSeedBoard(page)
  })

  test('on screen the print-only header and assumptions stay hidden', async ({ page }) => {
    await expect(page.getByText('CUTTING BOARD BUILD SHEET')).toBeHidden()
    await expect(page.getByRole('heading', { name: 'Assumptions' })).toBeHidden()
    await expect(page.getByRole('button', { name: 'Print build sheet' })).toBeVisible()
  })

  test('print media hides the app chrome and editing controls', async ({ page }) => {
    await page.emulateMedia({ media: 'print' })
    await expect(page.locator('.sidebar')).toBeHidden()
    await expect(page.locator('.topbar')).toBeHidden()
    await expect(page.locator('.designer-toolbar')).toBeHidden()
    await expect(page.getByRole('button', { name: 'Print build sheet' })).toBeHidden()
    await expect(page.getByRole('button', { name: 'Wood library' })).toBeHidden()
    await expect(page.getByRole('button', { name: 'Add strip' }).first()).toBeHidden()
    await expect(page.getByLabel('Strip 1 species')).toBeHidden()
    await expect(page.getByRole('button', { name: 'Toggle editor panel' })).toBeHidden()
    await expect(page.getByText('LIVE PREVIEW')).toBeHidden()
  })

  test('print media shows the build sheet with its key sections and numbers', async ({ page }) => {
    await page.emulateMedia({ media: 'print' })

    // Header: name, construction, and headline facts.
    await expect(page.getByText('SAWDUSTATLAS · CUTTING BOARD BUILD SHEET')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Walnut & maple daily board' })).toBeVisible()
    await expect(page.getByText(/Edge-grain construction · generated/)).toBeVisible()
    await expect(page.locator('.print-sheet-facts dd').first()).toHaveText('460 × 302 × 38 mm')
    for (const fact of ['Finished size', 'Rough stock', 'Material estimate', 'Price']) {
      await expect(page.locator('.print-sheet-facts dt', { hasText: fact })).toBeVisible()
    }

    // Bench numbers: rough stock summary, cut plan, rip & stock list.
    await expect(page.getByText('ROUGH STOCK', { exact: true }).first()).toBeVisible()
    await expect(page.locator('.build-summary-row').filter({ hasText: 'Thickness' }).locator('b').first()).toHaveText('42.5 mm')
    await expect(page.getByRole('heading', { name: 'Stock, cuts, and sequence' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Stock list', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Machine cuts' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Build sequence' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Rip & stock list', exact: true })).toBeVisible()
    await expect(page.getByText('RIP EACH STRIP TO')).toBeVisible()
    await expect(page.getByText('Total purchased')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Price breakdown' })).toBeVisible()

    // Assumptions footer spells out the allowances behind the numbers.
    await expect(page.getByRole('heading', { name: 'Assumptions' })).toBeVisible()
    await expect(page.getByText('Jointing 1.5 mm + planing 1.5 mm + router table 1.5 mm removed reaching the finished faces.')).toBeVisible()
    await expect(page.getByText('3.2 mm ripped per strip; 6 mm trimmed squaring the edges.')).toBeVisible()
    await expect(page.getByText('12 mm trimmed squaring the ends.')).toBeVisible()
  })
})
