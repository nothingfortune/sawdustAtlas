import { test, expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

// Shop-wide settings (wood library, milling allowances, pricing) live in their own
// sidebar modules but must flow into every board design. These tests change a
// setting there, reopen the board, and assert the numbers a maker relies on moved
// by exactly the amount the domain math (boardAllowances.ts / pricing.ts) predicts.
// Seed board: edge-grain 460 x 38 mm, nine strips (302 mm of finished width).

const BOARD = /Walnut & maple daily board/

async function openBoard(page: Page) {
  await page.getByRole('button', { name: 'Cutting boards' }).click()
  await page.getByRole('button', { name: BOARD }).click()
}

const money = async (locator: Locator) => Number((await locator.innerText()).replace(/[^0-9.]/g, ''))
const materialCost = (page: Page) => page.locator('.board-stats > div').filter({ has: page.getByText('Material', { exact: true }) }).locator('b')
const priceTotal = (page: Page) => page.locator('.board-stats > div').filter({ has: page.getByText('Price', { exact: true }) }).locator('b')

// The "Rough stock" column of the Thickness/Length/Width rows in the build summary.
const roughValue = (page: Page, label: string) => page.locator('.build-summary-row').filter({ hasText: new RegExp(`^${label}`) }).locator('b').first()

test.describe('shop-wide settings flow into designs', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { window.localStorage.clear(); window.localStorage.setItem('sawdust-atlas:onboarded', '1') })
    await page.goto('/')
  })

  test('a new wood species is pickable on a strip, and its price drives the material cost', async ({ page }) => {
    await page.getByRole('button', { name: 'Wood library' }).click()
    await page.getByRole('button', { name: 'Add custom wood' }).click()
    await page.getByRole('textbox', { name: 'Wood name' }).last().fill('Bubinga')
    await page.getByRole('spinbutton', { name: 'Bubinga price per board foot' }).fill('40')

    await openBoard(page)
    const before = await money(materialCost(page))
    const picker = page.getByRole('combobox', { name: 'Strip 1 species' })
    await expect(picker.getByRole('option', { name: 'Bubinga' })).toHaveCount(1)
    await picker.selectOption({ label: 'Bubinga' })
    await expect(picker).toHaveValue(/.+/)
    await expect.poll(() => money(materialCost(page))).toBeGreaterThan(before)
    const atForty = await money(materialCost(page))

    // Edit the price back in the library: the cost must fall again, and by the exact
    // price difference times the strip's rough board feet.
    await page.getByRole('button', { name: 'Wood library' }).click()
    await page.getByRole('spinbutton', { name: 'Bubinga price per board foot' }).fill('0')
    await openBoard(page)
    await expect.poll(() => money(materialCost(page))).toBeLessThan(before)
    const atZero = await money(materialCost(page))
    expect(atForty).toBeGreaterThan(atZero)

    // Linear in price: 40 -> 0 removes 40 $/bf of strip 1, and 12.5 (walnut) -> 40 added
    // 27.5 $/bf of it, so (atForty - before) / 27.5 === (atForty - atZero) / 40.
    expect((atForty - before) / 27.5).toBeCloseTo((atForty - atZero) / 40, 1)
  })

  test('changing a milling allowance moves the rough stock by exactly that amount', async ({ page }) => {
    await openBoard(page)
    // Defaults: jointing 1.5 + planing 1.5 + router table 1.5 over 38 mm; length trim 12
    // over 460; 9 strips x 3.2 rip + 6 width trim over 302 mm of finished width.
    await expect(roughValue(page, 'Thickness')).toHaveText('42.5 mm')
    await expect(roughValue(page, 'Length')).toHaveText('472 mm')
    await expect(roughValue(page, 'Width')).toHaveText('336.8 mm')

    await page.getByRole('button', { name: 'Milling allowances' }).click()
    await page.getByLabel('Router table (mm)').fill('4.5')
    await page.getByLabel('Rip per strip (mm)').fill('4.2')
    await page.getByLabel('Length trim (mm)').fill('20')

    await openBoard(page)
    await expect(roughValue(page, 'Thickness')).toHaveText('45.5 mm') // 38 + 1.5 + 1.5 + 4.5
    await expect(roughValue(page, 'Length')).toHaveText('480 mm') // 460 + 20
    await expect(roughValue(page, 'Width')).toHaveText('345.8 mm') // 302 + 9 * 4.2 + 6

    // The same numbers reach the rip fence reference: first strip is 50 mm finished,
    // + 4.2 rip + 3 (half the 6 mm width trim, outer strip) = 57.2.
    await expect(page.locator('.stock-assumptions')).toContainText('rip allowance 4.2 mm')
    await expect(page.locator('.stock-assumptions')).toContainText('length trim 20 mm')
    await expect(page.locator('.stock-rip-row').filter({ hasText: '57.2 mm' }).first()).toBeVisible()
  })

  test('changing the material markup changes the price total by the markup on material', async ({ page }) => {
    await openBoard(page)
    const breakdown = page.getByRole('region', { name: 'Price breakdown' })
    await expect(breakdown.getByText('Markup (30%)')).toBeVisible()
    const material = await money(materialCost(page))
    const before = await money(priceTotal(page))

    await page.getByRole('button', { name: 'Pricing' }).click()
    await page.getByLabel('Material markup (%)').fill('80')

    await openBoard(page)
    await expect(breakdown.getByText('Markup (80%)')).toBeVisible()
    // 30% -> 80% adds 50% of the (unchanged) material cost to the total.
    const expected = before + material * 0.5
    await expect.poll(() => money(priceTotal(page))).toBeCloseTo(expected, 0)
    await expect(breakdown.locator('.price-total dd')).toHaveText(`$${(await money(priceTotal(page))).toFixed(2)}`)
  })
})
